// Brief 28: the start line is always heard first. Its "done" comes only after its real end (onend after onstart);
// a start line that never started is said once more. Only then may the ready line (or a hazard) follow.
import type { SpeakHandle } from './speech'

export interface StartLineDeps {
  speak: (text: string) => SpeakHandle
  /** Still the same run, and no newer phrase took over (Stop, a question). */
  isCurrent: () => boolean
}

/** Says `text`; calls `done(heard)` once: after the line really ended, or after the last attempt failed. */
export function sayStartLine(text: string, deps: StartLineDeps, done: (heard: boolean) => void, attempts = 2): void {
  const attempt = (left: number) => {
    if (!deps.isCurrent()) return done(false)
    const handle = deps.speak(text)
    handle.started.then(
      () => void handle.ended.then(() => done(true)),
      () => (left > 1 && deps.isCurrent() ? attempt(left - 1) : done(false)),
    )
  }
  attempt(attempts)
}
