// One AudioContext for the microphone and earcons. iOS only starts it from a tap, so unlockAudio() runs in one.

let ctx: AudioContext | null = null

export function audioSupported(): boolean {
  return typeof window !== 'undefined' && 'AudioContext' in window
}

/** Call synchronously inside a tap (Start, or touch-and-hold). */
export function unlockAudio(): AudioContext | null {
  if (!audioSupported()) return null
  ctx ??= new AudioContext()
  void ctx.resume()
  return ctx
}

export function audioContext(): AudioContext | null {
  return ctx
}

/** For the debug line (Brief 25): "running", "suspended", "interrupted" (iOS), "closed", or "none" before Start. */
export function audioState(): string {
  return ctx?.state ?? 'none'
}
