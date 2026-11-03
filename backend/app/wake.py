"""The wake rule: which finished speech turns become a question. One rule, one file.

Only a question ever leaves this module. Every other turn is dropped here: not forwarded, not logged, not stored.
"""

import re
from dataclasses import dataclass, field

from .config import ASK_HOLD_TAIL_MS, ASK_WINDOW_MS

# "Hey Eyes" (WAKE_PHRASE, TENTATIVE) and close mis-hearings: case and punctuation do not matter.
_HEY = r"(?:hey|hay|hei|hi|heh)"
_EYES = r"(?:eyes|eye|eyez|ayes|aye|ice|i's)"
_WAKE = re.compile(
    rf"^\W*(?:{_HEY}[\s\W]*{_EYES}|heyeyes|heyeye|hayeyes)(?:\b|$)[\s\W]*(?P<rest>.*)$",
    re.IGNORECASE | re.DOTALL,
)


def match_wake(transcript: str) -> str | None:
    """None if the turn does not start with the wake phrase; else the rest of the turn (maybe "")."""
    m = _WAKE.match(transcript.strip())
    if not m:
        return None
    return m.group("rest").strip()


@dataclass
class WakeEvent:
    kind: str  # "wake" | "question"
    text: str = ""


@dataclass
class WakeTracker:
    """Turns -> events. Wake phrase + question in one turn, or the wake phrase alone and the next turn within
    ASK_WINDOW_MS. While a touch-and-hold is on (and ASK_HOLD_TAIL_MS after it ends) any turn is the question."""

    window_ms: int = ASK_WINDOW_MS
    hold_tail_ms: int = ASK_HOLD_TAIL_MS
    armed_until: float = field(default=-1.0)
    holding: bool = False
    hold_until: float = field(default=-1.0)

    def on_turn(self, transcript: str, now_ms: float) -> list[WakeEvent]:
        rest = match_wake(transcript)
        if self.holding or now_ms <= self.hold_until:
            question = rest if rest is not None else transcript.strip()
            return [WakeEvent("question", question)] if question else []
        if rest is not None:
            if rest:
                self.armed_until = -1.0
                return [WakeEvent("wake"), WakeEvent("question", rest)]
            self.armed_until = now_ms + self.window_ms
            return [WakeEvent("wake")]
        if now_ms <= self.armed_until and transcript.strip():
            self.armed_until = -1.0
            return [WakeEvent("question", transcript.strip())]
        return []  # not for us: dropped

    def hold_start(self) -> None:
        self.holding = True

    def hold_end(self, now_ms: float) -> None:
        self.holding = False
        self.hold_until = now_ms + self.hold_tail_ms
