"""The fast-warning rule: SAM boxes -> kept hits with side and distance. One rule, one file.

Keep a hit when its confidence is >= SAM_MIN_CONF and its box bottom is below the horizon (the frame centre line,
for a level phone). Side comes from the box centre (the same rule as Muse boxes). Distance comes from the box
bottom: a pinhole camera CAMERA_HEIGHT_M above flat ground, vertical field of view by the frame's orientation,
distance = height / tan(angle below the horizon), whole metres 1..DISTANCE_M_MAX; further -> dropped. A box touching
the frame bottom is "near" without metres (the ground it stands on is closer than the frame shows). Nearest first.

In the walking path only (Brief 15): at the box's ground point, its left and right edges are turned into metres
sideways (same camera, square pixels); the hit is kept when that span overlaps +-PATH_HALF_WIDTH_M. A box touching
the frame bottom has no ground point in view, so it is in the path when it overlaps the centre half of the frame.
Hits beside the path are dropped and only counted.
"""

import math
import re
from dataclasses import dataclass

from .config import (
    BOTTOM_TOUCH_FRAC,
    BOX_GRID_MAX,
    CAMERA_HEIGHT_M,
    DISTANCE_M_MAX,
    DISTANCE_M_MIN,
    PATH_HALF_WIDTH_M,
    SAM_MIN_CONF,
    VFOV_LANDSCAPE_DEG,
    VFOV_PORTRAIT_DEG,
)
from .schemas import DetectHit, DetectKind, side_of_box


@dataclass(frozen=True)
class RawHit:
    """One SAM box in source pixels (x2, y2 inclusive, as SAM writes them) on a w x h frame."""

    kind: DetectKind
    x1: int
    y1: int
    x2: int
    y2: int
    w: int
    h: int
    confidence: float


_BOX = re.compile(r"<\|box;([^|]*)\|>")


def parse_sam_text(text: str, kind: DetectKind) -> list[RawHit]:
    """SAM's output text -> boxes. Masks are ignored. A box without a confidence counts as 0 (dropped later)."""
    hits = []
    for body in _BOX.findall(text):
        kv = dict(part.split("=", 1) for part in body.split(";") if "=" in part)
        try:
            hits.append(
                RawHit(
                    kind=kind,
                    x1=int(kv["x1"]),
                    y1=int(kv["y1"]),
                    x2=int(kv["x2"]),
                    y2=int(kv["y2"]),
                    w=int(kv["w"]),
                    h=int(kv["h"]),
                    confidence=float(kv.get("c", 0.0)),
                )
            )
        except (KeyError, ValueError):
            continue  # a malformed box is skipped, never guessed
    return hits


def to_grid(raw: RawHit) -> list[int]:
    """Pixels (inclusive) -> the app's 0..1000 grid (exclusive right / bottom edges)."""

    def g(v: int, size: int) -> int:
        return max(0, min(BOX_GRID_MAX, round(v * BOX_GRID_MAX / size)))

    return [g(raw.x1, raw.w), g(raw.y1, raw.h), g(raw.x2 + 1, raw.w), g(raw.y2 + 1, raw.h)]


def focal_px(h: int, portrait: bool) -> float:
    """Focal length in pixels from the vertical field of view (the horizontal one follows from the aspect ratio)."""
    vfov = math.radians(VFOV_PORTRAIT_DEG if portrait else VFOV_LANDSCAPE_DEG)
    return (h / 2) / math.tan(vfov / 2)


def ground_distance_m(bottom_px: float, h: int, portrait: bool) -> float | None:
    """Metres to the ground point at `bottom_px` (0 = top) for a level camera; None at or above the horizon."""
    below = bottom_px - h / 2
    if below <= 0:
        return None
    return CAMERA_HEIGHT_M * focal_px(h, portrait) / below


def lateral_span_m(raw: RawHit, forward_m: float) -> tuple[float, float]:
    """The box's left and right edges, in metres sideways from straight ahead (negative = left), at `forward_m`."""
    f = focal_px(raw.h, portrait=raw.h > raw.w)
    cx = raw.w / 2
    return (raw.x1 - cx) * forward_m / f, (raw.x2 + 1 - cx) * forward_m / f


def in_path(raw: RawHit, forward_m: float | None) -> bool:
    """Does the box overlap the walking path? `forward_m` None: the box touches the frame bottom."""
    if forward_m is None:
        return raw.x1 < raw.w * 3 / 4 and raw.x2 + 1 > raw.w / 4  # overlaps the centre half of the frame
    left, right = lateral_span_m(raw, forward_m)
    return left < PATH_HALF_WIDTH_M and right > -PATH_HALF_WIDTH_M


BESIDE = "beside"  # keep()'s answer for a hit dropped only because it is beside the walking path


def keep(raw: RawHit) -> DetectHit | str | None:
    """The rule for one box: a DetectHit; BESIDE when it is beside the walking path; None when dropped otherwise."""
    if raw.w <= 0 or raw.h <= 0 or raw.confidence < SAM_MIN_CONF:
        return None
    bottom = raw.y2 + 1
    metres = ground_distance_m(bottom, raw.h, portrait=raw.h > raw.w)
    if metres is None:
        return None  # at or above the horizon: not on the ground ahead
    box = to_grid(raw)
    touching = bottom >= raw.h * (1 - BOTTOM_TOUCH_FRAC)
    if touching:
        if not in_path(raw, None):
            return BESIDE
        return DetectHit(kind=raw.kind, box=box, confidence=raw.confidence, side=side_of_box(box), distance="near")
    whole = max(DISTANCE_M_MIN, round(metres))
    if whole > DISTANCE_M_MAX:
        return None
    if not in_path(raw, metres):
        return BESIDE
    return DetectHit(
        kind=raw.kind, box=box, confidence=raw.confidence, side=side_of_box(box), distance="far", distance_m=whole
    )


def kept_hits(raws: list[RawHit]) -> tuple[list[DetectHit], int]:
    """Hits in the walking path, nearest first (touching the bottom first, then fewer metres, then higher
    confidence), and how many were beside the path."""
    results = [keep(r) for r in raws]
    hits = [h for h in results if isinstance(h, DetectHit)]
    beside = sum(1 for h in results if h == BESIDE)
    return sorted(hits, key=lambda h: (h.distance_m or 0, -h.confidence)), beside
