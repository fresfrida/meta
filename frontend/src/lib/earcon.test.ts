// Brief 28: the iPhone heartbeat tick. WebKit suspends the AudioContext between tones (Brief 27); a tone now waits
// until the context really runs and the context is suspended only after the tone and a tail. Android is unchanged.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TICK_MS, TONE_RESUME_WAIT_MS, TONE_TAIL_MS } from '../config'

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.3 Mobile/15E148 Safari/604.1'
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'

/** A context whose resume() takes `resumeMs` (iOS starts its audio hardware slowly), or never resolves (null). */
async function load(ua: string, resumeMs: number | null, search = '') {
  vi.resetModules()
  const log: string[] = []
  class FakeContext {
    state = 'suspended'
    currentTime = 0
    destination = {}
    resume = vi.fn(() => {
      log.push('resume')
      if (resumeMs === null) return new Promise<void>(() => undefined)
      return new Promise<void>((r) =>
        setTimeout(() => {
          this.state = 'running'
          r()
        }, resumeMs),
      )
    })
    suspend = vi.fn(async () => {
      log.push('suspend')
      this.state = 'suspended'
    })
    createOscillator = () => ({
      frequency: { value: 0 },
      connect: (n: unknown) => n,
      start: vi.fn(() => log.push('tone')),
      stop: vi.fn(),
    })
    createGain = () => ({ gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }, connect: (n: unknown) => n })
  }
  vi.stubGlobal('window', { AudioContext: FakeContext, location: { search } })
  vi.stubGlobal('AudioContext', FakeContext)
  vi.stubGlobal('navigator', { userAgent: ua, maxTouchPoints: ua.includes('iPhone') ? 5 : 0 })
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  const audio = await import('./audio')
  const earcon = await import('./earcon')
  return { audio, earcon, log }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('iPhone tick (WebKit)', () => {
  it('waits for the context to run, plays, and suspends only after the tone and the tail', async () => {
    const { audio, earcon, log } = await load(IPHONE_UA, 120)
    audio.unlockAudio()
    await vi.advanceTimersByTimeAsync(130) // Start tap: resumed, then suspended
    expect(log).toEqual(['resume', 'suspend'])
    earcon.playTick()
    await vi.advanceTimersByTimeAsync(100)
    expect(log).not.toContain('tone') // not scheduled on a suspended context
    await vi.advanceTimersByTimeAsync(30) // running now
    expect(log.filter((x) => x === 'tone')).toHaveLength(1)
    // the tone was scheduled 10 ms ago; it is held for TICK_MS + 10 + TONE_TAIL_MS from then
    await vi.advanceTimersByTimeAsync(TICK_MS + 10 + TONE_TAIL_MS - 20)
    expect(log.slice(-1)).toEqual(['tone']) // still held
    await vi.advanceTimersByTimeAsync(20)
    expect(log.slice(-1)).toEqual(['suspend'])
    expect(earcon.toneDebug()).toEqual({ ticksPlayed: 1, ticksSkipped: 0 })
  })

  it('a context that never runs: the tick is skipped and counted, the context is released', async () => {
    const { audio, earcon } = await load(IPHONE_UA, null)
    audio.unlockAudio()
    earcon.playTick()
    await vi.advanceTimersByTimeAsync(TONE_RESUME_WAIT_MS + 10)
    expect(earcon.toneDebug()).toEqual({ ticksPlayed: 0, ticksSkipped: 1 })
  })

  it('?tone=0 still means no Web Audio: counted as skipped', async () => {
    const { audio, earcon, log } = await load(IPHONE_UA, 10, '?tone=0')
    audio.unlockAudio()
    await vi.advanceTimersByTimeAsync(20)
    earcon.playTick()
    await vi.advanceTimersByTimeAsync(300)
    expect(log).not.toContain('tone')
    expect(earcon.toneDebug().ticksSkipped).toBe(1)
  })
})

describe('Android tick: unchanged', () => {
  it('the context keeps running; the tone is scheduled at once and never suspended', async () => {
    const { audio, earcon, log } = await load(ANDROID_UA, 0)
    audio.unlockAudio()
    await vi.advanceTimersByTimeAsync(1)
    earcon.playTick()
    expect(log.filter((x) => x === 'tone')).toHaveLength(1) // synchronously, as before
    await vi.advanceTimersByTimeAsync(500)
    expect(log).not.toContain('suspend')
    expect(earcon.toneDebug()).toEqual({ ticksPlayed: 1, ticksSkipped: 0 })
  })
})
