// Microphone samples (Float32 at the device rate) -> PCM16 mono at 16 kHz, in fixed-size frames.

/** Float sample -1..1 -> signed 16-bit, clipped. */
export function toInt16(x: number): number {
  const c = Math.max(-1, Math.min(1, x))
  return (c < 0 ? Math.round(c * 0x8000) : Math.round(c * 0x7fff)) || 0 // || 0 turns -0 into 0
}

/**
 * Streaming resampler + encoder. Linear interpolation, keeping the fractional position across chunks so
 * chunk boundaries add no clicks or drift. Emits frames of exactly `frameSamples` samples.
 */
export class Pcm16Encoder {
  private readonly step: number
  private pos = 1 // next output position, in input samples, counted from `prev` (so the first is input[0])
  private prev = 0 // last input sample of the previous chunk
  private pending: number[] = []

  private readonly frameSamples: number

  constructor(inRate: number, outRate = 16_000, frameSamples = 1_280) {
    if (inRate <= 0 || outRate <= 0) throw new Error('sample rates must be positive')
    this.step = inRate / outRate
    this.frameSamples = frameSamples
  }

  /** Feed one chunk; returns the complete frames now available (often none). */
  push(input: Float32Array): Int16Array<ArrayBuffer>[] {
    // Index -1 is the previous chunk's last sample, so interpolation spans the boundary.
    const at = (i: number) => (i < 0 ? this.prev : input[i])
    let p = this.pos - 1
    while (p <= input.length - 1) {
      const i = Math.floor(p)
      const frac = p - i
      const a = at(i)
      const b = i + 1 < input.length ? at(i + 1) : a
      this.pending.push(toInt16(a + (b - a) * frac))
      p += this.step
    }
    this.pos = p - (input.length - 1)
    if (input.length) this.prev = input[input.length - 1]
    const frames: Int16Array<ArrayBuffer>[] = []
    while (this.pending.length >= this.frameSamples) {
      frames.push(Int16Array.from(this.pending.splice(0, this.frameSamples)))
    }
    return frames
  }
}
