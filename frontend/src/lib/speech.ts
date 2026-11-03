// Browser speech synthesis. iOS only speaks after a user gesture has unlocked it.
import { SPEECH_LANG, SPEECH_RATE, SPEECH_START_TIMEOUT_MS } from '../config'

// Keep a reference so the utterance is not garbage-collected before its events fire.
let current: SpeechSynthesisUtterance | null = null

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
}

export interface SpeakHandle {
  /** Resolves with performance.now() at speech onstart; rejects on error or timeout. */
  started: Promise<number>
  /** Resolves when speech ends (or fails). */
  ended: Promise<void>
}

export function speak(text: string): SpeakHandle {
  let resolveEnded: () => void = () => {}
  const ended = new Promise<void>((r) => (resolveEnded = r))
  const started = new Promise<number>((resolve, reject) => {
    if (!speechSupported()) {
      resolveEnded()
      reject(new Error('speech synthesis not supported'))
      return
    }
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = SPEECH_LANG
    u.rate = SPEECH_RATE
    const timer = setTimeout(() => {
      resolveEnded()
      reject(new Error('speech did not start'))
    }, SPEECH_START_TIMEOUT_MS)
    u.onstart = () => {
      clearTimeout(timer)
      resolve(performance.now())
    }
    const finish = () => {
      if (current === u) current = null
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
