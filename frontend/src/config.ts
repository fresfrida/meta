// Tunable values for the frontend. One place for every knob.

export const API_BASE = '/api'

/** Longest edge of the frame sent to the backend, in pixels. Never upscaled. */
export const FRAME_LONG_EDGE_PX = 640
/** JPEG quality for the captured frame, 0..1. */
export const JPEG_QUALITY = 0.7

/** Abort a backend request after this long. */
export const REQUEST_TIMEOUT_MS = 10_000
/** If speech has not started this long after speak(), count it as failed. */
export const SPEECH_START_TIMEOUT_MS = 3_000
export const SPEECH_RATE = 1.0
export const SPEECH_LANG = 'en-US'

/** How many captures the on-screen timing list keeps. */
export const TIMING_HISTORY_SIZE = 10

/** Preferred camera resolution request (the browser may give less). */
export const CAMERA_IDEAL_WIDTH = 1280
export const CAMERA_IDEAL_HEIGHT = 720
