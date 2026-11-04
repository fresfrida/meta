// Distance at speaking time (Brief 16): one rule, one file. The person keeps walking while the answer is on its
// way, so the metres said are the metres at capture minus the distance walked since.
import { type Shown, isWarning } from './phrase'

export type AtSpeaking =
  | { drop: false; shown: Shown; capturedM: number | null; nowM: number | null }
  | { drop: true; capturedM: number }

/**
 * - No metres (clear, unsure, near / far only): unchanged.
 * - Walked = speed x seconds since capture (speed 0 when the phone is still).
 * - Already walked past it: "very close" if the answer is younger than `staleMs`, else dropped.
 * - Left after rounding <= 1 m: "very close" (no metres, red) - never a zero or negative figure.
 * - Otherwise: the rounded metres left.
 */
export function atSpeakingTime(
  shown: Shown,
  captureAt: number,
  now: number,
  walking: boolean,
  speedMS: number,
  staleMs: number,
): AtSpeaking {
  const m = shown.distance_m
  if (!isWarning(shown) || m === null) return { drop: false, shown, capturedM: m, nowM: m }
  const walked = walking ? (speedMS * (now - captureAt)) / 1000 : 0
  const left = m - walked
  const veryClose = { drop: false as const, shown: { ...shown, distance: 'near' as const, distance_m: null }, capturedM: m, nowM: null }
  if (left < 0) return now - captureAt < staleMs ? veryClose : { drop: true, capturedM: m }
  const whole = Math.round(left)
  if (whole <= 1) return veryClose
  return { drop: false, shown: { ...shown, distance_m: whole }, capturedM: m, nowM: whole }
}
