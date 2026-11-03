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
