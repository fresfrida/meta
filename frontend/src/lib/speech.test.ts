// Brief 25: iPhone speech. The WebKit cancel -> speak drop (reproduced in the iOS Simulator), the tap unlock, and the
// debug state. A fake speech engine stands in for the browser.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  HEARTBEAT_MIN_GAP_MS,
  SELF_SPEECH_TAIL_MS,
  SPEECH_CANCEL_GAP_MS,
  SPEECH_START_TIMEOUT_MS,
  SPEECH_STUCK_MS,
  speechEndMaxMs,
} from '../config'
import { shouldTick } from './heartbeat'
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
    resume: vi.fn(() => calls.push('resume')),
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

async function load(ua: string, search = '') {
  vi.resetModules() // fresh module state (debug, waiting phrase) per test
  engine = fakeSynth()
  vi.stubGlobal('window', { speechSynthesis: engine.synth, location: { search } })
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
    expect(engine.calls.filter((c) => c !== 'resume')).toEqual(['speak:']) // queued in the tap itself
    expect(engine.spoken[0].volume).toBe(0)
    engine.spoken[0].onend?.() // the unlock finished
    await vi.advanceTimersByTimeAsync(1000)
    await done
    expect(engine.calls.filter((c) => c !== 'resume')).toEqual(['speak:', "speak:Second Eyes is on. I'll tell you what I see in your path."])
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
    expect(engine.calls).toEqual(['resume', 'speak:Steps ahead.']) // Brief 27: resume() first on WebKit
  })

  it('something playing: cancel, wait the gap, then speak (speaking at once is dropped on WebKit)', async () => {
    const { speak } = await load(IPHONE_UA)
    engine.synth.speaking = true
    speak('Steps ahead.', opts)
    expect(engine.calls).toEqual(['cancel'])
    vi.advanceTimersByTime(SPEECH_CANCEL_GAP_MS - 1)
    expect(engine.calls).toEqual(['cancel'])
    vi.advanceTimersByTime(1)
    expect(engine.calls).toEqual(['cancel', 'resume', 'speak:Steps ahead.'])
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
    expect(speechDebug()).toMatchObject({ unlocked: true, last: 'ok', detail: null, failures: 0 })
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

describe('Brief 27: a stuck phrase on WebKit is spoken again once', () => {
  it('not started after SPEECH_STUCK_MS while the engine is busy: cancel, gap, speak again', async () => {
    const { speak, speechDebug } = await load(IPHONE_UA)
    const h = speak('Steps ahead.', opts)
    engine.synth.speaking = true // the engine says busy, but nothing started
    vi.advanceTimersByTime(SPEECH_STUCK_MS)
    expect(engine.calls.slice(-1)).toEqual(['cancel'])
    engine.spoken[0].onerror?.({ error: 'canceled' }) // the stuck one's cancel event is ignored
    vi.advanceTimersByTime(SPEECH_CANCEL_GAP_MS)
    expect(engine.calls.filter((c) => c.startsWith('speak:'))).toEqual(['speak:Steps ahead.', 'speak:Steps ahead.'])
    expect(speechDebug().respoken).toBe(1)
    engine.spoken[1].onstart?.()
    await expect(h.started).resolves.toBeTypeOf('number')
  })

  it('only once: a second stall is left to the start timeout', async () => {
    const { speak } = await load(IPHONE_UA)
    const h = speak('Steps ahead.', opts)
    const failed = expect(h.started).rejects.toThrow('speech did not start')
    engine.synth.speaking = true
    vi.advanceTimersByTime(SPEECH_START_TIMEOUT_MS)
    await failed
    expect(engine.calls.filter((c) => c.startsWith('speak:'))).toHaveLength(2)
  })

  it('engine idle (not busy): no re-speak', async () => {
    const { speak } = await load(IPHONE_UA)
    speak('Steps ahead.', opts)
    vi.advanceTimersByTime(SPEECH_STUCK_MS + SPEECH_CANCEL_GAP_MS)
    expect(engine.calls.filter((c) => c.startsWith('speak:'))).toHaveLength(1)
  })

  it('?resume=0: no resume() and no re-speak', async () => {
    const { speak } = await load(IPHONE_UA, '?resume=0')
    speak('Steps ahead.', opts)
    engine.synth.speaking = true
    vi.advanceTimersByTime(SPEECH_STUCK_MS + SPEECH_CANCEL_GAP_MS)
    expect(engine.calls).toEqual(['speak:Steps ahead.'])
  })

  it('Android: never resume() or re-speak (unchanged)', async () => {
    const { speak } = await load(ANDROID_UA)
    speak('Steps ahead.', opts)
    engine.synth.speaking = true
    vi.advanceTimersByTime(SPEECH_STUCK_MS + SPEECH_CANCEL_GAP_MS)
    expect(engine.calls).toEqual(['cancel', 'speak:Steps ahead.'])
  })
})

describe('Brief 27: "Tap to turn the sound back on"', () => {
  it('two phrases in a row that never started on WebKit -> blocked; a tap (unlock) clears it', async () => {
    const { speak, speechBlocked, speechDebug, unlockSpeech } = await load(IPHONE_UA)
    for (const text of ['Steps ahead.', 'Kerb ahead.']) {
      const h = speak(text, opts)
      engine.spoken[engine.spoken.length - 1].onend?.() // ended without starting
      await expect(h.started).rejects.toThrow()
    }
    expect(speechBlocked()).toBe(true)
    unlockSpeech()
    expect(speechDebug().failures).toBe(0)
    expect(speechBlocked()).toBe(false)
  })

  it('a phrase that starts resets the count', async () => {
    const { speak, speechDebug } = await load(IPHONE_UA)
    const a = speak('Steps ahead.', opts)
    engine.spoken[0].onend?.()
    await expect(a.started).rejects.toThrow()
    const b = speak('Kerb ahead.', opts)
    engine.spoken[1].onstart?.()
    await b.started
    expect(speechDebug().failures).toBe(0)
  })

  it('never on Android', async () => {
    const { speechBlocked } = await load(ANDROID_UA)
    expect(speechBlocked({ unlocked: true, last: 'timeout', detail: null, failures: 5, respoken: 0, endsLost: 0 }, false)).toBe(false)
  })
})

describe('Brief 27: after a route change', () => {
  it('nudgeSpeech wakes the WebKit engine and cancels a stray busy state; nothing on Android', async () => {
    const ios = await load(IPHONE_UA)
    engine.synth.speaking = true
    ios.nudgeSpeech()
    expect(engine.calls).toEqual(['resume', 'cancel'])
    const android = await load(ANDROID_UA)
    engine.synth.speaking = true
    android.nudgeSpeech()
    expect(engine.calls).toEqual([])
  })
})

describe('Brief 28: a re-spoken start line ends only when the second one ends', () => {
  it('the stuck one being cancelled does not end the phrase', async () => {
    const { speak } = await load(IPHONE_UA)
    const h = speak('Second Eyes is getting ready.', opts)
    let ended = false
    void h.ended.then(() => (ended = true))
    engine.synth.speaking = true
    vi.advanceTimersByTime(SPEECH_STUCK_MS)
    engine.spoken[0].onend?.() // the stuck utterance ends because it was cancelled
    engine.spoken[0].onerror?.({ error: 'canceled' })
    vi.advanceTimersByTime(SPEECH_CANCEL_GAP_MS)
    engine.spoken[1].onstart?.()
    await h.started
    await Promise.resolve()
    expect(ended).toBe(false)
    engine.spoken[1].onend?.()
    await Promise.resolve()
    expect(ended).toBe(true)
  })
})

describe('Brief 30: a lost end (WebKit drops onend) no longer shuts the mic and the ticks', () => {
  const TEXT = 'Steps, about 3 metres ahead.'

  /** The useSecondEyes say() pattern: speaking from start until `ended`. */
  async function started(ua: string) {
    const mod = await load(ua)
    const { selfSound } = await import('./micGate')
    const state = { speaking: true, ended: false }
    const h = mod.speak(TEXT, opts)
    void h.ended.then(() => {
      state.speaking = false
      state.ended = true
    })
    engine.spoken[0].onstart?.()
    await h.started
    return { mod, selfSound, state, h }
  }
  const tickNow = (speaking: boolean) =>
    shouldTick({ speaking, asking: false, now: 1e9, lastTickAt: 0, minGapMs: HEARTBEAT_MIN_GAP_MS })

  it('the timer is max(4 s, characters x 120 ms) + 2 s', () => {
    expect(speechEndMaxMs('Lift.')).toBe(6_000)
    expect(speechEndMaxMs('x'.repeat(100))).toBe(14_000)
  })

  it('no onend and no onerror: after the timer the gate reopens, speaking is false, ticks resume, counted', async () => {
    const { mod, selfSound, state } = await started(IPHONE_UA)
    vi.advanceTimersByTime(speechEndMaxMs(TEXT) - 1)
    await Promise.resolve()
    expect(state.ended).toBe(false)
    expect(selfSound.canSend(performance.now() + 10_000)).toBe(false) // still closed while it may be speaking
    expect(tickNow(state.speaking)).toBe(false)
    vi.advanceTimersByTime(1)
    await Promise.resolve()
    expect(state.ended).toBe(true)
    expect(state.speaking).toBe(false)
    expect(tickNow(state.speaking)).toBe(true)
    expect(selfSound.canSend(performance.now() + SELF_SPEECH_TAIL_MS)).toBe(true)
    expect(mod.speechDebug().endsLost).toBe(1)
    // a late onend afterwards changes nothing
    engine.spoken[0].onend?.()
    expect(mod.speechDebug().endsLost).toBe(1)
    expect(selfSound.canSend(performance.now() + SELF_SPEECH_TAIL_MS)).toBe(true)
  })

  it('a normal end: ended at once, the timer never fires, nothing counted (Android too)', async () => {
    for (const ua of [IPHONE_UA, ANDROID_UA]) {
      const { mod, selfSound, state } = await started(ua)
      engine.spoken[0].onend?.()
      await Promise.resolve()
      expect(state.ended).toBe(true)
      expect(selfSound.canSend(performance.now() + SELF_SPEECH_TAIL_MS)).toBe(true)
      selfSound.start() // something else sounding: a stray timer must not release it
      vi.advanceTimersByTime(60_000)
      expect(mod.speechDebug().endsLost).toBe(0)
      expect(selfSound.canSend(performance.now() + 60_000)).toBe(false)
    }
  })

  it('a replaced phrase: its timer is cleared; only the new phrase has one', async () => {
    const LONG = 'A lift, about 2 metres ahead. The doors are on the right, next to the stairs.' // a longer timer
    const { mod, selfSound } = await started(ANDROID_UA)
    const next = mod.speak(LONG, opts)
    let nextEnded = false
    void next.ended.then(() => (nextEnded = true))
    engine.spoken[1].onstart?.()
    await next.started
    vi.advanceTimersByTime(speechEndMaxMs(TEXT)) // the old phrase's timer would have fired here
    await Promise.resolve()
    expect(mod.speechDebug().endsLost).toBe(0)
    expect(nextEnded).toBe(false)
    expect(selfSound.canSend(performance.now() + 60_000)).toBe(false) // the new phrase still holds the mic
    vi.advanceTimersByTime(speechEndMaxMs(LONG))
    await Promise.resolve()
    expect(nextEnded).toBe(true)
    expect(mod.speechDebug().endsLost).toBe(1)
  })

  it('cancel (Stop) clears the timer', async () => {
    const { mod } = await started(IPHONE_UA)
    mod.cancelSpeech()
    vi.advanceTimersByTime(60_000)
    expect(mod.speechDebug().endsLost).toBe(0)
  })

  it('an error ends it and clears the timer', async () => {
    const { mod, state } = await started(IPHONE_UA)
    engine.spoken[0].onerror?.({ error: 'synthesis-failed' })
    await Promise.resolve()
    expect(state.ended).toBe(true)
    vi.advanceTimersByTime(60_000)
    expect(mod.speechDebug().endsLost).toBe(0)
  })
})
