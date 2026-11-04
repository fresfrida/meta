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

/** Brief 26 debug: where the time of the last answer went, ms (wait / speech null when it was not spoken). */
export interface StageTimes {
  channel: 'fast' | 'detail'
  /** drawImage + getImageData. */
  captureMs: number
  /** Face detector + blur. */
  blurMs: number
  encodeMs: number
  /** Capture start to request sent, minus the three above: waiting (in-flight limit, the detector busy with another frame). */
  queueMs: number
  /** Upload + download + server overhead: round trip minus the model's own time. */
  netMs: number
  modelMs: number
  /** Answer received to speak() called (merge and repeat rules, the fast cue). */
  waitMs: number | null
  /** speak() called to speech onstart (includes the WebKit cancel gap when it interrupts). */
  speechMs: number | null
}

export interface StageMarks {
  captureStart: number
  requestSent: number
  responseReceived: number
  serverMs: number
  frame: { drawMs: number; readMs: number; detectMs: number; encodeMs: number }
}

export function stageTimes(channel: 'fast' | 'detail', m: StageMarks, sayAt: number | null = null, speechStart: number | null = null): StageTimes {
  const captureMs = m.frame.drawMs + m.frame.readMs
  const frameMs = Math.round(m.requestSent - m.captureStart)
  const roundTrip = m.responseReceived - m.requestSent
  return {
    channel,
    captureMs,
    blurMs: m.frame.detectMs,
    encodeMs: m.frame.encodeMs,
    queueMs: Math.max(0, frameMs - captureMs - m.frame.detectMs - m.frame.encodeMs),
    netMs: Math.max(0, Math.round(roundTrip - m.serverMs)),
    modelMs: Math.round(m.serverMs),
    waitMs: sayAt === null ? null : Math.round(sayAt - m.responseReceived),
    speechMs: sayAt === null || speechStart === null ? null : Math.round(speechStart - sayAt),
  }
}
