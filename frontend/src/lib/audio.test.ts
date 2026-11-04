// Brief 26: the iOS audio session. Set inside the Start tap where the browser has one, untouched where it has not.
import { afterEach, describe, expect, it, vi } from 'vitest'

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
