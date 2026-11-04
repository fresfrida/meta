// Capture-to-speech timing marks and summary stats.

export interface TimingMarks {
  captureStart: number
  requestSent: number
  responseReceived: number
  speechStart: number
  modelMs: number
}

export interface TimingRecord {
  totalMs: number
  frameMs: number
  roundTripMs: number
  modelMs: number
  speechMs: number
}

export interface TimingStats {
  min: number
  median: number
  max: number
}

export function toRecord(m: TimingMarks): TimingRecord {
  return {
    totalMs: Math.round(m.speechStart - m.captureStart),
    frameMs: Math.round(m.requestSent - m.captureStart),
    roundTripMs: Math.round(m.responseReceived - m.requestSent),
    modelMs: Math.round(m.modelMs),
    speechMs: Math.round(m.speechStart - m.responseReceived),
  }
}

export function stats(values: readonly number[]): TimingStats | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const median =
    sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid]
  return { min: sorted[0], median, max: sorted[sorted.length - 1] }
}

/** Newest first, capped at `size`. */
export function pushHistory<T>(history: readonly T[], item: T, size: number): T[] {
  return [item, ...history].slice(0, size)
}
