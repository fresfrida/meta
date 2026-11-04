// The rules that turn a structured vision answer into the phrase on screen and the sentence that is spoken.
import type { Distance, ShownHazard, Side } from '../api/types'
import type { Lang } from '../config'
import { phrases } from '../strings'

export type WarningHazard = Exclude<ShownHazard, 'clear' | 'unsure'>

/** Anything that can be shown and spoken: a Muse answer, or a SAM hit as a "steps" / "curb" warning. */
export interface Shown {
  hazard: ShownHazard
  side: Side | null
  distance: Distance | null
  distance_m: number | null
  /** Said as "There might be ..." (Muse not sure, or a SAM hit below SAM_SURE_CONF): see hedge.ts. */
  hedged?: boolean
}

/**
 * clear / unsure -> their word alone.
 * With metres (distance_m set): the language's metres template, e.g. "Step down, 2 metres" / "前方2米，下台阶".
 * Without: the near/far template, e.g. "Curb ahead, right, close".
 */
export function phraseFor(answer: Shown, lang: Lang): string {
  const p = phrases[lang]
  const word = p.hazard[answer.hazard]
  if (!isWarning(answer)) return word
  const text =
    answer.distance_m !== null ? p.metres(word, answer.distance_m, answer.side) : p.plain(word, answer.side, answer.distance === 'near')
  // Hedged: the whole phrase ends in a question mark (Owner, 4 Nov): "Kerb, 3 metres?", "前方3米，路缘？".
  return answer.hedged ? `${text}${lang === 'zh' ? '？' : '?'}` : text
}

/**
 * The plain-language sentence that is spoken (voice table): e.g. "Steps going down, about 2 metres ahead." /
 * "The path looks clear.". Null for unsure, which is never spoken.
 */
export function speechFor(answer: Shown, lang: Lang): string | null {
  const v = phrases[lang].voice
  if (answer.hazard === 'unsure') return null
  if (!isWarning(answer)) return v.clear
  const what = v.hazard[answer.hazard]
  if (answer.hedged) {
    if (answer.distance_m !== null) return v.maybeMetres(what, answer.distance_m, answer.side)
    return v.maybePlain(what, answer.side, answer.distance === 'near')
  }
  if (answer.distance_m !== null) return v.metres(what, answer.distance_m, answer.side)
  return v.plain(what, answer.side, answer.distance === 'near')
}

/** Hazards that are warnings (not clear, not unsure). */
export function isWarning(answer: Pick<Shown, 'hazard'>): answer is { hazard: WarningHazard } {
  return answer.hazard !== 'clear' && answer.hazard !== 'unsure'
}
