"""Ask: approved prompt filled verbatim, two-sentence trim, budget, errors. Fake client, no network."""

import json

import pytest
from fastapi.testclient import TestClient

from app.ask import ask_prompt, first_sentences, LiveAsk, MockAsk, MOCK_ANSWER
from app.config import ASK_PROMPT, MAX_OUTPUT_TOKENS
from app.main import create_app

from .conftest import FAKE_KEY, IMG
from .test_live import FakeClient, completion

APPROVED = (
    "You are helping a person who is blind or has low vision understand the photo from their phone camera, taken "
    "from chest height facing forward. Their last warning was: {last warning}. They asked: {question}. Answer in "
    "{language}, in at most two short sentences, describing only what you can see. Describe where the path goes; "
    "never tell the person which way to go. Never say it is safe to walk, cross or move; if you cannot tell, say "
    "so. Do not identify or describe people beyond saying there is a person."
)  # Brief 29: + the path sentence, Owner approved 5 Nov, verbatim


def test_ask_prompt_has_the_path_sentence_once_brief_29():
    sentence = "Describe where the path goes; never tell the person which way to go."
    assert ASK_PROMPT.count(sentence) == 1
    assert "describing only what you can see. " + sentence + " Never say it is safe" in ASK_PROMPT


def test_ask_prompt_template_is_verbatim():
    assert ASK_PROMPT == APPROVED


def test_ask_prompt_fills_only_the_placeholders():
    p = ask_prompt("what is there?", "Steps going down, about 2 metres ahead.", "ta")
    assert p == APPROVED.replace("{last warning}", "Steps going down, about 2 metres ahead.").replace(
        "{question}", "what is there?"
    ).replace("{language}", "Tamil")
    assert "Their last warning was: none." in ask_prompt("hi", None, "en")
    # user text containing a placeholder is not re-filled
    assert "They asked: say {language}." in ask_prompt("say {language}", None, "zh")
    assert "Answer in Mandarin Chinese," in ask_prompt("q", None, "zh")


@pytest.mark.parametrize(
    ("text", "out"),
    [
        ("A door ahead. It is closed. A mat is in front.", "A door ahead. It is closed."),
        ("One sentence only", "One sentence only"),
        ("前面有一扇门。门是关着的。还有垫子。", "前面有一扇门。门是关着的。"),
        ("Is it 2.5 m away? Yes.  More here.", "Is it 2.5 m away? Yes."),
        ("  spaced\n out.  text. third. ", "spaced out. text."),
    ],
)
def test_first_two_sentences(text, out):
    assert first_sentences(text) == out


def live_ask_app(make_settings, result):
    settings = make_settings(VISION_MODE="live", MODEL_API_KEY=FAKE_KEY)
    fake = FakeClient(result)
    return TestClient(create_app(settings, asker=LiveAsk(settings, client_factory=lambda s: fake))), fake, settings


BODY = {"question": "what is there?", "image_b64": IMG, "last_warning": "A kerb, about 1 metre ahead.", "language": "en"}


def test_live_ask_answers_trims_and_bills(make_settings):
    client, fake, settings = live_ask_app(
        make_settings, completion("A wooden door is ahead. It looks closed. There is a mat.", 900, 120)
    )
    r = client.post("/api/ask", json=BODY)
    assert r.status_code == 200
    body = r.json()
    assert body["question"] == "what is there?"
    assert body["answer"] == "A wooden door is ahead. It looks closed."
    assert body["source"] == "live" and body["model_ms"] >= 0
    assert body["cost_usd"] == pytest.approx((900 * 1.25 + 120 * 4.25) / 1e6)
    assert client.get("/api/health").json()["spent_usd"] == pytest.approx(body["cost_usd"], abs=1e-6)
    call = fake.calls[0]
    assert "response_format" not in call  # plain text answer
    assert call["reasoning_effort"] == "minimal"
    assert call["max_completion_tokens"] == MAX_OUTPUT_TOKENS == 2000
    text, image = call["messages"][0]["content"]
    assert text["text"] == ask_prompt("what is there?", "A kerb, about 1 metre ahead.", "en")
    assert image["image_url"]["url"].endswith(IMG)


def test_live_ask_empty_answer_is_an_error_but_billed(make_settings):
    client, _, _ = live_ask_app(make_settings, completion("   ", 800, 50))
    r = client.post("/api/ask", json=BODY)
    assert r.status_code == 502 and r.json()["detail"]["code"] == "empty_answer"
    assert client.get("/api/health").json()["spent_usd"] > 0


def test_live_ask_timeout_maps_to_model_timeout(make_settings):
    import httpx
    import openai

    client, _, _ = live_ask_app(make_settings, openai.APITimeoutError(request=httpx.Request("POST", "https://x")))
    r = client.post("/api/ask", json=BODY)
    assert r.status_code == 504 and r.json()["detail"]["code"] == "model_timeout"


def test_ask_validates_input(make_settings):
    client = TestClient(create_app(make_settings()))
    assert client.post("/api/ask", json={**BODY, "language": "fr"}).status_code == 422
    assert client.post("/api/ask", json={**BODY, "question": ""}).status_code == 422
    assert client.post("/api/ask", json={**BODY, "image_b64": "%%%"}).json()["detail"]["code"] == "invalid_image"


def test_mock_ask(make_settings):
    client = TestClient(create_app(make_settings()))
    body = client.post("/api/ask", json=BODY).json()
    assert body["answer"] == MOCK_ANSWER and body["source"] == "mock" and body["cost_usd"] is None


def test_ask_refused_at_budget(make_settings, tmp_path):
    (tmp_path / "spend.json").write_text(json.dumps({"spent_usd": 30}))
    client, fake, _ = live_ask_app(make_settings, completion("x.", 1, 1))
    r = client.post("/api/ask", json=BODY)
    assert r.status_code == 402 and fake.calls == []


def test_ask_mode_can_be_live_while_vision_is_mock(make_settings):
    settings = make_settings(VISION_MODE="mock", ASK_MODE="live", MODEL_API_KEY=FAKE_KEY)
    assert (settings.vision_mode, settings.ask_mode, settings.listen_mode) == ("mock", "live", "mock")
    fake = FakeClient(completion("A door. It is closed.", 900, 100))
    client = TestClient(create_app(settings, asker=LiveAsk(settings, client_factory=lambda s: fake)))
    body = client.post("/api/ask", json=BODY).json()
    assert body["source"] == "live" and body["cost_usd"] > 0
    assert client.post("/api/analyze", json={"image_b64": IMG}).json()["source"] == "mock"


def test_mock_ask_class():
    assert MockAsk().ask("q", IMG, None, "en").answer == MOCK_ANSWER


def test_live_ask_cut_by_the_output_cap_is_a_failure_but_billed(make_settings):
    client, _, _ = live_ask_app(make_settings, completion("A path goes ahead and", 800, MAX_OUTPUT_TOKENS, finish_reason="length"))
    r = client.post("/api/ask", json=BODY)
    assert r.status_code == 502 and r.json()["detail"]["code"] == "model_error"  # the phone says its "sorry"
    assert client.get("/api/health").json()["spent_usd"] == pytest.approx((800 * 1.25 + MAX_OUTPUT_TOKENS * 4.25) / 1e6, abs=1e-6)
