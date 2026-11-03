"""Backend settings and tunable values. One place for every knob."""

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv

VisionMode = Literal["mock", "live"]
VISION_MODES: tuple[VisionMode, ...] = ("mock", "live")

BACKEND_DIR = Path(__file__).resolve().parent.parent
DEFAULT_ENV_FILE = BACKEND_DIR / ".env"
DEFAULT_SPEND_FILE = BACKEND_DIR / ".data" / "spend.json"

# Largest accepted base64 image payload (characters). A 640px JPEG is ~50-150 KB.
MAX_IMAGE_B64_CHARS = 2_000_000

# Prompt sent with every live frame. TENTATIVE: Owner approves the wording before Part B.
VISION_PROMPT_VERSION = "v1-tentative"
VISION_PROMPT = (
    "You are checking a photo for a research prototype that warns about hazards on a walking path. "
    "The photo is taken from chest height, facing forward. Find the single most important hazard on "
    "the path within about 5 metres: a step down, a step up, a curb, or another obstacle. Give its "
    "side (left, ahead or right) and distance (near means within about 2 metres, otherwise far). If "
    "the path is clear, answer clear. If the photo is too dark, blurred or unclear to judge, answer "
    "unsure. Do not describe people beyond calling them an obstacle."
)


@dataclass(frozen=True)
class Prices:
    """USD per 1M tokens."""

    input_per_m: float
    cached_input_per_m: float
    output_per_m: float


@dataclass(frozen=True)
class Settings:
    vision_mode: VisionMode
    model_api_key: str | None
    meta_base_url: str
    vision_model: str
    reasoning_effort: str
    timeout_s: float
    budget_usd: float
    prices: Prices
    spend_file: Path

    @property
    def key_present(self) -> bool:
        return bool(self.model_api_key)

    def __repr__(self) -> str:  # never print the key
        return f"Settings(vision_mode={self.vision_mode!r}, key_present={self.key_present}, model={self.vision_model!r})"


def _float(name: str, default: float) -> float:
    raw = os.environ.get(name, "").strip()
    return float(raw) if raw else default


def load_settings(env_file: Path | None = DEFAULT_ENV_FILE) -> Settings:
    """Reads backend/.env (if present) without overriding real environment variables."""
    if env_file is not None and env_file.is_file():
        load_dotenv(env_file, override=False)

    mode = os.environ.get("VISION_MODE", "mock").strip().lower()
    if mode not in VISION_MODES:
        raise ValueError(f"VISION_MODE must be one of {VISION_MODES}, got {mode!r}")

    return Settings(
        vision_mode=mode,  # type: ignore[arg-type]
        model_api_key=os.environ.get("MODEL_API_KEY", "").strip() or None,
        meta_base_url=os.environ.get("META_BASE_URL", "").strip() or "https://api.meta.ai/v1",
        vision_model=os.environ.get("VISION_MODEL", "").strip() or "muse-spark-1.3",
        # Lowest level Muse Spark accepts ("none" returns HTTP 400 per dev.meta.ai/docs/reasoning).
        reasoning_effort=os.environ.get("VISION_REASONING_EFFORT", "").strip() or "minimal",
        timeout_s=_float("VISION_TIMEOUT_S", 8.0),
        budget_usd=_float("BUDGET_USD", 25.0),
        prices=Prices(
            input_per_m=_float("PRICE_INPUT_PER_M", 1.25),
            cached_input_per_m=_float("PRICE_CACHED_INPUT_PER_M", 0.15),
            output_per_m=_float("PRICE_OUTPUT_PER_M", 4.25),
        ),
        spend_file=Path(os.environ.get("SPEND_FILE", "").strip() or DEFAULT_SPEND_FILE),
    )
