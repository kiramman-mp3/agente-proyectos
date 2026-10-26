"""REQ-11: cifrado de credenciales, hash de contraseñas, tokens JWT y control de acceso por rol."""
import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone

import jwt
from cryptography.fernet import Fernet, InvalidToken
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from . import db
from .config import settings

# Permisos por rol. El gestor del proyecto decide sobre propuestas, lanza procesos y administra usuarios;
# los desarrolladores consultan el estado del proyecto. 'admin' y 'observador' se mantienen por compatibilidad.
ROLES = ("gestor", "desarrollador")
ROLE_PERMISSIONS = {
    "gestor": {"read", "decide", "run", "users"},
    "desarrollador": {"read"},
    "admin": {"read", "decide", "run", "users"},
    "observador": {"read"},
}

SECRET_NAMES = ("openrouter_api_key", "gemini_api_key", "trello_api_key", "trello_token", "github_token",
                "smtp_password", "mail_webhook_secret")
OPTIONAL_SECRETS = {"smtp_password", "mail_webhook_secret"}
LLM_SECRET = {"openrouter": "openrouter_api_key", "gemini": "gemini_api_key"}


# ---------- Credenciales cifradas ----------

def _fernet() -> Fernet:
    if not settings.master_key:
        raise RuntimeError("MASTER_KEY no está configurada. Genérala con: python -m app.cli gen-key")
    return Fernet(settings.master_key.encode())


def set_secret(name: str, value: str) -> None:
    enc = _fernet().encrypt(value.encode()).decode()
    db.execute(
        "INSERT INTO secrets (name, value_enc, updated_at) VALUES (?, ?, ?) "
        "ON CONFLICT(name) DO UPDATE SET value_enc = excluded.value_enc, updated_at = excluded.updated_at",
        (name, enc, db.now_iso()),
    )


def get_secret(name: str) -> str:
    row = db.query_one("SELECT value_enc FROM secrets WHERE name = ?", (name,))
    if not row:
        raise RuntimeError(f"Credencial '{name}' no configurada. Usa: python -m app.cli set-secret {name}")
    try:
        return _fernet().decrypt(row["value_enc"].encode()).decode()
    except InvalidToken as e:
        raise RuntimeError(f"No se pudo descifrar '{name}': la MASTER_KEY no coincide") from e


def secrets_status() -> dict[str, bool]:
    """Estado de las credenciales requeridas por la configuración actual (las del proveedor de IA principal y del de respaldo, si lo hay)."""
    stored = {r["name"] for r in db.query("SELECT name FROM secrets")}
    llm_secrets = {LLM_SECRET.get(settings.llm_provider), LLM_SECRET.get(settings.llm_fallback_provider)}
    required = [n for n in SECRET_NAMES
                if n not in OPTIONAL_SECRETS and (n not in LLM_SECRET.values() or n in llm_secrets)]
    return {n: n in stored for n in required}


# ---------- Contraseñas ----------

def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 310_000)
    return f"pbkdf2_sha256$310000${salt.hex()}${digest.hex()}"


def generate_password(length: int = 12) -> str:
    """Contraseña temporal legible (sin caracteres ambiguos como 0/O o 1/l)."""
    import secrets
    alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(length))


def verify_password(password: str, stored: str) -> bool:
    try:
        _, iterations, salt_hex, digest_hex = stored.split("$")
    except ValueError:
        return False
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), int(iterations))
    return hmac.compare_digest(digest.hex(), digest_hex)


# ---------- Sesiones JWT ----------

def create_token(user: dict) -> str:
    if not settings.jwt_secret:
        raise RuntimeError("JWT_SECRET no está configurado")
    payload = {
        "sub": user["username"],
        "role": user["role"],
        "ver": user.get("token_version") or 0,
        "exp": datetime.now(timezone.utc) + timedelta(hours=settings.jwt_expire_hours),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def bump_token_version(user_id: int) -> None:
    """Invalida todas las sesiones abiertas de un usuario."""
    db.execute("UPDATE users SET token_version = COALESCE(token_version, 0) + 1 WHERE id = ?", (user_id,))


_bearer = HTTPBearer(auto_error=False)


def current_user(creds: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> dict:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Falta el token de sesión")
    try:
        payload = jwt.decode(creds.credentials, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sesión inválida o expirada")
    user = db.query_one("SELECT id, username, role, full_name, email, active, must_change_password, token_version "
                        "FROM users WHERE username = ?", (payload["sub"],))
    if not user or not user["active"]:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuario inactivo")
    # Cambiar o restablecer la contraseña sube la versión y deja sin efecto los tokens emitidos antes.
    if (payload.get("ver") or 0) != (user["token_version"] or 0):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sesión inválida o expirada")
    return user


def require(permission: str):
    def checker(user: dict = Depends(current_user)) -> dict:
        if permission not in ROLE_PERMISSIONS.get(user["role"], set()):
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"El rol '{user['role']}' no tiene permiso '{permission}'")
        return user
    return checker
