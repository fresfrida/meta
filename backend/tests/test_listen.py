"""Listen proxy with a fake realtime ASR (no network): handshake, real-time pacing with silence fill, wake ->
question, budget per streamed second, reconnect once, key and transcripts never logged."""

import asyncio
import json
import logging

import pytest
from fastapi.testclient import TestClient

from app.listen import BYTES_PER_SECOND, FRAME_BYTES
from app.main import create_app

from .conftest import FAKE_KEY

CLOSE = object()
DROP = object()


class FakeAsr:
    """Plays a script of ASR events once enough audio (in seconds) has been received."""

    def __init__(self, script=(), drop_after_s=None, refuse=False):
        self.script = list(script)
        self.drop_after_s = drop_after_s
        self.refuse = refuse
        self.handshake = None
        self.audio = bytearray()
        self.frames: list[int] = []
        self.ended = False
        self.out: asyncio.Queue | None = None

    async def __aenter__(self):
        self.out = asyncio.Queue()
        return self

    async def __aexit__(self, *exc):
        return False

    async def send(self, data):
        if isinstance(data, str):
            msg = json.loads(data)
            if self.handshake is None:
                self.handshake = msg
                ack = {"type": "error", "message": "bad", "sessionId": "x"} if self.refuse else {"sessionId": "s-1"}
                await self.out.put(json.dumps(ack))
            elif msg.get("type") == "endStream":
                self.ended = True
                await self.out.put(CLOSE)
            return
        self.frames.append(len(data))
        self.audio += data
        seconds = len(self.audio) / BYTES_PER_SECOND
        while self.script and seconds >= self.script[0][0]:
            await self.out.put(json.dumps(self.script.pop(0)[1]))
        if self.drop_after_s is not None and seconds >= self.drop_after_s:
            self.drop_after_s = None
            await self.out.put(DROP)

    async def recv(self):
        return await self.out.get()

    def __aiter__(self):
        return self

    async def __anext__(self):
        item = await self.out.get()
        if item is CLOSE:
            raise StopAsyncIteration
        if item is DROP:
            raise ConnectionError("dropped by fake")
        return item


def turn(at_s, transcript, turn_id=1):
    return [
        (at_s, {"type": "speechStart", "turnId": turn_id, "audioProcessedMs": 0}),
        (at_s, {"type": "transcript", "transcript": transcript[:5], "final": False, "audioProcessedMs": 0}),
        (at_s, {"type": "speechEnd", "turnId": turn_id, "audioProcessedMs": 0}),
        (at_s + 0.16, {"type": "speechComplete", "turnId": turn_id, "transcript": transcript, "audioProcessedMs": 0}),
    ]


def make_client(make_settings, fakes, **env):
    settings = make_settings(VISION_MODE="live", MODEL_API_KEY=FAKE_KEY, **env)
    queue = list(fakes)
    return TestClient(create_app(settings, asr_connect=lambda url: queue.pop(0))), settings


def test_handshake_follows_the_docs(make_settings):
    fake = FakeAsr(turn(0.2, "Hey Eyes, what is there?"))
    client, settings = make_client(make_settings, [fake])
    with client.websocket_connect("/api/listen?lang=ta") as ws:
        assert ws.receive_json() == {"type": "ready", "source": "live"}
        ws.receive_json()  # wake
        ws.receive_json()  # question
        ws.send_text(json.dumps({"type": "end"}))  # the phone ends the session (Stop)
        assert ws.receive()["type"] == "websocket.close"  # after endStream and the last events
    assert fake.handshake == {
        "authorization": {"accessToken": f"Bearer {FAKE_KEY}"},
        "model": "muse-voice-transcribe-1.0",
        "audioEncoding": "PCM_16KHZ",
        "mode": "ENDPOINTING",
        "languageBias": ["Tamil"],
        "keywords": ["Hey Eyes"],
        "emitAudioProgress": False,
    }
    assert fake.ended  # endStream sent before closing


def test_wake_then_question_reaches_the_phone_and_other_speech_does_not(make_settings):
    script = turn(0.2, "I need to buy milk", 1) + turn(0.5, "Hey Eyes, what is there?", 2)
    client, _ = make_client(make_settings, [FakeAsr(script)])
    with client.websocket_connect("/api/listen?lang=en") as ws:
        ws.receive_json()  # ready
        ws.send_bytes(b"\x01\x00" * 8000)  # 0.5 s of phone audio
        assert ws.receive_json() == {"type": "wake"}
        q = ws.receive_json()
        assert q["type"] == "question" and q["text"] == "what is there?"
        assert 0 <= q["asr_ms"] < 2000


def test_wake_alone_then_next_turn_is_the_question(make_settings):
    script = turn(0.2, "Hey Eyes.", 1) + turn(0.6, "Is the door open?", 2)
    client, _ = make_client(make_settings, [FakeAsr(script)])
    with client.websocket_connect("/api/listen?lang=en") as ws:
        ws.receive_json()
        assert ws.receive_json() == {"type": "wake"}
        assert ws.receive_json()["text"] == "Is the door open?"


def test_hold_makes_the_next_turn_a_question_without_the_wake_phrase(make_settings):
    client, _ = make_client(make_settings, [FakeAsr(turn(0.4, "what colour is the door"))])
    with client.websocket_connect("/api/listen?lang=en") as ws:
        ws.receive_json()
        ws.send_text(json.dumps({"type": "hold", "on": True}))
        q = ws.receive_json()
        assert q["type"] == "question" and q["text"] == "what colour is the door"


def test_audio_is_paced_at_real_time_and_silence_fills_gaps(make_settings):
    fake = FakeAsr(turn(1.0, "Hey Eyes, what is there?"))
    client, _ = make_client(make_settings, [fake])
    with client.websocket_connect("/api/listen?lang=en") as ws:
        ws.receive_json()
        # The phone sends 3 s of audio at once; the backend must not run ahead (cap 2 s queued, sent at real time).
        ws.send_bytes(b"\x02\x00" * (3 * BYTES_PER_SECOND // 2))
        ws.receive_json()
        ws.receive_json()
    assert set(fake.frames) == {FRAME_BYTES}  # 80 ms frames
    sent_s = len(fake.audio) / BYTES_PER_SECOND
    assert 1.0 <= sent_s < 1.6  # about real time when the question arrived, not 3 s


def test_silence_is_sent_when_the_phone_is_quiet(make_settings):
    fake = FakeAsr(turn(0.4, "Hey Eyes, what is there?"))
    client, _ = make_client(make_settings, [fake])
    with client.websocket_connect("/api/listen?lang=en") as ws:
        ws.receive_json()
        ws.receive_json()  # no phone audio at all, yet the session progressed
    assert len(fake.audio) >= 0.4 * BYTES_PER_SECOND and not any(fake.audio)


def test_budget_counts_streamed_seconds(make_settings):
    fake = FakeAsr(turn(2.1, "Hey Eyes, what is there?"))
    client, settings = make_client(make_settings, [fake])
    with client.websocket_connect("/api/listen?lang=en") as ws:
        ws.receive_json()
        ws.receive_json()
        ws.receive_json()
    spent = client.get("/api/health").json()["spent_usd"]
    whole_seconds = len(fake.audio) // BYTES_PER_SECOND
    assert whole_seconds >= 2
    assert spent == pytest.approx(whole_seconds * 0.18 / 3600, abs=1e-6)


def test_reconnects_once_after_a_drop(make_settings):
    first = FakeAsr(drop_after_s=0.2)
    second = FakeAsr(turn(0.3, "Hey Eyes, what is there?"))
    client, _ = make_client(make_settings, [first, second])
    with client.websocket_connect("/api/listen?lang=en") as ws:
        assert ws.receive_json()["type"] == "ready"
        assert ws.receive_json() == {"type": "wake"}
        assert ws.receive_json()["text"] == "what is there?"
    assert second.handshake is not None


def test_second_drop_stops_listening(make_settings):
    client, _ = make_client(make_settings, [FakeAsr(drop_after_s=0.2), FakeAsr(drop_after_s=0.2)])
    with client.websocket_connect("/api/listen?lang=en") as ws:
        assert ws.receive_json()["type"] == "ready"
        assert ws.receive_json() == {"type": "stopped"}


def test_refused_handshake_counts_as_a_drop(make_settings):
    client, _ = make_client(make_settings, [FakeAsr(refuse=True), FakeAsr(refuse=True)])
    with client.websocket_connect("/api/listen?lang=en") as ws:
        assert ws.receive_json() == {"type": "stopped"}


def test_key_and_transcripts_never_logged(make_settings, caplog):
    caplog.set_level(logging.DEBUG)
    script = turn(0.2, "my secret shopping list", 1) + turn(0.4, "Hey Eyes, what is there?", 2)
    client, _ = make_client(make_settings, [FakeAsr(script, drop_after_s=0.7), FakeAsr()])
    with client.websocket_connect("/api/listen?lang=en") as ws:
        ws.receive_json()
        ws.receive_json()
        ws.receive_json()
    assert FAKE_KEY not in caplog.text
    assert "shopping" not in caplog.text and "what is there" not in caplog.text


def test_mock_mode_and_bad_language(make_settings):
    client = TestClient(create_app(make_settings()))
    with client.websocket_connect("/api/listen?lang=en") as ws:
        assert ws.receive_json() == {"type": "ready", "source": "mock"}
    with client.websocket_connect("/api/listen?lang=fr") as ws:
        assert ws.receive_json() == {"type": "error", "code": "bad_language"}


def test_no_key_in_live_listen(make_settings):
    client = TestClient(create_app(make_settings(VISION_MODE="live")))
    with client.websocket_connect("/api/listen?lang=en") as ws:
        assert ws.receive_json() == {"type": "error", "code": "key_missing"}
