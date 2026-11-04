// One AudioContext for the microphone and earcons. iOS only starts it from a tap, so unlockAudio() runs in one.
import { AUDIO_SESSION_ENABLED } from '../config'
import { webKitSpeech } from './speech'

let ctx: AudioContext | null = null

export function audioSupported(): boolean {
  return typeof window !== 'undefined' && 'AudioContext' in window
}

// Brief 27, WebKit only: the context runs only while a tone plays or the mic is open, and is suspended in between,
// so it does not hold the iPhone's audio output while speech plays. Android keeps it running, as before.
let holds = 0

function idleSuspends(): boolean {
  return webKitSpeech()
}

function suspendIfIdle(): void {
  if (ctx && holds === 0 && idleSuspends() && ctx.state === 'running') void ctx.suspend().catch(() => undefined)
}

/** Call synchronously inside a tap (Start, or touch-and-hold). */
export function unlockAudio(): AudioContext | null {
  if (!audioSupported()) return null
  ctx ??= new AudioContext()
  const c = ctx
  // Started inside the tap (iOS needs that once per page); on WebKit suspended again until a tone needs it.
  void c.resume().then(suspendIfIdle, () => undefined)
  return c
}

export function audioContext(): AudioContext | null {
  return ctx
}

/** A tone is about to play, or the mic opens: the context must run. Returns it, or null before Start. */
export function holdAudio(): AudioContext | null {
  if (!ctx) return null
  holds += 1
  if (ctx.state !== 'running') void ctx.resume().catch(() => undefined)
  return ctx
}

/** The tone ended, or the mic closed. */
export function releaseAudio(): void {
  holds = Math.max(0, holds - 1)
  suspendIfIdle()
}

/** After a route change or an interruption (Brief 27): get the context back if iOS took it away. */
export function recoverAudio(): void {
  if (!ctx) return
  const state = ctx.state as string
  if (state === 'interrupted' || (holds > 0 && state === 'suspended')) void ctx.resume().then(suspendIfIdle, () => undefined)
}

/** For the debug line (Brief 25): "running", "suspended", "interrupted" (iOS), "closed", or "none" before Start. */
export function audioState(): string {
  return ctx?.state ?? 'none'
}

// ----- Audio session (Brief 26 / 27): Safari 16.4+ only; every other browser has no navigator.audioSession -----
//
// 'auto' lets iOS choose; with a running AudioContext it can choose an "ambient" session that the ring / silent
// switch mutes (speech included), and with the mic open a play-and-record session. Brief 27: ONE type for the whole
// run, chosen in the Start tap: 'play-and-record' when hands-free listening is on (the mic is open all the time),
// else 'playback' (speaker, ignores the silent switch). Only a touch-and-hold question with hands-free off opens the
// mic during a 'playback' run, and only then does the type change (recording needs it). Back to 'auto' on Stop.

export type AudioSessionType = 'auto' | 'playback' | 'play-and-record'

interface AudioSessionLike {
  type: string
}

export function audioSession(): AudioSessionLike | null {
  if (typeof navigator === 'undefined') return null
  return (navigator as Navigator & { audioSession?: AudioSessionLike }).audioSession ?? null
}

let runType: AudioSessionType | null = null
let micsOpen = 0

function applySession(): void {
  const session = audioSession()
  if (!session || !AUDIO_SESSION_ENABLED) return // ?session=0, or not Safari 16.4+ (Android, desktop Chrome)
  const wanted: AudioSessionType = runType === null ? (micsOpen > 0 ? 'play-and-record' : 'auto') : micsOpen > 0 ? 'play-and-record' : runType
  try {
    if (session.type !== wanted) session.type = wanted
  } catch (err) {
    console.warn('[audio] audio session type not accepted', wanted, err)
  }
}

/** Start tap (call synchronously, before unlockAudio / unlockSpeech). */
export function sessionStarted(handsFree = false): void {
  runType = handsFree ? 'play-and-record' : 'playback'
  applySession()
}

/** Stop: back to 'auto'. */
export function sessionStopped(): void {
  runType = null
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

/** For the debug line: the session type the browser reports, "off" for ?session=0, or "none" without the API. */
export function audioSessionType(): string {
  const session = audioSession()
  if (!session) return 'none'
  return AUDIO_SESSION_ENABLED ? session.type : `${session.type} (off)`
}
