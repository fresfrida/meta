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
} from '../config'
import { holdAudio, releaseAudio } from './audio'
import { webKitSpeech } from './speech'
import { selfSound } from './micGate'

/** ?tone=0 (Brief 27 test flag): no Web Audio sounds on WebKit. Android always plays them. */
function tonesOff(): boolean {
  return !TONES_ENABLED && webKitSpeech()
}

/** Plays the earcon; resolves when it has finished. The microphone is closed while it plays. */

export function playEarcon(): Promise<void> {
  if (tonesOff()) return Promise.resolve()
  const ctx = holdAudio()
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
      releaseAudio()
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
  // A tone that fails (iOS can leave the context "interrupted") must never stop the phrase that follows (Brief 25).
  try {
    tone(WARN_TONE_HZ, WARN_TONE_MS, EARCON_GAIN, 0.01)
  } catch (err) {
    console.warn('[earcon] warn cue failed', err)
  }
}

/** Heartbeat: a soft, short, low tick (TICK_*), quieter and lower than the fast cue. Does not wait. */
export function playTick(): void {
  try {
    tone(TICK_HZ, TICK_MS, TICK_GAIN, 0.005)
  } catch (err) {
    console.warn('[earcon] tick failed', err)
  }
}

/** One short tone; the microphone is closed while it plays. */
function tone(hz: number, ms: number, peak: number, rampS: number): void {
  if (tonesOff()) return
  const ctx = holdAudio()
  if (!ctx) return
  try {
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
  } catch (err) {
    releaseAudio()
    throw err
  }
  selfSound.start()
  setTimeout(() => {
    selfSound.end(performance.now())
    releaseAudio()
  }, ms + 10)
}
