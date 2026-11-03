// The rules that turn a structured vision answer into the phrase on screen and the sentence that is spoken.
import type { Hazard, VisionAnswer } from '../api/types'
import type { Lang } from '../config'
import { phrases } from '../strings'

export type WarningHazard = Exclude<Hazard, 'clear' | 'unsure'>

/**
 * clear / unsure -> their word alone.
 * With metres (distance_m set): the language's metres template, e.g. "Step down, 2 metres" / "前方2米，下台阶".
 * Without: the near/far template, e.g. "Curb ahead, right, close".
 */
export function phraseFor(answer: Pick<VisionAnswer, 'hazard' | 'side' | 'distance' | 'distance_m'>, lang: Lang): string {
  const p = phrases[lang]
  const word = p.hazard[answer.hazard]
  if (!isWarning(answer)) return word
  if (answer.distance_m !== null) return p.metres(word, answer.distance_m, answer.side)
  return p.plain(word, answer.side, answer.distance === 'near')
}

/**
 * The plain-language sentence that is spoken (voice table): e.g. "Steps going down, about 2 metres ahead." /
 * "The path looks clear.". Null for unsure, which is never spoken.
 */
export function speechFor(answer: Pick<VisionAnswer, 'hazard' | 'side' | 'distance' | 'distance_m'>, lang: Lang): string | null {
  const v = phrases[lang].voice
  if (answer.hazard === 'unsure') return null
  if (!isWarning(answer)) return v.clear
  const what = v.hazard[answer.hazard]
  if (answer.distance_m !== null) return v.metres(what, answer.distance_m, answer.side)
  return v.plain(what, answer.side, answer.distance === 'near')
}

/** Hazards that are warnings (not clear, not unsure). */
export function isWarning(answer: Pick<VisionAnswer, 'hazard'>): answer is { hazard: WarningHazard } {
  return answer.hazard !== 'clear' && answer.hazard !== 'unsure'
}
