// Brief 34: is the phone upside down (worn on a lanyard, top end down)? Then every captured frame is turned 180 degrees
// before face blur and JPEG, so SAM, Muse and Ask all see an upright picture.
import { FLIP_ENTER_Y, FLIP_EXIT_Y, FLIP_MIN_SAMPLES, FLIP_OVERRIDE, FLIP_STALE_MS, FLIP_STEADY_MS } from '../config'
import type { Box } from '../api/types'
import { webKitSpeech } from './speech'

/** accelerationIncludingGravity.y in the spec's sign (+9.8 upright portrait). WebKit (iPhone, iPad) reports the opposite. */
export function specY(rawY: number, webkit: boolean): number {
  return webkit ? -rawY : rawY
}

/** The rule: steady over FLIP_STEADY_MS, with hysteresis; no (or stale) data = upright. */
export class FlipDetector {
  private samples: { t: number; y: number }[] = []
  private down = false

  add(t: number, y: number): void {
    this.samples.push({ t, y })
    while (this.samples.length && t - this.samples[0].t > FLIP_STEADY_MS) this.samples.shift()
    if (this.samples.length < FLIP_MIN_SAMPLES || t - this.samples[0].t < FLIP_STEADY_MS * 0.8) return
    const avg = this.samples.reduce((sum, x) => sum + x.y, 0) / this.samples.length
    if (!this.down && avg < FLIP_ENTER_Y) this.down = true
    else if (this.down && avg > FLIP_EXIT_Y) this.down = false
  }

  upsideDown(now: number): boolean {
    const last = this.samples[this.samples.length - 1]
    if (!last || now - last.t > FLIP_STALE_MS) return false
    return this.down
  }

  /** The rule's state at its last sample (for the debug line). */
  lastState(): boolean {
    return this.down
  }

  lastY(): number | null {
    return this.samples.length ? this.samples[this.samples.length - 1].y : null
  }
}

let detector = new FlipDetector()

/** From the devicemotion listener: the raw accelerationIncludingGravity.y. */
export function noteGravity(t: number, rawY: number): void {
  detector.add(t, specY(rawY, webKitSpeech()))
}

/** A new run starts with no orientation data. */
export function resetFlip(): void {
  detector = new FlipDetector()
}

/** Turn the next captured frame? ?flip=1 / ?flip=0 win over the motion rule. */
export function frameUpsideDown(now: number, override: boolean | null = FLIP_OVERRIDE): boolean {
  return override ?? detector.upsideDown(now)
}

/** Debug line: "upright / upside down (auto|forced)" and the last gravity reading. */
export function flipDebug(): { upsideDown: boolean; source: 'auto' | 'forced'; y: number | null } {
  return { upsideDown: FLIP_OVERRIDE ?? detector.lastState(), source: FLIP_OVERRIDE === null ? 'auto' : 'forced', y: detector.lastY() }
}

/** 180-degree turn of RGBA pixels in place: reversing the pixel order (32 bits each) is exactly that. */
export function rotate180(data: Uint8ClampedArray): void {
  new Uint32Array(data.buffer, data.byteOffset, data.byteLength / 4).reverse()
}

/** A box found on a turned frame (0..1000 grid), mapped back onto the live preview (which is not turned). */
export function flipBox([x1, y1, x2, y2]: Box): Box {
  return [1000 - x2, 1000 - y2, 1000 - x1, 1000 - y1]
}
