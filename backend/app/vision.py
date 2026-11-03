"""Vision answers. Phase A: mock only. Live mode is not built yet."""

from itertools import cycle
from threading import Lock

from .schemas import VisionAnswer

MOCK_ANSWERS: tuple[VisionAnswer, ...] = (
    VisionAnswer(hazard="step_down", side="ahead", distance="near"),
    VisionAnswer(hazard="clear"),
    VisionAnswer(hazard="obstacle", side="left", distance="far"),
    VisionAnswer(hazard="curb", side="right", distance="near"),
    VisionAnswer(hazard="step_up", side="ahead", distance="far"),
    VisionAnswer(hazard="unsure"),
)


class LiveModeUnavailable(RuntimeError):
    """Raised when VISION_MODE=live is requested before Phase B exists."""


class MockVision:
    """Cycles through MOCK_ANSWERS in order, one per call."""

    def __init__(self) -> None:
        self._answers = cycle(MOCK_ANSWERS)
        self._lock = Lock()

    def analyze(self, image_b64: str) -> VisionAnswer:
        with self._lock:
            return next(self._answers)
