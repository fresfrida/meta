"""Running total of live spend, kept in a local JSON file so it survives restarts."""

import json
import logging
from pathlib import Path
from threading import Lock

from .config import Prices

log = logging.getLogger(__name__)


def cost_usd(prices: Prices, input_tokens: int, cached_tokens: int, output_tokens: int) -> float:
    """Output tokens include reasoning tokens (billed at the output rate)."""
    uncached = max(input_tokens - cached_tokens, 0)
    return (
        uncached * prices.input_per_m + cached_tokens * prices.cached_input_per_m + output_tokens * prices.output_per_m
    ) / 1_000_000


class Budget:
    def __init__(self, path: Path, budget_usd: float) -> None:
        self.path = path
        self.budget_usd = budget_usd
        self._lock = Lock()
        # Unreadable file: refuse live calls rather than silently reset the counter.
        self._unreadable = False
        self._spent = self._load()

    def _load(self) -> float:
        try:
            data = json.loads(self.path.read_text())
            return float(data["spent_usd"])
        except FileNotFoundError:
            return 0.0
        except (ValueError, KeyError, TypeError, OSError) as exc:
            log.error("spend file unreadable (%s); refusing live calls", type(exc).__name__)
            self._unreadable = True
            return 0.0

    @property
    def spent_usd(self) -> float:
        with self._lock:
            return self._spent

    def reached(self) -> bool:
        return self._unreadable or self.spent_usd >= self.budget_usd

    def add(self, amount_usd: float) -> float:
        with self._lock:
            self._spent += amount_usd
            self.path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.path.with_suffix(".tmp")
            tmp.write_text(json.dumps({"spent_usd": self._spent}))
            tmp.replace(self.path)
            return self._spent
