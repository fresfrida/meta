// The no-repeat rule: one place decides whether an answer is spoken or stays silent.
import type { VisionAnswer } from '../api/types'
import { isWarning } from './phrase'

export interface AnnounceState {
  /** Hazard type most recently sent to speech ("clear" included), or null before the first (and after a language change). */
  lastHazard: VisionAnswer['hazard'] | null
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

type Answer = Pick<VisionAnswer, 'hazard' | 'distance' | 'distance_m'>

export const INITIAL_ANNOUNCE: AnnounceState = {
  lastHazard: null,
  lastDistanceM: null,
  lastNear: false,
  lastSpokenAt: -Infinity,
  speaking: false,
}

/**
 * Repeat test. A side change alone never re-speaks (the side is read from the box and flaps near its lines).
 * - With metres (this answer and the last spoken one): the key is the hazard type; the same hazard stays silent
 *   unless it is at least `closerM` metres closer than when last spoken.
 * - Otherwise: the key is hazard type + near/far; the same hazard speaks again only when it goes far -> near.
 */
function isRepeat(answer: Answer, state: AnnounceState, closerM: number): boolean {
  if (answer.hazard !== state.lastHazard) return false
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
