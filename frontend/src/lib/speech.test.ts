// Brief 25: iPhone speech. The WebKit cancel -> speak drop (reproduced in the iOS Simulator), the tap unlock, and the
// debug state. A fake speech engine stands in for the browser.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SPEECH_CANCEL_GAP_MS, SPEECH_START_TIMEOUT_MS } from '../config'
import { greetAtOnce } from './sessionVoice'

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.3 Mobile/15E148 Safari/604.1'
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'
const MAC_SAFARI_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15'
const MAC_CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const IOS_CHROME_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1'

class FakeUtterance {
  text: string
  lang = ''
  rate = 1
  volume = 1
  voice: unknown = null
  onstart: (() => void) | null = null
  onend: (() => void) | null = null
  onerror: ((e: { error: string }) => void) | null = null
  constructor(text: string) {
    this.text = text
  }
}

/** Records every call in order; `speaking` is what the test says is playing. */
function fakeSynth() {
  const calls: string[] = []
  const spoken: FakeUtterance[] = []
  const synth = {
    speaking: false,
    pending: false,
    speak: vi.fn((u: FakeUtterance) => {
      calls.push(`speak:${u.text}`)
      spoken.push(u)
    }),
    cancel: vi.fn(() => calls.push('cancel')),
    getVoices: () => [],
  }
  return { synth, calls, spoken }
}

let engine: ReturnType<typeof fakeSynth>

async function load(ua: string) {
  vi.resetModules() // fresh module state (debug, waiting phrase) per test
  engine = fakeSynth()
  vi.stubGlobal('window', { speechSynthesis: engine.synth, location: { search: '' } })
  vi.stubGlobal('navigator', { userAgent: ua, maxTouchPoints: ua.includes('iPhone') ? 5 : 0 })
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  return import('./speech')
}

const opts = { lang: 'en-GB', voice: null }

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('which browsers get the WebKit speech rule', () => {
  it('iPhone Safari, iPhone Chrome (WebKit too) and Mac Safari: yes; Android and desktop Chrome: no', async () => {
    const { isWebKitSpeech } = await load(IPHONE_UA)
    expect(isWebKitSpeech(IPHONE_UA, 5)).toBe(true)
    expect(isWebKitSpeech(IOS_CHROME_UA, 5)).toBe(true)
    expect(isWebKitSpeech(MAC_SAFARI_UA, 0)).toBe(true)
    expect(isWebKitSpeech(ANDROID_UA, 5)).toBe(false)
    expect(isWebKitSpeech(MAC_CHROME_UA, 0)).toBe(false)
    // iPadOS asks for the desktop site with a Mac user agent; touch points give it away
    expect(isWebKitSpeech(MAC_SAFARI_UA, 5)).toBe(true)
  })
})

describe('the Start tap (iPhone)', () => {
  it('the first speak() happens synchronously inside the tap, before any await', async () => {
    const { unlockSpeech, speak } = await load(IPHONE_UA)
    // start(prepare) in the public demo: unlock in the tap, await the slot, then the start line.
    const tap = async () => {
      unlockSpeech()
      await new Promise((r) => setTimeout(r, 1000)) // the slot fetch
      speak("Second Eyes is on. I'll tell you what I see in your path.", opts)
    }
    const done = tap()
    expect(engine.calls).toEqual(['speak:']) // queued in the tap itself
    expect(engine.spoken[0].volume).toBe(0)
    engine.spoken[0].onend?.() // the unlock finished
    await vi.advanceTimersByTimeAsync(1000)
    await done
    expect(engine.calls).toEqual(['speak:', "speak:Second Eyes is on. I'll tell you what I see in your path."])
  })

  it('the start line never waits for voices on the iPhone (said in the tap); Android still waits', () => {
    expect(greetAtOnce(false, true)).toBe(true) // WebKit, voices not loaded yet (the Simulator reports 0 at first)
    expect(greetAtOnce(false, false)).toBe(false) // Android, voices loading: wait (Brief 20, unchanged)
    expect(greetAtOnce(true, false)).toBe(true)
  })

  it('unlocked turns yes only when the engine answers the unlock utterance', async () => {
    const { unlockSpeech, speechDebug } = await load(IPHONE_UA)
    unlockSpeech()
    expect(speechDebug().unlocked).toBe(false) // blocked utterances get no events at all
    engine.spoken[0].onend?.()
    expect(speechDebug().unlocked).toBe(true)
  })
})

describe('cancel -> speak on WebKit (iPhone)', () => {
  it('nothing playing: no cancel, spoken at once', async () => {
    const { speak } = await load(IPHONE_UA)
    speak('Steps ahead.', opts)
    expect(engine.calls).toEqual(['speak:Steps ahead.'])
  })

  it('something playing: cancel, wait the gap, then speak (speaking at once is dropped on WebKit)', async () => {
    const { speak } = await load(IPHONE_UA)
    engine.synth.speaking = true
    speak('Steps ahead.', opts)
    expect(engine.calls).toEqual(['cancel'])
    vi.advanceTimersByTime(SPEECH_CANCEL_GAP_MS - 1)
    expect(engine.calls).toEqual(['cancel'])
    vi.advanceTimersByTime(1)
    expect(engine.calls).toEqual(['cancel', 'speak:Steps ahead.'])
  })

  it('a newer phrase during the gap replaces the waiting one; only the newest is spoken', async () => {
    const { speak } = await load(IPHONE_UA)
    engine.synth.speaking = true
    const first = speak('Steps ahead.', opts)
    const second = speak('Kerb ahead.', opts)
    await expect(first.started).rejects.toThrow('speech replaced')
    vi.advanceTimersByTime(SPEECH_CANCEL_GAP_MS)
    expect(engine.calls.filter((c) => c.startsWith('speak:'))).toEqual(['speak:Kerb ahead.'])
    engine.spoken[0].onstart?.()
    await expect(second.started).resolves.toBeTypeOf('number')
  })

  it('Stop during the gap: nothing is spoken', async () => {
    const { speak, cancelSpeech } = await load(IPHONE_UA)
    engine.synth.speaking = true
    const h = speak('Steps ahead.', opts)
    cancelSpeech()
    await expect(h.started).rejects.toThrow('speech replaced')
    vi.advanceTimersByTime(SPEECH_CANCEL_GAP_MS * 2)
    expect(engine.synth.speak).not.toHaveBeenCalled()
  })

  it('a phrase WebKit drops (ends without starting) fails at once and shows in the debug line', async () => {
    const { speak, speechDebug } = await load(IPHONE_UA)
    const h = speak('Steps ahead.', opts)
    engine.spoken[0].onend?.()
    await expect(h.started).rejects.toThrow('ended without starting')
    expect(speechDebug()).toMatchObject({ last: 'error', detail: 'ended without starting' })
  })
})

describe('cancel -> speak on Android: unchanged', () => {
  it('always cancels, then speaks at once, even while something is playing', async () => {
    const { speak } = await load(ANDROID_UA)
    speak('Steps ahead.', opts)
    engine.synth.speaking = true
    speak('Kerb ahead.', opts)
    expect(engine.calls).toEqual(['cancel', 'speak:Steps ahead.', 'cancel', 'speak:Kerb ahead.'])
  })

  it('onend without onstart is not treated as a failure (as before)', async () => {
    const { speak, speechDebug } = await load(ANDROID_UA)
    speak('Steps ahead.', opts)
    engine.spoken[0].onend?.()
    expect(speechDebug().last).toBeNull()
  })
})

describe('the debug line: last speak ok / timeout / error', () => {
  it('ok when the phrase starts', async () => {
    const { speak, speechDebug } = await load(IPHONE_UA)
    const h = speak('Steps ahead.', opts)
    engine.spoken[0].onstart?.()
    await h.started
    expect(speechDebug()).toEqual({ unlocked: true, last: 'ok', detail: null })
  })

  it('timeout when it never starts (logged, rejected: the card shows "Speech did not start")', async () => {
    const { speak, speechDebug } = await load(IPHONE_UA)
    const h = speak('Steps ahead.', opts)
    const failed = expect(h.started).rejects.toThrow('speech did not start')
    vi.advanceTimersByTime(SPEECH_START_TIMEOUT_MS)
    await failed
    expect(speechDebug().last).toBe('timeout')
    expect(console.warn).toHaveBeenCalled()
  })

  it('a phrase cancelled by a newer one is not an error', async () => {
    const { speak, speechDebug } = await load(IPHONE_UA)
    const h = speak('Steps ahead.', opts)
    engine.spoken[0].onerror?.({ error: 'canceled' })
    await expect(h.started).rejects.toThrow()
    expect(speechDebug().last).toBeNull()
  })

  it('a real engine error is', async () => {
    const { speak, speechDebug } = await load(IPHONE_UA)
    const h = speak('Steps ahead.', opts)
    engine.spoken[0].onerror?.({ error: 'synthesis-failed' })
    await expect(h.started).rejects.toThrow()
    expect(speechDebug()).toMatchObject({ last: 'error', detail: 'speech error: synthesis-failed' })
  })

  it('listeners hear every change', async () => {
    const { speak, onSpeechDebug } = await load(IPHONE_UA)
    const heard = vi.fn()
    const off = onSpeechDebug(heard)
    const h = speak('Steps ahead.', opts)
    engine.spoken[0].onstart?.()
    await h.started
    off()
    expect(heard).toHaveBeenCalledTimes(1)
  })
})
