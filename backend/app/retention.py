"""Purga periódica de datos antiguos para que la base (Neon gratuito es pequeño) no crezca sin límite."""
import logging
from datetime import datetime, timedelta, timezone

from . import audit, db
from .config import settings

log = logging.getLogger("agente.retention")


def _cutoff(days: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat(timespec="seconds")


def purge() -> dict:
    """Borra lo que supera su plazo de retención. Un plazo de 0 desactiva esa purga."""
    removed = {}
    if settings.snapshot_retention_days > 0:
        # Siempre se conserva la instantánea más reciente: es la base para detectar cambios.
        removed["snapshots"] = db.execute_count(
            "DELETE FROM board_snapshots WHERE taken_at < ? AND id NOT IN (SELECT MAX(id) FROM board_snapshots)",
            (_cutoff(settings.snapshot_retention_days),))
    if settings.changes_retention_days > 0:
        removed["cambios"] = db.execute_count("DELETE FROM plan_changes WHERE detected_at < ?",
                                              (_cutoff(settings.changes_retention_days),))
    if settings.notification_retention_days > 0:
        removed["avisos"] = db.execute_count("DELETE FROM notifications WHERE read = 1 AND created_at < ?",
                                             (_cutoff(settings.notification_retention_days),))
    if settings.audit_retention_days > 0:
        removed["bitacora"] = db.execute_count("DELETE FROM audit_log WHERE ts < ?",
                                               (_cutoff(settings.audit_retention_days),))
    if any(removed.values()):
        audit.log(audit.SYSTEM, "purga_datos_antiguos", details=removed)
        log.info("Purga de datos antiguos: %s", removed)
    return removed
