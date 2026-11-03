"""API shapes. Keep in sync with frontend/src/api/types.ts."""

from typing import Literal, Optional, get_args

from pydantic import BaseModel, Field

from .config import MAX_IMAGE_B64_CHARS

Hazard = Literal["step_down", "step_up", "curb", "obstacle", "clear", "unsure"]
Side = Literal["left", "ahead", "right"]
Distance = Literal["near", "far"]
Source = Literal["mock", "live"]
ErrorCode = Literal[
    "invalid_image",
    "key_missing",
    "budget_reached",
    "model_timeout",
    "model_auth",
    "model_billing",
    "model_error",
]


class VisionAnswer(BaseModel):
    hazard: Hazard
    side: Optional[Side] = None
    distance: Optional[Distance] = None


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
        },
        "required": ["hazard", "side", "distance"],
        "additionalProperties": False,
    }


class AnalyzeRequest(BaseModel):
    image_b64: str = Field(min_length=1, max_length=MAX_IMAGE_B64_CHARS)


class AnalyzeResponse(VisionAnswer):
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
