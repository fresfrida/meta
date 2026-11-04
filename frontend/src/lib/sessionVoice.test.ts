import { describe, expect, it } from 'vitest'
import { SESSION_IDLE, greetingDone, holdForGreeting, onStart, onStop } from './sessionVoice'
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
    expect(sessionText.en).toEqual({ start: "Second Eyes is on. I'll tell you what I see in your path.", stop: 'Second Eyes is off.' })
    expect(sessionText.zh).toEqual({ start: 'Second Eyes 已开启。我会告诉您路上看到的情况。', stop: 'Second Eyes 已关闭。' })
    expect(sessionText.ms).toEqual({
      start: 'Second Eyes sudah dihidupkan. Saya akan beritahu apa yang saya nampak di laluan anda.',
      stop: 'Second Eyes sudah dimatikan.',
    })
    expect(sessionText.ta).toEqual({ start: 'Second Eyes இயக்கப்பட்டது. உங்கள் பாதையில் நான் பார்ப்பதைச் சொல்வேன்.', stop: 'Second Eyes நிறுத்தப்பட்டது.' })
  })
})
