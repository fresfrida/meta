import base64
from pathlib import Path

import pytest

from app.config import Settings, load_settings

ENV_VARS = (
    "VISION_MODE",
    "MODEL_API_KEY",
    "META_BASE_URL",
    "VISION_MODEL",
    "VISION_REASONING_EFFORT",
    "VISION_TIMEOUT_S",
    "BUDGET_USD",
    "PRICE_INPUT_PER_M",
    "PRICE_CACHED_INPUT_PER_M",
    "PRICE_OUTPUT_PER_M",
    "SPEND_FILE",
    "MOCK_HOLD_CALLS",
    "LISTEN_MODE",
    "ASK_MODE",
    "META_ASR_URL",
    "ASR_MODEL",
    "ASR_PRICE_PER_HOUR",
    "DETECT_MODE",
    "MOCK_VISION_DELAY_MS",
    "MOCK_DETECT_DELAY_MS",
    "PUBLIC_DEMO",
    "DATA_DIR",
    "DEMO_SLOT_S",
    "DEMO_SLOTS_PER_DAY",
    "DAILY_BUDGET_USD",
    "DEMO_SECRET",
    "VIDEO_URL",
    "STATIC_DIR",
)

IMG = base64.b64encode(b"\xff\xd8\xff\xe0fake-jpeg").decode()
FAKE_KEY = "LLM_test-secret-key-do-not-leak-123"


@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
    """Tests never see a real backend/.env or shell settings."""
    for name in ENV_VARS:
        monkeypatch.delenv(name, raising=False)


@pytest.fixture
def make_settings(monkeypatch, tmp_path: Path):
    def _make(**env: str) -> Settings:
        env.setdefault("SPEND_FILE", str(tmp_path / "spend.json"))
        for k, v in env.items():
            monkeypatch.setenv(k, v)
        return load_settings(env_file=None)

    return _make
