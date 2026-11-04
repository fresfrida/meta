import { describe, expect, it } from 'vitest'
import { MicGate } from './micGate'

describe('MicGate (self-speech is not sent)', () => {
  it('sends while the phone is silent', () => {
    expect(new MicGate(300).canSend(0)).toBe(true)
  })

  it('blocks while speaking and for the 300 ms tail after', () => {
    const g = new MicGate(300)
    g.start()
    expect(g.canSend(1_000)).toBe(false)
    g.end(2_000)
    expect(g.canSend(2_100)).toBe(false)
    expect(g.canSend(2_299)).toBe(false)
    expect(g.canSend(2_300)).toBe(true)
  })

  it('overlapping sounds (earcon + speech) keep it closed until the last ends', () => {
    const g = new MicGate(300)
    g.start()
    g.start()
    g.end(1_000)
    expect(g.canSend(5_000)).toBe(false)
    g.end(5_000)
    expect(g.canSend(5_300)).toBe(true)
  })

  it('reset (cancel) closes all sounds and starts the tail', () => {
    const g = new MicGate(300)
    g.start()
    g.start()
    g.reset(100)
    expect(g.canSend(399)).toBe(false)
    expect(g.canSend(400)).toBe(true)
  })

  it('a stray extra end never goes negative', () => {
    const g = new MicGate(0)
    g.end(0)
    g.start()
    expect(g.canSend(1)).toBe(false)
  })
})
