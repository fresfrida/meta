"""The fast-warning rule: confidence, horizon, side, distance from the box bottom, nearest first."""

import math

import pytest

from app.config import CAMERA_HEIGHT_M, SAM_MIN_CONF, VFOV_LANDSCAPE_DEG, VFOV_PORTRAIT_DEG
from app.detect_rule import RawHit, ground_distance_m, keep, kept_hits, parse_sam_text, to_grid


def raw(y2, x1=100, x2=260, y1=None, w=360, h=640, c=0.9, kind="steps"):
    return RawHit(kind, x1, y1 if y1 is not None else max(0, y2 - 50), x2, y2, w, h, c)


def test_parse_sam_text_reads_boxes_and_confidence_and_ignores_masks():
    text = (
        "<0f>0<|box;x1=353;y1=169;x2=381;y2=209;w=640;h=480;c=0.546|><|mask;x=0;y=0;data=4,5,!abc|>,"
        "1<|box;x1=311;y1=209;x2=370;y2=312;w=640;h=480;c=0.816|><|mask;x=0;y=0;data=1,1,!x|>\n"
    )
    hits = parse_sam_text(text, "steps")
    assert [(h.x1, h.y2, h.w, h.h, h.confidence) for h in hits] == [(353, 209, 640, 480, 0.546), (311, 312, 640, 480, 0.816)]
    assert parse_sam_text("", "curb") == []
    assert parse_sam_text("<|box;x1=1;y1=2|>", "curb") == []  # malformed: skipped, never guessed


def test_grid_is_0_to_1000_with_exclusive_far_edges():
    assert to_grid(RawHit("steps", 0, 530, 289, 639, 296, 640, 0.9)) == [0, 828, 980, 1000]


def test_confidence_below_the_minimum_is_dropped():
    assert keep(raw(500, c=SAM_MIN_CONF - 0.01)) is None
    assert keep(raw(500, c=SAM_MIN_CONF)) is not None


def test_box_bottom_at_or_above_the_horizon_is_dropped():
    assert keep(raw(319)) is None  # bottom edge 320 = frame centre of 640
    assert keep(raw(100)) is None


@pytest.mark.parametrize(
    ("w", "h", "vfov"),
    [(360, 640, VFOV_PORTRAIT_DEG), (640, 480, VFOV_LANDSCAPE_DEG)],
)
def test_distance_is_height_over_tan_of_angle_below_horizon(w, h, vfov):
    bottom = h * 0.7
    focal = (h / 2) / math.tan(math.radians(vfov) / 2)
    expected = CAMERA_HEIGHT_M / ((bottom - h / 2) / focal)
    assert ground_distance_m(bottom, h, portrait=h > w) == pytest.approx(expected)
    hit = keep(RawHit("curb", 10, 10, 50, round(bottom) - 1, w, h, 0.9))
    assert hit.distance_m == round(expected) and hit.distance == "far"


def test_brief_10_measured_boxes():
    # Brief 10 live SAM boxes -> the distances its report computed by hand.
    steps3 = kept_hits(parse_sam_text("<|box;x1=353;y1=169;x2=381;y2=209;w=640;h=480;c=0.546|><|box;x1=311;y1=209;x2=370;y2=312;w=640;h=480;c=0.816|>", "steps"))
    assert [(h.distance_m, h.side) for h in steps3] == [(9, "ahead")]  # upper flight: above the horizon, dropped
    cc0 = kept_hits(parse_sam_text("<|box;x1=160;y1=350;x2=639;y2=444;w=640;h=472;c=0.86|><|box;x1=17;y1=440;x2=95;y2=471;w=640;h=472;c=0.75|>", "curb"))
    assert [(h.distance, h.distance_m, h.side) for h in cc0] == [("near", None, "left"), ("far", 3, "right")]
    night = kept_hits(parse_sam_text("<|box;x1=0;y1=530;x2=289;y2=639;w=296;h=640;c=0.92|>", "steps"))
    assert [(h.distance, h.distance_m, h.box) for h in night] == [("near", None, [0, 828, 980, 1000])]


def test_touching_the_frame_bottom_is_near_without_metres():
    hit = keep(raw(639))
    assert hit.distance == "near" and hit.distance_m is None
    assert keep(raw(634)).distance == "near"  # within 1% of the bottom
    assert keep(raw(620)).distance == "far"


def test_beyond_10_metres_is_dropped_and_1_metre_is_the_floor():
    # Portrait: 10.5 m is ~50 px below the centre; just under the horizon is far beyond 10 m.
    assert keep(raw(330)) is None
    near_edge = keep(raw(600))
    assert near_edge is not None and near_edge.distance_m >= 1


def test_side_comes_from_the_box_centre_with_the_existing_lines():
    assert keep(raw(500, x1=0, x2=100)).side == "left"
    assert keep(raw(500, x1=150, x2=210)).side == "ahead"
    assert keep(raw(500, x1=260, x2=359)).side == "right"


def test_nearest_hit_comes_first():
    far = raw(420, kind="curb")
    near = raw(560, kind="steps")
    touching = raw(639, kind="curb", c=0.6)
    assert [h.kind for h in kept_hits([far, near])] == ["steps", "curb"]
    assert kept_hits([far, near, touching])[0].distance == "near"
