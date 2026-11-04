// The connection rule: while running, no answer on any channel for `lostMs` -> lost (lamp dark, "Connection lost"
// said, again every `repeatMs`); the next answer -> "Back online" once. Failures (budget, model) are not answers.

export interface LinkState {
  lastAnswerAt: number
  lost: boolean
  /** When the lost line was last said (-Infinity: not yet in this outage). */
  lastAlertAt: number
}

export type Say = 'lost' | 'back' | null

/** Start (or restart) of running: the clock for "no answer" starts now. */
export function startLink(now: number): LinkState {
  return { lastAnswerAt: now, lost: false, lastAlertAt: -Infinity }
}

/**
 * Called every check interval. `canSpeak` is false during Ask (the alert never interrupts an Ask answer); the lost
 * state still begins, and the line is said as soon as it may be.
 */
export function onCheck(
  s: LinkState,
  now: number,
  lostMs: number,
  repeatMs: number,
  canSpeak: boolean,
): [LinkState, Say] {
  if (now - s.lastAnswerAt < lostMs) return [s, null]
  const lost = { ...s, lost: true }
  if (canSpeak && now - s.lastAlertAt >= repeatMs) return [{ ...lost, lastAlertAt: now }, 'lost']
  return [lost, null]
}

/** A fresh answer arrived on either channel. "Back online" is said once, unless Ask is speaking. */
export function onAnswer(s: LinkState, now: number, canSpeak: boolean): [LinkState, Say] {
  const next = { lastAnswerAt: now, lost: false, lastAlertAt: -Infinity }
  return [next, s.lost && canSpeak ? 'back' : null]
}
