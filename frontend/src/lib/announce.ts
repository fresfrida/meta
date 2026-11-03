// The no-repeat rule: one place decides whether an answer is spoken or stays silent.
import type { VisionAnswer } from '../api/types'
import { isWarning } from './phrase'

export interface AnnounceState {
  /** Phrase most recently sent to speech, or null before the first one. */
  lastSpoken: string | null
  /** When that speech was started (ms, same clock as `now`). */
  lastSpokenAt: number
  /** Speech is playing right now. */
  speaking: boolean
}

export type Decision =
  | { speak: true; interrupt: boolean }
  | { speak: false; why: 'unsure' | 'repeat' | 'too_soon' | 'busy' }

export const INITIAL_ANNOUNCE: AnnounceState = { lastSpoken: null, lastSpokenAt: -Infinity, speaking: false }

/**
 * - "unsure" is shown but never spoken, and does not change the last spoken phrase.
 * - The same phrase as last spoken stays silent.
 * - A new phrase is spoken only if at least `minGapMs` has passed since the last speech.
 * - A new warning cuts off speech in progress; a non-warning (e.g. "Clear") waits for it to finish.
 */
export function decide(
  answer: VisionAnswer,
  phrase: string,
  state: AnnounceState,
  now: number,
  minGapMs: number,
): Decision {
  if (answer.hazard === 'unsure') return { speak: false, why: 'unsure' }
  if (phrase === state.lastSpoken) return { speak: false, why: 'repeat' }
  if (now - state.lastSpokenAt < minGapMs) return { speak: false, why: 'too_soon' }
  if (state.speaking && !isWarning(answer)) return { speak: false, why: 'busy' }
  return { speak: true, interrupt: state.speaking }
}

/** State after a phrase has been sent to speech. */
export function spoke(phrase: string, now: number): AnnounceState {
  return { lastSpoken: phrase, lastSpokenAt: now, speaking: true }
}
