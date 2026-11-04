"""Listen: phone microphone (PCM16 mono 16 kHz) -> Meta realtime ASR -> wake rule -> questions to the phone.

The key stays here: it goes only into the ASR handshake, never to the phone and never into a log. Transcripts are
never logged; only questions (see wake.py) are sent back to the phone.
"""

import asyncio
import json
import logging
import time
from contextlib import AbstractAsyncContextManager
from typing import Any, Callable

from fastapi import WebSocket, WebSocketDisconnect

from .budget import Budget
from .config import (
    ASR_END_DRAIN_S,
    ASR_FRAME_MS,
    ASR_HANDSHAKE_TIMEOUT_S,
    ASR_MAX_QUEUE_S,
    ASR_SAMPLE_RATE,
    LANGUAGE_NAMES,
    WAKE_PHRASE,
    Settings,
)
from .wake import WakeTracker

log = logging.getLogger(__name__)

BYTES_PER_SECOND = ASR_SAMPLE_RATE * 2  # PCM16 mono
FRAME_BYTES = BYTES_PER_SECOND * ASR_FRAME_MS // 1000
MAX_QUEUE_BYTES = int(BYTES_PER_SECOND * ASR_MAX_QUEUE_S)

AsrConnect = Callable[[str], AbstractAsyncContextManager[Any]]


def default_asr_connect(url: str) -> AbstractAsyncContextManager[Any]:
    from websockets.asyncio.client import connect

    return connect(url, open_timeout=ASR_HANDSHAKE_TIMEOUT_S, max_size=2**20)


def language_bias(language: str) -> list[str]:
    """English plus the chosen language: "Hey Eyes" is said in English inside a Chinese, Malay or Tamil question."""
    chosen = LANGUAGE_NAMES[language]
    return [chosen] if chosen == "English" else ["English", chosen]


def handshake_message(settings: Settings, language: str) -> dict:
    """Docs (dev.meta.ai/docs/api-reference/voice/schemas): auth goes in this first JSON frame, not a header."""
    return {
        "authorization": {"accessToken": f"Bearer {settings.model_api_key}"},
        "model": settings.asr_model,
        "audioEncoding": "PCM_16KHZ",
        "mode": "ENDPOINTING",
        "languageBias": language_bias(language),  # names, not codes (docs)
        "keywords": [WAKE_PHRASE],
        "emitAudioProgress": False,
    }


class AsrDropped(Exception):
    """The ASR connection failed or closed before we ended it."""


def _now_ms() -> float:
    return time.monotonic() * 1000


class ListenSession:
    def __init__(self, ws: WebSocket, settings: Settings, budget: Budget, connect: AsrConnect, language: str) -> None:
        self.ws = ws
        self.settings = settings
        self.budget = budget
        self.connect = connect
        self.language = language
        self.tracker = WakeTracker()
        self.queue = bytearray()
        self.end_requested = asyncio.Event()
        self.phone_gone = asyncio.Event()
        self.sent_bytes = 0
        self.billed_bytes = 0
        self.last_speech_end: float | None = None

    async def send_phone(self, payload: dict) -> None:
        try:
            await self.ws.send_text(json.dumps(payload))
        except Exception:  # the phone may already be gone
            self.phone_gone.set()

    # ---- phone -> queue -------------------------------------------------------------------------------------
    async def phone_reader(self) -> None:
        try:
            while True:
                msg = await self.ws.receive()
                if msg["type"] == "websocket.disconnect":
                    break
                if msg.get("bytes"):
                    self.queue += msg["bytes"]
                    overflow = len(self.queue) - MAX_QUEUE_BYTES
                    if overflow > 0:
                        del self.queue[:overflow]  # never run ahead of real time: drop the oldest audio
                elif msg.get("text"):
                    self.on_control(json.loads(msg["text"]))
        except (WebSocketDisconnect, RuntimeError, ValueError):
            pass
        finally:
            self.phone_gone.set()
            self.end_requested.set()

    def on_control(self, control: dict) -> None:
        kind = control.get("type")
        if kind == "hold":
            if control.get("on"):
                self.tracker.hold_start()
            else:
                self.tracker.hold_end(_now_ms())
        elif kind == "end":
            self.end_requested.set()

    # ---- queue -> ASR, at real time ---------------------------------------------------------------------------
    async def pacer(self, up: Any) -> None:
        loop = asyncio.get_running_loop()
        next_at = loop.time()
        per_second = self.settings.asr_price_per_hour / 3600
        while not self.end_requested.is_set():
            chunk = bytes(self.queue[:FRAME_BYTES])
            del self.queue[:FRAME_BYTES]
            # Silence keeps the session alive while the phone is not sending (e.g. while it speaks).
            chunk += bytes(FRAME_BYTES - len(chunk))
            await up.send(chunk)
            self.sent_bytes += FRAME_BYTES
            while self.sent_bytes - self.billed_bytes >= BYTES_PER_SECOND:  # billed per whole second
                self.billed_bytes += BYTES_PER_SECOND
                self.budget.add(per_second)
            if self.budget.reached():
                await self.send_phone({"type": "error", "code": "budget_reached"})
                self.end_requested.set()
                return
            next_at += ASR_FRAME_MS / 1000
            await asyncio.sleep(max(0.0, next_at - loop.time()))

    # ---- ASR -> wake rule -> phone ----------------------------------------------------------------------------
    async def reader(self, up: Any) -> None:
        async for raw in up:
            if isinstance(raw, bytes):
                continue
            event = json.loads(raw)
            kind = event.get("type")
            if kind == "speechEnd":
                self.last_speech_end = _now_ms()
            elif kind == "speechComplete":
                now = _now_ms()
                for e in self.tracker.on_turn(event.get("transcript") or "", now):
                    payload: dict = {"type": e.kind}
                    if e.kind == "question":
                        payload["text"] = e.text
                        if self.last_speech_end is not None:
                            payload["asr_ms"] = round(now - self.last_speech_end)
                    await self.send_phone(payload)
            elif kind == "error":
                # Message text only; never the transcript or the key.
                log.warning("ASR error event: %s", event.get("errorType") or event.get("message", "")[:120])

    async def handshake(self, up: Any) -> None:
        await up.send(json.dumps(handshake_message(self.settings, self.language)))
        ack = json.loads(await asyncio.wait_for(up.recv(), ASR_HANDSHAKE_TIMEOUT_S))
        if ack.get("type") == "error" or "sessionId" not in ack:
            raise AsrDropped(f"handshake refused: {str(ack.get('message', ''))[:120]}")

    async def pump(self, up: Any) -> str:
        """Runs one ASR session. Returns "ended" (we ended it) or raises AsrDropped."""
        pacer = asyncio.create_task(self.pacer(up))
        reader = asyncio.create_task(self.reader(up))
        ended = asyncio.create_task(self.end_requested.wait())
        try:
            done, _ = await asyncio.wait({pacer, reader, ended}, return_when=asyncio.FIRST_COMPLETED)
            if ended in done or self.end_requested.is_set():
                pacer.cancel()
                try:
                    await up.send(json.dumps({"type": "endStream"}))
                    await asyncio.wait_for(reader, ASR_END_DRAIN_S)  # last turn (e.g. a held question)
                except Exception:
                    pass
                return "ended"
            for task in done:
                if task.exception():
                    raise AsrDropped(type(task.exception()).__name__)
            raise AsrDropped("closed by the server")
        finally:
            for task in (pacer, reader, ended):
                task.cancel()

    async def run(self) -> None:
        phone = asyncio.create_task(self.phone_reader())
        reconnects_left = 1
        first = True
        try:
            while not self.end_requested.is_set():
                try:
                    async with self.connect(self.settings.asr_url) as up:
                        await self.handshake(up)
                        if first:
                            await self.send_phone({"type": "ready", "source": "live"})
                            first = False
                        await self.pump(up)
                    break
                except Exception as exc:  # dropped, refused, network: reconnect once
                    if self.end_requested.is_set():
                        break
                    log.warning("ASR connection lost (%s)", type(exc).__name__)
                    if reconnects_left == 0:
                        await self.send_phone({"type": "stopped"})
                        break
                    reconnects_left -= 1
        finally:
            phone.cancel()
            if not self.phone_gone.is_set():
                try:
                    await self.ws.close()
                except Exception:
                    pass


async def run_listen(ws: WebSocket, settings: Settings, budget: Budget, connect: AsrConnect) -> None:
    await ws.accept()
    language = ws.query_params.get("lang", "en")
    if language not in LANGUAGE_NAMES:
        await ws.send_text(json.dumps({"type": "error", "code": "bad_language"}))
        await ws.close(code=1008)
        return
    if settings.listen_mode != "live":
        # Mock: accept and discard audio; no questions are ever produced (use the touch-and-hold path in tests).
        await ws.send_text(json.dumps({"type": "ready", "source": "mock"}))
        try:
            while (await ws.receive())["type"] != "websocket.disconnect":
                pass
        except (WebSocketDisconnect, RuntimeError):
            pass
        return
    if not settings.key_present:
        await ws.send_text(json.dumps({"type": "error", "code": "key_missing"}))
        await ws.close(code=1008)
        return
    if budget.reached():
        await ws.send_text(json.dumps({"type": "error", "code": "budget_reached"}))
        await ws.close(code=1008)
        return
    await ListenSession(ws, settings, budget, connect, language).run()
