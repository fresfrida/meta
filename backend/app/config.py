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

# Bounding boxes are [x_min, y_min, x_max, y_max] on a 0..BOX_GRID_MAX grid.
BOX_GRID_MAX = 1000

# Side from box: a box whose centre x is <= LEFT_MAX is "left", >= RIGHT_MIN is "right", else "ahead".
# Owner approved 400 / 600 on 3 Nov (Brief 6; was 333 / 667, which read a bench at the walkway edge as "ahead").
LEFT_MAX = 400
RIGHT_MIN = 600

# distance_m: whole metres from the camera to the hazard, DISTANCE_M_MIN..DISTANCE_M_MAX, or null.
DISTANCE_M_MIN = 1
DISTANCE_M_MAX = 10

# Prompt sent with every live frame. Owner approved v5 on 4 Nov 2026 ("For now ok"), verbatim: 11 named hazards
# plus a clearer catch-all ("something else the person could walk into"). v4 (3 Nov) is in git history.
VISION_PROMPT_VERSION = "v5"
VISION_PROMPT = (
    'You are checking a photo for a research prototype that warns about hazards on a walking path. The '
    'photo is taken from chest height, facing forward. Find the single most important hazard on the path '
    'within about 5 metres. Name it as one of: a step down, a step up, a curb, an open drain, something '
    'at head height (such as a low branch or sign), a person, a group of people (three or more), a '
    'bicycle or scooter, a vehicle, a pole or post, a barrier or cone, a ramp, a door (including glass '
    'doors), a wall (including glass walls), or something else the person could walk into if none of '
    'these fit. Prefer drops and things at head height over things the person can walk around. Give its '
    'side (left, ahead or right) and distance (near means within about 2 metres, otherwise far). If the '
    'path is clear, answer clear. If the photo is too dark, blurred or unclear to judge, answer unsure. '
    'Do not identify or describe people beyond naming them as a person or a group of people. Also give '
    "the hazard's bounding box as [x_min, y_min, x_max, y_max] on a 0 to 1000 grid, or no box if the path "
    'is clear or you are unsure. Also estimate how far the hazard is from the camera in metres, as a '
    'whole number from 1 to 10, or no distance if the path is clear or you are unsure. Flat things lying '
    'on the ground, such as mats, rugs or painted lines, are not hazards.'
)

# Ask (Brief 6): the Owner-approved prompt, verbatim. The three {...} placeholders are filled by replace().
ASK_PROMPT = (
    "You are helping a person who is blind or has low vision understand the photo from their phone camera, "
    "taken from chest height facing forward. Their last warning was: {last warning}. They asked: {question}. "
    "Answer in {language}, in at most two short sentences, describing only what you can see. Never say it is "
    "safe to walk, cross or move; if you cannot tell, say so. Do not identify or describe people beyond saying "
    "there is a person."
)
ASK_MAX_SENTENCES = 2
# Upper bound on the model's output (reasoning included) for every live vision and Ask call, so no single call can
# run away (Brief 9: one call produced 147,757 tokens). Normal answers use ~270-650. A reply cut here is a failure.
MAX_OUTPUT_TOKENS = 2000
MAX_QUESTION_CHARS = 500
MAX_LAST_WARNING_CHARS = 200
# Language codes the phone sends -> names used in the Ask prompt and in the ASR languageBias (docs: names, not codes).
LANGUAGE_NAMES = {"en": "English", "zh": "Mandarin Chinese", "ms": "Malay", "ta": "Tamil"}

# Listen (Brief 6): realtime ASR proxy. Wake phrase TENTATIVE.
WAKE_PHRASE = "Hey Eyes"
ASK_WINDOW_MS = 6000  # after the wake phrase alone, the next turn within this long is the question
ASK_HOLD_TAIL_MS = 3000  # after a touch-and-hold ends, a turn completing within this long is still the question
ASR_SAMPLE_RATE = 16_000
ASR_FRAME_MS = 80  # docs examples use 80 ms frames
ASR_MAX_QUEUE_S = 2.0  # phone audio buffered beyond this is dropped (docs: never more than 5 s ahead)
ASR_HANDSHAKE_TIMEOUT_S = 10.0
ASR_END_DRAIN_S = 3.0  # after endStream, wait this long for the last events

# Fast warning (Brief 11): SAM 3.1 finds steps and kerbs in ~1-2 s and the phone speaks first; Muse adds the detail.
SAM_MODEL = "sam-3.1"
# Hit kind the phone shows -> SAM concept prompt (docs: one short noun phrase per request).
SAM_CONCEPTS = {"steps": "stairs", "curb": "curb"}
SAM_PRICE_PER_IMAGE = 2.50 / 1000  # USD per image per concept (docs: $2.50 per 1,000 images)
DETECT_TIMEOUT_S = 4.0  # per SAM request, wall clock
DETECT_MAX_BYTES = 2 * 1024 * 1024  # per SAM response; masks are streamed too, then ignored
SAM_MIN_CONF = 0.5  # hits below this confidence are dropped
# Distance from the box bottom, for a level phone held at chest height (pinhole camera, horizon = frame centre).
CAMERA_HEIGHT_M = 1.3
VFOV_PORTRAIT_DEG = 67.0  # typical phone main camera (26 mm equivalent, 4:3), long side vertical
VFOV_LANDSCAPE_DEG = 53.0  # short side vertical
BOTTOM_TOUCH_FRAC = 0.01  # a box ending within this fraction of the frame bottom touches it: "near", no metres


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
    mock_hold_calls: int
    listen_mode: VisionMode
    ask_mode: VisionMode
    asr_url: str
    asr_model: str
    asr_price_per_hour: float
    detect_mode: VisionMode
    # Mock only: pretend latency, so the two-speed loop can be seen without live calls (0 = instant).
    mock_vision_delay_ms: int
    mock_detect_delay_ms: int

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
    # Listen and Ask follow VISION_MODE unless set (e.g. a live Ask test while the camera loop stays on mock).
    listen_mode = os.environ.get("LISTEN_MODE", "").strip().lower() or mode
    ask_mode = os.environ.get("ASK_MODE", "").strip().lower() or mode
    detect_mode = os.environ.get("DETECT_MODE", "").strip().lower() or mode
    for name, value in (("LISTEN_MODE", listen_mode), ("ASK_MODE", ask_mode), ("DETECT_MODE", detect_mode)):
        if value not in VISION_MODES:
            raise ValueError(f"{name} must be one of {VISION_MODES}, got {value!r}")

    return Settings(
        vision_mode=mode,  # type: ignore[arg-type]
        model_api_key=os.environ.get("MODEL_API_KEY", "").strip() or None,
        meta_base_url=os.environ.get("META_BASE_URL", "").strip() or "https://api.meta.ai/v1",
        vision_model=os.environ.get("VISION_MODEL", "").strip() or "muse-spark-1.3",
        # Lowest level Muse Spark accepts ("none" returns HTTP 400 per dev.meta.ai/docs/reasoning).
        reasoning_effort=os.environ.get("VISION_REASONING_EFFORT", "").strip() or "minimal",
        timeout_s=_float("VISION_TIMEOUT_S", 10.0),
        budget_usd=_float("BUDGET_USD", 25.0),
        prices=Prices(
            input_per_m=_float("PRICE_INPUT_PER_M", 1.25),
            cached_input_per_m=_float("PRICE_CACHED_INPUT_PER_M", 0.15),
            output_per_m=_float("PRICE_OUTPUT_PER_M", 4.25),
        ),
        spend_file=Path(os.environ.get("SPEND_FILE", "").strip() or DEFAULT_SPEND_FILE),
        # Mock repeats each answer this many calls, so the frontend no-repeat rule can be seen.
        mock_hold_calls=max(1, int(_float("MOCK_HOLD_CALLS", 4))),
        listen_mode=listen_mode,  # type: ignore[arg-type]
        ask_mode=ask_mode,  # type: ignore[arg-type]
        asr_url=os.environ.get("META_ASR_URL", "").strip() or "wss://api.meta.ai/v1/asr/realtime",
        asr_model=os.environ.get("ASR_MODEL", "").strip() or "muse-voice-transcribe-1.0",
        # USD per hour of audio streamed (docs: $0.18/hour, billed per whole second).
        asr_price_per_hour=_float("ASR_PRICE_PER_HOUR", 0.18),
        detect_mode=detect_mode,  # type: ignore[arg-type]
        mock_vision_delay_ms=int(_float("MOCK_VISION_DELAY_MS", 0)),
        mock_detect_delay_ms=int(_float("MOCK_DETECT_DELAY_MS", 0)),
    )
