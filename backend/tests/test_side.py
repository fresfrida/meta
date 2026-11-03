"""Side from box: the box centre x decides left / ahead / right; without a box the model's side stands."""

import json

import pytest
from fastapi.testclient import TestClient

from app.config import LEFT_MAX, RIGHT_MIN
from app.main import create_app
from app.schemas import VisionAnswer, resolve_side
from app.vision import MOCK_ANSWERS

from .conftest import IMG
from .test_live import completion, live_app


# Centre x = (x_min + x_max) / 2, so odd sums give half-steps either side of each threshold.
@pytest.mark.parametrize(
    ("x_min", "x_max", "side"),
    [
        (0, 0, "left"),
        (0, 2 * LEFT_MAX, "left"),  # centre exactly LEFT_MAX
        (0, 2 * LEFT_MAX + 1, "ahead"),  # centre LEFT_MAX + 0.5
        (400, 600, "ahead"),
        (2 * RIGHT_MIN - 1000 - 1, 1000, "ahead"),  # centre RIGHT_MIN - 0.5
        (2 * RIGHT_MIN - 1000, 1000, "right"),  # centre exactly RIGHT_MIN
        (1000, 1000, "right"),
    ],
)
def test_side_from_box_centre_at_thresholds(x_min, x_max, side):
    answer = VisionAnswer(hazard="obstacle", side=None, distance="near", box=[x_min, 100, x_max, 200])
    assert answer.box is not None
    assert resolve_side(answer) == (side, "box")


def test_box_overrides_the_models_side():
    answer = VisionAnswer(hazard="curb", side="left", distance="far", box=[700, 500, 900, 700])
    assert resolve_side(answer) == ("right", "box")


@pytest.mark.parametrize("side", ["left", "ahead", "right", None])
def test_null_box_keeps_the_models_side(side):
    answer = VisionAnswer(hazard="step_down", side=side, distance="near", box=None)
    assert resolve_side(answer) == (side, "model")


def test_malformed_box_falls_back_to_the_models_side():
    answer = VisionAnswer(hazard="step_up", side="left", distance="far", box=[900, 0, 100, 10])  # inverted
    assert answer.box is None
    assert resolve_side(answer) == ("left", "model")


@pytest.mark.parametrize("hazard", ["clear", "unsure"])
def test_clear_and_unsure_are_model_side(hazard):
    assert resolve_side(VisionAnswer(hazard=hazard)) == (None, "model")


def test_mock_responses_carry_side_source_and_side_matches_box(make_settings):
    client = TestClient(create_app(make_settings(MOCK_HOLD_CALLS="1")))
    for expected in MOCK_ANSWERS:
        body = client.post("/api/analyze", json={"image_b64": IMG}).json()
        assert body["hazard"] == expected.hazard
        if expected.box is None:
            assert body["side_source"] == "model"
            assert body["side"] == expected.side
        else:
            assert body["side_source"] == "box"
            # Mock sides were written to agree with their boxes.
            assert body["side"] == expected.side


def test_live_answer_side_comes_from_box(make_settings):
    content = json.dumps({"hazard": "obstacle", "side": "ahead", "distance": "near", "box": [20, 400, 300, 800]})
    client, _, _ = live_app(make_settings, completion(content))
    body = client.post("/api/analyze", json={"image_b64": IMG}).json()
    assert (body["side"], body["side_source"], body["box"]) == ("left", "box", [20, 400, 300, 800])


def test_live_answer_without_box_keeps_model_side(make_settings):
    content = json.dumps({"hazard": "obstacle", "side": "right", "distance": "far", "box": None})
    client, _, _ = live_app(make_settings, completion(content))
    body = client.post("/api/analyze", json={"image_b64": IMG}).json()
    assert (body["side"], body["side_source"], body["box"]) == ("right", "model", None)
