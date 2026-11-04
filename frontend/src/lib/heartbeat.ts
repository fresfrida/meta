// The heartbeat rule: when the soft tick plays (a fresh answer arrived and nothing was spoken).

export interface TickInputs {
  /** Hazard speech or a connection alert is playing. */
  speaking: boolean
  /** A question is being asked or answered. */
  asking: boolean
  now: number
  lastTickAt: number
  minGapMs: number
}

export function shouldTick({ speaking, asking, now, lastTickAt, minGapMs }: TickInputs): boolean {
  return !speaking && !asking && now - lastTickAt >= minGapMs
}
