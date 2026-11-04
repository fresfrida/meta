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

// ----- Audio session (Brief 26): Safari 16.4+ only; every other browser has no navigator.audioSession -----
//
// 'auto' lets iOS choose; with a running AudioContext it can choose an "ambient" session that the ring / silent
// switch mutes (speech included), and with the mic open a play-and-record session. While Second Eyes runs we ask
// for 'playback' (plays on the speaker, ignores the silent switch); while the mic is open 'play-and-record'
// (needed to record); back to 'auto' on Stop.

export type AudioSessionType = 'auto' | 'playback' | 'play-and-record'

interface AudioSessionLike {
  type: string
}

function audioSession(): AudioSessionLike | null {
  if (typeof navigator === 'undefined') return null
  return (navigator as Navigator & { audioSession?: AudioSessionLike }).audioSession ?? null
}

let running = false
let micsOpen = 0

function applySession(): void {
  const session = audioSession()
  if (!session) return // not Safari 16.4+: nothing to do (Android, desktop Chrome)
  const wanted: AudioSessionType = micsOpen > 0 ? 'play-and-record' : running ? 'playback' : 'auto'
  try {
    if (session.type !== wanted) session.type = wanted
  } catch (err) {
    console.warn('[audio] audio session type not accepted', wanted, err)
  }
}

/** Start tap (call synchronously, before unlockAudio / unlockSpeech): 'playback' while running. */
export function sessionStarted(): void {
  running = true
  applySession()
}

/** Stop: back to 'auto'. */
export function sessionStopped(): void {
  running = false
  applySession()
}

/** The mic opens (before getUserMedia) or closes. */
export function micOpened(): void {
  micsOpen += 1
  applySession()
}

export function micClosed(): void {
  micsOpen = Math.max(0, micsOpen - 1)
  applySession()
}

/** For the debug line: the session type the browser reports, or "none" where there is no audio session API. */
export function audioSessionType(): string {
  return audioSession()?.type ?? 'none'
}
