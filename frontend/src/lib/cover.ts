// Brief 34: is the camera covered (a hand over the lens, a pocket)? Measured on the captured frame before it is sent.
import { COVER_DARK_MEAN, COVER_DARK_SD, COVER_FLAT_MAX_MEAN, COVER_FLAT_SD, COVER_HOLD_MS } from '../config'

export interface Luma {
  mean: number
  sd: number
}

/** Mean and standard deviation of the luma (0-255) over every `step`-th pixel of RGBA data. */
export function frameStats(data: Uint8ClampedArray, step = 4): Luma {
  let n = 0
  let sum = 0
  let sum2 = 0
  for (let i = 0; i + 2 < data.length; i += 4 * step) {
    const y = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    sum += y
    sum2 += y * y
    n += 1
  }
  if (!n) return { mean: 0, sd: 0 }
  const mean = sum / n
  return { mean, sd: Math.sqrt(Math.max(0, sum2 / n - mean * mean)) }
}

/** The rule: almost no detail (unless bright: a plain lit wall stays a frame), or very dark with little detail. */
export function looksCovered({ mean, sd }: Luma): boolean {
  return (sd < COVER_FLAT_SD && mean < COVER_FLAT_MAX_MEAN) || (mean < COVER_DARK_MEAN && sd < COVER_DARK_SD)
}

/** Covered for COVER_HOLD_MS in a row -> 'covered' once; clear again after that -> 'clear' once. */
export class CoverWatch {
  private since: number | null = null
  private on = false

  update(covered: boolean, now: number): 'covered' | 'clear' | null {
    if (!covered) {
      this.since = null
      if (!this.on) return null
      this.on = false
      return 'clear'
    }
    if (this.since === null) this.since = now
    if (!this.on && now - this.since >= COVER_HOLD_MS) {
      this.on = true
      return 'covered'
    }
    return null
  }

  get covered(): boolean {
    return this.on
  }
}
