"""Public demo limits (Brief 17): one rule, one file, server-enforced. Only used when PUBLIC_DEMO=1.

- A visitor's Start asks for a slot: a signed token valid DEMO_SLOT_S seconds. Every live-capable call needs a valid,
  unexpired token; an expired one is refused (403 slot_ended).
- At most DEMO_SLOTS_PER_DAY new slots per Singapore day, and at most DAILY_BUDGET_USD spent per day (on top of the
  total BUDGET_USD). Full -> 429 with a reason.
- One active slot per browser: the same browser asking again while its slot runs gets the same slot back.
- Counts live in DATA_DIR (a persistent volume), written atomically like the spend file. Nothing personal is kept:
  browsers are stored only as a short hash of a random id the page made up.
"""

import hashlib
import hmac
import json
import logging
import secrets
import time
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import Lock
from typing import Callable

from .budget import Budget

log = logging.getLogger(__name__)

SGT = timezone(timedelta(hours=8))  # Singapore: no daylight saving


def sgt_day(epoch_s: float) -> str:
    return datetime.fromtimestamp(epoch_s, SGT).strftime("%Y-%m-%d")


class SlotRefused(Exception):
    """No new slot: `code` is slots_full or daily_budget."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class Slot:
    token: str
    expires_at: float


class DemoBook:
    def __init__(
        self,
        path: Path,
        slot_s: int,
        slots_per_day: int,
        daily_budget_usd: float,
        secret: str | None = None,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self.path = path
        self.slot_s = slot_s
        self.slots_per_day = slots_per_day
        self.daily_budget_usd = daily_budget_usd
        # Without DEMO_SECRET a random one is made: slots then end when the server restarts (fail closed).
        self._secret = (secret or secrets.token_hex(32)).encode()
        self._clock = clock
        self._lock = Lock()
        self._state = self._load()

    # ---- state -------------------------------------------------------------------------------------------------
    def _fresh(self, day: str) -> dict:
        return {"day": day, "slots": 0, "spent_usd": 0.0, "devices": {}}

    def _load(self) -> dict:
        today = sgt_day(self._clock())
        try:
            state = json.loads(self.path.read_text())
            if not isinstance(state.get("slots"), int) or not isinstance(state.get("devices"), dict):
                raise ValueError("bad demo file")
            return state
        except FileNotFoundError:
            return self._fresh(today)
        except (ValueError, KeyError, TypeError, OSError) as exc:
            # Unreadable counts: treat today as full rather than handing out unlimited slots.
            log.error("demo file unreadable (%s); no new slots today", type(exc).__name__)
            return {**self._fresh(today), "slots": self.slots_per_day}

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self._state))
        tmp.replace(self.path)

    def _roll(self, now: float) -> None:
        today = sgt_day(now)
        if self._state.get("day") != today:
            self._state = self._fresh(today)

    # ---- tokens ------------------------------------------------------------------------------------------------
    def _sign(self, slot_id: str, expires_at: int) -> str:
        mac = hmac.new(self._secret, f"{slot_id}.{expires_at}".encode(), hashlib.sha256).hexdigest()[:32]
        return f"{slot_id}.{expires_at}.{mac}"

    def check(self, token: str | None) -> bool:
        """True when the token is ours and has not expired."""
        if not token:
            return False
        try:
            slot_id, expires, mac = token.split(".")
            expires_at = int(expires)
        except ValueError:
            return False
        if not hmac.compare_digest(self._sign(slot_id, expires_at), token):
            return False
        return self._clock() < expires_at

    # ---- slots -------------------------------------------------------------------------------------------------
    def issue(self, device_id: str) -> Slot:
        """A slot for this browser: its running one, or a new one if today's slots and budget allow."""
        device = hashlib.sha256(device_id.encode()).hexdigest()[:16]
        with self._lock:
            now = self._clock()
            self._roll(now)
            running = self._state["devices"].get(device)
            if running and running["expires_at"] > now:
                return Slot(running["token"], running["expires_at"])
            if self._state["spent_usd"] >= self.daily_budget_usd:
                raise SlotRefused("daily_budget", "today's demo budget is used up")
            if self._state["slots"] >= self.slots_per_day:
                raise SlotRefused("slots_full", "today's demo slots are full")
            expires_at = int(now + self.slot_s)
            token = self._sign(secrets.token_hex(8), expires_at)
            self._state["slots"] += 1
            # Only running slots are kept per browser.
            self._state["devices"] = {k: v for k, v in self._state["devices"].items() if v["expires_at"] > now}
            self._state["devices"][device] = {"token": token, "expires_at": expires_at}
            self._save()
            return Slot(token, expires_at)

    # ---- daily spend -------------------------------------------------------------------------------------------
    def add_spend(self, usd: float) -> None:
        with self._lock:
            self._roll(self._clock())
            self._state["spent_usd"] += usd
            self._save()

    def daily_reached(self) -> bool:
        with self._lock:
            self._roll(self._clock())
            return self._state["spent_usd"] >= self.daily_budget_usd

    @property
    def slots_today(self) -> int:
        with self._lock:
            self._roll(self._clock())
            return self._state["slots"]


class DailyCapBudget:
    """The total Budget plus the demo's daily cap: live calls stop at whichever is reached first."""

    def __init__(self, total: Budget, book: DemoBook) -> None:
        self.total = total
        self.book = book
        self.budget_usd = total.budget_usd

    @property
    def spent_usd(self) -> float:
        return self.total.spent_usd

    def reached(self) -> bool:
        return self.total.reached() or self.book.daily_reached()

    def add(self, amount_usd: float) -> float:
        self.book.add_spend(amount_usd)
        return self.total.add(amount_usd)


class RateLimit:
    """At most `per_minute` requests per key (an IP) in any 60 s."""

    def __init__(self, per_minute: int, clock: Callable[[], float] = time.time) -> None:
        self.per_minute = per_minute
        self._clock = clock
        self._hits: dict[str, deque[float]] = {}
        self._lock = Lock()

    def allow(self, key: str) -> bool:
        with self._lock:
            now = self._clock()
            hits = self._hits.setdefault(key, deque())
            while hits and now - hits[0] >= 60:
                hits.popleft()
            if len(hits) >= self.per_minute:
                return False
            hits.append(now)
            if len(self._hits) > 10_000:  # bound memory: forget keys with no recent hits
                self._hits = {k: v for k, v in self._hits.items() if v and now - v[-1] < 60}
            return True
