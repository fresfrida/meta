// Brief 26: the iOS audio session. Set inside the Start tap where the browser has one, untouched where it has not.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

async function load(session: { type: string } | null) {
  vi.resetModules()
  vi.stubGlobal('navigator', session ? { audioSession: session } : {})
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  return import('./audio')
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('audio session (Safari 16.4+)', () => {
  it('Start sets playback at once (synchronously, inside the tap); Stop sets auto', async () => {
    const session = { type: 'auto' }
    const a = await load(session)
    a.sessionStarted()
    expect(session.type).toBe('playback') // no await in between: still inside the tap
    expect(a.audioSessionType()).toBe('playback')
    a.sessionStopped()
    expect(session.type).toBe('auto')
  })

  it('play-and-record while the mic is open, back to playback when it closes', async () => {
    const session = { type: 'auto' }
    const a = await load(session)
    a.sessionStarted()
    a.micOpened()
    expect(session.type).toBe('play-and-record')
    a.micClosed()
    expect(session.type).toBe('playback')
  })

  it('a mic that closes after Stop leaves the session on auto', async () => {
    const session = { type: 'auto' }
    const a = await load(session)
    a.sessionStarted()
    a.micOpened()
    a.sessionStopped()
    expect(session.type).toBe('play-and-record') // the mic is still open
    a.micClosed()
    expect(session.type).toBe('auto')
  })

  it('a browser that refuses the type does not break Start', async () => {
    const session = {
      get type() {
        return 'auto'
      },
      set type(_v: string) {
        throw new Error('not allowed')
      },
    }
    const a = await load(session)
    expect(() => a.sessionStarted()).not.toThrow()
    expect(console.warn).toHaveBeenCalled()
  })
})

describe('no audio session (Android, desktop Chrome)', () => {
  it('nothing is touched and the debug line says none', async () => {
    const a = await load(null)
    expect(() => {
      a.sessionStarted()
      a.micOpened()
      a.micClosed()
      a.sessionStopped()
    }).not.toThrow()
    expect(a.audioSessionType()).toBe('none')
  })
})

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.3 Mobile/15E148 Safari/604.1'
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'

async function loadWith(opts: { ua: string; search?: string; session?: { type: string } | null }) {
  vi.resetModules()
  const calls: string[] = []
  class FakeContext {
    state = 'suspended'
    currentTime = 0
    destination = {}
    resume = vi.fn(async () => {
      calls.push('resume')
      this.state = 'running'
    })
    suspend = vi.fn(async () => {
      calls.push('suspend')
      this.state = 'suspended'
    })
    createOscillator = () => ({ frequency: { value: 0 }, connect: (n: unknown) => n, start: vi.fn(), stop: vi.fn() })
    createGain = () => ({
      gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
      connect: (n: unknown) => n,
    })
  }
  vi.stubGlobal('window', { AudioContext: FakeContext, location: { search: opts.search ?? '' } })
  vi.stubGlobal('AudioContext', FakeContext)
  vi.stubGlobal('navigator', {
    userAgent: opts.ua,
    maxTouchPoints: opts.ua.includes('iPhone') ? 5 : 0,
    ...(opts.session ? { audioSession: opts.session } : {}),
  })
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  const audio = await import('./audio')
  const earcon = await import('./earcon')
  return { audio, earcon, calls }
}

describe('Brief 27: one audio session type for the whole run', () => {
  it('hands-free on: play-and-record from the Start tap, unchanged when the mic opens and closes', async () => {
    const session = { type: 'auto' }
    const { audio } = await loadWith({ ua: IPHONE_UA, session })
    audio.sessionStarted(true)
    expect(session.type).toBe('play-and-record')
    audio.micOpened()
    audio.micClosed()
    expect(session.type).toBe('play-and-record') // never switched mid-run
    audio.sessionStopped()
    expect(session.type).toBe('auto')
  })

  it('?session=0: the audio session is never touched', async () => {
    const session = { type: 'auto' }
    const { audio } = await loadWith({ ua: IPHONE_UA, session, search: '?session=0' })
    audio.sessionStarted(false)
    audio.micOpened()
    expect(session.type).toBe('auto')
    expect(audio.audioSessionType()).toBe('auto (off)')
  })
})

describe('Brief 27: the AudioContext runs only while a tone plays (WebKit)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('iPhone: suspended after the Start unlock, resumed for a tone, suspended after it', async () => {
    const { audio, earcon, calls } = await loadWith({ ua: IPHONE_UA })
    audio.unlockAudio()
    await vi.advanceTimersByTimeAsync(0)
    expect(calls).toEqual(['resume', 'suspend'])
    earcon.playTick()
    await vi.advanceTimersByTimeAsync(0)
    expect(audio.audioState()).toBe('running')
    await vi.advanceTimersByTimeAsync(200)
    expect(calls).toEqual(['resume', 'suspend', 'resume', 'suspend'])
  })

  it('the mic keeps it running until it closes', async () => {
    const { audio, earcon, calls } = await loadWith({ ua: IPHONE_UA })
    audio.unlockAudio()
    await vi.advanceTimersByTimeAsync(0)
    audio.holdAudio() // the mic
    earcon.playTick()
    await vi.advanceTimersByTimeAsync(200)
    expect(calls.slice(-1)).toEqual(['resume']) // no suspend while the mic is open
    audio.releaseAudio()
    expect(calls.slice(-1)).toEqual(['suspend'])
  })

  it('Android: never suspended (unchanged)', async () => {
    const { audio, earcon, calls } = await loadWith({ ua: ANDROID_UA })
    audio.unlockAudio()
    earcon.playTick()
    await vi.advanceTimersByTimeAsync(200)
    expect(calls).not.toContain('suspend')
  })

  it('?tone=0: no Web Audio for the cue and the tick on the iPhone; Android ignores the flag', async () => {
    const ios = await loadWith({ ua: IPHONE_UA, search: '?tone=0' })
    ios.audio.unlockAudio()
    await vi.advanceTimersByTimeAsync(0)
    ios.earcon.playTick()
    ios.earcon.playWarnCue()
    await vi.advanceTimersByTimeAsync(200)
    expect(ios.calls).toEqual(['resume', 'suspend']) // only the Start unlock
    const android = await loadWith({ ua: ANDROID_UA, search: '?tone=0' })
    android.audio.unlockAudio()
    android.earcon.playTick()
    await vi.advanceTimersByTimeAsync(0)
    expect(android.calls.filter((c) => c === 'resume').length).toBeGreaterThanOrEqual(1)
  })

  it('a route change brings back an interrupted context', async () => {
    const { audio, calls } = await loadWith({ ua: IPHONE_UA })
    const ctx = audio.unlockAudio()!
    await vi.advanceTimersByTimeAsync(0)
    ;(ctx as unknown as { state: string }).state = 'interrupted'
    audio.recoverAudio()
    await vi.advanceTimersByTimeAsync(0)
    expect(calls).toEqual(['resume', 'suspend', 'resume', 'suspend'])
  })
})
