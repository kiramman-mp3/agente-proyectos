import pytest
from fastapi.testclient import TestClient

from app import chat, db
from app.security import hash_password


@pytest.fixture
def client():
    db.insert("users", {"username": "johan", "password_hash": hash_password("clave-gestor"), "role": "gestor",
                        "created_at": db.now_iso()})
    from app.main import app
    c = TestClient(app)
    tok = c.post("/auth/login", json={"username": "johan", "password": "clave-gestor"}).json()["token"]
    c.headers["Authorization"] = f"Bearer {tok}"
    return c


def seed():
    db.kv_set("board_meta", {"name": "Proyecto Demo", "url": "https://trello.com/b/x"})
    db.kv_set("summary", {"total": 1, "progress_weighted": 40})
    db.kv_set("activities", [{"name": "API de usuarios", "list": "En progreso", "status": "retrasada", "progress": 0.5,
                              "start": None, "due": "2026-10-01", "days_left": -3, "responsables": ["Luis Mora"],
                              "priority": "Alta", "at_risk": True, "risk_reasons": ["vencida"], "blocks": ["x"]}])


def test_chat_requires_login():
    from app.main import app
    assert TestClient(app).post("/chat", json={"messages": [{"role": "user", "content": "hola"}]}).status_code == 401


def test_chat_answers_with_project_context(client, monkeypatch):
    seed()
    seen = {}

    def fake(model, system, history, **_):
        seen.update(system=system, history=history)
        return "La actividad retrasada es API de usuarios."

    monkeypatch.setattr(chat, "chat_text", fake)
    r = client.post("/chat", json={"messages": [{"role": "user", "content": "¿Qué está retrasado?"}]})
    assert r.status_code == 200 and "API de usuarios" in r.json()["reply"]
    assert "Proyecto Demo" in seen["system"] and "API de usuarios" in seen["system"]
    assert seen["history"] == [{"role": "user", "content": "¿Qué está retrasado?"}]


def test_chat_history_is_trimmed_and_must_end_with_user(client, monkeypatch):
    monkeypatch.setattr(chat, "chat_text", lambda *a, **k: "ok")
    turns = [{"role": "user" if i % 2 == 0 else "assistant", "content": f"m{i}"} for i in range(30)]
    cleaned = chat.clean_history(turns[:29])
    assert len(cleaned) <= chat.MAX_TURNS and cleaned[0]["role"] == "user" and cleaned[-1]["role"] == "user"
    r = client.post("/chat", json={"messages": [{"role": "user", "content": "a"}, {"role": "assistant", "content": "b"}]})
    assert r.status_code == 422


def test_chat_reports_provider_failure_as_502(client, monkeypatch):
    from app.llm import LLMError

    def boom(*a, **k):
        raise LLMError("sin cuota")

    monkeypatch.setattr(chat, "chat_text", boom)
    r = client.post("/chat", json={"messages": [{"role": "user", "content": "hola"}]})
    assert r.status_code == 502 and "sin cuota" in r.json()["detail"]


def test_context_labels_proposals_and_counts_pending(client):
    now = db.now_iso()
    for status, action in (("pendiente_gestor", "reasignar"), ("ejecutada", "reprogramar")):
        db.insert("proposals", {"created_at": now, "updated_at": now, "source": "retraso", "action_type": action,
                                "target_name": "API", "params_json": "{}", "status": status})
    ctx = chat.build_context()
    assert ctx["propuestas_esperan_decision_del_gestor"]["cantidad"] == 1
    assert ctx["propuestas_esperan_decision_del_gestor"]["detalle"][0]["estado"] == "Espera la decisión del gestor"
    assert "pendiente_gestor" not in str(ctx)
