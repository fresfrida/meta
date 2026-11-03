import { describe, expect, it } from 'vitest'
import { Pcm16Encoder, toInt16 } from './pcm'

const tone = (rate: number, seconds: number, hz = 440, from = 0) =>
  Float32Array.from({ length: Math.round(rate * seconds) }, (_, i) => 0.5 * Math.sin((2 * Math.PI * hz * (from + i)) / rate))

describe('toInt16', () => {
  it('maps -1..1 to the int16 range and clips', () => {
    expect(toInt16(0)).toBe(0)
    expect(toInt16(1)).toBe(32767)
    expect(toInt16(-1)).toBe(-32768)
    expect(toInt16(2)).toBe(32767)
    expect(toInt16(-3)).toBe(-32768)
    expect(toInt16(0.5)).toBe(16384)
  })
})

describe('Pcm16Encoder', () => {
  it('48 kHz -> 16 kHz: 1 s gives 12.5 frames of 80 ms (12 complete)', () => {
    const enc = new Pcm16Encoder(48_000)
    const frames = enc.push(tone(48_000, 1))
    expect(frames).toHaveLength(12)
    expect(frames.every((f) => f.length === 1_280)).toBe(true)
  })

  it('keeps the rate exact across many small chunks (no drift)', () => {
    const enc = new Pcm16Encoder(44_100)
    let samples = 0
    for (let k = 0; k < 100; k++) samples += enc.push(tone(44_100, 0.1 / 3.7)).reduce((n, f) => n + f.length, 0)
    // 100 chunks of ~27 ms = 2.7 s of input -> about 43,200 output samples, emitted in whole frames
    const expected = 100 * Math.round(44_100 * (0.1 / 3.7)) * (16_000 / 44_100)
    expect(Math.abs(samples - expected)).toBeLessThan(1_280 + 2)
    expect(samples % 1_280).toBe(0)
  })

  it('chunked and one-shot encoding give the same samples', () => {
    const input = tone(48_000, 0.5)
    const whole = new Pcm16Encoder(48_000, 16_000, 160).push(input)
    const enc = new Pcm16Encoder(48_000, 16_000, 160)
    const parts = [0, 997, 4_001, 12_000, 24_000].map((s, i, a) => input.slice(s, a[i + 1] ?? input.length))
    const chunked = parts.flatMap((p) => enc.push(p))
    expect(chunked.map((f) => Array.from(f))).toEqual(whole.map((f) => Array.from(f)))
  })

  it('preserves the waveform: a 440 Hz tone keeps its amplitude after resampling', () => {
    const [frame] = new Pcm16Encoder(48_000).push(tone(48_000, 0.1))
    const peak = Math.max(...Array.from(frame, Math.abs))
    expect(peak).toBeGreaterThan(16_000)
    expect(peak).toBeLessThanOrEqual(16_384)
  })

  it('16 kHz input passes straight through', () => {
    const input = tone(16_000, 0.08)
    const [frame] = new Pcm16Encoder(16_000).push(input)
    expect(Array.from(frame)).toEqual(Array.from(input, toInt16))
  })
})
