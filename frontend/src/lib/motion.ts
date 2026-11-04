// Is the person walking? Variance of the phone's acceleration magnitude over the last window. With no data (motion
// not available or not permitted) it answers "walking": the distance rule then says closer, never further.

export class WalkDetector {
  private samples: { t: number; a: number }[] = []
  private readonly windowMs: number
  private readonly threshold: number

  constructor(windowMs: number, threshold: number) {
    this.windowMs = windowMs
    this.threshold = threshold
  }

  add(t: number, magnitude: number): void {
    this.samples.push({ t, a: magnitude })
    this.trim(t)
  }

  walking(now: number): boolean {
    this.trim(now)
    if (this.samples.length < 5) return true // unknown: assume walking (safer)
    const mean = this.samples.reduce((s, x) => s + x.a, 0) / this.samples.length
    const variance = this.samples.reduce((s, x) => s + (x.a - mean) ** 2, 0) / this.samples.length
    return variance > this.threshold
  }

  private trim(now: number): void {
    while (this.samples.length && now - this.samples[0].t > this.windowMs) this.samples.shift()
  }
}
