// The one rule that turns a structured vision answer into the spoken phrase.
import type { VisionAnswer } from '../api/types'
import { strings } from '../strings'

const p = strings.phrase

/**
 * clear / unsure -> their word alone.
 * Otherwise "<Hazard> ahead", then ", left|right" if off to a side,
 * then ", close" if near. Examples: "Step down ahead, left", "Obstacle ahead".
 */
export function phraseFor(answer: Pick<VisionAnswer, 'hazard' | 'side' | 'distance'>): string {
  const label = p.hazard[answer.hazard]
  if (answer.hazard === 'clear' || answer.hazard === 'unsure') return label

  const parts = [`${label} ${p.ahead}`]
  if (answer.side) {
    const side = p.side[answer.side]
    if (side) parts.push(side)
  }
  if (answer.distance) {
    const distance = p.distance[answer.distance]
    if (distance) parts.push(distance)
  }
  return parts.join(', ')
}

/** Hazards that get the warning colour. */
export function isWarning(answer: Pick<VisionAnswer, 'hazard'>): boolean {
  return answer.hazard !== 'clear' && answer.hazard !== 'unsure'
}
