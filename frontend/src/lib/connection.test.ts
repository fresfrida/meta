import { describe, expect, it } from 'vitest'
import { type LinkState, onAnswer, onCheck, startLink } from './connection'
import { shouldTick } from './heartbeat'

const LOST = 6_000
const REPEAT = 10_000

/** Runs checks every 500 ms from `from` to `to` (fake clock), collecting what would be said. */
function run(s: LinkState, from: number, to: number, canSpeak = true): [LinkState, [number, string][]] {
  const said: [number, string][] = []
  for (let t = from; t <= to; t += 500) {
    const [next, say] = onCheck(s, t, LOST, REPEAT, canSpeak)
    s = next
    if (say) said.push([t, say])
  }
  return [s, said]
}

describe('connection alerts (fake clock)', () => {
  it('nothing for 6 s -> lost once, then again every 10 s', () => {
    const [s, said] = run(startLink(0), 0, 27_000)
    expect(said).toEqual([
      [6_000, 'lost'],
      [16_000, 'lost'],
      [26_000, 'lost'],
    ])
    expect(s.lost).toBe(true)
  })

  it('answers keep it quiet', () => {
    let s = startLink(0)
    for (let t = 0; t <= 30_000; t += 1_000) {
      ;[s] = onAnswer(s, t, true)
      const [next, say] = onCheck(s, t + 500, LOST, REPEAT, true)
      s = next
      expect(say).toBeNull()
    }
  })

  it('the next answer after a loss says "back" once, and the clock restarts', () => {
    let [s] = run(startLink(0), 0, 7_000)
    const [back, say] = onAnswer(s, 7_200, true)
    expect(say).toBe('back')
    expect(back.lost).toBe(false)
    const [again, say2] = onAnswer(back, 7_500, true)
    expect(say2).toBeNull()
    ;[s] = [again]
    expect(run(s, 8_000, 13_000)[1]).toEqual([]) // < 6 s since 7.5 s
    expect(run(s, 8_000, 13_500)[1]).toEqual([[13_500, 'lost']])
  })

  it('during Ask the lamp goes dark but nothing is said; the line comes once Ask is done', () => {
    let [s, said] = run(startLink(0), 0, 9_000, false)
    expect(s.lost).toBe(true)
    expect(said).toEqual([])
    ;[s, said] = run(s, 9_500, 10_000, true)
    expect(said).toEqual([[9_500, 'lost']])
  })

  it('"back" is not said over an Ask answer', () => {
    const [s] = run(startLink(0), 0, 7_000)
    expect(onAnswer(s, 7_200, false)[1]).toBeNull()
  })
})

describe('heartbeat tick', () => {
  const base = { speaking: false, asking: false, now: 10_000, lastTickAt: 0, minGapMs: 700 }
  it('ticks when a fresh answer is silent', () => {
    expect(shouldTick(base)).toBe(true)
  })
  it('never while speaking or during Ask', () => {
    expect(shouldTick({ ...base, speaking: true })).toBe(false)
    expect(shouldTick({ ...base, asking: true })).toBe(false)
  })
  it('at most once per gap (both channels answering together)', () => {
    expect(shouldTick({ ...base, lastTickAt: 9_500 })).toBe(false)
    expect(shouldTick({ ...base, lastTickAt: 9_300 })).toBe(true)
  })
})

describe('connection lines (wording v2), verbatim', () => {
  it('4 languages', async () => {
    const { connectionText } = await import('../strings')
    expect(connectionText.en).toEqual({ lost: "Connection lost. I can't warn you right now. Please use your cane.", back: "I'm back. Warnings are on again." })
    expect(connectionText.zh).toEqual({ lost: '连接中断。我现在无法提醒您，请使用手杖。', back: '我回来了，提醒已恢复。' })
    expect(connectionText.ms).toEqual({
      lost: 'Sambungan terputus. Saya tidak dapat memberi amaran sekarang. Sila gunakan tongkat anda.',
      back: 'Saya kembali. Amaran aktif semula.',
    })
    expect(connectionText.ta).toEqual({
      lost: 'இணைப்பு துண்டிக்கப்பட்டது. இப்போது என்னால் எச்சரிக்க முடியாது. உங்கள் கைத்தடியைப் பயன்படுத்துங்கள்.',
      back: 'நான் திரும்பி வந்துவிட்டேன். எச்சரிக்கைகள் மீண்டும் இயங்குகின்றன.',
    })
  })
})
