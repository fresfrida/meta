// The face guard: every frame that leaves the phone (hazard loop and Ask) passes through here first.
// Faces are found on the device and blurred. If the detector cannot load or errors, the frame still goes
// (hazard warnings matter more) and the status turns "off" - visibly, never silently.
import { FACE_LOAD_TIMEOUT_MS, FACE_MIN_SCORE } from '../config'
import { type FaceBox, type Pixels, blurFaces } from './faceBlur'

export type FaceBlurStatus = 'loading' | 'on' | 'off'

export interface DetectedFace extends FaceBox {
  score: number
}

export interface FaceDetector {
  detect(pixels: Pixels): Promise<DetectedFace[]>
}

export type FaceDetectorLoader = () => Promise<FaceDetector>

/** No model bundled: always fails, so frames go unblurred with the status "off". Replaced by the real loader. */
const noModel: FaceDetectorLoader = () => Promise.reject(new Error('no face model bundled'))

let loader: FaceDetectorLoader = noModel
let detector: Promise<FaceDetector> | null = null
let status: FaceBlurStatus = 'loading'
const listeners = new Set<() => void>()

function setStatus(next: FaceBlurStatus): void {
  if (next === status) return
  status = next
  listeners.forEach((l) => l())
}

export function getFaceBlurStatus(): FaceBlurStatus {
  return status
}

/** For useSyncExternalStore. */
export function subscribeFaceBlur(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setFaceDetectorLoader(next: FaceDetectorLoader): void {
  loader = next
  detector = null
  setStatus('loading')
}

/** Starts loading the model (on Start), so the first frame does not wait for the download. */
export function warmUpFaceDetector(): void {
  if (!detector) {
    detector = loader()
    detector.catch((err) => {
      console.warn('face blur off: detector failed to load', err)
      setStatus('off')
      detector = null // the next Start tries again
    })
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`face model not ready after ${ms} ms`)), ms)
    promise.then(
      (v) => (clearTimeout(timer), resolve(v)),
      (e) => (clearTimeout(timer), reject(e)),
    )
  })
}

export interface GuardResult {
  status: Exclude<FaceBlurStatus, 'loading'>
  /** Face boxes blurred (padded). */
  blurred: FaceBox[]
}

/** Finds and blurs faces in place. Never throws: on any failure the pixels are left as they are, status "off". */
export async function guardPixels(pixels: Pixels, timeoutMs = FACE_LOAD_TIMEOUT_MS): Promise<GuardResult> {
  warmUpFaceDetector()
  try {
    const d = await withTimeout(detector!, timeoutMs)
    const faces = (await d.detect(pixels)).filter((f) => f.score >= FACE_MIN_SCORE)
    const blurred = blurFaces(pixels, faces)
    setStatus('on')
    return { status: 'on', blurred }
  } catch (err) {
    console.warn('face blur off for this frame', err)
    setStatus('off')
    return { status: 'off', blurred: [] }
  }
}
