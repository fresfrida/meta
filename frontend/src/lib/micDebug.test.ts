// Brief 30: the mic debug line ("mic: sent N · gated M · listen open / closed / stopped") follows the listen socket.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { strings } from '../strings'

class FakeSocket {
  static OPEN = 1
  static last: FakeSocket
  readyState = 0
  binaryType = ''
  url: string
  sent: unknown[] = []
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onmessage: ((e: { data: unknown }) => void) | null = null
  constructor(url: string) {
    this.url = url
    FakeSocket.last = this
  }
  send(d: unknown) {
    this.sent.push(d)
  }
  close() {
    this.readyState = 3
    this.onclose?.()
  }
}

async function load() {
  vi.resetModules()
  vi.stubGlobal('WebSocket', FakeSocket)
  vi.stubGlobal('window', { location: { protocol: 'https:', host: 'eyes.test', search: '' }, sessionStorage: undefined })
  const { ListenClient } = await import('./listen')
  const dbg = await import('./micDebug')
  return { ListenClient, dbg }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('mic debug line', () => {
  it('connecting -> open (frames counted only once sent) -> stopped by the server', async () => {
    const { ListenClient, dbg } = await load()
    expect(dbg.micDebug().socket).toBe('none')
    const c = new ListenClient('en', () => undefined, () => undefined)
    expect(dbg.micDebug().socket).toBe('connecting')
    c.sendAudio(new Int16Array(4))
    expect(dbg.micDebug().sent).toBe(0) // not open yet: nothing sent
    FakeSocket.last.readyState = 1
    FakeSocket.last.onopen?.()
    expect(dbg.micDebug().socket).toBe('open')
    c.sendAudio(new Int16Array(4))
    c.sendAudio(new Int16Array(4))
    expect(dbg.micDebug().sent).toBe(2)
    FakeSocket.last.close()
    expect(dbg.micDebug().socket).toBe('stopped')
  })

  it('closed by the app (Stop) reads "closed"', async () => {
    vi.useFakeTimers()
    const { ListenClient, dbg } = await load()
    const c = new ListenClient('en', () => undefined, () => undefined)
    FakeSocket.last.readyState = 1
    FakeSocket.last.onopen?.()
    c.end()
    vi.advanceTimersByTime(5_000)
    expect(dbg.micDebug().socket).toBe('closed')
  })

  it('public demo: the listen socket carries the slot token as ?slot=', async () => {
    const { ListenClient } = await load()
    const { setSlotToken } = await import('./demoSlot')
    setSlotToken('abc.123.def')
    new ListenClient('en', () => undefined, () => undefined)
    expect(FakeSocket.last.url).toBe('wss://eyes.test/api/listen?lang=en&slot=abc.123.def')
  })

  it('the line itself', () => {
    expect(strings.timing.mic(12, 3, 'open', 48_000)).toBe('mic: sent 12 · gated 3 · listen open · in 48000 Hz -> 16000')
    expect(strings.timing.mic(0, 0, 'none', null)).toBe('mic: sent 0 · gated 0 · listen none')
  })
})
