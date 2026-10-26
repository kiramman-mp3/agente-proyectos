"""Configuración central leída desde variables de entorno (.env)."""
import os
from pathlib import Path
from zoneinfo import ZoneInfo

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def _list(name: str, default: str) -> list[str]:
    return [x.strip() for x in os.getenv(name, default).split(",") if x.strip()]


class Settings:
    master_key: str = os.getenv("MASTER_KEY", "")
    jwt_secret: str = os.getenv("JWT_SECRET", "")
    jwt_expire_hours: int = int(os.getenv("JWT_EXPIRE_HOURS", "12"))
    db_path: Path = BASE_DIR / os.getenv("DB_PATH", "data/agente.db")
    # Si se define, se usa PostgreSQL (p. ej. Neon) en lugar de SQLite.
    database_url: str = os.getenv("DATABASE_URL", "").strip()

    # Correo para retrasos críticos: "smtp" (Gmail con contraseña de aplicación), "apps_script"
    # (webhook HTTPS de Google Apps Script, útil donde el hosting bloquea SMTP) o vacío (desactivado).
    mail_transport: str = os.getenv("MAIL_TRANSPORT", "").strip().lower()
    smtp_host: str = os.getenv("SMTP_HOST", "smtp.gmail.com")
    smtp_port: int = int(os.getenv("SMTP_PORT", "465"))
    smtp_user: str = os.getenv("SMTP_USER", "")
    mail_webhook_url: str = os.getenv("MAIL_WEBHOOK_URL", "")
    app_url: str = os.getenv("APP_URL", "")

    llm_provider: str = os.getenv("LLM_PROVIDER", "openrouter").strip().lower()
    model_executor: str = os.getenv("MODEL_EXECUTOR", "anthropic/claude-sonnet-4.5")
    model_reviewer: str = os.getenv("MODEL_REVIEWER", "openai/gpt-4.1-mini")
    model_approver: str = os.getenv("MODEL_APPROVER", "openai/gpt-4.1-mini")
    # Proveedor de respaldo: se usa solo si el principal falla. Cada proveedor nombra distinto sus modelos.
    llm_fallback_provider: str = os.getenv("LLM_FALLBACK_PROVIDER", "").strip().lower()
    fallback_model_executor: str = os.getenv("FALLBACK_MODEL_EXECUTOR", "")
    fallback_model_reviewer: str = os.getenv("FALLBACK_MODEL_REVIEWER", "")
    fallback_model_approver: str = os.getenv("FALLBACK_MODEL_APPROVER", "")

    def fallback_model(self, model: str) -> str:
        """Modelo equivalente del proveedor de respaldo para un modelo del principal (por rol)."""
        by_role = {self.model_executor: self.fallback_model_executor, self.model_reviewer: self.fallback_model_reviewer,
                   self.model_approver: self.fallback_model_approver}
        return by_role.get(model) or self.fallback_model_reviewer or self.fallback_model_executor

    trello_board_id: str = os.getenv("TRELLO_BOARD_ID", "")
    lists_pending: list[str] = _list("LISTS_PENDING", "Pendiente,Por hacer,To Do,Backlog")
    lists_in_progress: list[str] = _list("LISTS_IN_PROGRESS", "En progreso,En ejecución,Doing,In Progress")
    lists_done: list[str] = _list("LISTS_DONE", "Hecho,Completado,Terminado,Done")
    lists_blocked: list[str] = _list("LISTS_BLOCKED", "Bloqueado,Blocked")
    blocked_label: str = os.getenv("BLOCKED_LABEL", "Bloqueado")
    priority_labels: list[str] = _list("PRIORITY_LABELS", "Alta,Media,Baja")

    github_repo: str = os.getenv("GITHUB_REPO", "")
    github_branch: str = os.getenv("GITHUB_BRANCH", "main")

    risk_days: int = int(os.getenv("RISK_DAYS", "3"))
    tz: ZoneInfo = ZoneInfo(os.getenv("TIMEZONE", "America/Guayaquil"))

    scheduler_enabled: bool = os.getenv("SCHEDULER_ENABLED", "true").lower() == "true"
    analysis_interval_minutes: int = int(os.getenv("ANALYSIS_INTERVAL_MINUTES", "60"))
    code_review_interval_hours: int = int(os.getenv("CODE_REVIEW_INTERVAL_HOURS", "24"))
    report_day: str = os.getenv("REPORT_DAY", "mon")
    report_hour: int = int(os.getenv("REPORT_HOUR", "8"))

    # Documentación interactiva (/docs): desactivada por defecto para no exponer el mapa de la API en producción.
    docs_enabled: bool = os.getenv("ENABLE_DOCS", "false").strip().lower() == "true"

    # Límite de intentos fallidos de inicio de sesión (por usuario y por IP) dentro de una ventana de tiempo.
    login_max_attempts: int = int(os.getenv("LOGIN_MAX_ATTEMPTS", "5"))
    login_window_seconds: int = int(os.getenv("LOGIN_WINDOW_SECONDS", "900"))

    # Retención de datos (en días). 0 desactiva la purga. La bitácora de auditoría se conserva por defecto.
    audit_retention_days: int = int(os.getenv("AUDIT_RETENTION_DAYS", "0"))
    snapshot_retention_days: int = int(os.getenv("SNAPSHOT_RETENTION_DAYS", "90"))
    changes_retention_days: int = int(os.getenv("CHANGES_RETENTION_DAYS", "180"))
    notification_retention_days: int = int(os.getenv("NOTIFICATION_RETENTION_DAYS", "90"))

    policy_path: Path = BASE_DIR / "policy.json"
    standards_path: Path = BASE_DIR / "standards.md"


    def validate(self) -> None:
        """Falla al arrancar si falta una configuración imprescindible, en lugar de dar errores 500 más tarde."""
        missing = [n for n, v in (("MASTER_KEY", self.master_key), ("JWT_SECRET", self.jwt_secret)) if not v]
        if missing:
            raise RuntimeError(f"Faltan variables de entorno obligatorias: {', '.join(missing)}")
        if len(self.jwt_secret) < 32:
            raise RuntimeError("JWT_SECRET debe tener al menos 32 caracteres")


settings = Settings()
