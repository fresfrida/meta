import { describe, expect, it } from 'vitest'
import { pushHistory, stageTimes, stats, toRecord } from './timing'

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

describe('stage times of the last answer (Brief 26 debug)', () => {
  const marks = {
    captureStart: 1000,
    requestSent: 1260,
    responseReceived: 2260,
    serverMs: 700,
    frame: { drawMs: 5, readMs: 20, detectMs: 200, encodeMs: 10 },
  }
  it('splits capture, blur, encode, queue, network and model', () => {
    expect(stageTimes('fast', marks)).toEqual({
      channel: 'fast',
      captureMs: 25,
      blurMs: 200,
      encodeMs: 10,
      queueMs: 25, // 260 - 25 - 200 - 10
      netMs: 300, // 1000 round trip - 700 model
      modelMs: 700,
      waitMs: null,
      speechMs: null,
    })
  })
  it('adds the wait before speech and the speech start when spoken', () => {
    expect(stageTimes('detail', marks, 2265, 2400)).toMatchObject({ waitMs: 5, speechMs: 135 })
  })
})
