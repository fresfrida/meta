// Brief 30: the spoken Ask hint, once per Start, right after the ready line, only with hands-free listening on.
// Any answer spoken before it plays comes first, and the hint is then dropped for that run (never queued).

/** off: not for this run · pending: waits for the ready line's end · said · dropped: an answer was spoken first. */
export type HintState = 'off' | 'pending' | 'said' | 'dropped'

/** Start: pending only with hands-free listening on and a hint in this language (English only for now). */
export function hintOnStart(handsFree: boolean, text: string | null): HintState {
  return handsFree && text ? 'pending' : 'off'
}

/** An answer (hazard or path phrase) is about to be spoken. */
export function hintOnSpeech(s: HintState): HintState {
  return s === 'pending' ? 'dropped' : s
}

/**
 * The ready line ended. `current`: it really ended, and no newer phrase, Stop or new run took over. True when the hint
 * is said now (once per run).
 */
export function hintAfterReady(s: HintState, current: boolean): [HintState, boolean] {
  if (s !== 'pending') return [s, false]
  return current ? ['said', true] : ['dropped', false]
}
