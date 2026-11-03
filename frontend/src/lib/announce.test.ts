import { describe, expect, it } from 'vitest'
import type { VisionAnswer } from '../api/types'
import { INITIAL_ANNOUNCE, decide, spoke } from './announce'
import { phraseFor } from './phrase'

const GAP = 1500
const CLOSER = 2
const step: VisionAnswer = { hazard: 'step_down', side: 'ahead', distance: 'near', box: [1, 2, 3, 4], distance_m: null }
const curb: VisionAnswer = { hazard: 'curb', side: 'right', distance: null, box: null, distance_m: null }
const clear: VisionAnswer = { hazard: 'clear', side: null, distance: null, box: null, distance_m: null }
const unsure: VisionAnswer = { hazard: 'unsure', side: null, distance: null, box: null, distance_m: null }
const run = (a: VisionAnswer, s = INITIAL_ANNOUNCE, now = 10_000) => decide(a, phraseFor(a, 'en'), s, now, GAP, CLOSER)
const said = (a: VisionAnswer, at: number, speaking = false) => ({ ...spoke(a, phraseFor(a, 'en'), at), speaking })

describe('decide (no-repeat rule, without metres)', () => {
  it('speaks the first answer', () => {
    expect(run(step)).toEqual({ speak: true, interrupt: false })
    expect(run(clear)).toEqual({ speak: true, interrupt: false })
  })

  it('never speaks unsure, even first', () => {
    expect(run(unsure)).toEqual({ speak: false, why: 'unsure' })
    expect(run(unsure, said(clear, 0))).toEqual({ speak: false, why: 'unsure' })
  })

  it('stays silent on the same phrase, however long ago', () => {
    expect(run(step, said(step, 0), 60_000)).toEqual({ speak: false, why: 'repeat' })
  })

  it('speaks a changed phrase once the gap has passed', () => {
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

  it('compares phrases, so a side change counts as new', () => {
    expect(run({ ...step, side: 'left' }, said(step, 10_000), 20_000)).toEqual({ speak: true, interrupt: false })
  })
})

describe('decide with metres (key = hazard + side)', () => {
  const at = (m: number, side: VisionAnswer['side'] = 'left'): VisionAnswer => ({
    hazard: 'obstacle',
    side,
    distance: m <= 2 ? 'near' : 'far',
    box: [1, 2, 3, 4],
    distance_m: m,
  })
  const later = 30_000

  it('same key, same or further: silent', () => {
    expect(run(at(5), said(at(5), 0), later)).toEqual({ speak: false, why: 'repeat' })
    expect(run(at(8), said(at(5), 0), later)).toEqual({ speak: false, why: 'repeat' })
  })

  it('same key, less than REPEAT_CLOSER_M closer: silent, though the phrase changed', () => {
    expect(run(at(4), said(at(5), 0), later)).toEqual({ speak: false, why: 'repeat' })
  })

  it('same key, at least REPEAT_CLOSER_M closer: spoken', () => {
    expect(run(at(3), said(at(5), 0), later)).toEqual({ speak: true, interrupt: false })
    expect(run(at(1), said(at(5), 0), later)).toEqual({ speak: true, interrupt: false })
  })

  it('a closer repeat still obeys the gap', () => {
    expect(run(at(3), said(at(5), later), later + GAP - 1)).toEqual({ speak: false, why: 'too_soon' })
  })

  it('a different side or hazard is a new key: spoken', () => {
    expect(run(at(5, 'right'), said(at(5), 0), later)).toEqual({ speak: true, interrupt: false })
    expect(run({ ...at(5), hazard: 'curb' }, said(at(5), 0), later)).toEqual({ speak: true, interrupt: false })
  })

  it('last spoken without metres: falls back to comparing phrases', () => {
    const noMetres = { ...at(5), distance_m: null }
    expect(run(at(5), said(noMetres, 0), later)).toEqual({ speak: true, interrupt: false })
  })

  it('a reset state (language change) speaks the same answer again', () => {
    expect(run(at(5), INITIAL_ANNOUNCE, later)).toEqual({ speak: true, interrupt: false })
  })
})

describe('spoke', () => {
  it('records phrase, time, speaking, key and metres', () => {
    expect(spoke({ hazard: 'curb', side: 'right', distance_m: 3 }, 'Curb, 3 metres, right', 5)).toEqual({
      lastSpoken: 'Curb, 3 metres, right',
      lastSpokenAt: 5,
      speaking: true,
      lastKey: 'curb|right',
      lastDistanceM: 3,
    })
  })
})
