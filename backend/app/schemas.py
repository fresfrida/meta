"""API shapes. Keep in sync with frontend/src/api/types.ts."""

from typing import Literal, Optional

from pydantic import BaseModel, Field

from .config import MAX_IMAGE_B64_CHARS

Hazard = Literal["step_down", "step_up", "curb", "obstacle", "clear", "unsure"]
Side = Literal["left", "ahead", "right"]
Distance = Literal["near", "far"]
Source = Literal["mock", "live"]


class VisionAnswer(BaseModel):
    hazard: Hazard
    side: Optional[Side] = None
    distance: Optional[Distance] = None


class AnalyzeRequest(BaseModel):
    image_b64: str = Field(min_length=1, max_length=MAX_IMAGE_B64_CHARS)


class AnalyzeResponse(VisionAnswer):
    source: Source
    model_ms: float


class HealthResponse(BaseModel):
    status: Literal["ok"]
    vision_mode: Source
