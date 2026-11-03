import { describe, expect, it } from 'vitest'
import type { VisionAnswer } from '../api/types'
import { INITIAL_ANNOUNCE, decide, spoke } from './announce'
import { phraseFor } from './phrase'

const GAP = 1500
const step: VisionAnswer = { hazard: 'step_down', side: 'ahead', distance: 'near', box: [1, 2, 3, 4] }
const curb: VisionAnswer = { hazard: 'curb', side: 'right', distance: null, box: null }
const clear: VisionAnswer = { hazard: 'clear', side: null, distance: null, box: null }
const unsure: VisionAnswer = { hazard: 'unsure', side: null, distance: null, box: null }
const run = (a: VisionAnswer, s = INITIAL_ANNOUNCE, now = 10_000) => decide(a, phraseFor(a), s, now, GAP)

describe('decide (no-repeat rule)', () => {
  it('speaks the first answer', () => {
    expect(run(step)).toEqual({ speak: true, interrupt: false })
    expect(run(clear)).toEqual({ speak: true, interrupt: false })
  })

  it('never speaks unsure, even first', () => {
    expect(run(unsure)).toEqual({ speak: false, why: 'unsure' })
    expect(run(unsure, { ...spoke('Clear', 0), speaking: false })).toEqual({ speak: false, why: 'unsure' })
  })

  it('stays silent on the same phrase, however long ago', () => {
    const s = { ...spoke(phraseFor(step), 0), speaking: false }
    expect(run(step, s, 60_000)).toEqual({ speak: false, why: 'repeat' })
  })

  it('speaks a changed phrase once the gap has passed', () => {
    const s = { ...spoke(phraseFor(step), 10_000), speaking: false }
    expect(run(clear, s, 10_000 + GAP - 1)).toEqual({ speak: false, why: 'too_soon' })
    expect(run(clear, s, 10_000 + GAP)).toEqual({ speak: true, interrupt: false })
  })

  it('a new warning cuts off speech in progress', () => {
    const s = spoke(phraseFor(step), 10_000)
    expect(run(curb, s, 10_000 + GAP)).toEqual({ speak: true, interrupt: true })
  })

  it('a non-warning waits for speech in progress to finish', () => {
    const s = spoke(phraseFor(step), 10_000)
    expect(run(clear, s, 10_000 + GAP)).toEqual({ speak: false, why: 'busy' })
  })

  it('unsure between two equal answers keeps them silent', () => {
    const s = { ...spoke(phraseFor(step), 10_000), speaking: false }
    expect(run(unsure, s, 12_000).speak).toBe(false)
    expect(run(step, s, 14_000)).toEqual({ speak: false, why: 'repeat' })
  })

  it('compares phrases, so a side change counts as new', () => {
    const s = { ...spoke(phraseFor(step), 10_000), speaking: false }
    expect(run({ ...step, side: 'left' }, s, 20_000)).toEqual({ speak: true, interrupt: false })
  })
})

describe('spoke', () => {
  it('records phrase, time and speaking', () => {
    expect(spoke('Clear', 5)).toEqual({ lastSpoken: 'Clear', lastSpokenAt: 5, speaking: true })
  })
})
