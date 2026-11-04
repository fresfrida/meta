// The traffic light rule: which lamp is lit for the answer on screen.
import { RED_MAX_M } from '../config'
import { type Shown, isWarning } from './phrase'

export type Lamp = 'red' | 'amber' | 'green' | 'off'

/**
 * red   = a warning with distance_m <= RED_MAX_M, or distance "near" when there are no metres
 * amber = any other warning
 * green = clear
 * off   = unsure, or no answer (waiting, stopped, error): pass null
 */
export function lampFor(answer: Pick<Shown, 'hazard' | 'distance' | 'distance_m'> | null): Lamp {
  if (!answer || answer.hazard === 'unsure') return 'off'
  if (answer.hazard === 'clear') return 'green'
  if (!isWarning(answer)) return 'off'
  const close = answer.distance_m !== null ? answer.distance_m <= RED_MAX_M : answer.distance === 'near'
  return close ? 'red' : 'amber'
}
