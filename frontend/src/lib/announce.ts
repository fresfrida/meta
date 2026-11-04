// The no-repeat rule: one place decides whether an answer is spoken or stays silent.
import type { ShownHazard } from '../api/types'
import { type Shown, isWarning } from './phrase'

export interface AnnounceState {
  /** Hazard type most recently sent to speech ("clear" included), or null before the first (and after a language change). */
  lastHazard: ShownHazard | null
  /** distance_m of the last spoken answer, or null when it had no metres. */
  lastDistanceM: number | null
  /** The last spoken answer was "near" (near/far fallback). */
  lastNear: boolean
  /** When that speech was started (ms, same clock as `now`). */
  lastSpokenAt: number
  /** Speech is playing right now. */
  speaking: boolean
}

export type Decision =
  | { speak: true; interrupt: boolean }
  | { speak: false; why: 'unsure' | 'repeat' | 'too_soon' | 'busy' }

type Answer = Pick<Shown, 'hazard' | 'distance' | 'distance_m'>

export const INITIAL_ANNOUNCE: AnnounceState = {
  lastHazard: null,
  lastDistanceM: null,
  lastNear: false,
  lastSpokenAt: -Infinity,
  speaking: false,
}

/**
 * Steps of any direction (SAM's "steps", Muse's up / down) are one kind; a person and a group of people are one
 * kind; every other hazard is its own.
 */
export function kindOf(hazard: ShownHazard): ShownHazard {
  if (hazard === 'step_down' || hazard === 'step_up') return 'steps'
  if (hazard === 'people') return 'person'
  return hazard
}

/** The detail inside a kind that is news when it changes: up / down for steps, one / several for people. */
const VARIANT: Partial<Record<ShownHazard, string>> = { step_down: 'down', step_up: 'up', person: 'one', people: 'several' }
const variant = (hazard: ShownHazard) => VARIANT[hazard] ?? null

/**
 * Repeat test. A side change alone never re-speaks (the side is read from the box and flaps near its lines).
 * - The key is the kind (kindOf). Up or down is new when it was not said yet or it changed: Muse's "steps going
 *   down" after SAM's "steps" speaks; SAM's "steps" after "steps going down" does not. Likewise a person ->
 *   several people (or back) speaks.
 * - With metres (this answer and the last spoken one): the same kind stays silent unless it is at least `closerM`
 *   metres closer than when last spoken.
 * - Otherwise: the key is kind + near/far; the same kind speaks again only when it goes far -> near.
 */
function isRepeat(answer: Answer, state: AnnounceState, closerM: number): boolean {
  if (state.lastHazard === null || kindOf(answer.hazard) !== kindOf(state.lastHazard)) return false
  const detail = variant(answer.hazard)
  if (detail !== null && detail !== variant(state.lastHazard)) return false
  if (answer.distance_m !== null && state.lastDistanceM !== null) {
    return answer.distance_m > state.lastDistanceM - closerM
  }
  return !(answer.distance === 'near' && !state.lastNear)
}

/**
 * - "unsure" is shown but never spoken, and does not change what was last spoken.
 * - A repeat (see isRepeat) stays silent.
 * - Speech starts only if at least `minGapMs` has passed since the last speech.
 * - A new warning cuts off speech in progress; a non-warning ("clear") waits for it to finish.
 */
export function decide(answer: Answer, state: AnnounceState, now: number, minGapMs: number, closerM: number): Decision {
  if (answer.hazard === 'unsure') return { speak: false, why: 'unsure' }
  if (isRepeat(answer, state, closerM)) return { speak: false, why: 'repeat' }
  if (now - state.lastSpokenAt < minGapMs) return { speak: false, why: 'too_soon' }
  if (state.speaking && !isWarning(answer)) return { speak: false, why: 'busy' }
  return { speak: true, interrupt: state.speaking }
}

/** State after an answer has been sent to speech. */
export function spoke(answer: Answer, now: number): AnnounceState {
  return {
    lastHazard: answer.hazard,
    lastDistanceM: answer.distance_m,
    lastNear: answer.distance === 'near',
    lastSpokenAt: now,
    speaking: true,
  }
}
