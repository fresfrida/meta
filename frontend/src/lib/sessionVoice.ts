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

// ----- Getting ready (Brief 27): from the Start tap until the first answer is handled -----

export interface StartPhase {
  /** Between the Start tap and the first answer (fast or detail). */
  preparing: boolean
  /** performance.now() of the Start tap. */
  since: number
  /** The still-preparing line was said (once per Start). */
  stillSaid: boolean
  /** The first answer came while the start line was still playing: say the ready line when it ends. */
  readyPending: boolean
}

export const PHASE_IDLE: StartPhase = { preparing: false, since: 0, stillSaid: false, readyPending: false }

export function enterPreparing(now: number): StartPhase {
  return { preparing: true, since: now, stillSaid: false, readyPending: false }
}

/** Stop, a camera failure, a refused slot: no getting-ready phase, nothing pending. */
export function leavePreparing(): StartPhase {
  return PHASE_IDLE
}

/**
 * The first answer was handled: the phase ends. The ready line is said, unless the answer is a hazard (the hazard is
 * said instead, by the normal rules) or the start line is still playing (then it is said when that ends).
 */
export function onFirstAnswer(p: StartPhase, a: { hazard: boolean; greeting: boolean }): [StartPhase, 'ready' | null] {
  if (!p.preparing) return [p, null]
  const left = { ...p, preparing: false }
  if (a.hazard) return [left, null]
  if (a.greeting) return [{ ...left, readyPending: true }, null]
  return [left, 'ready']
}

/** The start line finished: a ready line that waited for it is said now. */
export function onGreetingEnd(p: StartPhase): [StartPhase, 'ready' | null] {
  return p.readyPending ? [{ ...p, readyPending: false }, 'ready'] : [p, null]
}

/** Still preparing `stillMs` after the tap: the still-preparing line, once. */
export function stillPreparing(p: StartPhase, now: number, stillMs: number): [StartPhase, 'still' | null] {
  if (!p.preparing || p.stillSaid || now - p.since < stillMs) return [p, null]
  return [{ ...p, stillSaid: true }, 'still']
}

/** "Model is slow" is never shown while getting ready (the first answers are slow by nature). */
export function showSlow(p: StartPhase, slow: boolean): boolean {
  return slow && !p.preparing
}
