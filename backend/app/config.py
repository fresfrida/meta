"""Backend settings and tunable values. One place for every knob."""

import os
from dataclasses import dataclass
from typing import Literal

VisionMode = Literal["mock", "live"]
VISION_MODES: tuple[VisionMode, ...] = ("mock", "live")

# Largest accepted base64 image payload (characters). A 640px JPEG is ~50-150 KB.
MAX_IMAGE_B64_CHARS = 2_000_000


@dataclass(frozen=True)
class Settings:
    vision_mode: VisionMode


def load_settings() -> Settings:
    raw = os.environ.get("VISION_MODE", "mock").strip().lower()
    if raw not in VISION_MODES:
        raise ValueError(f"VISION_MODE must be one of {VISION_MODES}, got {raw!r}")
    return Settings(vision_mode=raw)  # type: ignore[arg-type]
