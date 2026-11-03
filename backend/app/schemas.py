"""API shapes. Keep in sync with frontend/src/api/types.ts."""

from typing import Any, Literal, Optional, get_args

from pydantic import BaseModel, Field, field_validator, model_validator

from .config import BOX_GRID_MAX, LEFT_MAX, MAX_IMAGE_B64_CHARS, RIGHT_MIN

Hazard = Literal["step_down", "step_up", "curb", "obstacle", "clear", "unsure"]
Side = Literal["left", "ahead", "right"]
Distance = Literal["near", "far"]
Source = Literal["mock", "live"]
SideSource = Literal["box", "model"]
ErrorCode = Literal[
    "invalid_image",
    "key_missing",
    "budget_reached",
    "model_timeout",
    "model_auth",
    "model_billing",
    "model_error",
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


class VisionAnswer(BaseModel):
    hazard: Hazard
    side: Optional[Side] = None
    distance: Optional[Distance] = None
    box: Optional[Box] = None

    @field_validator("box", mode="before")
    @classmethod
    def _box_or_none(cls, value: Any) -> Box | None:
        # A malformed or out-of-range box becomes null; the rest of the answer is kept.
        return valid_box(value)

    @model_validator(mode="after")
    def _no_box_without_hazard(self) -> "VisionAnswer":
        if self.hazard in ("clear", "unsure"):
            self.box = None
        return self


def resolve_side(answer: VisionAnswer) -> tuple[Optional[Side], SideSource]:
    """The one side rule: with a box, side comes from the box centre x; without one, the model's side stands."""
    if answer.box is None:
        return answer.side, "model"
    x_min, _, x_max, _ = answer.box
    centre_x = (x_min + x_max) / 2
    if centre_x <= LEFT_MAX:
        return "left", "box"
    if centre_x >= RIGHT_MIN:
        return "right", "box"
    return "ahead", "box"


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
        },
        "required": ["hazard", "side", "distance", "box"],
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


class ErrorDetail(BaseModel):
    code: ErrorCode
    message: str
