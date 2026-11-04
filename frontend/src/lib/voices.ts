// Picking an installed speech voice for a language: a steady, clear default (Brief 20), the user's own choice per
// language (remembered), and waiting for the browser's voice list before the first speech.
import type { VoiceStatus } from '../strings'

type VoiceLike = Pick<SpeechSynthesisVoice, 'lang' | 'name'> &
  Partial<Pick<SpeechSynthesisVoice, 'localService' | 'voiceURI'>>

const norm = (tag: string) => tag.replace(/_/g, '-').toLowerCase()
const QUALITY = /google|enhanced|premium|natural|neural/i

/**
 * Preferred regions per language, Singapore first (Brief 24, Advisor decision). Regions not listed come after, in
 * name order. 中文 is Mandarin: Cantonese voices (yue, Hong Kong, Macao) are never offered for it.
 */
const REGION_ORDER: Record<string, readonly string[]> = {
  zh: ['sg', 'cn', 'my', 'tw'],
  en: ['sg', 'gb'],
  ms: ['sg', 'my'],
  ta: ['sg', 'in'],
}
/** Only when a language has no voice at all: Bahasa Melayu falls back to Indonesian. */
const LAST_FALLBACK: Record<string, string> = { ms: 'id' }

// Locale words in voice names ("Chinese Hong Kong", "Google UK English Female"), for phones whose tags don't help.
const NAME_REGIONS: [RegExp, string][] = [
  [/\bsingapore\b/i, 'sg'],
  [/\bhong kong\b/i, 'hk'],
  [/\bmaca[ou]\b/i, 'mo'],
  [/\btaiwan\b/i, 'tw'],
  [/\bmalaysia\b/i, 'my'],
  [/\bindonesia\b/i, 'id'],
  [/\bchina\b/i, 'cn'],
  [/\b(united kingdom|uk|british)\b/i, 'gb'],
  [/\b(united states|us|american)\b/i, 'us'],
  [/\bindia\b/i, 'in'],
]
const NAME_LANGS: [RegExp, string][] = [
  [/\bcantonese\b/i, 'yue'],
  [/\b(chinese|mandarin)\b/i, 'zh'],
  [/\benglish\b/i, 'en'],
  [/\bindonesian\b/i, 'id'],
  [/\bmalay\b/i, 'ms'],
  [/\btamil\b/i, 'ta'],
]
const LANG_ALIAS: Record<string, string> = { cmn: 'zh', zho: 'zh', chi: 'zh', eng: 'en', msa: 'ms', may: 'ms', tam: 'ta', in: 'id' }

export interface VoiceInfo {
  /** Language (zh = Mandarin / written Chinese, yue = Cantonese), or null when neither tag nor name says. */
  lang: string | null
  /** Region, lower case (sg, cn, gb ...), or null. */
  region: string | null
}

/**
 * What a voice speaks, from its lang tag (lower case, "_" -> "-", "cmn" -> zh, "yue" kept) and the locale words in its
 * name. A region named in the voice's name wins over the tag (some phones tag every Chinese voice zh-CN). Chinese
 * from Hong Kong or Macao counts as Cantonese.
 */
export function voiceInfo(v: VoiceLike): VoiceInfo {
  const parts = norm(v.lang ?? '').split('-').filter(Boolean)
  let lang: string | null = parts[0] && /^[a-z]{2,3}$/.test(parts[0]) ? (LANG_ALIAS[parts[0]] ?? parts[0]) : null
  const tagRegion = parts.slice(1).find((p) => /^([a-z]{2}|\d{3})$/.test(p)) ?? null
  const nameRegion = NAME_REGIONS.find(([re]) => re.test(v.name))?.[1] ?? null
  if (!lang) lang = NAME_LANGS.find(([re]) => re.test(v.name))?.[1] ?? null
  const region = nameRegion ?? tagRegion
  if (lang === 'zh' && (region === 'hk' || region === 'mo' || /\bcantonese\b/i.test(v.name))) lang = 'yue'
  return { lang, region }
}

const quality = (v: VoiceLike) => (v.localService !== false && QUALITY.test(v.name) ? 0 : v.localService !== false ? 1 : 2)

/**
 * The phone's voices for this speech language (en-GB, zh-CN, ms-MY, ta-IN), best first: by region (Singapore first,
 * REGION_ORDER), then on-device higher-quality names, then on-device, then by name. Deterministic.
 */
export function voicesFor<V extends VoiceLike>(voices: readonly V[], lang: string): V[] {
  const want = norm(lang).split('-')[0]
  const infos = voices.map((v) => ({ v, info: voiceInfo(v) }))
  let pool = infos.filter((x) => x.info.lang === want)
  if (pool.length === 0 && LAST_FALLBACK[want]) pool = infos.filter((x) => x.info.lang === LAST_FALLBACK[want])
  const order = REGION_ORDER[want] ?? []
  const rank = (region: string | null) => {
    const i = region ? order.indexOf(region) : -1
    return i < 0 ? order.length : i
  }
  return pool
    .map((x, i) => ({ ...x, i }))
    .sort(
      (a, b) =>
        rank(a.info.region) - rank(b.info.region) ||
        quality(a.v) - quality(b.v) ||
        a.v.name.localeCompare(b.v.name) ||
        a.i - b.i,
    )
    .map((x) => x.v)
}

/** The default voice: the first of voicesFor (Singapore first, then quality); null when the language has none. */
export function recommendedVoice<V extends VoiceLike>(voices: readonly V[], lang: string): V | null {
  return voicesFor(voices, lang)[0] ?? null
}

/**
 * A stable id per voice in a list: its voiceURI (or name + lang), with "#2", "#3" added when several voices share it
 * (Android lists several voices with the same name and URI). Used for row keys, selection and the remembered choice.
 */
export function voiceIds<V extends VoiceLike>(list: readonly V[]): string[] {
  const seen = new Map<string, number>()
  return list.map((v) => {
    const base = v.voiceURI || `${v.name}|${v.lang}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return n === 1 ? base : `${base}#${n}`
  })
}

/** The remembered voice (by id, or by name from before Brief 22) if the phone still has it, else the recommended one. */
export function chooseVoice<V extends VoiceLike>(voices: readonly V[], lang: string, preferred: string | null): V | null {
  const own = voicesFor(voices, lang)
  if (preferred) {
    const ids = voiceIds(own)
    const i = ids.indexOf(preferred)
    if (i >= 0) return own[i]
    const byOldName = own.find((v) => v.name === preferred)
    if (byOldName) return byOldName
  }
  return recommendedVoice(voices, lang)
}

export interface VoiceRow<V> {
  key: string
  /** The voice's name, with " · 2", " · 3" added when names repeat. */
  label: string
  recommended: boolean
  selected: boolean
  voice: V
}

/** The Settings voice list for this language, built fresh each time: exactly one row selected when any exist. */
export function voiceRows<V extends VoiceLike>(voices: readonly V[], lang: string, preferred: string | null): VoiceRow<V>[] {
  const own = voicesFor(voices, lang)
  const ids = voiceIds(own)
  const recommended = recommendedVoice(voices, lang)
  const selected = chooseVoice(voices, lang, preferred)
  const nameCount = new Map<string, number>()
  return own.map((v, i) => {
    const n = (nameCount.get(v.name) ?? 0) + 1
    nameCount.set(v.name, n)
    return {
      key: ids[i],
      label: n === 1 ? v.name : `${v.name} · ${n}`,
      recommended: v === recommended,
      selected: v === selected,
      voice: v,
    }
  })
}

const prefKey = (lang: string) => `second-eyes.voice.${norm(lang)}`

/** The voice id chosen in Settings for this speech language, or null (storage blocked counts as none). */
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

/**
 * The voice to speak with: the user's choice for this language if still offered, else the recommended one. A
 * remembered choice the list no longer offers (e.g. a Cantonese voice for 中文, Brief 24) is simply not used.
 */
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
