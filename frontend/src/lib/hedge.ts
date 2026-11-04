// The hedge rule (Brief 13b): when a warning is said as "There might be ...". One rule, one file.
import type { DetectHit, VisionAnswer } from '../api/types'
import { isWarning } from './phrase'

/** Muse: a warning the model says it is not sure about. */
export function museHedged(answer: Pick<VisionAnswer, 'hazard' | 'sure'>): boolean {
  return isWarning(answer) && answer.sure === false
}

/** SAM: a kept hit (confidence >= SAM_MIN_CONF on the backend) below `sureConf`. */
export function samHedged(hit: Pick<DetectHit, 'confidence'>, sureConf: number): boolean {
  return hit.confidence < sureConf
}
