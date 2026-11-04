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


def mock_sequence(client, n):
    out = []
    for _ in range(n):
        r = client.post("/api/analyze", json={"image_b64": IMG})
        assert r.status_code == 200
        body = r.json()
        assert body["source"] == "mock"
        assert body["model_ms"] >= 0
        assert body["input_tokens"] is None and body["cost_usd"] is None
        out.append(body)
    return out


def test_mock_holds_each_answer_four_calls_by_default(client):
    n = len(MOCK_ANSWERS)
    bodies = mock_sequence(client, 4 * n + 1)
    expected = [a.model_dump() for a in MOCK_ANSWERS for _ in range(4)]
    got = [{k: b[k] for k in ("hazard", "side", "distance", "box", "distance_m", "sure")} for b in bodies]
    assert got == expected + expected[:1]
    assert {"clear", "unsure"} <= {b["hazard"] for b in bodies}


def test_mock_hold_is_configurable(make_settings):
    client = TestClient(create_app(make_settings(MOCK_HOLD_CALLS="1")))
    hazards = [b["hazard"] for b in mock_sequence(client, len(MOCK_ANSWERS) + 1)]
    assert hazards == [a.hazard for a in MOCK_ANSWERS] + [MOCK_ANSWERS[0].hazard]


def test_mock_boxes_plausible():
    for a in MOCK_ANSWERS:
        if a.hazard in ("clear", "unsure"):
            assert a.box is None
        else:
            x0, y0, x1, y1 = a.box
            assert 0 <= x0 < x1 <= 1000 and 0 <= y0 < y1 <= 1000


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
