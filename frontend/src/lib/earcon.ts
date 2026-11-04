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
} from '../config'
import { audioContext } from './audio'
import { selfSound } from './micGate'

/** Plays the earcon; resolves when it has finished. The microphone is closed while it plays. */
export function playEarcon(): Promise<void> {
  const ctx = audioContext()
  if (!ctx) return Promise.resolve()
  const toneS = EARCON_TONE_MS / 1000
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
  selfSound.start()
  const totalMs = EARCON_TONES_HZ.length * EARCON_TONE_MS + 20
  return new Promise((resolve) =>
    setTimeout(() => {
      selfSound.end(performance.now())
      resolve()
    }, totalMs),
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
  const ctx = audioContext()
  if (!ctx) return
  const toneS = WARN_TONE_MS / 1000
  const start = ctx.currentTime + 0.01
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.frequency.value = WARN_TONE_HZ
  gain.gain.setValueAtTime(0, start)
  gain.gain.linearRampToValueAtTime(EARCON_GAIN, start + 0.01)
  gain.gain.linearRampToValueAtTime(0, start + toneS)
  osc.connect(gain).connect(ctx.destination)
  osc.start(start)
  osc.stop(start + toneS)
  selfSound.start()
  setTimeout(() => selfSound.end(performance.now()), WARN_TONE_MS + 10)
}

/** Heartbeat: a soft, short, low tick (TICK_*), quieter and lower than the fast cue. Does not wait. */
export function playTick(): void {
  const ctx = audioContext()
  if (!ctx) return
  const toneS = TICK_MS / 1000
  const start = ctx.currentTime + 0.01
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.frequency.value = TICK_HZ
  gain.gain.setValueAtTime(0, start)
  gain.gain.linearRampToValueAtTime(TICK_GAIN, start + 0.005)
  gain.gain.linearRampToValueAtTime(0, start + toneS)
  osc.connect(gain).connect(ctx.destination)
  osc.start(start)
  osc.stop(start + toneS)
  selfSound.start()
  setTimeout(() => selfSound.end(performance.now()), TICK_MS + 10)
}
