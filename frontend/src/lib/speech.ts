// Browser speech synthesis. iOS only speaks after a user gesture has unlocked it.
import { SPEECH_CANCEL_GAP_MS, SPEECH_RATE, SPEECH_START_TIMEOUT_MS } from '../config'
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
 * One rule for the WebKit speech quirks (Brief 25): the cancel gap, and the start line not waiting for voices.
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
}

let debug: SpeechDebug = { unlocked: false, last: null, detail: null }
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

// -----

/** Call inside a tap handler: speaks an empty utterance so later speak() calls are allowed. */
export function unlockSpeech(): void {
  if (!speechSupported()) return
  const u = new SpeechSynthesisUtterance('')
  u.volume = 0
  // iOS answers an accepted utterance with start / end; a blocked one gets no events at all (iOS Simulator).
  u.onstart = u.onend = () => setDebug({ unlocked: true })
  window.speechSynthesis.speak(u)
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
    dropWaiting() // a newer phrase replaces one still waiting for its gap
    // WebKit: cancel only what is playing or queued, then wait the gap (speaking at once is dropped there).
    // Other browsers: cancel and speak at once, as before.
    const busy = synth.speaking || synth.pending
    if (!webkit || busy) synth.cancel()
    quietCurrent?.()
    const u = new SpeechSynthesisUtterance(text)
    // The microphone stays closed from now until speech ends (+ tail), so the phone does not hear itself.
    let sounding = true
    let begun = false
    selfSound.start()
    const quiet = () => {
      if (sounding) selfSound.end(performance.now())
      sounding = false
      if (quietCurrent === quiet) quietCurrent = null
    }
    quietCurrent = quiet
    u.lang = lang
    if (voice) u.voice = voice
    u.rate = SPEECH_RATE
    const fail = (outcome: SpeakOutcome, reason: string) => {
      setDebug({ last: outcome, detail: outcome === 'error' ? reason : null })
      console.warn(`[speech] ${reason}: "${text}"`)
      reject(new Error(reason))
    }
    const timer = setTimeout(() => {
      quiet()
      resolveEnded()
      fail('timeout', 'speech did not start')
    }, SPEECH_START_TIMEOUT_MS)
    u.onstart = () => {
      begun = true
      clearTimeout(timer)
      setDebug({ unlocked: true, last: 'ok', detail: null })
      resolve(performance.now())
    }
    const finish = () => {
      if (current === u) current = null
      quiet()
      resolveEnded()
    }
    u.onend = () => {
      finish()
      // WebKit drops a phrase by ending it without a start: count it as failed now, not after the timeout.
      if (webkit && !begun) {
        clearTimeout(timer)
        fail('error', 'ended without starting')
      }
    }
    u.onerror = (e) => {
      clearTimeout(timer)
      finish()
      // Cancelled by a newer phrase or by Stop: normal, not a speech failure.
      if (e.error === 'interrupted' || e.error === 'canceled') return reject(new Error(`speech error: ${e.error}`))
      fail('error', `speech error: ${e.error}`)
    }
    current = u
    if (!(webkit && busy)) return synth.speak(u)
    waiting = {
      timer: setTimeout(() => {
        waiting = null
        synth.speak(u)
      }, SPEECH_CANCEL_GAP_MS),
      drop: () => {
        clearTimeout(timer)
        if (current === u) current = null
        quiet()
        resolveEnded()
        reject(new Error('speech replaced'))
      },
    }
  })
  return { started, ended }
}
