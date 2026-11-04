// Picking an installed speech voice for a language: a steady, clear default (Brief 20), the user's own choice per
// language (remembered), and waiting for the browser's voice list before the first speech.
import type { VoiceStatus } from '../strings'

type VoiceLike = Pick<SpeechSynthesisVoice, 'lang' | 'name'> & Partial<Pick<SpeechSynthesisVoice, 'localService'>>

const norm = (lang: string) => lang.replace('_', '-').toLowerCase()
const QUALITY = /google|enhanced|premium|natural|neural/i
const byName = <V extends VoiceLike>(a: V, b: V) => a.name.localeCompare(b.name)

/** The phone's voices for this language: the exact lang (en-GB) if any, else the same base language (en-*). */
export function voicesFor<V extends VoiceLike>(voices: readonly V[], lang: string): V[] {
  const want = norm(lang)
  const exact = voices.filter((v) => norm(v.lang) === want)
  if (exact.length) return [...exact].sort(byName)
  const base = want.split('-')[0]
  return voices.filter((v) => norm(v.lang).split('-')[0] === base).sort(byName)
}

/**
 * The default voice (deterministic: the same list in any order gives the same voice): among the language's voices,
 * an on-device voice whose name suggests higher quality ("Google", "Enhanced", "Premium", "Natural", "Neural"),
 * else any on-device voice, else the first by name; null when the language has none.
 */
export function recommendedVoice<V extends VoiceLike>(voices: readonly V[], lang: string): V | null {
  const own = voicesFor(voices, lang)
  return (
    own.find((v) => v.localService !== false && QUALITY.test(v.name)) ??
    own.find((v) => v.localService !== false) ??
    own[0] ??
    null
  )
}

/** The remembered voice (by name) if the phone still has it for this language, else the recommended one. */
export function chooseVoice<V extends VoiceLike>(voices: readonly V[], lang: string, preferred: string | null): V | null {
  const own = voicesFor(voices, lang)
  return (preferred ? own.find((v) => v.name === preferred) : undefined) ?? recommendedVoice(voices, lang)
}

const prefKey = (lang: string) => `second-eyes.voice.${norm(lang)}`

/** The voice chosen in Settings for this speech language, or null (storage blocked counts as none). */
export function voicePref(lang: string): string | null {
  try {
    return window.localStorage.getItem(prefKey(lang))
  } catch {
    return null
  }
}

export function setVoicePref(lang: string, name: string | null): void {
  try {
    if (name) window.localStorage.setItem(prefKey(lang), name)
    else window.localStorage.removeItem(prefKey(lang))
  } catch {
    // not remembered; the choice still applies for this visit through the caller's state
  }
}

/** The voice to speak with: the user's choice for this language if still installed, else the recommended one. */
export function pickVoice<V extends VoiceLike>(voices: readonly V[], lang: string): V | null {
  return chooseVoice(voices, lang, typeof window === 'undefined' ? null : voicePref(lang))
}

/** An empty list means the browser has not loaded voices yet (or has none): unknown, not missing. */
export function voiceStatus(voices: readonly VoiceLike[], lang: string): VoiceStatus {
  if (voices.length === 0) return 'unknown'
  return recommendedVoice(voices, lang) ? 'installed' : 'missing'
}

type Synth = Pick<SpeechSynthesis, 'getVoices' | 'addEventListener' | 'removeEventListener'>

/**
 * The browser's voices, waiting up to `maxMs` for them to load (Android loads them late; speaking before that
 * gives a random fallback voice). Resolves with whatever is there when the time is up.
 */
export function waitForVoices(synth: Synth, maxMs: number): Promise<SpeechSynthesisVoice[]> {
  const now = synth.getVoices()
  if (now.length) return Promise.resolve(now)
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer)
      synth.removeEventListener('voiceschanged', done)
      resolve(synth.getVoices())
    }
    const timer = setTimeout(done, maxMs)
    synth.addEventListener('voiceschanged', done)
  })
}
