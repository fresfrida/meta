import { describe, expect, it } from 'vitest'
import { atSpeakingTime } from './distanceNow'
import { lampFor } from './light'
import { WalkDetector } from './motion'
import type { Shown } from './phrase'
import { speechFor } from './phrase'

const SPEED = 0.8
const STALE = 6000
const wall = (m: number | null): Shown => ({ hazard: 'wall', side: 'ahead', distance: m === null ? 'near' : 'far', distance_m: m })
const at = (s: Shown, ms: number, walking = true) => atSpeakingTime(s, 1_000, 1_000 + ms, walking, SPEED, STALE)

describe('distance at speaking time (fake clock)', () => {
  it('Muse said 4 m, answer 2.5 s later while walking: 2 m left', () => {
    const r = at(wall(4), 2_500)
    expect(r).toMatchObject({ drop: false, capturedM: 4, nowM: 2 })
    if (!r.drop) expect(speechFor(r.shown, 'en')).toBe('A wall, about 2 metres ahead.')
  })
  it('standing still: unchanged', () => {
    expect(at(wall(4), 4_000, false)).toMatchObject({ drop: false, nowM: 4 })
  })
  it('<= 1 m left: "very close", red, never 0 or negative metres', () => {
    const r = at(wall(4), 3_800) // 4 - 3.04 = 0.96
    expect(r.drop).toBe(false)
    if (!r.drop) {
      expect(r.shown.distance_m).toBeNull()
      expect(speechFor(r.shown, 'en')).toBe('A wall very close.')
      expect(lampFor(r.shown)).toBe('red')
    }
  })
  it('already walked past: "very close" while young, dropped when stale', () => {
    const young = at(wall(2), 3_000) // walked 2.4 m > 2 m, 3 s old
    expect(young.drop).toBe(false)
    if (!young.drop) expect(young.shown.distance).toBe('near')
    expect(at(wall(2), 6_500)).toEqual({ drop: true, capturedM: 2 })
  })
  it('lamp uses the adjusted metres: 4 m (amber) becomes 2 m (red)', () => {
    expect(lampFor(wall(4))).toBe('amber')
    const r = at(wall(4), 2_500)
    if (!r.drop) expect(lampFor(r.shown)).toBe('red')
  })
  it('no metres, clear and unsure are unchanged', () => {
    expect(at(wall(null), 5_000)).toMatchObject({ drop: false, nowM: null })
    const clear: Shown = { hazard: 'clear', side: null, distance: null, distance_m: null }
    expect(at(clear, 9_000)).toMatchObject({ drop: false, shown: clear })
  })
})

describe('walking detection', () => {
  it('no motion data: assumes walking', () => {
    expect(new WalkDetector(2_000, 0.3).walking(10_000)).toBe(true)
  })
  it('a still phone (steady 9.8): not walking', () => {
    const d = new WalkDetector(2_000, 0.3)
    for (let t = 0; t <= 2_000; t += 50) d.add(t, 9.8 + (t % 100 ? 0.01 : -0.01))
    expect(d.walking(2_000)).toBe(false)
  })
  it('walking (steps of +-2 m/s^2): walking', () => {
    const d = new WalkDetector(2_000, 0.3)
    for (let t = 0; t <= 2_000; t += 50) d.add(t, 9.8 + 2 * Math.sin(t / 80))
    expect(d.walking(2_000)).toBe(true)
  })
  it('old samples leave the window: back to "assume walking"', () => {
    const d = new WalkDetector(2_000, 0.3)
    for (let t = 0; t <= 2_000; t += 50) d.add(t, 9.8)
    expect(d.walking(2_000)).toBe(false)
    expect(d.walking(10_000)).toBe(true)
  })
})
