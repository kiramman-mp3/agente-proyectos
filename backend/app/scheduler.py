"""Tareas periódicas: análisis de retrasos, revisión de código, reporte semanal y purga de datos antiguos."""
import logging
import os

import httpx
from apscheduler.schedulers.background import BackgroundScheduler

from . import audit, db, orchestrator, retention
from .config import settings

log = logging.getLogger("agente.scheduler")
_scheduler: BackgroundScheduler | None = None


def _safe(name: str, fn, ttl_seconds: int):
    """Envuelve una tarea: la reserva en la base (para que, con varias instancias, solo una la ejecute) y
    registra su resultado sin dejar que un fallo detenga el planificador."""
    def job():
        try:
            if not db.claim_job(name, ttl_seconds):
                log.info("%s omitido: otra instancia ya la ejecutó", name)
                return
            result = fn()
            log.info("%s: %s", name, result)
        except orchestrator.BusyError:
            log.info("%s omitido: ya está en ejecución", name)
        except Exception as e:  # noqa: BLE001
            log.exception("%s falló", name)
            audit.log(audit.SYSTEM, f"tarea_fallida_{name}", details={"error": str(e)})
    return job


def start() -> None:
    global _scheduler
    if not settings.scheduler_enabled or _scheduler:
        return
    _scheduler = BackgroundScheduler(timezone=settings.tz)
    analysis_ttl = int(settings.analysis_interval_minutes * 60 * 0.8)
    code_ttl = int(settings.code_review_interval_hours * 3600 * 0.8)
    _scheduler.add_job(_safe("analisis_retrasos", orchestrator.run_delay_analysis, analysis_ttl), "interval",
                       minutes=settings.analysis_interval_minutes, id="analysis")
    _scheduler.add_job(_safe("revision_codigo", orchestrator.run_code_review, code_ttl), "interval",
                       hours=settings.code_review_interval_hours, id="code")
    _scheduler.add_job(_safe("reporte_semanal", orchestrator.generate_weekly_report, 6 * 3600), "cron",
                       day_of_week=settings.report_day, hour=settings.report_hour, id="report")
    _scheduler.add_job(_safe("purga_datos", retention.purge, 6 * 3600), "cron", hour=3, minute=30, id="retention")
    # Opcional: en hostings que duermen el servicio sin tráfico entrante, KEEPALIVE_URL hace que se llame a sí mismo.
    # En Azure App Service con Always On no hace falta.
    public_url = os.getenv("KEEPALIVE_URL")
    if public_url:
        _scheduler.add_job(_keepalive, "interval", minutes=10, id="keepalive", args=[public_url.rstrip("/")])
    _scheduler.start()


def _keepalive(url: str) -> None:
    try:
        httpx.get(f"{url}/health", timeout=20)
    except httpx.HTTPError as e:
        log.warning("keepalive falló: %s", e)


def stop() -> None:
    global _scheduler
    if _scheduler:
        _scheduler.shutdown(wait=False)
        _scheduler = None


def jobs() -> list[dict]:
    if not _scheduler:
        return []
    return [{"id": j.id, "next_run": j.next_run_time.isoformat() if j.next_run_time else None}
            for j in _scheduler.get_jobs() if j.id not in ("keepalive", "retention")]
