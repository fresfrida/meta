"""The wake rule: tolerant matching, the rest of the turn is the question, everything else is dropped."""

import pytest

from app.wake import WakeEvent, WakeTracker, match_wake


@pytest.mark.parametrize(
    ("turn", "rest"),
    [
        ("Hey Eyes, what is there?", "what is there?"),
        ("hey eyes what is there", "what is there"),
        ("HEY EYES! What's ahead?", "What's ahead?"),
        ("Hey, Eyes. What is there?", "What is there?"),
        ("Hey-Eyes what is there", "what is there"),
        ("hey eye, what is there", "what is there"),
        ("Hey ice what is there?", "what is there?"),
        ("Hay eyes, what is there?", "what is there?"),
        ("Hi eyes what's in front of me", "what's in front of me"),
        ("Heyeyes what is there", "what is there"),
        ("Hey Eyes", ""),
        ("Hey Eyes.", ""),
        ("  hey eyes  ", ""),
        ("Hey Eyes, 前面有什么？", "前面有什么？"),
    ],
)
def test_wake_phrase_matches_tolerantly(turn, rest):
    assert match_wake(turn) == rest


# Exactly as the live ASR wrote them (Brief 8, 4 Nov 2026: macOS `say` clips, bias English + the chosen language).
# In every language "Hey Eyes" came back in Latin letters, so no other spellings were added.
@pytest.mark.parametrize(
    ("lang", "turn", "rest"),
    [
        ("en", "Hey eyes, what is there?", "what is there?"),
        ("en", "Hey Eyes, what is there?", "what is there?"),
        ("zh", "Hey eyes,前面有什么？", "前面有什么？"),
        ("zh", "Hey Eyes,前面有什么。", "前面有什么。"),
        ("zh", "Hey Eyes, 前面有什么?", "前面有什么?"),
        ("ms", "Hey eyes, apa yang ada di hadapan?", "apa yang ada di hadapan?"),
        ("ta", "Hey Eyes, முன்னால் என்ன இருக்கிறது?", "முன்னால் என்ன இருக்கிறது?"),
        ("ta", "Hey Eyes, முன்னால் என்ன இருக்கிறது", "முன்னால் என்ன இருக்கிறது"),
        ("ta", "Hey Eyes, Munnal என்ன இருக்கிறது", "Munnal என்ன இருக்கிறது"),
    ],
)
def test_wake_phrase_as_the_asr_writes_it_per_language(lang, turn, rest):
    assert match_wake(turn) == rest


# The distractors from the same run (no wake phrase): never a question.
@pytest.mark.parametrize(
    "turn",
    [
        "I need to buy some milk later.",
        "我等一下要去买牛奶。",
        "Saya perlu membeli susu nanti.",
        "நான் பிறகு போல் வாங்க வேண்டும்.",
    ],
)
def test_measured_distractors_never_wake(turn):
    assert match_wake(turn) is None
    assert WakeTracker().on_turn(turn, 0) == []


@pytest.mark.parametrize(
    "turn",
    [
        "what is there",
        "Hi, is anyone there?",
        "They said hey eyes earlier",
        "Heyes",
        "Hey you",
        "Eyes hey",
        "Hey, I see it",
        "",
    ],
)
def test_other_speech_does_not_wake(turn):
    assert match_wake(turn) is None


def test_wake_and_question_in_one_turn():
    t = WakeTracker()
    assert t.on_turn("Hey Eyes, what is there?", 0) == [WakeEvent("wake"), WakeEvent("question", "what is there?")]


def test_wake_alone_then_question_within_window():
    t = WakeTracker(window_ms=6000)
    assert t.on_turn("Hey Eyes", 1000) == [WakeEvent("wake")]
    assert t.on_turn("what is in front of me", 6500) == [WakeEvent("question", "what is in front of me")]
    # the window is used up by that question
    assert t.on_turn("and now?", 7000) == []


def test_wake_alone_then_too_late():
    t = WakeTracker(window_ms=6000)
    t.on_turn("Hey Eyes", 1000)
    assert t.on_turn("what is there", 7001) == []


def test_everything_else_is_dropped():
    t = WakeTracker()
    assert t.on_turn("I need to buy milk", 0) == []
    assert t.on_turn("call me later", 100) == []


def test_hold_makes_any_turn_a_question_and_strips_a_wake_phrase():
    t = WakeTracker(hold_tail_ms=3000)
    t.hold_start()
    assert t.on_turn("what colour is the door", 0) == [WakeEvent("question", "what colour is the door")]
    assert t.on_turn("Hey Eyes, is it open", 10) == [WakeEvent("question", "is it open")]
    t.hold_end(1000)
    assert t.on_turn("one more", 3999) == [WakeEvent("question", "one more")]
    assert t.on_turn("not this", 4001) == []


def test_empty_turns_never_become_questions():
    t = WakeTracker()
    t.on_turn("Hey Eyes", 0)
    assert t.on_turn("   ", 100) == []
