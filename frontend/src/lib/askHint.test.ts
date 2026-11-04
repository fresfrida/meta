// Brief 30: the spoken Ask hint: once per Start after the ready line, hands-free only, dropped when an answer comes first.
import { describe, expect, it } from 'vitest'
import { hintAfterReady, hintOnSpeech, hintOnStart } from './askHint'
import { askHintText, strings } from '../strings'

describe('the spoken Ask hint', () => {
  it('Owner-approved words; English only; the screen line is English in every language', () => {
    expect(askHintText.en).toBe('You can ask me anything. Just say "Hey Eyes", then your question.')
    expect([askHintText.zh, askHintText.ms, askHintText.ta]).toEqual([null, null, null])
    expect(strings.ask.hintLine).toBe('Say "Hey Eyes", then ask')
  })

  it('hands-free on: said once, right after the ready line ends', () => {
    let s = hintOnStart(true, askHintText.en)
    expect(s).toBe('pending')
    let now: boolean
    ;[s, now] = hintAfterReady(s, true)
    expect(now).toBe(true)
    // a second ready line in the same run (it is said once per Start, but the rule holds anyway): no second hint
    ;[s, now] = hintAfterReady(s, true)
    expect(now).toBe(false)
    expect(s).toBe('said')
    // a new Start: once more
    s = hintOnStart(true, askHintText.en)
    ;[, now] = hintAfterReady(s, true)
    expect(now).toBe(true)
  })

  it('hands-free off: never', () => {
    const s = hintOnStart(false, askHintText.en)
    expect(s).toBe('off')
    expect(hintAfterReady(s, true)[1]).toBe(false)
  })

  it('中文 / Bahasa Melayu / தமிழ்: no spoken hint', () => {
    for (const lang of ['zh', 'ms', 'ta'] as const) expect(hintOnStart(true, askHintText[lang])).toBe('off')
  })

  it('a hazard spoken before it plays: said first, the hint is dropped for that run, not queued', () => {
    let s = hintOnStart(true, askHintText.en)
    s = hintOnSpeech(s) // the hazard
    expect(s).toBe('dropped')
    expect(hintAfterReady(s, true)[1]).toBe(false)
  })

  it('the ready line taken over (a question, Stop, a newer phrase): dropped', () => {
    const [s, now] = hintAfterReady(hintOnStart(true, askHintText.en), false)
    expect(now).toBe(false)
    expect(s).toBe('dropped')
  })

  it('answers after the hint was said do not change anything', () => {
    const [s] = hintAfterReady(hintOnStart(true, askHintText.en), true)
    expect(hintOnSpeech(s)).toBe('said')
  })
})
