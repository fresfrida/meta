"""distance_m: whole metres 1..10 or null; an invalid value becomes null and the rest of the answer is kept."""

import json

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.schemas import VisionAnswer, vision_answer_json_schema
from app.vision import MOCK_ANSWERS

from .conftest import IMG
from .test_live import completion, live_app


def test_schema_distance_m_is_required_nullable_int_1_10():
    schema = vision_answer_json_schema()
    assert "distance_m" in schema["required"]
    assert schema["properties"]["distance_m"] == {
        "anyOf": [{"type": "integer", "minimum": 1, "maximum": 10}, {"type": "null"}]
    }


@pytest.mark.parametrize("value", [1, 5, 10])
def test_valid_distance_m_kept(value):
    a = VisionAnswer(hazard="obstacle", side="left", distance="far", box=[0, 0, 10, 10], distance_m=value)
    assert a.distance_m == value


@pytest.mark.parametrize("value", [0, 11, -1, 2.5, "3", True, [3], None])
def test_invalid_distance_m_becomes_null_rest_kept(value):
    a = VisionAnswer.model_validate(
        {"hazard": "curb", "side": "right", "distance": "near", "box": [600, 600, 900, 800], "distance_m": value}
    )
    assert a.distance_m is None
    assert (a.hazard, a.side, a.distance, a.box) == ("curb", "right", "near", [600, 600, 900, 800])


@pytest.mark.parametrize("hazard", ["clear", "unsure"])
def test_distance_m_null_for_clear_and_unsure(hazard):
    assert VisionAnswer(hazard=hazard, distance_m=3).distance_m is None


def test_mock_answers_carry_plausible_distance_m(make_settings):
    client = TestClient(create_app(make_settings(MOCK_HOLD_CALLS="1")))
    for expected in MOCK_ANSWERS:
        body = client.post("/api/analyze", json={"image_b64": IMG}).json()
        assert body["distance_m"] == expected.distance_m
        if expected.hazard in ("clear", "unsure"):
            assert body["distance_m"] is None
        else:
            assert 1 <= body["distance_m"] <= 10
            # near/far fallback agrees with the metres (near = within about 2 m)
            assert (body["distance_m"] <= 2) == (body["distance"] == "near")


def test_live_distance_m_passes_through(make_settings):
    content = json.dumps({"hazard": "step_down", "side": "ahead", "distance": "near", "box": [0, 600, 1000, 700], "distance_m": 2})
    client, fake, _ = live_app(make_settings, completion(content))
    body = client.post("/api/analyze", json={"image_b64": IMG}).json()
    assert body["distance_m"] == 2
    assert "distance_m" in fake.calls[0]["response_format"]["json_schema"]["schema"]["required"]


def test_live_bad_distance_m_kept_as_null(make_settings):
    content = json.dumps({"hazard": "obstacle", "side": "left", "distance": "far", "box": None, "distance_m": 40})
    client, _, _ = live_app(make_settings, completion(content))
    body = client.post("/api/analyze", json={"image_b64": IMG}).json()
    assert (body["hazard"], body["distance_m"], body["distance"]) == ("obstacle", None, "far")


def test_default_backend_timeout_is_10s(make_settings):
    assert make_settings().timeout_s == 10.0
