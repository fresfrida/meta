// The no-repeat rule: one place decides whether an answer is spoken or stays silent.
import type { VisionAnswer } from '../api/types'
import { isWarning } from './phrase'

export interface AnnounceState {
  /** Phrase most recently sent to speech, or null before the first one (and after a language change). */
  lastSpoken: string | null
  /** When that speech was started (ms, same clock as `now`). */
  lastSpokenAt: number
  /** Speech is playing right now. */
  speaking: boolean
  /** hazard + side of the last spoken answer. */
  lastKey: string | null
  /** distance_m of the last spoken answer, or null when it had no metres. */
  lastDistanceM: number | null
}

export type Decision =
  | { speak: true; interrupt: boolean }
  | { speak: false; why: 'unsure' | 'repeat' | 'too_soon' | 'busy' }

type Answer = Pick<VisionAnswer, 'hazard' | 'side' | 'distance_m'>

export const INITIAL_ANNOUNCE: AnnounceState = {
  lastSpoken: null,
  lastSpokenAt: -Infinity,
  speaking: false,
  lastKey: null,
  lastDistanceM: null,
}

const keyOf = (answer: Answer) => `${answer.hazard}|${answer.side ?? ''}`

/**
 * Repeat test. With metres on both this answer and the last spoken one, the key is hazard + side: the same key
 * stays silent unless it is at least `closerM` metres closer than when last spoken. Otherwise the phrase is
 * compared: the same phrase stays silent, however long ago.
 */
function isRepeat(answer: Answer, phrase: string, state: AnnounceState, closerM: number): boolean {
  if (answer.distance_m !== null && state.lastDistanceM !== null && keyOf(answer) === state.lastKey) {
    return answer.distance_m > state.lastDistanceM - closerM
  }
  return phrase === state.lastSpoken
}

/**
 * - "unsure" is shown but never spoken, and does not change the last spoken phrase.
 * - A repeat (see isRepeat) stays silent.
 * - A new phrase is spoken only if at least `minGapMs` has passed since the last speech.
 * - A new warning cuts off speech in progress; a non-warning (e.g. "Clear") waits for it to finish.
 */
export function decide(
  answer: Answer,
  phrase: string,
  state: AnnounceState,
  now: number,
  minGapMs: number,
  closerM: number,
): Decision {
  if (answer.hazard === 'unsure') return { speak: false, why: 'unsure' }
  if (isRepeat(answer, phrase, state, closerM)) return { speak: false, why: 'repeat' }
  if (now - state.lastSpokenAt < minGapMs) return { speak: false, why: 'too_soon' }
  if (state.speaking && !isWarning(answer)) return { speak: false, why: 'busy' }
  return { speak: true, interrupt: state.speaking }
}

/** State after a phrase has been sent to speech. */
export function spoke(answer: Answer, phrase: string, now: number): AnnounceState {
  return { lastSpoken: phrase, lastSpokenAt: now, speaking: true, lastKey: keyOf(answer), lastDistanceM: answer.distance_m }
}
