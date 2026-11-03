"""Ask: a spoken question + the current frame -> a short plain-text answer (muse-spark-1.3)."""

import logging
import re
import time
from dataclasses import dataclass
from typing import Any, Callable, Protocol

from .config import ASK_MAX_SENTENCES, ASK_PROMPT, LANGUAGE_NAMES, Settings
from .vision import VisionError, _status_error, default_client_factory

log = logging.getLogger(__name__)

MOCK_ANSWER = "MOCK answer: a path ahead with a step down."

# A sentence ends at . ! ? (Latin, Tamil) or 。！？ (Chinese), followed by space or the end.
_SENTENCE_END = re.compile(r"[.!?](?=\s|$)|[。！？]")


_PLACEHOLDER = re.compile(r"\{(last warning|question|language)\}")


def ask_prompt(question: str, last_warning: str | None, language: str) -> str:
    """The approved prompt with its three placeholders filled in one pass (user text is never re-scanned)."""
    values = {"last warning": last_warning or "none", "question": question, "language": LANGUAGE_NAMES[language]}
    return _PLACEHOLDER.sub(lambda m: values[m.group(1)], ASK_PROMPT)


def first_sentences(text: str, n: int = ASK_MAX_SENTENCES) -> str:
    """Trim to the first n sentences (the model is asked for at most two; this enforces it)."""
    text = " ".join(text.split())
    ends = [m.end() for m in _SENTENCE_END.finditer(text)]
    return text[: ends[n - 1]].strip() if len(ends) >= n else text.strip()


@dataclass(frozen=True)
class AskResult:
    answer: str
    model_ms: float
    input_tokens: int | None = None
    cached_tokens: int | None = None
    output_tokens: int | None = None


class Ask(Protocol):
    def ask(self, question: str, image_b64: str, last_warning: str | None, language: str) -> AskResult: ...


class MockAsk:
    def ask(self, question: str, image_b64: str, last_warning: str | None, language: str) -> AskResult:
        return AskResult(answer=MOCK_ANSWER, model_ms=0.0)


class LiveAsk:
    def __init__(self, settings: Settings, client_factory: Callable[[Settings], Any] = default_client_factory) -> None:
        self._settings = settings
        self._client = client_factory(settings) if settings.key_present else None

    def ask(self, question: str, image_b64: str, last_warning: str | None, language: str) -> AskResult:
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
                            {"type": "text", "text": ask_prompt(question, last_warning, language)},
                            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"}},
                        ],
                    }
                ],
            )
        except openai.APITimeoutError:
            raise VisionError("model_timeout", f"model did not answer within {s.timeout_s:g} s", 504)
        except openai.APIConnectionError:
            raise VisionError("model_error", "could not connect to the model API", 502)
        except openai.APIStatusError as exc:
            raise _status_error(exc.status_code)
        model_ms = (time.perf_counter() - started) * 1000

        content = (response.choices[0].message.content if response.choices else None) or ""
        answer = first_sentences(content)
        usage = response.usage
        details = getattr(usage, "prompt_tokens_details", None) if usage else None
        result = AskResult(
            answer=answer,
            model_ms=model_ms,
            input_tokens=usage.prompt_tokens if usage else None,
            cached_tokens=(getattr(details, "cached_tokens", None) or 0) if usage else None,
            output_tokens=usage.completion_tokens if usage else None,
        )
        if not answer:
            # Billed but empty: the caller still records the cost, the phone says its fixed "sorry".
            raise EmptyAnswer(result)
        return result


class EmptyAnswer(Exception):
    def __init__(self, result: AskResult) -> None:
        super().__init__("empty answer")
        self.result = result
