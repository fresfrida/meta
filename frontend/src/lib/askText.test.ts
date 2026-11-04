import { describe, expect, it } from 'vitest'
import type { Lang } from '../config'
import type { AskView } from '../hooks/useAsk'
import { askFailureSpeech, askLines } from './askText'

// Each language through the Ask flow: wake -> question -> looking -> answer, or -> failure (sorry, shown and spoken).
const cases: Record<Lang, { question: string; listening: string; asked: string; thinking: string; sorry: string; voice: string }> = {
  en: {
    question: 'what is there?',
    listening: 'Listening for your question…',
    asked: 'You asked: what is there?',
    thinking: 'Looking…',
    sorry: 'Sorry, I could not answer.',
    voice: 'en-GB',
  },
  zh: {
    question: '前面有什么？',
    listening: '请说出您的问题…',
    asked: '您问：前面有什么？',
    thinking: '正在查看…',
    sorry: '抱歉，我无法回答。',
    voice: 'zh-CN',
  },
  ms: {
    question: 'apa yang ada di hadapan?',
    listening: 'Sila tanya soalan anda…',
    asked: 'Anda bertanya: apa yang ada di hadapan?',
    thinking: 'Sedang melihat…',
    sorry: 'Maaf, saya tidak dapat menjawab.',
    voice: 'ms-MY',
  },
  ta: {
    question: 'முன்னால் என்ன இருக்கிறது?',
    listening: 'உங்கள் கேள்வியைக் கேளுங்கள்…',
    asked: 'நீங்கள் கேட்டது: முன்னால் என்ன இருக்கிறது?',
    thinking: 'பார்க்கிறேன்…',
    sorry: 'மன்னிக்கவும், என்னால் பதில் சொல்ல முடியவில்லை.',
    voice: 'ta-IN',
  },
}

describe.each(Object.entries(cases) as [Lang, (typeof cases)[Lang]][])('Ask flow in %s', (lang, c) => {
  const view = (status: AskView['status'], question: string | null, answer: string | null = null): AskView => ({
    status,
    question,
    answer,
  })

  it('shows the translated texts at each step', () => {
    expect(askLines(view('listening', null), lang)).toEqual({ question: c.listening, thinking: null, answer: null })
    expect(askLines(view('thinking', c.question), lang)).toEqual({ question: c.asked, thinking: c.thinking, answer: null })
    expect(askLines(view('answering', c.question, 'model answer'), lang)).toEqual({
      question: c.asked,
      thinking: null,
      answer: 'model answer',
    })
  })

  it('shows and speaks "sorry" in the chosen language on failure', () => {
    expect(askLines(view('failed', c.question), lang)).toEqual({ question: c.asked, thinking: null, answer: c.sorry })
    expect(askFailureSpeech(lang)).toEqual({ text: c.sorry, lang: c.voice })
  })
})
