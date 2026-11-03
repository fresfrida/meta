"""Vision answers: a fixed mock list, or the live Meta Model API."""

import json
import logging
import time
from dataclasses import dataclass
from itertools import cycle
from threading import Lock
from typing import Any, Callable, Protocol

from pydantic import ValidationError

from .config import VISION_PROMPT, Settings
from .schemas import VisionAnswer, vision_answer_json_schema

log = logging.getLogger(__name__)

MOCK_ANSWERS: tuple[VisionAnswer, ...] = (
    # Boxes sit between the phrase card and the bottom controls, as a real hazard on the path would.
    VisionAnswer(hazard="step_down", side="ahead", distance="near", box=[80, 600, 920, 720], distance_m=2),
    VisionAnswer(hazard="clear"),
    VisionAnswer(hazard="obstacle", side="left", distance="far", box=[60, 380, 300, 640], distance_m=5),
    VisionAnswer(hazard="curb", side="right", distance="near", box=[620, 600, 980, 770], distance_m=1),
    VisionAnswer(hazard="step_up", side="ahead", distance="far", box=[300, 440, 700, 560], distance_m=6),
    VisionAnswer(hazard="unsure"),
)

UNSURE = VisionAnswer(hazard="unsure")


@dataclass(frozen=True)
class VisionResult:
    answer: VisionAnswer
    model_ms: float
    input_tokens: int | None = None
    cached_tokens: int | None = None
    output_tokens: int | None = None


class VisionError(Exception):
    """A live call failed. `code` matches schemas.ErrorCode; the message never holds secrets."""

    def __init__(self, code: str, message: str, status: int) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


class Vision(Protocol):
    def analyze(self, image_b64: str) -> VisionResult: ...


class MockVision:
    """Cycles through MOCK_ANSWERS in order, repeating each one `hold_calls` times."""

    def __init__(self, hold_calls: int = 1) -> None:
        self._answers = cycle([a for a in MOCK_ANSWERS for _ in range(hold_calls)])
        self._lock = Lock()

    def analyze(self, image_b64: str) -> VisionResult:
        started = time.perf_counter()
        with self._lock:
            answer = next(self._answers)
        return VisionResult(answer=answer, model_ms=(time.perf_counter() - started) * 1000)


def parse_answer(content: str | None) -> tuple[VisionAnswer, str | None]:
    """Model text -> VisionAnswer. Anything unparseable becomes unsure, with the reason."""
    if not content:
        return UNSURE, "empty model output"
    try:
        return VisionAnswer.model_validate(json.loads(content)), None
    except json.JSONDecodeError:
        return UNSURE, "model output is not JSON"
    except ValidationError as exc:
        return UNSURE, f"model output does not match schema ({exc.error_count()} errors)"


def default_client_factory(settings: Settings) -> Any:
    from openai import OpenAI

    # max_retries=0: one frame, one attempt; a stale retry is worse than "unsure" for this app.
    return OpenAI(
        base_url=settings.meta_base_url,
        api_key=settings.model_api_key,
        timeout=settings.timeout_s,
        max_retries=0,
    )


class LiveVision:
    """One base64 JPEG -> muse-spark (Chat Completions, json_schema structured output)."""

    def __init__(self, settings: Settings, client_factory: Callable[[Settings], Any] = default_client_factory) -> None:
        self._settings = settings
        self._client = client_factory(settings) if settings.key_present else None

    def analyze(self, image_b64: str) -> VisionResult:
        if self._client is None:
            raise VisionError("key_missing", "MODEL_API_KEY is not set on the backend", 503)

        import openai

        s = self._settings
        started = time.perf_counter()
        try:
            response = self._client.chat.completions.create(
                model=s.vision_model,
                reasoning_effort=s.reasoning_effort,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": VISION_PROMPT},
                            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"}},
                        ],
                    }
                ],
                response_format={
                    "type": "json_schema",
                    "json_schema": {"name": "vision_answer", "schema": vision_answer_json_schema()},
                },
            )
        except openai.APITimeoutError:
            raise VisionError("model_timeout", f"model did not answer within {s.timeout_s:g} s", 504)
        except openai.APIConnectionError:
            raise VisionError("model_error", "could not connect to the model API", 502)
        except openai.APIStatusError as exc:
            raise _status_error(exc.status_code)
        model_ms = (time.perf_counter() - started) * 1000

        content = response.choices[0].message.content if response.choices else None
        answer, reason = parse_answer(content)
        if reason:
            log.warning("live answer replaced with unsure: %s", reason)

        usage = response.usage
        details = getattr(usage, "prompt_tokens_details", None) if usage else None
        return VisionResult(
            answer=answer,
            model_ms=model_ms,
            input_tokens=usage.prompt_tokens if usage else None,
            cached_tokens=(getattr(details, "cached_tokens", None) or 0) if usage else None,
            output_tokens=usage.completion_tokens if usage else None,
        )


def _status_error(status: int) -> VisionError:
    if status == 401:
        return VisionError("model_auth", "model API rejected the key (401)", 502)
    if status == 402:
        return VisionError("model_billing", "model API billing issue (402)", 502)
    return VisionError("model_error", f"model API error (HTTP {status})", 502)
