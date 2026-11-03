// Picking an installed speech voice for a language.
import type { VoiceStatus } from '../strings'

type VoiceLike = Pick<SpeechSynthesisVoice, 'lang' | 'name'>

const norm = (lang: string) => lang.replace('_', '-').toLowerCase()

/** Exact lang match first (en-GB), then the same base language (en-US for en-GB); null if none. */
export function pickVoice<V extends VoiceLike>(voices: readonly V[], lang: string): V | null {
  const want = norm(lang)
  const base = want.split('-')[0]
  return voices.find((v) => norm(v.lang) === want) ?? voices.find((v) => norm(v.lang).split('-')[0] === base) ?? null
}

/** An empty list means the browser has not loaded voices yet (or has none): unknown, not missing. */
export function voiceStatus(voices: readonly VoiceLike[], lang: string): VoiceStatus {
  if (voices.length === 0) return 'unknown'
  return pickVoice(voices, lang) ? 'installed' : 'missing'
}
