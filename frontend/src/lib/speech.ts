// Browser speech synthesis. iOS only speaks after a user gesture has unlocked it.
import {
  SPEECH_BLOCKED_AFTER,
  SPEECH_CANCEL_GAP_MS,
  SPEECH_RATE,
  SPEECH_RESUME_ENABLED,
  SPEECH_START_TIMEOUT_MS,
  SPEECH_STUCK_MS,
} from '../config'
import { selfSound } from './micGate'

// Keep a reference so the utterance is not garbage-collected before its events fire.
let current: SpeechSynthesisUtterance | null = null
// Releases the mic gate for the utterance in progress (cancel does not always fire onend).
let quietCurrent: (() => void) | null = null
// WebKit: a phrase waiting out SPEECH_CANCEL_GAP_MS; a newer speak() or cancelSpeech() drops it.
let waiting: { timer: ReturnType<typeof setTimeout>; drop: () => void } | null = null

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

/**
 * WebKit speech engine: every iPhone / iPad browser, and Safari on the Mac. Chrome, Edge and Android are not.
 * One rule for the WebKit speech quirks (Briefs 25-27): the cancel gap, the start line not waiting for voices, resume()
 * and the one re-speak of a stuck phrase.
 */
export function isWebKitSpeech(ua: string, maxTouchPoints = 0): boolean {
  if (/iPhone|iPad|iPod/.test(ua)) return true
  if (/Macintosh/.test(ua) && maxTouchPoints > 1) return true // iPadOS asking for the desktop site
  return /AppleWebKit/.test(ua) && /Safari\//.test(ua) && !/Chrome\/|Chromium\/|Android|Edg\//.test(ua)
}

export function webKitSpeech(): boolean {
  if (typeof navigator === 'undefined') return false
  return isWebKitSpeech(navigator.userAgent ?? '', navigator.maxTouchPoints ?? 0)
}

// ----- Debug state for the timing panel (Brief 25): "speech: unlocked yes/no · last speak ok/timeout/error" -----

export type SpeakOutcome = 'ok' | 'timeout' | 'error'
export interface SpeechDebug {
  /** The engine answered an utterance (the tap unlock, or any phrase that started). */
  unlocked: boolean
  last: SpeakOutcome | null
  /** For an error: the reason, e.g. "ended without starting". */
  detail: string | null
  /** Phrases in a row that never started (reset when one starts, or by a tap). */
  failures: number
  /** Brief 27: stuck phrases cancelled and spoken again. */
  respoken: number
}

const DEBUG_START: SpeechDebug = { unlocked: false, last: null, detail: null, failures: 0, respoken: 0 }
let debug: SpeechDebug = DEBUG_START
const listeners = new Set<() => void>()

function setDebug(next: Partial<SpeechDebug>): void {
  debug = { ...debug, ...next }
  listeners.forEach((l) => l())
}

export function speechDebug(): SpeechDebug {
  return debug
}

export function onSpeechDebug(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Brief 27: speech looks blocked on WebKit (SPEECH_BLOCKED_AFTER phrases in a row never started): the app shows
 * "Tap to turn the sound back on", because only a tap can unlock speech again. Never on Android.
 */
export function speechBlocked(d: SpeechDebug = debug, webkit = webKitSpeech()): boolean {
  return webkit && d.failures >= SPEECH_BLOCKED_AFTER
}

// -----

/** Call inside a tap handler: speaks an empty utterance so later speak() calls are allowed. */
export function unlockSpeech(): void {
  if (!speechSupported()) return
  if (webKitSpeech() && SPEECH_RESUME_ENABLED) window.speechSynthesis.resume()
  const u = new SpeechSynthesisUtterance('')
  u.volume = 0
  // iOS answers an accepted utterance with start / end; a blocked one gets no events at all (iOS Simulator).
  u.onstart = u.onend = () => setDebug({ unlocked: true })
  window.speechSynthesis.speak(u)
  if (debug.failures) setDebug({ failures: 0 }) // a tap: give speech a fresh chance
}

function dropWaiting(): void {
  if (!waiting) return
  const { timer, drop } = waiting
  waiting = null
  clearTimeout(timer)
  drop()
}

export function cancelSpeech(): void {
  dropWaiting()
  if (speechSupported()) window.speechSynthesis.cancel()
  quietCurrent = null
  selfSound.reset(performance.now())
}

/**
 * Brief 27, after an audio route change or interruption (WebKit): wake the engine, and cancel a phrase that is
 * stuck (the engine busy, nothing started), so the next phrase speaks.
 */
export function nudgeSpeech(): void {
  if (!speechSupported() || !webKitSpeech() || !SPEECH_RESUME_ENABLED) return
  const synth = window.speechSynthesis
  synth.resume()
  if ((synth.speaking || synth.pending) && current === null) synth.cancel()
}

export interface SpeakHandle {
  /** Resolves with performance.now() at speech onstart; rejects on error or timeout. */
  started: Promise<number>
  /** Resolves when speech ends (or fails). */
  ended: Promise<void>
}

export interface SpeakOptions {
  /** BCP-47 speech lang, e.g. en-GB. */
  lang: string
  /** An installed voice for that lang; null lets the browser choose. */
  voice: SpeechSynthesisVoice | null
}

export function speak(text: string, { lang, voice }: SpeakOptions): SpeakHandle {
  let resolveEnded: () => void = () => {}
  const ended = new Promise<void>((r) => (resolveEnded = r))
  const started = new Promise<number>((resolve, reject) => {
    if (!speechSupported()) {
      resolveEnded()
      reject(new Error('speech synthesis not supported'))
      return
    }
    const synth = window.speechSynthesis
    const webkit = webKitSpeech()
    const respeak = webkit && SPEECH_RESUME_ENABLED
    dropWaiting() // a newer phrase replaces one still waiting for its gap
    // WebKit: cancel only what is playing or queued, then wait the gap (speaking at once is dropped there).
    // Other browsers: cancel and speak at once, as before.
    const busy = synth.speaking || synth.pending
    if (!webkit || busy) synth.cancel()
    quietCurrent?.()
    // The microphone stays closed from now until speech ends (+ tail), so the phone does not hear itself.
    let sounding = true
    let begun = false
    let settled = false
    let retried = false
    selfSound.start()
    const quiet = () => {
      if (sounding) selfSound.end(performance.now())
      sounding = false
      if (quietCurrent === quiet) quietCurrent = null
    }
    quietCurrent = quiet
    const timers: ReturnType<typeof setTimeout>[] = []
    const clearTimers = () => timers.forEach(clearTimeout)
    const fail = (outcome: SpeakOutcome, reason: string) => {
      if (settled) return
      settled = true
      clearTimers()
      setDebug({ last: outcome, detail: outcome === 'error' ? reason : null, failures: debug.failures + 1 })
      console.warn(`[speech] ${reason}: "${text}"`)
      reject(new Error(reason))
    }
    let active: SpeechSynthesisUtterance
    const utterance = () => {
      const u = new SpeechSynthesisUtterance(text)
      u.lang = lang
      if (voice) u.voice = voice
      u.rate = SPEECH_RATE
      const finish = () => {
        if (current === u) current = null
        quiet()
        resolveEnded()
      }
      u.onstart = () => {
        if (u !== active) return // a replaced (re-spoken) utterance
        begun = true
        settled = true
        clearTimers()
        setDebug({ unlocked: true, last: 'ok', detail: null, failures: 0 })
        resolve(performance.now())
      }
      u.onend = () => {
        if (u !== active) return
        finish()
        // WebKit drops a phrase by ending it without a start: count it as failed now, not after the timeout.
        if (webkit && !begun) fail('error', 'ended without starting')
      }
      u.onerror = (e) => {
        if (u !== active) return
        finish()
        // Cancelled by a newer phrase or by Stop: normal, not a speech failure.
        if (e.error === 'interrupted' || e.error === 'canceled') {
          settled = true
          clearTimers()
          return reject(new Error(`speech error: ${e.error}`))
        }
        fail('error', `speech error: ${e.error}`)
      }
      active = u
      current = u
      return u
    }
    const say = (u: SpeechSynthesisUtterance) => {
      if (respeak) synth.resume() // Brief 27: a paused engine queues phrases silently
      synth.speak(u)
    }
    timers.push(
      setTimeout(() => {
        quiet()
        resolveEnded()
        fail('timeout', 'speech did not start')
      }, SPEECH_START_TIMEOUT_MS),
    )
    // Brief 27: a phrase that has not started while the engine says it is busy is stuck. Cancel it and say it once
    // more, after the gap.
    if (respeak) {
      timers.push(
        setTimeout(() => {
          if (begun || settled || retried || !(synth.speaking || synth.pending)) return
          retried = true
          setDebug({ respoken: debug.respoken + 1 })
          const again = utterance() // replaces `active` first, so the stuck one's cancel events are ignored
          synth.cancel()
          timers.push(setTimeout(() => !settled && say(again), SPEECH_CANCEL_GAP_MS))
        }, SPEECH_STUCK_MS),
      )
    }
    const first = utterance()
    if (!(webkit && busy)) return say(first)
    waiting = {
      timer: setTimeout(() => {
        waiting = null
        say(first)
      }, SPEECH_CANCEL_GAP_MS),
      drop: () => {
        settled = true
        clearTimers()
        if (current === first) current = null
        quiet()
        resolveEnded()
        reject(new Error('speech replaced'))
      },
    }
  })
  return { started, ended }
}
