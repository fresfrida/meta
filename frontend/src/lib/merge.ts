// The two-speed merge: which answer (fast SAM hit or detailed Muse answer) is shown, and when the fast cue plays.
// Whether it is spoken is the repeat rule's job (announce.ts), shared by both channels.
import type { DetectHit, ShownHazard } from '../api/types'
import { SAM_SURE_CONF } from '../config'
import { type Decision, kindOf } from './announce'
import { samHedged } from './hedge'
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
export function hitAsShown(hit: DetectHit, sureConf = SAM_SURE_CONF): Shown {
  return {
    hazard: hit.kind,
    side: hit.side,
    distance: hit.distance,
    distance_m: hit.distance_m,
    hedged: samHedged(hit, sureConf),
  }
}

/**
 * Does this answer replace what is on screen (and may it be spoken)? `speaks`: the repeat rule would speak it.
 * - A fast hit that would be spoken always does (SAM sends only hits; "nothing found" changes nothing).
 * - A silent fast hit does not replace a Muse answer younger than `holdMs`: Muse's detail ("going down", its
 *   metres, an obstacle) stays on screen instead of flipping back to the fast phrase every frame.
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
  if (channel === 'fast') return speaks || !(shown.channel === 'detail' && young)
  const quiet = answer.hazard === 'clear' || answer.hazard === 'unsure'
  return !(quiet && shown.channel === 'fast' && young)
}

/** When each kind (kindOf) was last spoken, by either channel, and how close it was. */
export type SpokenKinds = Partial<
  Record<ShownHazard, { at: number; distance_m: number | null; near: boolean; hedged: boolean }>
>

/** Records a spoken answer in the per-kind memory. */
export function rememberSpoken(kinds: SpokenKinds, answer: Shown, now: number): SpokenKinds {
  const memory = { at: now, distance_m: answer.distance_m, near: answer.distance === 'near', hedged: answer.hedged === true }
  return { ...kinds, [kindOf(answer.hazard)]: memory }
}

/**
 * A fast hit whose kind was spoken (by either channel) less than `windowMs` ago stays silent unless it is closer
 * (`closerM` metres, or far -> near). Without this, a scene with a kerb (SAM, every frame) and an
 * obstacle (Muse) is spoken "kerb, obstacle, kerb, obstacle..." (Brief 11 live run). Muse answers are not affected.
 */
export function fastRecentlySaid(hit: Shown, kinds: SpokenKinds, now: number, windowMs: number, closerM: number): boolean {
  const last = kinds[kindOf(hit.hazard)]
  if (!last || now - last.at >= windowMs) return false
  if (last.hedged && !hit.hedged) return false // sure after "There might be ...": said once without the hedge
  if (hit.distance_m !== null && last.distance_m !== null) return hit.distance_m > last.distance_m - closerM
  return !(hit.distance === 'near' && !last.near)
}

const SEVERITY: Record<Lamp, number> = { off: 0, green: 1, amber: 2, red: 3 }

/** Traffic light: the newest answer's lamp; for two answers about the same frame, the more severe one. */
export function mergedLamp(lamp: Lamp, seq: number, shown: ShownState): Lamp {
  return seq === shown.seq && SEVERITY[shown.lamp] > SEVERITY[lamp] ? shown.lamp : lamp
}

/** The fast cue (short tone + vibration) plays only before a fast warning that is about to be spoken for the first
 *  time (not before a Talk more repeat). */
export function fastCue(channel: Channel, decision: Decision): boolean {
  return channel === 'fast' && decision.speak && !decision.again
}
