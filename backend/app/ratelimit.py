"""Límite de intentos fallidos de inicio de sesión, en memoria (la API corre en una sola instancia).

Cuenta los fallos por usuario y por IP dentro de una ventana deslizante. Un inicio de sesión correcto reinicia el
contador del usuario. Los nombres de usuario inexistentes también cuentan, así no se distingue un usuario válido de
uno inválido."""
import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException

from .config import settings

IP_FACTOR = 4  # una IP puede fallar más veces que un usuario concreto (por ejemplo, una red compartida)


class LoginLimiter:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._fails: dict[str, deque] = defaultdict(deque)

    def _prune(self, key: str, now: float) -> deque:
        q = self._fails.get(key)
        if q is None:
            return deque()
        while q and now - q[0] > settings.login_window_seconds:
            q.popleft()
        if not q:
            self._fails.pop(key, None)
            return deque()
        return q

    def check(self, user: str, ip: str) -> None:
        """Lanza 429 si el usuario o la IP agotaron sus intentos."""
        now = time.monotonic()
        with self._lock:
            for key, limit in ((f"u:{user.lower()}", settings.login_max_attempts),
                               (f"ip:{ip}", settings.login_max_attempts * IP_FACTOR)):
                q = self._prune(key, now)
                if len(q) >= limit:
                    wait = max(1, int(settings.login_window_seconds - (now - q[0])))
                    minutes = -(-wait // 60)
                    raise HTTPException(429, f"Demasiados intentos fallidos. Intenta de nuevo en {minutes} min.",
                                        headers={"Retry-After": str(wait)})

    def fail(self, user: str, ip: str) -> None:
        now = time.monotonic()
        with self._lock:
            self._fails[f"u:{user.lower()}"].append(now)
            self._fails[f"ip:{ip}"].append(now)

    def success(self, user: str) -> None:
        with self._lock:
            self._fails.pop(f"u:{user.lower()}", None)

    def reset(self) -> None:
        with self._lock:
            self._fails.clear()


login_limiter = LoginLimiter()


def client_ip(request) -> str:
    """IP del cliente. Tras el proxy de Azure se toma la última entrada de X-Forwarded-For, que añade el propio
    proxy; las anteriores las puede falsear el cliente."""
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        last = forwarded.split(",")[-1].strip()
        return last.rsplit(":", 1)[0] if last.count(":") == 1 else last
    return request.client.host if request.client else "desconocida"
