import { describe, expect, it } from 'vitest'
import {
  PHASE_IDLE,
  SESSION_IDLE,
  enterPreparing,
  greetingDone,
  holdForGreeting,
  leavePreparing,
  onFirstAnswer,
  onGreetingEnd,
  onStart,
  onStop,
  showSlow,
  stillPreparing,
} from './sessionVoice'
import { sessionText } from '../strings'

describe('Start / Stop lines', () => {
  it('nothing is said on page load (no tap)', () => {
    expect(SESSION_IDLE).toEqual({ on: false, greeting: false })
  })
  it('Start says the start line once; a second tap says nothing', () => {
    const [s1, say1] = onStart(SESSION_IDLE)
    expect(say1).toBe('start')
    const [, say2] = onStart(s1)
    expect(say2).toBeNull()
  })
  it('Stop says the stop line once, only after Start', () => {
    expect(onStop(SESSION_IDLE)[1]).toBeNull()
    const [on] = onStart(SESSION_IDLE)
    const [off, say] = onStop(on)
    expect(say).toBe('stop')
    expect(onStop(off)[1]).toBeNull()
  })
  it('hazard speech never overlaps the start line: it waits until the line is done', () => {
    const [greeting] = onStart(SESSION_IDLE)
    const speak = { speak: true, interrupt: true } as const
    expect(holdForGreeting(speak, greeting)).toEqual({ speak: false, why: 'busy' })
    expect(holdForGreeting(speak, greetingDone(greeting))).toEqual(speak)
    expect(holdForGreeting({ speak: false, why: 'repeat' }, greeting)).toEqual({ speak: false, why: 'repeat' })
  })
  it('the lines, verbatim (Owner approved, 4 languages)', () => {
    expect(sessionText.en).toEqual({
      start: 'Second Eyes is getting ready. Please wait a moment before you walk.', // Brief 27
      stop: 'Second Eyes is off.',
      ready: "Ready. I'll tell you what I see in your path.",
      still: 'Still getting ready. Thank you for waiting.',
    })
    expect(sessionText.zh).toEqual({ start: 'Second Eyes 已开启。我会告诉您路上看到的情况。', stop: 'Second Eyes 已关闭。', ready: null, still: null })
    expect(sessionText.ms).toEqual({
      start: 'Second Eyes sudah dihidupkan. Saya akan beritahu apa yang saya nampak di laluan anda.',
      stop: 'Second Eyes sudah dimatikan.',
      ready: null,
      still: null,
    })
    expect(sessionText.ta).toEqual({
      start: 'Second Eyes இயக்கப்பட்டது. உங்கள் பாதையில் நான் பார்ப்பதைச் சொல்வேன்.',
      stop: 'Second Eyes நிறுத்தப்பட்டது.',
      ready: null,
      still: null,
    })
  })
})

describe('getting ready (Brief 27)', () => {
  it('Start enters it; the first answer leaves it and says the ready line', () => {
    const p = enterPreparing(1000)
    expect(p.preparing).toBe(true)
    const [left, say] = onFirstAnswer(p, { hazard: false, greeting: false })
    expect(left.preparing).toBe(false)
    expect(say).toBe('ready')
    expect(onFirstAnswer(left, { hazard: false, greeting: false })[1]).toBeNull() // once
  })
  it('a hazard as the first answer beats the ready line', () => {
    const [left, say] = onFirstAnswer(enterPreparing(0), { hazard: true, greeting: false })
    expect(left.preparing).toBe(false)
    expect(say).toBeNull()
  })
  it('the start line still playing: the ready line waits for it, then is said once', () => {
    const [left, say] = onFirstAnswer(enterPreparing(0), { hazard: false, greeting: true })
    expect(say).toBeNull()
    const [after, ready] = onGreetingEnd(left)
    expect(ready).toBe('ready')
    expect(onGreetingEnd(after)[1]).toBeNull()
  })
  it('still preparing after 8 s: the still line once; not after the first answer', () => {
    const p = enterPreparing(1000)
    expect(stillPreparing(p, 8999, 8000)[1]).toBeNull()
    const [said, still] = stillPreparing(p, 9000, 8000)
    expect(still).toBe('still')
    expect(stillPreparing(said, 20000, 8000)[1]).toBeNull()
    const [left] = onFirstAnswer(p, { hazard: false, greeting: false })
    expect(stillPreparing(left, 20000, 8000)[1]).toBeNull()
  })
  it('no "Model is slow" while getting ready; shown as before afterwards', () => {
    expect(showSlow(enterPreparing(0), true)).toBe(false)
    expect(showSlow(PHASE_IDLE, true)).toBe(true)
    expect(showSlow(leavePreparing(), false)).toBe(false)
  })
})
