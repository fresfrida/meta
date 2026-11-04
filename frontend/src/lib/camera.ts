// Rear camera access and single-frame capture.
import { CAMERA_IDEAL_HEIGHT, CAMERA_IDEAL_WIDTH, FRAME_LONG_EDGE_PX, JPEG_QUALITY } from '../config'
import { type FaceBlurStatus, guardPixels } from './faceGuard'

export type CameraFailure = 'denied' | 'unavailable' | 'insecure'

export class CameraError extends Error {
  readonly failure: CameraFailure
  constructor(failure: CameraFailure, message: string) {
    super(message)
    this.failure = failure
  }
}

export async function openRearCamera(): Promise<MediaStream> {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw new CameraError('insecure', 'getUserMedia needs a secure context')
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: CAMERA_IDEAL_WIDTH },
        height: { ideal: CAMERA_IDEAL_HEIGHT },
      },
    })
  } catch (err) {
    const name = err instanceof DOMException ? err.name : ''
    const denied = name === 'NotAllowedError' || name === 'SecurityError'
    throw new CameraError(denied ? 'denied' : 'unavailable', String(err))
  }
}

export function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop())
}

/** The frame exactly as it leaves the phone. */
export interface SentFrame {
  /** Base64 JPEG, no data: prefix (what the backend gets). */
  imageB64: string
  /** The same JPEG as a data URL (the thumbnail in the timing panel). */
  dataUrl: string
  /** Face blur on this frame: "on" (detector ran) or "off" (failed open: sent unblurred). */
  blur: Exclude<FaceBlurStatus, 'loading'>
  faces: number
  /** Time spent finding and blurring faces. */
  blurMs: number
}

/**
 * Grabs the current video frame, downscaled to FRAME_LONG_EDGE_PX, finds and blurs faces on it (only this
 * captured frame, never the live preview), and encodes it as JPEG. Every frame sent to the backend comes from here.
 */
export async function captureGuarded(video: HTMLVideoElement): Promise<SentFrame> {
  const { videoWidth: w, videoHeight: h } = video
  if (!w || !h) throw new CameraError('unavailable', 'video has no frame yet')
  const scale = Math.min(1, FRAME_LONG_EDGE_PX / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * scale)
  canvas.height = Math.round(h * scale)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new CameraError('unavailable', 'no 2d canvas context')
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  const started = performance.now()
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const guard = await guardPixels(pixels)
  if (guard.blurred.length) ctx.putImageData(pixels, 0, 0)
  const blurMs = Math.round(performance.now() - started)
  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
  return { imageB64: dataUrl.slice(dataUrl.indexOf(',') + 1), dataUrl, blur: guard.status, faces: guard.blurred.length, blurMs }
}
