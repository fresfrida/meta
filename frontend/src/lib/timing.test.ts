import { describe, expect, it } from 'vitest'
import { pushHistory, stats, toRecord } from './timing'

describe('stats', () => {
  it('is null when empty', () => expect(stats([])).toBeNull())
  it('handles odd and even counts', () => {
    expect(stats([30, 10, 20])).toEqual({ min: 10, median: 20, max: 30 })
    expect(stats([40, 10, 20, 30])).toEqual({ min: 10, median: 25, max: 40 })
  })
})

describe('toRecord', () => {
  it('splits the total into stages', () => {
    expect(
      toRecord({ captureStart: 0, requestSent: 30, responseReceived: 130, speechStart: 180, modelMs: 2.4 }),
    ).toEqual({ totalMs: 180, frameMs: 30, roundTripMs: 100, modelMs: 2, speechMs: 50 })
  })
})

describe('pushHistory', () => {
  it('keeps newest first and caps size', () => {
    expect(pushHistory([2, 1], 3, 2)).toEqual([3, 2])
  })
})
