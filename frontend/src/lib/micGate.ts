// Self-speech gate: the phone must not send its own voice (speech, earcons) to the speech recogniser.
import { SELF_SPEECH_TAIL_MS } from '../config'

export class MicGate {
  private active = 0
  private quietSince = -Infinity
  private readonly tailMs: number

  constructor(tailMs = SELF_SPEECH_TAIL_MS) {
    this.tailMs = tailMs
  }

  /** The phone started making sound (speech or an earcon). */
  start(): void {
    this.active += 1
  }

  /** That sound ended at `now` (ms). */
  end(now: number): void {
    this.active = Math.max(0, this.active - 1)
    if (this.active === 0) this.quietSince = now
  }

  /** Everything stopped at once (cancel). */
  reset(now: number): void {
    this.active = 0
    this.quietSince = now
  }

  /** Send mic audio only when the phone is silent and the tail has passed. */
  canSend(now: number): boolean {
    return this.active === 0 && now - this.quietSince >= this.tailMs
  }
}

/** The one gate shared by speech, earcons and the microphone. */
export const selfSound = new MicGate()
