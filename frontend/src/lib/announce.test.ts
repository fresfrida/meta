import { describe, expect, it } from 'vitest'
import type { VisionAnswer } from '../api/types'
import { type AnnounceState, INITIAL_ANNOUNCE, decide, spoke } from './announce'

const GAP = 1500
const CLOSER = 2
const LEFT_MAX = 333
type A = Pick<VisionAnswer, 'hazard' | 'side' | 'distance' | 'distance_m'>
const a = (hazard: A['hazard'], distance: A['distance'] = null, distance_m: A['distance_m'] = null, side: A['side'] = 'ahead'): A => ({
  hazard,
  side,
  distance,
  distance_m,
})
const step = a('step_down', 'near')
const curb = a('curb', 'far')
const clear = a('clear')
const unsure = a('unsure')
const run = (x: A, s: AnnounceState = INITIAL_ANNOUNCE, now = 10_000) => decide(x, s, now, GAP, CLOSER)
const said = (x: A, at: number, speaking = false) => ({ ...spoke(x, at), speaking })
const later = 30_000

describe('decide: timing and unsure', () => {
  it('speaks the first answer', () => {
    expect(run(step)).toEqual({ speak: true, interrupt: false })
    expect(run(clear)).toEqual({ speak: true, interrupt: false })
  })

  it('never speaks unsure, even first', () => {
    expect(run(unsure)).toEqual({ speak: false, why: 'unsure' })
    expect(run(unsure, said(clear, 0))).toEqual({ speak: false, why: 'unsure' })
  })

  it('speaks a new hazard once the gap has passed', () => {
    const s = said(step, 10_000)
    expect(run(clear, s, 10_000 + GAP - 1)).toEqual({ speak: false, why: 'too_soon' })
    expect(run(clear, s, 10_000 + GAP)).toEqual({ speak: true, interrupt: false })
  })

  it('a new warning cuts off speech in progress', () => {
    expect(run(curb, said(step, 10_000, true), 10_000 + GAP)).toEqual({ speak: true, interrupt: true })
  })

  it('a non-warning waits for speech in progress to finish', () => {
    expect(run(clear, said(step, 10_000, true), 10_000 + GAP)).toEqual({ speak: false, why: 'busy' })
  })

  it('unsure between two equal answers keeps them silent', () => {
    const s = said(step, 10_000)
    expect(run(unsure, s, 12_000).speak).toBe(false)
    expect(run(step, s, 14_000)).toEqual({ speak: false, why: 'repeat' })
  })

  it('clear stays silent after clear', () => {
    expect(run(clear, said(clear, 0), later)).toEqual({ speak: false, why: 'repeat' })
  })
})

describe('decide with metres (key = hazard type)', () => {
  const at = (m: number, side: A['side'] = 'left') => a('obstacle', m <= 2 ? 'near' : 'far', m, side)

  it('same hazard, same or further: silent', () => {
    expect(run(at(5), said(at(5), 0), later)).toEqual({ speak: false, why: 'repeat' })
    expect(run(at(8), said(at(5), 0), later)).toEqual({ speak: false, why: 'repeat' })
  })

  it('same hazard, less than REPEAT_CLOSER_M closer: silent', () => {
    expect(run(at(4), said(at(5), 0), later)).toEqual({ speak: false, why: 'repeat' })
  })

  it('same hazard, at least REPEAT_CLOSER_M closer: spoken', () => {
    expect(run(at(3), said(at(5), 0), later)).toEqual({ speak: true, interrupt: false })
    expect(run(at(1), said(at(5), 0), later)).toEqual({ speak: true, interrupt: false })
  })

  it('a side change alone never re-speaks', () => {
    expect(run(at(5, 'right'), said(at(5, 'left'), 0), later)).toEqual({ speak: false, why: 'repeat' })
    expect(run(at(5, 'ahead'), said(at(5, 'left'), 0), later)).toEqual({ speak: false, why: 'repeat' })
  })

  it('a different hazard type: spoken', () => {
    expect(run(a('curb', 'far', 5, 'left'), said(at(5), 0), later)).toEqual({ speak: true, interrupt: false })
  })

  it('a closer repeat still obeys the gap', () => {
    expect(run(at(3), said(at(5), later), later + GAP - 1)).toEqual({ speak: false, why: 'too_soon' })
  })

  it('a reset state (language change) speaks the same answer again', () => {
    expect(run(at(5), INITIAL_ANNOUNCE, later)).toEqual({ speak: true, interrupt: false })
  })

  it('the live flapping sequence (box centre 307-342 around 333) speaks once', () => {
    // Box centres seen in the Brief 5 live loop, one answer every ~1.8 s; obstacle at 2 m throughout.
    const centres = [312, 307, 342, 340, 312, 312, 312, 340]
    let state = INITIAL_ANNOUNCE
    let spokenCount = 0
    centres.forEach((c, i) => {
      const answer = at(2, c <= LEFT_MAX ? 'left' : 'ahead')
      const now = 1_000 + i * 1_800
      const d = decide(answer, state, now, GAP, CLOSER)
      if (d.speak) {
        spokenCount += 1
        state = spoke(answer, now)
      }
      state = { ...state, speaking: false }
    })
    expect(spokenCount).toBe(1)
  })
})

describe('decide without metres (key = hazard type + near/far)', () => {
  it('same hazard and distance: silent, whatever the side', () => {
    expect(run(a('curb', 'far', null, 'right'), said(a('curb', 'far', null, 'left'), 0), later)).toEqual({
      speak: false,
      why: 'repeat',
    })
  })

  it('far -> near speaks again', () => {
    expect(run(a('curb', 'near'), said(a('curb', 'far'), 0), later)).toEqual({ speak: true, interrupt: false })
  })

  it('near -> far stays silent', () => {
    expect(run(a('curb', 'far'), said(a('curb', 'near'), 0), later)).toEqual({ speak: false, why: 'repeat' })
  })

  it('a new hazard type speaks', () => {
    expect(run(a('step_up', 'far'), said(a('curb', 'far'), 0), later)).toEqual({ speak: true, interrupt: false })
  })

  it('last spoken with metres, now without: falls back to near/far', () => {
    expect(run(a('obstacle', 'far'), said(a('obstacle', 'far', 5), 0), later)).toEqual({ speak: false, why: 'repeat' })
    expect(run(a('obstacle', 'near'), said(a('obstacle', 'far', 5), 0), later)).toEqual({ speak: true, interrupt: false })
  })
})

describe('spoke', () => {
  it('records hazard, metres, near, time and speaking', () => {
    expect(spoke(a('curb', 'far', 3, 'right'), 5)).toEqual({
      lastHazard: 'curb',
      lastDistanceM: 3,
      lastNear: false,
      lastSpokenAt: 5,
      speaking: true,
    })
  })
})
