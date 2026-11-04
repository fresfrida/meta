import pytest

from app.config import VISION_PROMPT, VISION_PROMPT_VERSION
from app.schemas import VisionAnswer, vision_answer_json_schema
from app.vision import parse_answer

# Brief 13b (4 Nov 2026): v7 = v6 + the "are you sure" sentence and the kerb sentence, Owner approved verbatim.
PROMPT_V7 = (
    'You are checking a photo for a research prototype that warns about hazards on a walking path. The photo '
    'is taken from chest height, facing forward. Find the single most important hazard on the path within '
    'about 5 metres. Name it as one of: a step down, a step up, a curb, an open drain, something at head '
    'height (such as a low branch or sign), a person, a group of people (three or more), a bicycle or '
    'scooter, a vehicle, a pole or post, a barrier or cone, a ramp, a door (including glass doors), a wall '
    '(including glass walls), a road for cars (including an intersection), a road crossing, a cycle path, an '
    'escalator, uneven or broken ground, or something else the person could walk into if none of these fit. '
    'Prefer roads, drops and things at head height over things the person can walk around. Never answer clear '
    'if the path leads onto a road for cars, a road crossing or a cycle path; name it instead. Give its side '
    '(left, ahead or right) and distance (near means within about 2 metres, otherwise far). If the path is '
    'clear, answer clear. If the photo is too dark, blurred or unclear to judge, answer unsure. Do not '
    "identify or describe people beyond naming them as a person or a group of people. Also give the hazard's "
    'bounding box as [x_min, y_min, x_max, y_max] on a 0 to 1000 grid, or no box if the path is clear or you '
    'are unsure. Also estimate how far the hazard is from the camera in metres, as a whole number from 1 to '
    '10, or no distance if the path is clear or you are unsure. Also say whether you are sure what the hazard '
    'is. Flat things lying on the ground, such as mats, rugs or painted lines, are not hazards. A single '
    'raised edge between a footpath and a road is a curb, not a step.'
)


# Brief 28 (4 Nov 2026): v8 = v7 + the lift door in the list (after the escalator) + the double-door sentence at the end.
PROMPT_V8 = PROMPT_V7.replace(
    "an escalator, uneven or broken ground", "an escalator, a lift (elevator) door, uneven or broken ground"
) + " A door can be a single door, double doors or a glass door."


def test_prompt_v8_verbatim():
    assert VISION_PROMPT == PROMPT_V8
    assert VISION_PROMPT_VERSION == "v8"
    assert "a lift (elevator) door" in VISION_PROMPT
    assert VISION_PROMPT.endswith("A single raised edge between a footpath and a road is a curb, not a step. A door can be a single door, double doors or a glass door.")


def test_schema_asks_for_sure_as_a_required_boolean():
    schema = vision_answer_json_schema()
    assert schema["properties"]["sure"] == {"type": "boolean"}
    assert "sure" in schema["required"]


@pytest.mark.parametrize(("raw", "sure"), [("true", True), ("false", False), ("null", True), ('"no"', True)])
def test_sure_is_kept_and_anything_invalid_counts_as_sure(raw, sure):
    answer, problem = parse_answer('{"hazard": "curb", "side": "left", "distance": "near", "box": null, "distance_m": 2, "sure": %s}' % raw)
    assert problem is None and answer.sure is sure


def test_missing_sure_counts_as_sure():
    answer, _ = parse_answer('{"hazard": "curb", "side": "left", "distance": "near", "box": null, "distance_m": 2}')
    assert answer.sure is True


def test_schema_names_every_v6_kind_and_the_catch_all():
    hazards = vision_answer_json_schema()["properties"]["hazard"]["enum"]
    assert hazards == [
        "step_down", "step_up", "curb", "drain", "head_height", "person", "people", "bike", "vehicle",
        "pole", "barrier", "ramp", "door", "wall", "road", "crossing", "cycle_path", "escalator", "lift",
        "uneven", "obstacle", "clear", "unsure",
    ]  # fmt: skip


NEW_KINDS = [
    "drain", "head_height", "person", "people", "bike", "vehicle", "pole", "barrier", "ramp", "door", "wall",
    "road", "crossing", "cycle_path", "escalator", "lift", "uneven",
]  # fmt: skip


@pytest.mark.parametrize("kind", NEW_KINDS)
def test_new_kinds_parse_with_box_and_metres(kind):
    answer, problem = parse_answer(
        '{"hazard": "%s", "side": "left", "distance": "near", "box": [0, 100, 300, 900], "distance_m": 2}' % kind
    )
    assert problem is None
    assert (answer.hazard, answer.box, answer.distance_m) == (kind, [0, 100, 300, 900], 2)


def test_an_unknown_kind_is_still_unsure():
    answer, problem = parse_answer('{"hazard": "tree", "side": "left", "distance": "near", "box": null, "distance_m": null}')
    assert answer.hazard == "unsure" and problem is not None


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
