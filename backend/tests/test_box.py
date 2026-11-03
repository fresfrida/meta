import pytest

from app.config import VISION_PROMPT, VISION_PROMPT_VERSION
from app.schemas import VisionAnswer, vision_answer_json_schema
from app.vision import parse_answer

PROMPT_V2 = (
    "You are checking a photo for a research prototype that warns about hazards on a walking path. The photo is "
    "taken from chest height, facing forward. Find the single most important hazard on the path within about 5 "
    "metres: a step down, a step up, a curb, or another obstacle. Give its side (left, ahead or right) and distance "
    "(near means within about 2 metres, otherwise far). If the path is clear, answer clear. If the photo is too "
    "dark, blurred or unclear to judge, answer unsure. Do not describe people beyond calling them an obstacle. Also "
    "give the hazard's bounding box as [x_min, y_min, x_max, y_max] on a 0 to 1000 grid, or no box if the path is "
    "clear or you are unsure."
)


def test_prompt_v2_verbatim():
    assert VISION_PROMPT == PROMPT_V2
    assert VISION_PROMPT_VERSION == "v2"


def test_schema_box_is_nullable_array_of_4_ints_0_1000():
    schema = vision_answer_json_schema()
    assert "box" in schema["required"]
    array, null = schema["properties"]["box"]["anyOf"]
    assert null == {"type": "null"}
    assert array == {
        "type": "array",
        "items": {"type": "integer", "minimum": 0, "maximum": 1000},
        "minItems": 4,
        "maxItems": 4,
    }


def test_good_box_kept():
    a = VisionAnswer(hazard="curb", side="left", distance="near", box=[0, 10, 1000, 990])
    assert a.box == [0, 10, 1000, 990]


@pytest.mark.parametrize(
    "box",
    [
        [1, 2, 3],  # too short
        [1, 2, 3, 4, 5],  # too long
        [0, 0, 1001, 10],  # out of range
        [-1, 0, 10, 10],  # negative
        [10.5, 0, 20, 20],  # not integer
        [True, 0, 20, 20],  # bool is not a number here
        ["1", "2", "3", "4"],  # strings
        [500, 0, 100, 10],  # x_min > x_max
        [0, 500, 10, 100],  # y_min > y_max
        "0,0,10,10",
        {"x": 1},
    ],
)
def test_malformed_box_becomes_null_rest_kept(box):
    a = VisionAnswer.model_validate({"hazard": "obstacle", "side": "right", "distance": "far", "box": box})
    assert a.box is None
    assert (a.hazard, a.side, a.distance) == ("obstacle", "right", "far")


@pytest.mark.parametrize("hazard", ["clear", "unsure"])
def test_no_box_for_clear_or_unsure(hazard):
    assert VisionAnswer(hazard=hazard, box=[1, 2, 3, 4]).box is None


def test_parse_model_output_with_bad_box_keeps_answer():
    answer, reason = parse_answer('{"hazard":"step_down","side":"ahead","distance":"near","box":[1,2,3,9999]}')
    assert reason is None
    assert answer.hazard == "step_down" and answer.box is None


def test_parse_model_output_with_box():
    answer, _ = parse_answer('{"hazard":"step_down","side":"ahead","distance":"near","box":[100,600,900,950]}')
    assert answer.box == [100, 600, 900, 950]
