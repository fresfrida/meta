// The two-speed merge: which answer (fast SAM hit or detailed Muse answer) is shown, and when the fast cue plays.
// Whether it is spoken is the repeat rule's job (announce.ts), shared by both channels.
import type { DetectHit, ShownHazard } from '../api/types'
import { type Decision, kindOf } from './announce'
import type { Lamp } from './light'
import type { Shown } from './phrase'

export type Channel = 'fast' | 'detail'

/** What is on screen now. */
export interface ShownState {
  channel: Channel | null
  hazard: ShownHazard | null
  /** Capture number of the frame it came from. */
  seq: number
  lamp: Lamp
  /** When it was shown (ms, same clock as `now`). */
  at: number
}

export const NOTHING_SHOWN: ShownState = { channel: null, hazard: null, seq: 0, lamp: 'off', at: -Infinity }

/** A kept SAM hit as a warning: "steps" (direction unknown) or "curb", with the rule's side and distance. */
export function hitAsShown(hit: DetectHit): Shown {
  return { hazard: hit.kind, side: hit.side, distance: hit.distance, distance_m: hit.distance_m }
}

/**
 * Does this answer replace what is on screen (and may it be spoken)? `speaks`: the repeat rule would speak it.
 * - A fast hit that would be spoken always does (SAM sends only hits; "nothing found" changes nothing).
 * - A silent fast hit does not replace a Muse answer of the same kind younger than `holdMs`: Muse's detail
 *   ("going down", its metres) stays on screen instead of flipping back to "steps" every frame.
 * - A Muse "clear" or "not sure" does not cancel a fast warning younger than `holdMs`: not shown, not spoken.
 * - Every other Muse answer does, as today (obstacles, up / down, metres).
 */
export function replaces(
  channel: Channel,
  answer: Pick<Shown, 'hazard'>,
  shown: ShownState,
  now: number,
  holdMs: number,
  speaks: boolean,
): boolean {
  const young = now - shown.at < holdMs
  if (channel === 'fast') {
    if (speaks) return true
    const sameKind = shown.hazard !== null && kindOf(shown.hazard) === kindOf(answer.hazard)
    return !(shown.channel === 'detail' && sameKind && young)
  }
  const quiet = answer.hazard === 'clear' || answer.hazard === 'unsure'
  return !(quiet && shown.channel === 'fast' && young)
}

const SEVERITY: Record<Lamp, number> = { off: 0, green: 1, amber: 2, red: 3 }

/** Traffic light: the newest answer's lamp; for two answers about the same frame, the more severe one. */
export function mergedLamp(lamp: Lamp, seq: number, shown: ShownState): Lamp {
  return seq === shown.seq && SEVERITY[shown.lamp] > SEVERITY[lamp] ? shown.lamp : lamp
}

/** The fast cue (short tone + vibration) plays only before a fast warning that is about to be spoken. */
export function fastCue(channel: Channel, decision: Decision): boolean {
  return channel === 'fast' && decision.speak
}
