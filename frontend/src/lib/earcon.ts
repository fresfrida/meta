// The short sound that says "I am listening for your question".
import { EARCON_GAIN, EARCON_TONE_MS, EARCON_TONES_HZ } from '../config'
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
