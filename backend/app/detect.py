"""Fast detection: one frame -> SAM 3.1 boxes for each concept (steps, kerb), in parallel. Mock or live.

The key stays here (Bearer header on a shared keep-alive client). Every request is bounded: DETECT_TIMEOUT_S wall
clock and DETECT_MAX_BYTES of response. Masks are read off the stream and dropped; only boxes are kept.
"""

import base64
import binascii
import json
import logging
import struct
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from itertools import cycle
from threading import Lock
from typing import Any, Protocol

from .config import DETECT_MAX_BYTES, DETECT_TIMEOUT_S, SAM_CONCEPTS, SAM_MODEL, Settings
from .detect_rule import RawHit, kept_hits, parse_sam_text
from .schemas import DetectHit, DetectKind
from .vision import VisionError

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class DetectResult:
    hits: list[DetectHit]
    found: int  # boxes before the rule
    sam_ms: float
    beside: int = 0  # hits dropped because they are beside the walking path
    images_billed: int = 0  # SAM requests that the API accepted (each is billed per image)


class DetectFailed(VisionError):
    """Every concept failed. Requests the API had accepted are still billed."""

    def __init__(self, code: str, message: str, status: int, images_billed: int) -> None:
        super().__init__(code, message, status)
        self.images_billed = images_billed


class Detector(Protocol):
    def detect(self, image_b64: str) -> DetectResult: ...


def jpeg_size(image_b64: str) -> tuple[int, int]:
    """Width, height from the first SOF marker of a base64 JPEG; (0, 0) if it cannot be read."""
    try:
        data = base64.b64decode(image_b64, validate=True)
        i = 2
        while i + 9 < len(data):
            marker, length = data[i + 1], struct.unpack(">H", data[i + 2 : i + 4])[0]
            if marker in (0xC0, 0xC1, 0xC2):
                h, w = struct.unpack(">HH", data[i + 5 : i + 9])
                return w, h
            i += 2 + length
    except (binascii.Error, ValueError, struct.error):
        pass
    return 0, 0


# Mock scenes as fractions of the frame: (kind, x1, y1, x2, y2, confidence). Each repeats `hold_calls` times.
MOCK_SCENES: tuple[tuple[tuple[DetectKind, float, float, float, float, float], ...], ...] = (
    (("steps", 0.10, 0.60, 0.90, 0.72, 0.91),),  # steps ahead, a few metres
    (("curb", 0.60, 0.62, 0.98, 0.78, 0.84),),  # kerb on the right
    (),  # nothing found
    (("steps", 0.05, 0.80, 0.95, 1.00, 0.88),),  # steps touching the frame bottom: near
    # A corridor: a door on each side wall (beside the walking path: dropped, counted) and nothing ahead.
    (("door", 0.02, 0.25, 0.18, 0.70, 0.85), ("door", 0.82, 0.25, 0.98, 0.70, 0.85)),
)


class MockDetect:
    def __init__(self, hold_calls: int = 1, delay_ms: int = 0) -> None:
        self._scenes = cycle([s for s in MOCK_SCENES for _ in range(hold_calls)])
        self._lock = Lock()
        self._delay_s = delay_ms / 1000

    def detect(self, image_b64: str) -> DetectResult:
        started = time.perf_counter()
        with self._lock:
            scene = next(self._scenes)
        w, h = jpeg_size(image_b64)
        w, h = (w, h) if w and h else (360, 640)  # a portrait phone frame
        raws = [
            RawHit(kind, round(x1 * w), round(y1 * h), round(x2 * w) - 1, round(y2 * h) - 1, w, h, c)
            for kind, x1, y1, x2, y2, c in scene
        ]
        time.sleep(self._delay_s)
        hits, beside = kept_hits(raws)
        return DetectResult(hits, len(raws), (time.perf_counter() - started) * 1000, beside=beside)


class _Aborted(Exception):
    pass


class LiveDetect:
    """POST /v1/responses with model sam-3.1 (docs), one request per concept, in parallel, on one keep-alive client."""

    def __init__(self, settings: Settings, client: Any = None) -> None:
        import httpx

        self._key = settings.model_api_key or ""
        self._client = client or httpx.Client(
            base_url=settings.meta_base_url.rstrip("/"),
            headers={"Authorization": f"Bearer {self._key}"},
            timeout=httpx.Timeout(DETECT_TIMEOUT_S),
            limits=httpx.Limits(max_keepalive_connections=8, keepalive_expiry=60),
        )
        self._pool = ThreadPoolExecutor(max_workers=8, thread_name_prefix="sam")

    def _one(self, kind: DetectKind, image_b64: str) -> tuple[list[RawHit], bool]:
        """One concept. Returns (boxes, accepted by the API). Raises on failure or abort."""
        body = {
            "model": SAM_MODEL,
            "stream": True,
            "metadata": {"include_confidence": "true", "mask_encoding": "one_bit"},
            "input": [
                {
                    "type": "message",
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": SAM_CONCEPTS[kind]},
                        {"type": "input_image", "image_url": f"data:image/jpeg;base64,{image_b64}"},
                    ],
                }
            ],
        }
        started = time.perf_counter()
        received, buf, text = 0, b"", ""
        accepted = False
        try:
            with self._client.stream("POST", "/responses", json=body) as r:
                if r.status_code != 200:
                    raise _Aborted(f"HTTP {r.status_code}")
                accepted = True
                for chunk in r.iter_bytes():
                    received += len(chunk)
                    if time.perf_counter() - started > DETECT_TIMEOUT_S:
                        raise TimeoutError("wall clock")
                    if received > DETECT_MAX_BYTES:
                        raise _Aborted("response over the size cap")
                    buf += chunk
                    while b"\n\n" in buf:
                        block, buf = buf.split(b"\n\n", 1)
                        for line in block.decode(errors="replace").splitlines():
                            if not line.startswith("data:") or line[5:].strip() == "[DONE]":
                                continue
                            event = json.loads(line[5:])
                            if event.get("type") == "response.output_text.delta":
                                text += event.get("delta", "")
                            elif event.get("type") in ("error", "response.failed"):
                                raise _Aborted("error event")
        except Exception as exc:
            exc.accepted = accepted  # type: ignore[attr-defined]
            raise
        return parse_sam_text(text, kind), accepted

    def detect(self, image_b64: str) -> DetectResult:
        import httpx

        if not self._key:
            raise VisionError("key_missing", "MODEL_API_KEY is not set on the backend", 503)
        started = time.perf_counter()
        futures = {kind: self._pool.submit(self._one, kind, image_b64) for kind in SAM_CONCEPTS}
        raws: list[RawHit] = []
        billed = 0
        failures: list[str] = []
        timed_out = False
        for kind, future in futures.items():
            try:
                boxes, accepted = future.result(timeout=DETECT_TIMEOUT_S + 1)
                raws += boxes
                billed += accepted
            except Exception as exc:  # one concept failing still lets the other warn
                billed += bool(getattr(exc, "accepted", False))
                timed_out |= isinstance(exc, (TimeoutError, httpx.TimeoutException))
                failures.append(f"{kind}: {type(exc).__name__}")
        sam_ms = (time.perf_counter() - started) * 1000
        if failures:
            log.warning("SAM concept failed: %s", "; ".join(failures))  # names only; never the key
        if len(failures) == len(futures):
            if timed_out:
                raise DetectFailed("model_timeout", f"SAM did not answer within {DETECT_TIMEOUT_S:g} s", 504, billed)
            raise DetectFailed("model_error", "SAM request failed", 502, billed)
        hits, beside = kept_hits(raws)
        return DetectResult(hits, len(raws), sam_ms, images_billed=billed, beside=beside)

