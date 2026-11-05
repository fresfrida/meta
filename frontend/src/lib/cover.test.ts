// Brief 34: the covered-camera rule. Covered (a hand, a pocket) vs a dark room with detail vs a normal frame.
import { describe, expect, it } from 'vitest'
import { COVER_HOLD_MS } from '../config'
import { coveredText } from '../strings'
import { CoverWatch, frameStats, looksCovered } from './cover'

/** RGBA pixels from a per-pixel grey value. */
function frame(n: number, grey: (i: number) => number): Uint8ClampedArray {
  const d = new Uint8ClampedArray(n * 4)
  for (let i = 0; i < n; i++) {
    const g = Math.max(0, Math.min(255, Math.round(grey(i))))
    d.set([g, g, g, 255], i * 4)
  }
  return d
}
const N = 640 * 360
let seed = 7
const noise = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31 - 0.5) * 2

describe('looksCovered', () => {
  it('a hand over the lens (dark, almost no detail): covered', () => {
    expect(looksCovered(frameStats(frame(N, () => 14 + noise() * 2)))).toBe(true)
  })
  it('a lit hand or a pocket (mid grey, almost no detail): covered', () => {
    expect(looksCovered(frameStats(frame(N, () => 70 + noise() * 4)))).toBe(true)
  })
  it('a dark room with detail (dark, but edges and lights): not covered', () => {
    expect(looksCovered(frameStats(frame(N, (i) => (i % 640 < 320 ? 8 : 45) + noise() * 6)))).toBe(false)
  })
  it('a normal indoor frame: not covered', () => {
    expect(looksCovered(frameStats(frame(N, (i) => 90 + 60 * Math.sin(i / 900) + noise() * 20)))).toBe(false)
  })
  it('a plain bright wall close up: not covered (it is a frame worth sending)', () => {
    expect(looksCovered(frameStats(frame(N, () => 200 + noise() * 3)))).toBe(false)
  })
})

describe('CoverWatch', () => {
  it('covered 2 s in a row -> "covered" once; the line is said once; clear -> "clear" once', () => {
    const w = new CoverWatch()
    const events: (string | null)[] = []
    for (let t = 0; t <= 5000; t += 300) events.push(w.update(true, t))
    expect(events.filter((e) => e === 'covered')).toHaveLength(1)
    expect(events.indexOf('covered') * 300).toBeGreaterThanOrEqual(COVER_HOLD_MS)
    expect(w.covered).toBe(true)
    expect(w.update(false, 5300)).toBe('clear')
    expect(w.update(false, 5600)).toBe(null)
    expect(w.covered).toBe(false)
  })
  it('a covered frame now and then (less than 2 s in a row) never fires', () => {
    const w = new CoverWatch()
    for (let t = 0; t < 10000; t += 300) expect(w.update(t % 1500 < 900, t)).toBe(null)
  })
  it('the line, verbatim (Owner approved)', () => {
    expect(coveredText).toBe("I can't see right now. Please check the camera.")
  })
})
