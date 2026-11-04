// What the Ask part of the card shows, and what is spoken when a question gets no answer, in the chosen language.
import { type Lang, SPEECH_LANGS } from '../config'
import type { AskView } from '../hooks/useAsk'
import { askText } from '../strings'

export interface AskLines {
  /** "You asked: …", or "Listening for your question…" before the question arrives. */
  question: string
  /** "Looking…" while waiting for the answer. */
  thinking: string | null
  /** The answer, or the fixed "sorry" when there is none. */
  answer: string | null
}

export function askLines(ask: AskView, lang: Lang): AskLines {
  const t = askText[lang]
  return {
    question: ask.question ? t.youAsked(ask.question) : t.listening,
    thinking: ask.status === 'thinking' ? t.thinking : null,
    answer: ask.status === 'failed' ? t.sorry : ask.answer,
  }
}

/** Spoken when a question gets no answer: the fixed "sorry", in the chosen language and its voice. */
export function askFailureSpeech(lang: Lang): { text: string; lang: string } {
  return { text: askText[lang].sorry, lang: SPEECH_LANGS[lang] }
}
