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

/**
 * Fast warning (Brief 11): every frame also goes to SAM 3.1 (/api/detect, ~1-2 s), which warns first about steps
 * and kerbs; Muse (/api/analyze, ~4 s) gets every DETAIL_EVERY-th frame and adds up/down, obstacles and metres.
 * Turn it off (Muse only, as before) with `?fast=0`.
 */
export const FAST_ENABLED = readFlag('fast', true)
/** With the fast channel on, the next capture starts this long after the previous one started. */
export const FAST_STAGGER_MS = 900
/** At most this many /api/detect requests in flight; the loop waits for one to finish. */
export const FAST_MAX_IN_FLIGHT = 2
/** Every this-many-th frame also goes to Muse (so Muse keeps its ~1.8 s spacing and cost). */
export const DETAIL_EVERY = 2
/** A Muse "clear" or "not sure" does not replace a fast warning younger than this. */
export const SAM_HOLD_MS = 3_000
/** A SAM hit below this confidence is said as "There might be ..." (hits below SAM_MIN_CONF 0.5 are dropped). */
export const SAM_SURE_CONF = 0.7
/** A fast hit stays silent when its kind was spoken less than this long ago and it is not closer (merge.ts). */
export const FAST_REPEAT_MS = 10_000
/** Abort a /api/detect request after this long (the backend gives each SAM request 4 s). */
export const DETECT_REQUEST_TIMEOUT_MS = 6_000
/** Fast warning cue before its phrase: one short tone, and a vibration where the browser supports it (TENTATIVE). */
export const WARN_TONE_HZ = 880
export const WARN_TONE_MS = 90
export const WARN_VIBRATE_MS = 120

/**
 * Heartbeat (Brief 13): a soft short tick each time a fresh answer arrives (either channel) and nothing is spoken,
 * so silence never means "dropped out". Quieter and lower than the fast cue. Not while speaking or during Ask.
 * TENTATIVE sound; at most one tick per HEARTBEAT_MIN_GAP_MS (the two channels can answer together).
 */
export const TICK_HZ = 330
export const TICK_MS = 35
export const TICK_GAIN = 0.05
export const HEARTBEAT_MIN_GAP_MS = 700
/** Connection alert: no answer on any channel for this long while running -> "Connection lost" (spoken, shown). */
export const CONNECTION_LOST_MS = 6_000
/** The lost line is said again this often until an answer arrives; then "Back online" once. */
export const CONNECTION_REPEAT_MS = 10_000
export const CONNECTION_CHECK_MS = 500
/** Talk more (Settings, off by default): repeat the current warning, or the clear sentence, about this often. */
export const TALK_MORE_DEFAULT = false
export const TALK_MORE_STORAGE_KEY = 'second-eyes.talkmore'
export const TALK_MORE_MS = 4_000

/**
 * Path guide (Brief 15, TENTATIVE design): two faint static hairlines from the bottom corners of the walking path
 * to the horizon, under the phrase card and under any hazard box. The geometry matches the backend's path rule
 * (backend/app/config.py: PATH_HALF_WIDTH_M, CAMERA_HEIGHT_M, VFOV_*): keep the numbers in step.
 */
export const PATH_GUIDE = true
export const PATH_HALF_WIDTH_M = 0.75
export const CAMERA_HEIGHT_M = 1.3
export const VFOV_PORTRAIT_DEG = 67
export const VFOV_LANDSCAPE_DEG = 53

/**
 * Distance at speaking time (Brief 16): metres are said as "metres at capture - walking speed x time since capture",
 * so a 4 m answer that arrives 4 s later is not said as 4 m. Walking speed applies only while the phone detects
 * walking (DeviceMotion); with no motion data it assumes walking (says closer, never further).
 */
export const WALK_SPEED_M_S = 0.8 // typical for cane users
export const WALK_WINDOW_MS = 2_000
/** Variance of the acceleration magnitude, (m/s^2)^2, over WALK_WINDOW_MS above which the phone counts as walking. */
export const WALK_ACCEL_VAR = 0.3
/** An answer whose distance has already been walked is said as "very close" only if younger than this; else dropped. */
export const STALE_MS = 6_000

/**
 * Side hysteresis (Brief 16b): once a side has been spoken for a kind of hazard, it changes only when the box centre
 * is past the side line by SIDE_HYST grid points (0..1000). The lines match the backend's LEFT_MAX / RIGHT_MIN.
 */
export const SIDE_LEFT_MAX = 400
export const SIDE_RIGHT_MIN = 600
export const SIDE_HYST = 50

/** Traffic light: a warning this close (metres) or nearer is red; further is amber. */
export const RED_MAX_M = 2

/** Mic test page (`?mictest=1`): speak a test sentence this often. */
export const MIC_TEST = readFlag('mictest', false)
export const MIC_TEST_INTERVAL_MS = 3_000

/** The hazard box fades out when no new answer has arrived for this long. */
export const BOX_STALE_MS = 2_000

/** Hands-free "Hey Eyes" listening is on by default (Settings can turn it off; off = touch-and-hold only). */
export const HANDS_FREE_DEFAULT = true
export const HANDS_FREE_STORAGE_KEY = 'second-eyes.handsfree'
/** Microphone audio sent to the backend: PCM16 mono at this rate, in frames of MIC_FRAME_MS. */
export const MIC_SAMPLE_RATE = 16_000
export const MIC_FRAME_MS = 80
/** Mic frames are not sent while the phone speaks, nor for this long after, so it does not hear itself. */
export const SELF_SPEECH_TAIL_MS = 300
/** Touch and hold the camera view this long to ask without the wake phrase. */
export const HOLD_TO_ASK_MS = 600
/** After the wake phrase alone, wait this long for the question (matches the backend's ASK_WINDOW_MS). */
export const ASK_WINDOW_MS = 6_000
/** After a hold ends, the question may still arrive for this long (matches ASK_HOLD_TAIL_MS). */
export const ASK_HOLD_TAIL_MS = 3_000
/** Give up on an answer after this long. */
export const ASK_TIMEOUT_MS = 15_000
/** The answer stays on the card this long after it is spoken. */
export const ASK_SHOW_MS = 8_000

/** Earcon when the phone starts listening for a question: two rising tones (TENTATIVE). */
export const EARCON_TONES_HZ = [660, 990] as const
export const EARCON_TONE_MS = 110
export const EARCON_GAIN = 0.2

/** Face blur (always on): each detected face box is grown by this fraction on every side before blurring. */
export const FACE_PAD = 0.2
/** The blurred area becomes a mosaic this many cells across its longer side (4 = no face is recognisable). */
export const FACE_MOSAIC_CELLS = 4
/** Detections below this confidence are ignored. Low on purpose: blurring a non-face costs little, a missed face
 *  leaks one. Owner chose 0.2 (4 Nov 2026) after the CC0 crowd test (0.2 found more faces than 0.3). */
export const FACE_MIN_SCORE = 0.2
/** Wait at most this long for the face model before the first frame; after that frames go unblurred (fail-open). */
export const FACE_LOAD_TIMEOUT_MS = 8_000

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
