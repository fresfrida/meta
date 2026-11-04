// Brief 28: the order is always the start line, then the ready line (or a hazard).
import { describe, expect, it, vi } from 'vitest'
import { enterPreparing, onFirstAnswer, onGreetingEnd } from './sessionVoice'
import type { SpeakHandle } from './speech'
import { sayStartLine } from './startLine'

/** A fake speak(): each call's outcome is given in order ('ok' = starts, then ends when `end()` is called). */
function fakeSpeak(outcomes: ('ok' | 'fail')[]) {
  const ends: (() => void)[] = []
  const said: string[] = []
  const speak = vi.fn((text: string): SpeakHandle => {
    said.push(text)
    const outcome = outcomes.shift() ?? 'fail'
    let end: () => void = () => {}
    const ended = new Promise<void>((r) => (end = r))
    ends.push(end)
    return {
      started: outcome === 'ok' ? Promise.resolve(1) : Promise.reject(new Error('speech did not start')),
      ended,
    }
  })
  return { speak, said, ends }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('start line first', () => {
  it('done only after the start line really ended (not when it started)', async () => {
    const { speak, ends } = fakeSpeak(['ok'])
    const done = vi.fn()
    sayStartLine('Start.', { speak, isCurrent: () => true }, done)
    await flush()
    expect(done).not.toHaveBeenCalled() // playing
    ends[0]()
    await flush()
    expect(done).toHaveBeenCalledWith(true)
  })

  it('a start line that failed is said again first, then done', async () => {
    const { speak, said, ends } = fakeSpeak(['fail', 'ok'])
    const done = vi.fn()
    sayStartLine('Start.', { speak, isCurrent: () => true }, done)
    await flush()
    expect(said).toEqual(['Start.', 'Start.'])
    expect(done).not.toHaveBeenCalled()
    ends[1]()
    await flush()
    expect(done).toHaveBeenCalledWith(true)
  })

  it('failed twice: done (not heard), so the ready line is not held for ever', async () => {
    const { speak, said } = fakeSpeak(['fail', 'fail'])
    const done = vi.fn()
    sayStartLine('Start.', { speak, isCurrent: () => true }, done)
    await flush()
    expect(said).toHaveLength(2)
    expect(done).toHaveBeenCalledWith(false)
  })

  it('stopped (or a question took over): no second attempt', async () => {
    const { speak, said } = fakeSpeak(['fail'])
    let current = true
    const done = vi.fn()
    sayStartLine('Start.', { speak, isCurrent: () => current }, (h) => done(h))
    current = false
    await flush()
    expect(said).toHaveLength(1)
    expect(done).toHaveBeenCalledWith(false)
  })

  it('the first answer during the start line: the ready line only after the start line ends', async () => {
    const { speak, ends } = fakeSpeak(['ok'])
    const order: string[] = []
    let phase = enterPreparing(0)
    let greeting = true
    sayStartLine('Start.', { speak, isCurrent: () => true }, () => {
      greeting = false
      order.push('start ended')
      const [next, ready] = onGreetingEnd(phase)
      phase = next
      if (ready) order.push('ready')
    })
    await flush()
    const [next, now] = onFirstAnswer(phase, { hazard: false, greeting })
    phase = next
    expect(now).toBeNull() // not over the start line
    ends[0]()
    await flush()
    expect(order).toEqual(['start ended', 'ready'])
  })

  it('a hazard as the first answer during the start line: no ready line, the start line is not cut', async () => {
    const { speak, ends } = fakeSpeak(['ok'])
    const order: string[] = []
    let phase = enterPreparing(0)
    sayStartLine('Start.', { speak, isCurrent: () => true }, () => {
      order.push('start ended')
      const [, ready] = onGreetingEnd(phase)
      if (ready) order.push('ready')
    })
    await flush()
    phase = onFirstAnswer(phase, { hazard: true, greeting: true })[0]
    expect(speak).toHaveBeenCalledTimes(1)
    ends[0]()
    await flush()
    expect(order).toEqual(['start ended'])
  })
})
