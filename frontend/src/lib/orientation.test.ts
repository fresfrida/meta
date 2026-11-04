// Brief 34: the upside-down rule (steady, hysteresis, no data) and the 180-degree frame turn.
import { describe, expect, it } from 'vitest'
import { FLIP_STALE_MS } from '../config'
import { FlipDetector, flipBox, frameUpsideDown, rotate180, specY } from './orientation'

/** Feeds `y` (spec sign) every 50 ms from `from` for `ms`. Returns the time after the last sample. */
function feed(d: FlipDetector, y: number, from: number, ms: number): number {
  let t = from
  for (; t < from + ms; t += 50) d.add(t, y)
  return t
}

describe('upside down on a lanyard', () => {
  it('upright (+9.8) stays upright; upside down (-9.8) steadily for about 1 s turns it on', () => {
    const d = new FlipDetector()
    let t = feed(d, 9.8, 0, 2000)
    expect(d.upsideDown(t)).toBe(false)
    t = feed(d, -9.8, t, 500)
    expect(d.upsideDown(t)).toBe(false) // not yet steady
    t = feed(d, -9.8, t, 1100)
    expect(d.upsideDown(t)).toBe(true)
  })

  it('a short swing does not flip it, and hysteresis holds it while the phone swings near the middle', () => {
    const d = new FlipDetector()
    let t = feed(d, -9.5, 0, 1500)
    expect(d.upsideDown(t)).toBe(true)
    t = feed(d, -3, t, 1500) // swinging, tilted: between the two thresholds
    expect(d.upsideDown(t)).toBe(true)
    t = feed(d, 6, t, 300) // a brief upright moment
    expect(d.upsideDown(t)).toBe(true)
    t = feed(d, 9.6, t, 1200) // held upright again
    expect(d.upsideDown(t)).toBe(false)
  })

  it('no motion data, too few samples, or stale data = upright', () => {
    const d = new FlipDetector()
    expect(d.upsideDown(1000)).toBe(false)
    d.add(0, -9.8)
    d.add(900, -9.8)
    expect(d.upsideDown(950)).toBe(false) // two samples only
    const t = feed(d, -9.8, 1000, 1500)
    expect(d.upsideDown(t)).toBe(true)
    expect(d.upsideDown(t + FLIP_STALE_MS + 1)).toBe(false) // the sensor stopped
  })

  it('WebKit (iPhone) reports gravity with the opposite sign; it is turned round', () => {
    expect(specY(-9.8, true)).toBe(9.8)
    expect(specY(9.8, false)).toBe(9.8)
  })

  it('?flip=1 / ?flip=0 win over the rule', () => {
    expect(frameUpsideDown(0, true)).toBe(true)
    expect(frameUpsideDown(0, false)).toBe(false)
    expect(frameUpsideDown(0, null)).toBe(false) // no data yet
  })
})

describe('the frame turned 180 degrees', () => {
  it("the top-left pixel ends bottom-right, and the picture is otherwise intact", () => {
    const w = 3
    const h = 2
    const data = new Uint8ClampedArray(w * h * 4)
    for (let i = 0; i < w * h; i++) data.set([i * 10, i * 10 + 1, i * 10 + 2, 255], i * 4)
    const topLeft = Array.from(data.slice(0, 4))
    const topRight = Array.from(data.slice((w - 1) * 4, w * 4))
    rotate180(data)
    expect(Array.from(data.slice((w * h - 1) * 4))).toEqual(topLeft) // bottom-right
    expect(Array.from(data.slice((w * (h - 1)) * 4, (w * (h - 1) + 1) * 4))).toEqual(topRight) // bottom-left
    rotate180(data)
    expect(Array.from(data.slice(0, 4))).toEqual(topLeft) // twice = as before
  })

  it('a box on the turned frame maps back onto the live preview', () => {
    expect(flipBox([100, 200, 300, 900])).toEqual([700, 100, 900, 800])
    expect(flipBox(flipBox([10, 20, 30, 40]))).toEqual([10, 20, 30, 40])
  })
})
