// The one rule that turns a structured vision answer into the spoken phrase, per language.
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

/** Hazards that are warnings (not clear, not unsure). */
export function isWarning(answer: Pick<VisionAnswer, 'hazard'>): answer is { hazard: WarningHazard } {
  return answer.hazard !== 'clear' && answer.hazard !== 'unsure'
}
