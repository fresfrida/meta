"""API shapes. Keep in sync with frontend/src/api/types.ts."""

from typing import Any, Literal, Optional, get_args

from pydantic import BaseModel, Field, field_validator, model_validator

from .config import (
    BOX_GRID_MAX,
    DISTANCE_M_MAX,
    DISTANCE_M_MIN,
    LEFT_MAX,
    MAX_IMAGE_B64_CHARS,
    MAX_LAST_WARNING_CHARS,
    MAX_QUESTION_CHARS,
    RIGHT_MIN,
)

# Prompt v6 (Brief 13): 19 named kinds, "obstacle" = the catch-all ("something else the person could walk into").
Hazard = Literal[
    "step_down",
    "step_up",
    "curb",
    "drain",
    "head_height",
    "person",
    "people",
    "bike",
    "vehicle",
    "pole",
    "barrier",
    "ramp",
    "door",
    "wall",
    "road",
    "crossing",
    "cycle_path",
    "escalator",
    "lift",
    "uneven",
    "obstacle",
    "clear",
    "unsure",
]
Side = Literal["left", "ahead", "right"]
Distance = Literal["near", "far"]
Source = Literal["mock", "live"]
Language = Literal["en", "zh", "ms", "ta"]
SideSource = Literal["box", "model"]
ErrorCode = Literal[
    "invalid_image",
    "key_missing",
    "budget_reached",
    "model_timeout",
    "model_auth",
    "model_billing",
    "model_error",
    "empty_answer",
    "slot_ended",
    "slots_full",
    "daily_budget",
    "rate_limited",
]


Box = list[int]  # [x_min, y_min, x_max, y_max] on a 0..BOX_GRID_MAX grid


def valid_box(value: Any) -> Box | None:
    """The one box rule: exactly 4 integers in 0..BOX_GRID_MAX with min <= max, else None."""
    if not isinstance(value, (list, tuple)) or len(value) != 4:
        return None
    if not all(isinstance(v, int) and not isinstance(v, bool) and 0 <= v <= BOX_GRID_MAX for v in value):
        return None
    x_min, y_min, x_max, y_max = value
    if x_min > x_max or y_min > y_max:
        return None
    return list(value)


def valid_distance_m(value: Any) -> int | None:
    """Whole metres DISTANCE_M_MIN..DISTANCE_M_MAX, else None."""
    if isinstance(value, int) and not isinstance(value, bool) and DISTANCE_M_MIN <= value <= DISTANCE_M_MAX:
        return value
    return None


class VisionAnswer(BaseModel):
    hazard: Hazard
    side: Optional[Side] = None
    distance: Optional[Distance] = None
    box: Optional[Box] = None
    distance_m: Optional[int] = None
    # Prompt v7: is the model sure what the hazard is? Missing, null or invalid counts as sure (never a guess of "unsure").
    sure: bool = True

    @field_validator("sure", mode="before")
    @classmethod
    def _sure_or_true(cls, value: Any) -> bool:
        return value if isinstance(value, bool) else True

    @field_validator("distance_m", mode="before")
    @classmethod
    def _distance_m_or_none(cls, value: Any) -> int | None:
        # An invalid distance becomes null; the rest of the answer is kept (distance near/far stays the fallback).
        return valid_distance_m(value)

    @field_validator("box", mode="before")
    @classmethod
    def _box_or_none(cls, value: Any) -> Box | None:
        # A malformed or out-of-range box becomes null; the rest of the answer is kept.
        return valid_box(value)

    @model_validator(mode="after")
    def _no_box_without_hazard(self) -> "VisionAnswer":
        if self.hazard in ("clear", "unsure"):
            self.box = None
            self.distance_m = None
        return self


def side_of_box(box: Box) -> Side:
    """The one side rule for a box: its centre x against LEFT_MAX / RIGHT_MIN (Muse and SAM boxes alike)."""
    centre_x = (box[0] + box[2]) / 2
    if centre_x <= LEFT_MAX:
        return "left"
    if centre_x >= RIGHT_MIN:
        return "right"
    return "ahead"


def resolve_side(answer: VisionAnswer) -> tuple[Optional[Side], SideSource]:
    """With a box, side comes from the box centre x; without one, the model's side stands."""
    if answer.box is None:
        return answer.side, "model"
    return side_of_box(answer.box), "box"


def vision_answer_json_schema() -> dict:
    """JSON schema for the model's answer, built from the same Literal types as VisionAnswer."""

    def nullable_enum(values: tuple[str, ...]) -> dict:
        return {"anyOf": [{"type": "string", "enum": list(values)}, {"type": "null"}]}

    return {
        "type": "object",
        "properties": {
            "hazard": {"type": "string", "enum": list(get_args(Hazard))},
            "side": nullable_enum(get_args(Side)),
            "distance": nullable_enum(get_args(Distance)),
            "box": {
                "anyOf": [
                    {
                        "type": "array",
                        "items": {"type": "integer", "minimum": 0, "maximum": BOX_GRID_MAX},
                        "minItems": 4,
                        "maxItems": 4,
                    },
                    {"type": "null"},
                ]
            },
            "distance_m": {
                "anyOf": [
                    {"type": "integer", "minimum": DISTANCE_M_MIN, "maximum": DISTANCE_M_MAX},
                    {"type": "null"},
                ]
            },
            "sure": {"type": "boolean"},
        },
        "required": ["hazard", "side", "distance", "box", "distance_m", "sure"],
        "additionalProperties": False,
    }


class AnalyzeRequest(BaseModel):
    image_b64: str = Field(min_length=1, max_length=MAX_IMAGE_B64_CHARS)


class AnalyzeResponse(VisionAnswer):
    side_source: SideSource
    source: Source
    model_ms: float
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None
    cost_usd: Optional[float] = None


class HealthResponse(BaseModel):
    status: Literal["ok"]
    vision_mode: Source
    model: Optional[str]
    key_present: bool
    spent_usd: float
    budget_usd: float
    # Public demo (Brief 17): the page shows the notice and asks for a slot when this is true.
    public_demo: bool = False
    demo_slot_s: Optional[int] = None
    video_url: Optional[str] = None


class SlotRequest(BaseModel):
    device_id: str = Field(min_length=8, max_length=64)


class SlotResponse(BaseModel):
    token: str
    expires_in_s: float


class ErrorDetail(BaseModel):
    code: ErrorCode
    message: str


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=MAX_QUESTION_CHARS)
    image_b64: str = Field(min_length=1, max_length=MAX_IMAGE_B64_CHARS)
    last_warning: Optional[str] = Field(default=None, max_length=MAX_LAST_WARNING_CHARS)
    language: Language


class AskResponse(BaseModel):
    question: str
    answer: str
    source: Source
    model_ms: float
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None
    cost_usd: Optional[float] = None


DetectKind = Literal["steps", "curb", "door", "vehicle"]  # vehicle: SAM "car" (Brief 29)


class DetectRequest(BaseModel):
    image_b64: str = Field(min_length=1, max_length=MAX_IMAGE_B64_CHARS)
    # Brief 29: the fast car warning for this frame (?car=0 / ?car=1 on the phone); None = the server's CAR_FAST.
    car: Optional[bool] = None


class DetectHit(BaseModel):
    """A kept SAM hit (see detect_rule.py): side from the box, distance from the box bottom."""

    kind: DetectKind
    box: Box
    confidence: float
    side: Side
    distance: Distance  # "near" when the box touches the frame bottom (then distance_m is null)
    distance_m: Optional[int] = None


class DetectResponse(BaseModel):
    hits: list[DetectHit]  # kept hits, nearest first; empty when nothing passed the rule
    found: int  # boxes SAM returned before the rule
    beside: int = 0  # kept by confidence and distance, but beside the walking path: not spoken, not drawn
    source: Source
    sam_ms: float
    cost_usd: Optional[float] = None
