// Start / Stop lines (Brief 14): "Second Eyes is on. ..." once per tap on Start, "Second Eyes is off." once per tap on
// Stop. Hazard speech waits until the start line has finished (never overlapping). Nothing is said on page load.

import type { Decision } from './announce'

export interface SessionVoice {
  /** Running since the last Start tap. */
  on: boolean
  /** The start line is playing: hazard speech waits. */
  greeting: boolean
}

export const SESSION_IDLE: SessionVoice = { on: false, greeting: false }

/** A tap on Start. Says the start line only when not already on (a double tap says it once). */
export function onStart(s: SessionVoice): [SessionVoice, 'start' | null] {
  if (s.on) return [s, null]
  return [{ on: true, greeting: true }, 'start']
}

/** The start line finished (or failed): hazard speech may begin. */
export function greetingDone(s: SessionVoice): SessionVoice {
  return { ...s, greeting: false }
}

/** A tap on Stop. Says the stop line only when it was on. */
export function onStop(s: SessionVoice): [SessionVoice, 'stop' | null] {
  if (!s.on) return [s, null]
  return [SESSION_IDLE, 'stop']
}

/** While the start line plays, a hazard that would be spoken waits (it is said on the next answer). */
export function holdForGreeting(decision: Decision, s: SessionVoice): Decision {
  return s.greeting && decision.speak ? { speak: false, why: 'busy' } : decision
}

/**
 * Brief 20 / 25: the start line is said at once when the phone's voices are loaded, or when it must not wait
 * (WebKit: an iPhone only speaks reliably when the first phrase is queued inside the tap). Otherwise it waits (at most
 * VOICE_WAIT_MS) for the voices, so Android never uses a random fallback voice.
 */
export function greetAtOnce(voicesLoaded: boolean, mustNotWait: boolean): boolean {
  return voicesLoaded || mustNotWait
}
