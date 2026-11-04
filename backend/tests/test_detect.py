"""/api/detect: mock hits through the rule, and live SAM calls against a fake server (no network): both concepts in
parallel on one client, bounded by time and size, billed per image per concept, key never logged."""

import json
import logging
import threading
import time

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import SAM_CONCEPTS, SAM_PRICE_PER_IMAGE
from app.detect import LiveDetect, MockDetect, jpeg_size
from app.main import create_app

from .conftest import FAKE_KEY, IMG


def sse(*events):
    return "".join(f"event: {e['type']}\ndata: {json.dumps(e)}\n\n" for e in events).encode()


def sam_stream(text):
    return sse(
        {"type": "response.created"},
        {"type": "response.output_text.delta", "delta": text},
        {"type": "response.completed", "response": {"usage": {"images_processed": 1}}},
    )


BOXES = {
    "stairs": "<0f>0<|box;x1=36;y1=420;x2=324;y2=500;w=360;h=640;c=0.9|><|mask;x=0;y=0;data=1,1,!x|>\n",
    "curb": "<0f>0<|box;x1=220;y1=400;x2=350;y2=460;w=360;h=640;c=0.4|>\n",  # below SAM_MIN_CONF: dropped
    "door": "",  # nothing found
}
N = len(SAM_CONCEPTS)


class FakeSam:
    def __init__(self, handler=None):
        self.requests = []
        self.threads = set()
        self.lock = threading.Lock()
        self.handler = handler or (lambda concept: httpx.Response(200, content=sam_stream(BOXES[concept])))

    def __call__(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        concept = body["input"][0]["content"][0]["text"]
        with self.lock:
            self.requests.append((request, body))
            self.threads.add(threading.get_ident())
        return self.handler(concept)


def live_detect_app(make_settings, fake, **env):
    settings = make_settings(VISION_MODE="live", MODEL_API_KEY=FAKE_KEY, **env)
    client = httpx.Client(
        base_url="https://api.meta.ai/v1", headers={"Authorization": f"Bearer {FAKE_KEY}"}, transport=httpx.MockTransport(fake)
    )
    return TestClient(create_app(settings, detector=LiveDetect(settings, client=client))), settings


def test_live_detect_sends_both_concepts_as_documented_and_keeps_only_passing_hits(make_settings):
    fake = FakeSam()
    client, _ = live_detect_app(make_settings, fake)
    r = client.post("/api/detect", json={"image_b64": IMG})
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "live" and body["found"] == 2  # stairs 1 + curb 1 + door 0
    assert [(h["kind"], h["side"], h["distance"]) for h in body["hits"]] == [("steps", "ahead", "far")]
    assert body["hits"][0]["box"] == [100, 656, 903, 783]
    assert body["cost_usd"] == pytest.approx(N * SAM_PRICE_PER_IMAGE)
    assert client.get("/api/health").json()["spent_usd"] == pytest.approx(N * SAM_PRICE_PER_IMAGE)

    assert sorted(b["input"][0]["content"][0]["text"] for _, b in fake.requests) == sorted(SAM_CONCEPTS.values())
    for request, b in fake.requests:
        assert request.url.path == "/v1/responses"
        assert request.headers["authorization"] == f"Bearer {FAKE_KEY}"
        assert b["model"] == "sam-3.1" and b["stream"] is True
        assert b["metadata"]["include_confidence"] == "true"
        image = b["input"][0]["content"][1]
        assert image == {"type": "input_image", "image_url": f"data:image/jpeg;base64,{IMG}"}


def test_the_two_concepts_run_in_parallel(make_settings):
    def slow(concept):
        time.sleep(0.3)
        return httpx.Response(200, content=sam_stream(""))

    fake = FakeSam(slow)
    client, _ = live_detect_app(make_settings, fake)
    started = time.perf_counter()
    assert client.post("/api/detect", json={"image_b64": IMG}).json()["hits"] == []
    assert time.perf_counter() - started < 0.55  # not 0.9 s in series
    assert len(fake.threads) == N


def test_one_concept_failing_still_returns_the_other(make_settings):
    def handler(concept):
        if concept == "curb":
            return httpx.Response(500, content=b"oops")
        return httpx.Response(200, content=sam_stream(BOXES[concept]))

    client, _ = live_detect_app(make_settings, FakeSam(handler))
    body = client.post("/api/detect", json={"image_b64": IMG}).json()
    assert [h["kind"] for h in body["hits"]] == ["steps"]
    assert body["cost_usd"] == pytest.approx((N - 1) * SAM_PRICE_PER_IMAGE)  # the refused one is not billed


def test_a_response_over_the_size_cap_is_aborted_but_billed(make_settings, monkeypatch):
    monkeypatch.setattr("app.detect.DETECT_MAX_BYTES", 1000)
    big = sse({"type": "response.output_text.delta", "delta": "x" * 5000})
    client, _ = live_detect_app(make_settings, FakeSam(lambda c: httpx.Response(200, content=big)))
    r = client.post("/api/detect", json={"image_b64": IMG})
    assert r.status_code == 502 and r.json()["detail"]["code"] == "model_error"
    assert client.get("/api/health").json()["spent_usd"] == pytest.approx(N * SAM_PRICE_PER_IMAGE)


def test_a_slow_stream_is_aborted_at_the_wall_clock_limit(make_settings, monkeypatch):
    monkeypatch.setattr("app.detect.DETECT_TIMEOUT_S", 0.2)

    def trickle():
        for _ in range(10):
            time.sleep(0.05)
            yield b": keep-alive\n\n"

    client, _ = live_detect_app(make_settings, FakeSam(lambda c: httpx.Response(200, content=trickle())))
    started = time.perf_counter()
    r = client.post("/api/detect", json={"image_b64": IMG})
    assert r.status_code == 504 and r.json()["detail"]["code"] == "model_timeout"
    assert time.perf_counter() - started < 0.45


def test_budget_reached_refuses_live_detect(make_settings, tmp_path):
    (tmp_path / "spend.json").write_text(json.dumps({"spent_usd": 2.0}))
    client, _ = live_detect_app(make_settings, FakeSam(), BUDGET_USD="1")
    r = client.post("/api/detect", json={"image_b64": IMG})
    assert r.status_code == 402 and r.json()["detail"]["code"] == "budget_reached"


def test_key_never_logged(make_settings, caplog):
    caplog.set_level(logging.DEBUG)
    client, _ = live_detect_app(make_settings, FakeSam(lambda c: httpx.Response(401, content=FAKE_KEY.encode())))
    client.post("/api/detect", json={"image_b64": IMG})
    assert FAKE_KEY not in caplog.text


def test_mock_detect_returns_rule_checked_hits_and_no_cost(make_settings):
    client = TestClient(create_app(make_settings(MOCK_HOLD_CALLS="1")))
    seen = [client.post("/api/detect", json={"image_b64": IMG}).json() for _ in range(4)]
    assert all(s["source"] == "mock" and s["cost_usd"] is None for s in seen)
    assert [[(h["kind"], h["side"], h["distance"]) for h in s["hits"]] for s in seen] == [
        [("steps", "ahead", "far")],
        [("curb", "right", "far")],
        [],
        [("steps", "ahead", "near")],
    ]


def test_mock_detect_delay():
    started = time.perf_counter()
    MockDetect(delay_ms=100).detect(IMG)
    assert time.perf_counter() - started >= 0.1


def test_jpeg_size_reads_the_frame_size():
    import base64

    sof = b"\xff\xd8" + b"\xff\xc0" + (17).to_bytes(2, "big") + b"\x08" + (480).to_bytes(2, "big") + (640).to_bytes(2, "big") + b"\x00" * 12
    assert jpeg_size(base64.b64encode(sof).decode()) == (640, 480)
    assert jpeg_size(IMG) == (0, 0)


def test_detect_mode_can_be_mock_while_vision_is_live(make_settings):
    client = TestClient(create_app(make_settings(VISION_MODE="live", MODEL_API_KEY=FAKE_KEY, DETECT_MODE="mock")))
    assert client.post("/api/detect", json={"image_b64": IMG}).json()["source"] == "mock"


def test_door_is_a_third_concept_and_its_hits_come_back_as_door(make_settings):
    assert SAM_CONCEPTS == {"steps": "stairs", "curb": "curb", "door": "door"}
    boxes = dict(BOXES, door="<0f>0<|box;x1=100;y1=300;x2=250;y2=560;w=360;h=640;c=0.85|>\n")
    client, _ = live_detect_app(make_settings, FakeSam(lambda c: httpx.Response(200, content=sam_stream(boxes[c]))))
    kinds = [h["kind"] for h in client.post("/api/detect", json={"image_b64": IMG}).json()["hits"]]
    assert "door" in kinds
