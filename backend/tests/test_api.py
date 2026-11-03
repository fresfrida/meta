import base64

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.vision import MOCK_ANSWERS

IMG = base64.b64encode(b"\xff\xd8\xff\xe0fake-jpeg").decode()


@pytest.fixture
def client(monkeypatch):
    monkeypatch.delenv("VISION_MODE", raising=False)
    return TestClient(create_app())


def test_health_reports_mock_by_default(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "vision_mode": "mock"}


def test_analyze_mock_cycles_fixed_answers(client):
    seen = []
    for _ in range(len(MOCK_ANSWERS) + 1):
        r = client.post("/api/analyze", json={"image_b64": IMG})
        assert r.status_code == 200
        body = r.json()
        assert body["source"] == "mock"
        assert body["model_ms"] >= 0
        seen.append((body["hazard"], body["side"], body["distance"]))
    expected = [(a.hazard, a.side, a.distance) for a in MOCK_ANSWERS]
    assert seen == expected + expected[:1]
    hazards = {h for h, _, _ in seen}
    assert {"clear", "unsure"} <= hazards


def test_analyze_rejects_bad_base64(client):
    r = client.post("/api/analyze", json={"image_b64": "not base64!!"})
    assert r.status_code == 422


def test_analyze_rejects_empty_body(client):
    r = client.post("/api/analyze", json={"image_b64": ""})
    assert r.status_code == 422


def test_live_mode_rejected_clearly(monkeypatch):
    monkeypatch.setenv("VISION_MODE", "live")
    client = TestClient(create_app())
    assert client.get("/api/health").json()["vision_mode"] == "live"
    r = client.post("/api/analyze", json={"image_b64": IMG})
    assert r.status_code == 501
    assert "Phase B" in r.json()["detail"]


def test_unknown_mode_fails_at_startup(monkeypatch):
    monkeypatch.setenv("VISION_MODE", "banana")
    with pytest.raises(ValueError):
        create_app()
