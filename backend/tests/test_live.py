"""Live path with a fake OpenAI client. No network calls."""

import json
import logging
from types import SimpleNamespace

import httpx
import openai
import pytest
from fastapi.testclient import TestClient

from app.budget import Budget, cost_usd
from app.config import VISION_PROMPT
from app.main import create_app
from app.vision import LiveVision, default_client_factory

from .conftest import FAKE_KEY, IMG


def completion(content, prompt_tokens=1400, completion_tokens=30, cached=0):
    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=content))],
        usage=SimpleNamespace(
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            prompt_tokens_details=SimpleNamespace(cached_tokens=cached),
        ),
    )


class FakeClient:
    def __init__(self, result):
        self.calls = []
        self._result = result
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def _create(self, **kwargs):
        self.calls.append(kwargs)
        if isinstance(self._result, Exception):
            raise self._result
        return self._result


def live_app(make_settings, result, **env):
    env.setdefault("VISION_MODE", "live")
    env.setdefault("MODEL_API_KEY", FAKE_KEY)
    settings = make_settings(**env)
    fake = FakeClient(result)
    vision = LiveVision(settings, client_factory=lambda s: fake)
    return TestClient(create_app(settings, vision=vision)), fake, settings


def test_good_json_answer_and_request_shape(make_settings):
    client, fake, settings = live_app(
        make_settings, completion(json.dumps({"hazard": "step_down", "side": "left", "distance": "near", "box": [10, 500, 400, 900]}))
    )
    r = client.post("/api/analyze", json={"image_b64": IMG})
    assert r.status_code == 200
    body = r.json()
    assert (body["hazard"], body["side"], body["distance"], body["source"]) == ("step_down", "left", "near", "live")
    assert body["box"] == [10, 500, 400, 900]
    assert body["input_tokens"] == 1400 and body["output_tokens"] == 30
    assert body["cost_usd"] == pytest.approx((1400 * 1.25 + 30 * 4.25) / 1e6)

    call = fake.calls[0]
    assert call["model"] == "muse-spark-1.3"
    assert call["reasoning_effort"] == "minimal"
    assert call["response_format"]["type"] == "json_schema"
    schema = call["response_format"]["json_schema"]["schema"]
    assert schema["properties"]["hazard"]["enum"] == ["step_down", "step_up", "curb", "obstacle", "clear", "unsure"]
    text, image = call["messages"][0]["content"]
    assert text == {"type": "text", "text": VISION_PROMPT}
    assert image["image_url"]["url"] == f"data:image/jpeg;base64,{IMG}"


@pytest.mark.parametrize(
    "content",
    ["not json at all", json.dumps({"hazard": "lava"}), json.dumps({"side": "left"}), "", None],
)
def test_bad_output_becomes_unsure_and_is_still_billed(make_settings, content, caplog):
    client, _, _ = live_app(make_settings, completion(content))
    with caplog.at_level(logging.WARNING):
        r = client.post("/api/analyze", json={"image_b64": IMG})
    assert r.status_code == 200
    assert r.json()["hazard"] == "unsure"
    assert "replaced with unsure" in caplog.text
    assert client.get("/api/health").json()["spent_usd"] > 0


def test_timeout_maps_to_model_timeout(make_settings):
    err = openai.APITimeoutError(request=httpx.Request("POST", "https://example.invalid"))
    client, _, _ = live_app(make_settings, err)
    r = client.post("/api/analyze", json={"image_b64": IMG})
    assert r.status_code == 504
    assert r.json()["detail"]["code"] == "model_timeout"
    assert client.get("/api/health").json()["spent_usd"] == 0


@pytest.mark.parametrize("status,code", [(401, "model_auth"), (402, "model_billing"), (500, "model_error")])
def test_api_status_errors(make_settings, status, code):
    req = httpx.Request("POST", "https://example.invalid")
    err = openai.APIStatusError("boom", response=httpx.Response(status, request=req), body=None)
    client, _, _ = live_app(make_settings, err)
    r = client.post("/api/analyze", json={"image_b64": IMG})
    assert r.status_code == 502
    assert r.json()["detail"]["code"] == code


def test_missing_key_is_clear_error(make_settings):
    settings = make_settings(VISION_MODE="live")
    client = TestClient(create_app(settings))
    assert client.get("/api/health").json()["key_present"] is False
    r = client.post("/api/analyze", json={"image_b64": IMG})
    assert r.status_code == 503
    assert r.json()["detail"]["code"] == "key_missing"


def test_refuses_at_cap_and_spend_survives_restart(make_settings, tmp_path):
    good = completion(json.dumps({"hazard": "clear", "side": None, "distance": None}), 1_000_000, 0)
    client, fake, settings = live_app(make_settings, good, BUDGET_USD="2")
    assert client.post("/api/analyze", json={"image_b64": IMG}).status_code == 200  # $1.25
    assert client.post("/api/analyze", json={"image_b64": IMG}).status_code == 200  # $2.50 >= $2
    r = client.post("/api/analyze", json={"image_b64": IMG})
    assert r.status_code == 402
    assert r.json()["detail"]["code"] == "budget_reached"
    assert len(fake.calls) == 2  # third frame never reached the model

    restarted = Budget(settings.spend_file, settings.budget_usd)
    assert restarted.spent_usd == pytest.approx(2.5)
    assert restarted.reached()


def test_unreadable_spend_file_refuses_live(make_settings, tmp_path):
    spend = tmp_path / "bad.json"
    spend.write_text("{not json")
    client, fake, _ = live_app(make_settings, completion("{}"), SPEND_FILE=str(spend))
    assert client.post("/api/analyze", json={"image_b64": IMG}).status_code == 402
    assert fake.calls == []


def test_cost_uses_cached_price():
    from app.config import Prices

    p = Prices(input_per_m=1.25, cached_input_per_m=0.15, output_per_m=4.25)
    assert cost_usd(p, 1000, 400, 100) == pytest.approx((600 * 1.25 + 400 * 0.15 + 100 * 4.25) / 1e6)


def test_key_never_in_responses_or_logs(make_settings, caplog):
    with caplog.at_level(logging.DEBUG):
        client, _, settings = live_app(make_settings, completion("garbage"))
        bodies = [
            client.get("/api/health").text,
            client.post("/api/analyze", json={"image_b64": IMG}).text,
        ]
        req = httpx.Request("POST", "https://example.invalid")
        err = openai.APIStatusError(f"bad key {FAKE_KEY}", response=httpx.Response(401, request=req), body=None)
        client2, _, _ = live_app(make_settings, err)
        bodies.append(client2.post("/api/analyze", json={"image_b64": IMG}).text)
    for text in bodies + [caplog.text, repr(settings), str(settings)]:
        assert FAKE_KEY not in text


def test_real_sdk_builds_expected_http_request(make_settings):
    """The real OpenAI SDK, with an in-memory transport: checks the wire format, no network."""
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["auth"] = request.headers.get("authorization")
        seen["body"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "id": "x",
                "object": "chat.completion",
                "created": 0,
                "model": "muse-spark-1.3",
                "choices": [
                    {
                        "index": 0,
                        "finish_reason": "stop",
                        "message": {"role": "assistant", "content": '{"hazard":"curb","side":"right","distance":"far"}'},
                    }
                ],
                "usage": {"prompt_tokens": 1300, "completion_tokens": 20, "total_tokens": 1320},
            },
        )

    def factory(s):
        client = default_client_factory(s)
        return client.with_options(http_client=httpx.Client(transport=httpx.MockTransport(handler)))

    settings = make_settings(VISION_MODE="live", MODEL_API_KEY=FAKE_KEY)
    result = LiveVision(settings, client_factory=factory).analyze(IMG)
    assert result.answer.hazard == "curb"
    assert result.input_tokens == 1300 and result.cached_tokens == 0
    assert seen["url"] == "https://api.meta.ai/v1/chat/completions"
    assert seen["auth"] == f"Bearer {FAKE_KEY}"
    assert seen["body"]["reasoning_effort"] == "minimal"
    assert seen["body"]["response_format"]["json_schema"]["name"] == "vision_answer"
