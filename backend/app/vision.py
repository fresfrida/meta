"""Vision answers: a fixed mock list, or the live Meta Model API."""

import json
import logging
import time
from dataclasses import dataclass
from itertools import cycle
from threading import Lock
from typing import Any, Callable, Protocol

from pydantic import ValidationError

from .config import MAX_OUTPUT_TOKENS, VISION_PROMPT, Settings
from .schemas import VisionAnswer, vision_answer_json_schema

log = logging.getLogger(__name__)

MOCK_ANSWERS: tuple[VisionAnswer, ...] = (
    # Boxes sit between the phrase card and the bottom controls, as a real hazard on the path would.
    # Every named kind appears once (prompt v5); the first three are the ones a demo sees first.
    VisionAnswer(hazard="step_down", side="ahead", distance="near", box=[80, 600, 920, 720], distance_m=2),
    VisionAnswer(hazard="head_height", side="ahead", distance="near", box=[250, 120, 750, 330], distance_m=2),
    VisionAnswer(hazard="people", side="left", distance="far", box=[40, 330, 420, 700], distance_m=4),
    VisionAnswer(hazard="road", side="ahead", distance="near", box=[0, 620, 1000, 1000], distance_m=2),
    VisionAnswer(hazard="crossing", side="ahead", distance="far", box=[100, 560, 900, 760], distance_m=4),
    VisionAnswer(hazard="cycle_path", side="left", distance="far", box=[0, 600, 450, 900], distance_m=3),
    VisionAnswer(hazard="escalator", side="ahead", distance="far", box=[300, 250, 700, 800], distance_m=5),
    VisionAnswer(hazard="uneven", side="right", distance="near", box=[550, 700, 1000, 950], distance_m=2),
    VisionAnswer(hazard="clear"),
    VisionAnswer(hazard="obstacle", side="left", distance="far", box=[60, 380, 300, 640], distance_m=5),
    VisionAnswer(hazard="curb", side="right", distance="near", box=[620, 600, 980, 770], distance_m=1),
    VisionAnswer(hazard="person", side="right", distance="far", box=[640, 300, 820, 700], distance_m=3),
    VisionAnswer(hazard="step_up", side="ahead", distance="far", box=[300, 440, 700, 560], distance_m=6),
    VisionAnswer(hazard="pole", side="right", distance="far", box=[700, 150, 760, 720], distance_m=3),
    VisionAnswer(hazard="drain", side="ahead", distance="near", box=[300, 650, 700, 760], distance_m=2),
    VisionAnswer(hazard="bike", side="left", distance="far", box=[60, 420, 380, 700], distance_m=4),
    VisionAnswer(hazard="vehicle", side="right", distance="far", box=[600, 380, 1000, 700], distance_m=6),
    VisionAnswer(hazard="barrier", side="ahead", distance="far", box=[300, 480, 700, 680], distance_m=4),
    VisionAnswer(hazard="ramp", side="ahead", distance="far", box=[250, 560, 750, 760], distance_m=3),
    VisionAnswer(hazard="door", side="ahead", distance="near", box=[300, 150, 700, 780], distance_m=2),
    VisionAnswer(hazard="wall", side="left", distance="near", box=[0, 100, 380, 800], distance_m=1),
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

    def __init__(self, code: str, message: str, status: int, usage: "Usage | None" = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.usage = usage  # set when the failed call was still billed


@dataclass(frozen=True)
class Usage:
    input_tokens: int | None
    cached_tokens: int | None
    output_tokens: int | None


def usage_of(response: Any) -> Usage:
    usage = response.usage
    details = getattr(usage, "prompt_tokens_details", None) if usage else None
    return Usage(
        input_tokens=usage.prompt_tokens if usage else None,
        cached_tokens=(getattr(details, "cached_tokens", None) or 0) if usage else None,
        output_tokens=usage.completion_tokens if usage else None,
    )


def check_not_cut(response: Any) -> None:
    """A reply stopped by the output cap is a model failure (billed), never a half answer."""
    if response.choices and getattr(response.choices[0], "finish_reason", None) == "length":
        raise VisionError(
            "model_error", f"model reply cut at the {MAX_OUTPUT_TOKENS}-token output cap", 502, usage_of(response)
        )


class Vision(Protocol):
    def analyze(self, image_b64: str) -> VisionResult: ...


class MockVision:
    """Cycles through MOCK_ANSWERS in order, repeating each one `hold_calls` times."""

    def __init__(self, hold_calls: int = 1, delay_ms: int = 0) -> None:
        self._answers = cycle([a for a in MOCK_ANSWERS for _ in range(hold_calls)])
        self._lock = Lock()
        self._delay_s = delay_ms / 1000

    def analyze(self, image_b64: str) -> VisionResult:
        started = time.perf_counter()
        with self._lock:
            answer = next(self._answers)
        time.sleep(self._delay_s)
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
                max_completion_tokens=MAX_OUTPUT_TOKENS,
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
        check_not_cut(response)

        content = response.choices[0].message.content if response.choices else None
        answer, reason = parse_answer(content)
        if reason:
            log.warning("live answer replaced with unsure: %s", reason)

        usage = usage_of(response)
        return VisionResult(
            answer=answer,
            model_ms=model_ms,
            input_tokens=usage.input_tokens,
            cached_tokens=usage.cached_tokens,
            output_tokens=usage.output_tokens,
        )


def _status_error(status: int) -> VisionError:
    if status == 401:
        return VisionError("model_auth", "model API rejected the key (401)", 502)
    if status == 402:
        return VisionError("model_billing", "model API billing issue (402)", 502)
    return VisionError("model_error", f"model API error (HTTP {status})", 502)
