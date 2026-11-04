// Browser speech synthesis. iOS only speaks after a user gesture has unlocked it.
import { SPEECH_RATE, SPEECH_START_TIMEOUT_MS } from '../config'
import { selfSound } from './micGate'

// Keep a reference so the utterance is not garbage-collected before its events fire.
let current: SpeechSynthesisUtterance | null = null
// Releases the mic gate for the utterance in progress (cancel does not always fire onend).
let quietCurrent: (() => void) | null = null

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

/** Call inside a tap handler: speaks an empty utterance so later speak() calls are allowed. */
export function unlockSpeech(): void {
  if (!speechSupported()) return
  const u = new SpeechSynthesisUtterance('')
  u.volume = 0
  window.speechSynthesis.speak(u)
}

export function cancelSpeech(): void {
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
    window.speechSynthesis.cancel()
    quietCurrent?.()
    const u = new SpeechSynthesisUtterance(text)
    // The microphone stays closed from now until speech ends (+ tail), so the phone does not hear itself.
    let sounding = true
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
    const timer = setTimeout(() => {
      quiet()
      resolveEnded()
      reject(new Error('speech did not start'))
    }, SPEECH_START_TIMEOUT_MS)
    u.onstart = () => {
      clearTimeout(timer)
      resolve(performance.now())
    }
    const finish = () => {
      if (current === u) current = null
      quiet()
      resolveEnded()
    }
    u.onend = finish
    u.onerror = (e) => {
      clearTimeout(timer)
      finish()
      reject(new Error(`speech error: ${e.error}`))
    }
    current = u
    window.speechSynthesis.speak(u)
  })
  return { started, ended }
}
