"""Public demo limits (Brief 17): slots with a fake clock, the daily cap, the per-browser slot, the rate limit, and
the API behaviour with PUBLIC_DEMO on and off."""

import json
from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from app.budget import Budget
from app.demo import SGT, DailyCapBudget, DemoBook, RateLimit, SlotRefused
from app.main import create_app

from .conftest import IMG


class Clock:
    def __init__(self, t: float) -> None:
        self.t = t

    def __call__(self) -> float:
        return self.t


NOON_SGT = datetime(2026, 11, 5, 12, 0, tzinfo=SGT).timestamp()


def book(tmp_path, clock, **kw):
    args = dict(slot_s=180, slots_per_day=10, daily_budget_usd=8.0, secret="s")
    args.update(kw)
    return DemoBook(tmp_path / "demo.json", clock=clock, **args)


def test_a_slot_lasts_180_s(tmp_path):
    clock = Clock(NOON_SGT)
    b = book(tmp_path, clock)
    slot = b.issue("browser-aaaaaaaa")
    assert slot.expires_at == NOON_SGT + 180
    clock.t += 179
    assert b.check(slot.token)
    clock.t += 1
    assert not b.check(slot.token)


def test_tokens_are_signed(tmp_path):
    b = book(tmp_path, Clock(NOON_SGT))
    token = b.issue("browser-aaaaaaaa").token
    slot_id, expires, mac = token.split(".")
    assert not b.check(f"{slot_id}.{int(expires) + 3600}.{mac}")  # a longer slot is not accepted
    assert not b.check("nonsense") and not b.check(None) and not b.check("")
    other = DemoBook(tmp_path / "other.json", 180, 10, 8.0, secret="different", clock=Clock(NOON_SGT))
    assert not other.check(token)


def test_the_11th_slot_of_the_day_is_refused_and_the_next_day_starts_fresh(tmp_path):
    clock = Clock(NOON_SGT)
    b = book(tmp_path, clock)
    for i in range(10):
        b.issue(f"browser-{i:08d}")
    with pytest.raises(SlotRefused) as refused:
        b.issue("browser-eleventh")
    assert refused.value.code == "slots_full"
    clock.t = datetime(2026, 11, 6, 0, 0, 1, tzinfo=SGT).timestamp()  # just after midnight in Singapore
    assert b.issue("browser-eleventh").token


def test_same_browser_gets_its_running_slot_back_not_a_new_one(tmp_path):
    clock = Clock(NOON_SGT)
    b = book(tmp_path, clock)
    first = b.issue("browser-aaaaaaaa")
    clock.t += 60
    assert b.issue("browser-aaaaaaaa") == first and b.slots_today == 1
    clock.t += 200  # first slot over: a new one counts
    assert b.issue("browser-aaaaaaaa") != first and b.slots_today == 2


def test_daily_budget_stops_new_slots_and_live_calls(tmp_path):
    clock = Clock(NOON_SGT)
    b = book(tmp_path, clock, daily_budget_usd=1.0)
    total = Budget(tmp_path / "spend.json", 25.0)
    capped = DailyCapBudget(total, b)
    capped.add(0.6)
    assert not capped.reached()
    capped.add(0.5)
    assert capped.reached() and not total.reached()
    with pytest.raises(SlotRefused) as refused:
        b.issue("browser-aaaaaaaa")
    assert refused.value.code == "daily_budget"
    clock.t = datetime(2026, 11, 6, 8, 0, tzinfo=SGT).timestamp()  # new day: the daily cap resets, the total does not
    assert not capped.reached() and capped.spent_usd == pytest.approx(1.1)


def test_counts_survive_a_restart_and_unreadable_counts_fail_closed(tmp_path):
    clock = Clock(NOON_SGT)
    b = book(tmp_path, clock)
    for i in range(3):
        b.issue(f"browser-{i:08d}")
    assert book(tmp_path, clock).slots_today == 3
    (tmp_path / "demo.json").write_text("{not json")
    broken = book(tmp_path, clock)
    with pytest.raises(SlotRefused):
        broken.issue("browser-zzzzzzzz")


def test_nothing_personal_is_stored(tmp_path):
    b = book(tmp_path, Clock(NOON_SGT))
    b.issue("browser-my-random-id")
    assert "browser-my-random-id" not in (tmp_path / "demo.json").read_text()


def test_rate_limit_per_ip():
    clock = Clock(0)
    rl = RateLimit(2, clock)
    assert rl.allow("1.1.1.1") and rl.allow("1.1.1.1") and not rl.allow("1.1.1.1")
    assert rl.allow("2.2.2.2")
    clock.t = 60
    assert rl.allow("1.1.1.1")


# ---- through the API ---------------------------------------------------------------------------------------------
def public_app(make_settings, tmp_path, **env):
    env = {"PUBLIC_DEMO": "1", "DATA_DIR": str(tmp_path), "DEMO_SECRET": "s", "VIDEO_URL": "https://example.com/v"} | env
    return TestClient(create_app(make_settings(**env)))


def test_public_mode_needs_a_slot_for_every_call(make_settings, tmp_path):
    client = public_app(make_settings, tmp_path)
    health = client.get("/api/health").json()
    assert (health["public_demo"], health["demo_slot_s"], health["video_url"]) == (True, 180, "https://example.com/v")
    for path, body in (("/api/analyze", {"image_b64": IMG}), ("/api/detect", {"image_b64": IMG})):
        r = client.post(path, json=body)
        assert r.status_code == 403 and r.json()["detail"]["code"] == "slot_ended"
    token = client.post("/api/slot", json={"device_id": "browser-aaaaaaaa"}).json()["token"]
    assert client.post("/api/analyze", json={"image_b64": IMG}, headers={"x-demo-slot": token}).status_code == 200
    assert client.post("/api/detect", json={"image_b64": IMG}, headers={"x-demo-slot": token}).status_code == 200
    ask = {"question": "what is there?", "image_b64": IMG, "last_warning": None, "language": "en"}
    assert client.post("/api/ask", json=ask).status_code == 403
    assert client.post("/api/ask", json=ask, headers={"x-demo-slot": token}).status_code == 200


def test_public_mode_listen_needs_a_slot(make_settings, tmp_path):
    client = public_app(make_settings, tmp_path)
    with client.websocket_connect("/api/listen?lang=en") as ws:
        assert ws.receive_json() == {"type": "error", "code": "slot_ended"}
    token = client.post("/api/slot", json={"device_id": "browser-aaaaaaaa"}).json()["token"]
    with client.websocket_connect(f"/api/listen?lang=en&slot={token}") as ws:
        assert ws.receive_json() == {"type": "ready", "source": "mock"}


def test_the_11th_slot_is_refused_over_the_api(make_settings, tmp_path):
    client = public_app(make_settings, tmp_path)
    codes = []
    for i in range(11):
        r = client.post("/api/slot", json={"device_id": f"browser-{i:08d}"}, headers={"x-forwarded-for": f"10.0.0.{i}"})
        codes.append(r.status_code if r.status_code == 200 else r.json()["detail"]["code"])
    assert codes == [200] * 10 + ["slots_full"]


def test_daily_cap_refusal_over_the_api(make_settings, tmp_path):
    (tmp_path / "demo.json").write_text(json.dumps({"day": datetime.now(SGT).strftime("%Y-%m-%d"), "slots": 0, "spent_usd": 8.0, "devices": {}}))
    client = public_app(make_settings, tmp_path)
    r = client.post("/api/slot", json={"device_id": "browser-aaaaaaaa"})
    assert r.status_code == 429 and r.json()["detail"]["code"] == "daily_budget"


def test_slot_requests_are_rate_limited_per_ip(make_settings, tmp_path):
    client = public_app(make_settings, tmp_path)
    codes = [client.post("/api/slot", json={"device_id": f"browser-{i:08d}"}).status_code for i in range(8)]
    assert codes[:6] == [200] * 6 and codes[6:] == [429, 429]


def test_with_public_demo_off_everything_is_as_today(make_settings, tmp_path):
    client = TestClient(create_app(make_settings(DATA_DIR=str(tmp_path))))
    assert client.post("/api/analyze", json={"image_b64": IMG}).status_code == 200
    assert client.post("/api/slot", json={"device_id": "browser-aaaaaaaa"}).status_code == 404
    assert client.get("/api/health").json()["public_demo"] is False


def test_static_frontend_and_spa_fallback(make_settings, tmp_path):
    static = tmp_path / "static"
    (static / "assets").mkdir(parents=True)
    (static / "index.html").write_text("<html>app</html>")
    (static / "assets" / "app.js").write_text("console.log(1)")
    client = TestClient(create_app(make_settings(STATIC_DIR=str(static))))
    assert client.get("/").text == "<html>app</html>"
    assert client.get("/assets/app.js").text == "console.log(1)"
    assert client.get("/settings").text == "<html>app</html>"  # SPA fallback
    assert client.get("/api/health").json()["status"] == "ok"  # API still wins
    assert client.get("/api/nope").status_code == 404
