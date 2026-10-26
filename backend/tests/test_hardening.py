import threading
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app import actions, db, orchestrator, retention
from app.config import Settings, settings
from app.ratelimit import login_limiter
from app.security import hash_password


@pytest.fixture(autouse=True)
def clean_limiter():
    login_limiter.reset()
    yield
    login_limiter.reset()


@pytest.fixture
def client():
    db.insert("users", {"username": "johan", "password_hash": hash_password("clave-gestor"), "role": "gestor",
                        "created_at": db.now_iso()})
    from app.main import app
    c = TestClient(app)
    tok = c.post("/auth/login", json={"username": "johan", "password": "clave-gestor"}).json()["token"]
    c.headers["Authorization"] = f"Bearer {tok}"
    return c


def _anon():
    from app.main import app
    return TestClient(app)


# ---------------------------------------------------------------- inicio de sesión

def test_login_is_rate_limited_per_user(monkeypatch):
    monkeypatch.setattr(settings, "login_max_attempts", 3)
    db.insert("users", {"username": "ana", "password_hash": hash_password("clave-correcta"), "role": "gestor",
                        "created_at": db.now_iso()})
    c = _anon()
    for _ in range(3):
        assert c.post("/auth/login", json={"username": "ana", "password": "mal"}).status_code == 401
    blocked = c.post("/auth/login", json={"username": "ana", "password": "clave-correcta"})
    assert blocked.status_code == 429 and "Retry-After" in blocked.headers
    # Otro usuario no se ve afectado.
    db.insert("users", {"username": "luis", "password_hash": hash_password("otra-clave-1"), "role": "gestor",
                        "created_at": db.now_iso()})
    assert c.post("/auth/login", json={"username": "luis", "password": "otra-clave-1"}).status_code == 200


def test_unknown_users_count_but_do_not_flood_the_audit_log(monkeypatch):
    monkeypatch.setattr(settings, "login_max_attempts", 2)
    c = _anon()
    for _ in range(2):
        assert c.post("/auth/login", json={"username": "no-existe", "password": "x"}).status_code == 401
    assert c.post("/auth/login", json={"username": "no-existe", "password": "x"}).status_code == 429
    assert db.query("SELECT id FROM audit_log WHERE action = 'login_fallido'") == []


def test_successful_login_resets_the_counter(monkeypatch):
    monkeypatch.setattr(settings, "login_max_attempts", 3)
    db.insert("users", {"username": "ana", "password_hash": hash_password("clave-correcta"), "role": "gestor",
                        "created_at": db.now_iso()})
    c = _anon()
    for _ in range(2):
        c.post("/auth/login", json={"username": "ana", "password": "mal"})
    assert c.post("/auth/login", json={"username": "ana", "password": "clave-correcta"}).status_code == 200
    for _ in range(2):
        assert c.post("/auth/login", json={"username": "ana", "password": "mal"}).status_code == 401


# ---------------------------------------------------------------- tokens

def test_password_reset_and_change_revoke_old_tokens(client):
    created = client.post("/users", json={"username": "carol", "role": "desarrollador"}).json()
    temp = created["temporary_password"]
    first = _anon().post("/auth/login", json={"username": "carol", "password": temp}).json()["token"]
    dev = TestClient(client.app, headers={"Authorization": f"Bearer {first}"})
    assert dev.get("/auth/me").status_code == 200
    assert "token_version" not in dev.get("/auth/me").json()

    renewed = dev.post("/auth/change-password", json={"current_password": temp, "new_password": "nueva-clave-1"}).json()
    assert dev.get("/auth/me").status_code == 401          # el token anterior ya no sirve
    dev.headers["Authorization"] = f"Bearer {renewed['token']}"
    assert dev.get("/auth/me").status_code == 200           # el nuevo mantiene la sesión

    client.post(f"/users/{created['id']}/reset-password")
    assert dev.get("/auth/me").status_code == 401           # el restablecimiento cierra las sesiones


def test_changing_role_or_deactivating_revokes_sessions(client):
    created = client.post("/users", json={"username": "paulo", "role": "desarrollador"}).json()
    login = _anon().post("/auth/login", json={"username": "paulo", "password": created["temporary_password"]})
    dev = TestClient(client.app, headers={"Authorization": f"Bearer {login.json()['token']}"})
    assert dev.get("/auth/me").status_code == 200
    client.patch(f"/users/{created['id']}", json={"role": "gestor"})
    assert dev.get("/auth/me").status_code == 401


# ---------------------------------------------------------------- exposición de la API

def test_docs_are_not_published_by_default():
    c = _anon()
    assert c.get("/docs").status_code == 404
    assert c.get("/openapi.json").status_code == 404


def test_health_and_ready():
    c = _anon()
    assert c.get("/health").json() == {"ok": True}
    assert c.get("/health/ready").json() == {"ok": True, "db": "ok"}


def test_startup_validation_requires_secrets():
    class Bare(Settings):
        master_key = ""
        jwt_secret = ""

    with pytest.raises(RuntimeError, match="MASTER_KEY"):
        Bare().validate()

    class Short(Settings):
        master_key = "k"
        jwt_secret = "corto"

    with pytest.raises(RuntimeError, match="32"):
        Short().validate()


# ---------------------------------------------------------------- decisiones atómicas

def _pending_proposal(action="comentar") -> int:
    now = db.now_iso()
    return db.insert("proposals", {"created_at": now, "updated_at": now, "source": "retraso", "action_type": action,
                                   "target_id": "T1", "target_name": "API", "params_json": '{"text": "hola"}',
                                   "status": "pendiente_gestor"})


def test_only_one_of_two_concurrent_approvals_executes(monkeypatch):
    db.kv_set("activities", [])
    db.kv_set("board_meta", {})
    calls = []
    barrier = threading.Barrier(2)

    def fake_execute(p, meta, target):
        calls.append(p["id"])
        return "ok"

    monkeypatch.setattr(orchestrator.actions, "execute", fake_execute)
    monkeypatch.setattr(orchestrator, "sync_board", lambda *a, **k: {})
    pid = _pending_proposal()
    results = []

    def approve():
        barrier.wait()
        try:
            results.append(orchestrator.manager_approve(pid, "johan"))
        except ValueError as e:
            results.append(e)

    threads = [threading.Thread(target=approve) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert calls == [pid]
    assert sum(isinstance(r, ValueError) for r in results) == 1


def test_decisions_on_an_already_decided_proposal_are_rejected():
    pid = _pending_proposal()
    assert orchestrator.manager_reject(pid, "johan") == "rechazada_gestor"
    for fn in (lambda: orchestrator.manager_reject(pid, "johan"), lambda: orchestrator.manager_approve(pid, "johan"),
               lambda: orchestrator.manager_request_changes(pid, "johan", "cambios")):
        with pytest.raises(ValueError, match="no está pendiente"):
            fn()
    with pytest.raises(LookupError):
        orchestrator.manager_approve(9999, "johan")


# ---------------------------------------------------------------- comentarios automáticos

def test_automatic_comments_are_sanitized():
    text = "Revisa https://malo.example/x y avisa a @jefe\n\nahora  mismo www.otro.com " + "x" * 600
    clean = actions.safe_comment(text)
    assert "http" not in clean and "www." not in clean and "@" not in clean and "\n" not in clean
    assert "[enlace omitido]" in clean and len(clean) <= actions.COMMENT_MAX_CHARS
    with pytest.raises(actions.ExecutionError):
        actions.safe_comment("   ")


# ---------------------------------------------------------------- planificador y retención

def test_claim_job_is_exclusive_until_it_expires():
    assert db.claim_job("analisis", 600) is True
    assert db.claim_job("analisis", 600) is False
    assert db.claim_job("otra", 600) is True
    db.execute("UPDATE job_locks SET locked_until = ? WHERE name = 'analisis'", ("2000-01-01T00:00:00+00:00",))
    assert db.claim_job("analisis", 600) is True


def _days_ago(n: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=n)).isoformat(timespec="seconds")


def test_retention_purges_old_rows_but_keeps_the_latest_snapshot(monkeypatch):
    monkeypatch.setattr(settings, "audit_retention_days", 0)
    for age in (200, 150, 100):
        db.insert("board_snapshots", {"taken_at": _days_ago(age), "data_json": "{}"})
    db.insert("plan_changes", {"detected_at": _days_ago(400), "field": "due"})
    db.insert("plan_changes", {"detected_at": _days_ago(1), "field": "due"})
    db.insert("notifications", {"created_at": _days_ago(200), "level": "info", "title": "viejo leído", "read": 1})
    db.insert("notifications", {"created_at": _days_ago(200), "level": "info", "title": "viejo sin leer", "read": 0})
    db.insert("audit_log", {"ts": _days_ago(900), "actor": "Sistema", "actor_type": "sistema", "action": "antigua"})

    removed = retention.purge()
    assert removed == {"snapshots": 2, "cambios": 1, "avisos": 1}
    assert db.query_one("SELECT COUNT(*) n FROM board_snapshots")["n"] == 1   # se conserva la más reciente
    assert [r["title"] for r in db.query("SELECT title FROM notifications")] == ["viejo sin leer"]
    assert db.query_one("SELECT COUNT(*) n FROM audit_log WHERE action = 'antigua'")["n"] == 1  # la bitácora no se purga

    monkeypatch.setattr(settings, "audit_retention_days", 365)
    assert retention.purge().get("bitacora", 0) >= 1
