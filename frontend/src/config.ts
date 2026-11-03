// Tunable values for the frontend. One place for every knob.

export const API_BASE = '/api'

/** Longest edge of the frame sent to the backend, in pixels. Never upscaled. */
export const FRAME_LONG_EDGE_PX = 640
/** JPEG quality for the captured frame, 0..1. */
export const JPEG_QUALITY = 0.7

/** Abort a backend request after this long. */
export const REQUEST_TIMEOUT_MS = 10_000
/** Show "model is slow" when an answer takes longer than this. */
export const MODEL_SLOW_MS = 3_000
/** If speech has not started this long after speak(), count it as failed. */
export const SPEECH_START_TIMEOUT_MS = 3_000
export const SPEECH_RATE = 1.0
export const SPEECH_LANG = 'en-US'

/**
 * Loop mode: after Start, capture continuously, one request in flight at most.
 * Turn it off (single Capture button, as in Brief 1) with `?loop=0` in the page URL.
 */
export const LOOP_ENABLED = readFlag('loop', true)
/** Wait this long after an answer (or failure) before the next capture. */
export const LOOP_INTERVAL_MS = 1_000
/** No-repeat rule: never start speaking within this long of the last speech. */
export const MIN_GAP_MS = 1_500

/** The hazard box fades out when no new answer has arrived for this long. */
export const BOX_STALE_MS = 2_000

/** How many captures the on-screen timing list keeps. */
export const TIMING_HISTORY_SIZE = 10

/** Preferred camera resolution request (the browser may give less). */
export const CAMERA_IDEAL_WIDTH = 1280
export const CAMERA_IDEAL_HEIGHT = 720

function readFlag(name: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback
  const value = new URLSearchParams(window.location.search).get(name)
  if (value === '0' || value === 'false') return false
  if (value === '1' || value === 'true') return true
  return fallback
}
