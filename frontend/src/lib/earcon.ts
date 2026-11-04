// The short sounds: "I am listening for your question", and the fast-warning cue.
import {
  EARCON_GAIN,
  EARCON_TONE_MS,
  EARCON_TONES_HZ,
  TICK_GAIN,
  TICK_HZ,
  TICK_MS,
  WARN_TONE_HZ,
  WARN_TONE_MS,
  WARN_VIBRATE_MS,
  TONES_ENABLED,
  TONE_RESUME_WAIT_MS,
  TONE_TAIL_MS,
} from '../config'
import { holdAudio, releaseAudio } from './audio'
import { webKitSpeech } from './speech'
import { selfSound } from './micGate'

/** ?tone=0 (Brief 27 test flag): no Web Audio sounds on WebKit. Android always plays them. */
function tonesOff(): boolean {
  return !TONES_ENABLED && webKitSpeech()
}

// ----- Debug (Brief 28): heartbeat ticks played vs skipped -----

export interface ToneDebug {
  ticksPlayed: number
  ticksSkipped: number
}

let debug: ToneDebug = { ticksPlayed: 0, ticksSkipped: 0 }
const listeners = new Set<() => void>()

function count(kind: 'tick' | 'other', played: boolean): void {
  if (kind !== 'tick') return
  debug = played ? { ...debug, ticksPlayed: debug.ticksPlayed + 1 } : { ...debug, ticksSkipped: debug.ticksSkipped + 1 }
  listeners.forEach((l) => l())
}

export function toneDebug(): ToneDebug {
  return debug
}

export function onToneDebug(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Runs `play(ctx)` once the context is running, keeping it held until `ms` after that (+ TONE_TAIL_MS on WebKit).
 * Brief 28: on the iPhone the context is suspended between tones; scheduling on it and suspending again 45 ms later
 * lost the tick. Android's context is running already, so it plays at once, exactly as before.
 * Resolves true when the tone played, false when it was skipped.
 */
function withRunningContext(ms: number, play: (ctx: AudioContext) => void): Promise<boolean> {
  const ctx = holdAudio()
  if (!ctx) return Promise.resolve(false)
  const tail = webKitSpeech() ? TONE_TAIL_MS : 0
  const start = (): Promise<boolean> => {
    try {
      play(ctx)
    } catch (err) {
      releaseAudio()
      return Promise.reject(err)
    }
    selfSound.start()
    return new Promise((resolve) =>
      setTimeout(() => {
        selfSound.end(performance.now())
        releaseAudio()
        resolve(true)
      }, ms + tail),
    )
  }
  if (ctx.state === 'running') return start()
  const running = ctx.resume().then(
    () => (ctx.state as string) === 'running',
    () => false,
  )
  const late = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), TONE_RESUME_WAIT_MS))
  return Promise.race([running, late]).then((ok) => {
    if (ok && ctx.state === 'running') return start()
    releaseAudio()
    return false
  })
}

/** Plays the earcon; resolves when it has finished. The microphone is closed while it plays. */
export function playEarcon(): Promise<void> {
  if (tonesOff()) return Promise.resolve()
  const toneS = EARCON_TONE_MS / 1000
  const totalMs = EARCON_TONES_HZ.length * EARCON_TONE_MS + 20
  return withRunningContext(totalMs, (ctx) => {
    const t0 = ctx.currentTime + 0.02
    EARCON_TONES_HZ.forEach((hz, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = hz
      const start = t0 + i * toneS
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(EARCON_GAIN, start + 0.01)
      gain.gain.linearRampToValueAtTime(0, start + toneS)
      osc.connect(gain).connect(ctx.destination)
      osc.start(start)
      osc.stop(start + toneS)
    })
  }).then(
    () => undefined,
    () => undefined,
  )
}

/** Fast warning cue, just before its phrase: one short tone, and a vibration where the browser supports it
 *  (Android Chrome; iPhone Safari has no navigator.vibrate). Does not wait. The microphone is closed while it plays. */
export function playWarnCue(): void {
  try {
    navigator.vibrate?.(WARN_VIBRATE_MS)
  } catch {
    // vibration is a bonus; never block the warning
  }
  // A tone that fails (iOS can leave the context "interrupted") must never stop the phrase that follows (Brief 25).
  try {
    tone(WARN_TONE_HZ, WARN_TONE_MS, EARCON_GAIN, 0.01)
  } catch (err) {
    console.warn('[earcon] warn cue failed', err)
  }
}

/** Heartbeat: a soft, short, low tick (TICK_*), quieter and lower than the fast cue. Does not wait. */
export function playTick(): void {
  if (tonesOff()) return count('tick', false)
  tone(TICK_HZ, TICK_MS, TICK_GAIN, 0.005, 'tick')
}

/** One short tone; the microphone is closed while it plays. Never throws (a failed tone never blocks speech). */
function tone(hz: number, ms: number, peak: number, rampS: number, kind: 'tick' | 'other' = 'other'): void {
  if (tonesOff()) return
  withRunningContext(ms + 10, (ctx) => {
    const toneS = ms / 1000
    const start = ctx.currentTime + 0.01
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = hz
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(peak, start + rampS)
    gain.gain.linearRampToValueAtTime(0, start + toneS)
    osc.connect(gain).connect(ctx.destination)
    osc.start(start)
    osc.stop(start + toneS)
  }).then(
    (played) => count(kind, played),
    (err) => {
      count(kind, false)
      console.warn('[earcon] tone failed', err)
    },
  )
}
