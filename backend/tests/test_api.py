import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.vision import MOCK_ANSWERS

from .conftest import IMG


@pytest.fixture
def client(make_settings):
    return TestClient(create_app(make_settings()))


def test_health_reports_mock_by_default(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {
        "status": "ok",
        "vision_mode": "mock",
        "model": None,
        "key_present": False,
        "spent_usd": 0.0,
        "budget_usd": 25.0,
    }


def test_analyze_mock_cycles_fixed_answers(client):
    seen = []
    for _ in range(len(MOCK_ANSWERS) + 1):
        r = client.post("/api/analyze", json={"image_b64": IMG})
        assert r.status_code == 200
        body = r.json()
        assert body["source"] == "mock"
        assert body["model_ms"] >= 0
        assert body["input_tokens"] is None and body["cost_usd"] is None
        seen.append((body["hazard"], body["side"], body["distance"]))
    expected = [(a.hazard, a.side, a.distance) for a in MOCK_ANSWERS]
    assert seen == expected + expected[:1]
    assert {"clear", "unsure"} <= {h for h, _, _ in seen}


def test_analyze_rejects_bad_base64(client):
    r = client.post("/api/analyze", json={"image_b64": "not base64!!"})
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "invalid_image"


def test_analyze_rejects_empty_body(client):
    r = client.post("/api/analyze", json={"image_b64": ""})
    assert r.status_code == 422


def test_unknown_mode_fails_at_startup(make_settings):
    with pytest.raises(ValueError):
        make_settings(VISION_MODE="banana")


def test_env_file_loaded_but_real_env_wins(tmp_path, monkeypatch):
    from app.config import load_settings

    env_file = tmp_path / ".env"
    env_file.write_text("VISION_MODE=live\nVISION_MODEL=from-file\nBUDGET_USD=3\n")
    monkeypatch.setenv("VISION_MODEL", "from-shell")
    s = load_settings(env_file=env_file)
    assert s.vision_mode == "live"
    assert s.vision_model == "from-shell"
    assert s.budget_usd == 3.0
