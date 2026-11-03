// Tunable values for the frontend. One place for every knob.

export const API_BASE = '/api'

/** Longest edge of the frame sent to the backend, in pixels. Never upscaled. */
export const FRAME_LONG_EDGE_PX = 640
/** JPEG quality for the captured frame, 0..1. */
export const JPEG_QUALITY = 0.7

/** Abort a backend request after this long (the backend gives the model 10 s). */
export const REQUEST_TIMEOUT_MS = 12_000
/** Show "model is slow" when an answer takes longer than this. */
export const MODEL_SLOW_MS = 6_000
/** If speech has not started this long after speak(), count it as failed. */
export const SPEECH_START_TIMEOUT_MS = 3_000
export const SPEECH_RATE = 1.0
/** Spoken languages and the speech lang each uses. The first is the default. */
export const LANGS = ['en', 'zh', 'ms', 'ta'] as const
export type Lang = (typeof LANGS)[number]
export const SPEECH_LANGS: Record<Lang, string> = { en: 'en-GB', zh: 'zh-CN', ms: 'ms-MY', ta: 'ta-IN' }
/** localStorage key for the chosen language. */
export const LANG_STORAGE_KEY = 'second-eyes.lang'

/**
 * Loop mode: after Start, capture continuously, one request in flight at most.
 * Turn it off (single Capture button, as in Brief 1) with `?loop=0` in the page URL.
 */
export const LOOP_ENABLED = readFlag('loop', true)
/** At most this many requests in flight at once. */
export const MAX_IN_FLIGHT = 2
/** The next capture starts this long after the previous one started (about half the live median). */
export const LOOP_STAGGER_MS = 1_750
/** No-repeat rule: never start speaking within this long of the last speech. */
export const MIN_GAP_MS = 1_500
/** With metres, the same hazard and side is spoken again only once it is at least this many metres closer. */
export const REPEAT_CLOSER_M = 2

/** Traffic light: a warning this close (metres) or nearer is red; further is amber. */
export const RED_MAX_M = 2

/** Mic test page (`?mictest=1`): speak a test sentence this often. */
export const MIC_TEST = readFlag('mictest', false)
export const MIC_TEST_INTERVAL_MS = 3_000

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
