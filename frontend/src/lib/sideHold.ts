// Side hysteresis (Brief 16b): a hazard near a side line does not flip "ahead" <-> "left" / "right" with every
// answer. Once a side has been spoken for a kind, it changes only when the box centre is clearly past the line.
import type { Box, ShownHazard, Side } from '../api/types'
import { kindOf } from './announce'
import type { Shown } from './phrase'

export interface Lines {
  leftMax: number
  rightMin: number
  hyst: number
}

/** The side for a box centred at `centre` (0..1000), given the side last spoken for this kind (null: none yet). */
export function heldSide(centre: number, last: Side | null, { leftMax, rightMin, hyst }: Lines): Side {
  const raw: Side = centre <= leftMax ? 'left' : centre >= rightMin ? 'right' : 'ahead'
  if (last === null || raw === last) return raw
  if (last === 'left') return centre > leftMax + hyst ? raw : 'left'
  if (last === 'right') return centre < rightMin - hyst ? raw : 'right'
  // last ahead
  if (raw === 'left') return centre <= leftMax - hyst ? 'left' : 'ahead'
  return centre >= rightMin + hyst ? 'right' : 'ahead'
}

export type SpokenSides = Partial<Record<ShownHazard, Side>>

/** Applies the hold to an answer with a box (either channel); answers without a box or side are unchanged. */
export function holdSide(shown: Shown, box: Box | null, spoken: SpokenSides, lines: Lines): Shown {
  if (!box || shown.side === null) return shown
  const side = heldSide((box[0] + box[2]) / 2, spoken[kindOf(shown.hazard)] ?? null, lines)
  return side === shown.side ? shown : { ...shown, side }
}

/** Remembers the side just spoken for this kind. */
export function rememberSide(spoken: SpokenSides, shown: Shown): SpokenSides {
  return shown.side === null ? spoken : { ...spoken, [kindOf(shown.hazard)]: shown.side }
}
