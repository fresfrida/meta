// Rear camera access and single-frame capture.
import { CAMERA_ASPECT, CAMERA_IDEAL_HEIGHT, CAMERA_IDEAL_WIDTH, FRAME_LONG_EDGE_PX, JPEG_QUALITY } from '../config'
import { type FaceBlurStatus, guardPixels } from './faceGuard'

export type CameraFailure = 'denied' | 'unavailable' | 'insecure'

export class CameraError extends Error {
  readonly failure: CameraFailure
  constructor(failure: CameraFailure, message: string) {
    super(message)
    this.failure = failure
  }
}

/** The camera request (Brief 26): the same 16:9 shape on every phone, "ideal" so no phone refuses it. */
export function cameraConstraints(deviceId?: string): MediaTrackConstraints {
  return {
    ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } }),
    width: { ideal: CAMERA_IDEAL_WIDTH },
    height: { ideal: CAMERA_IDEAL_HEIGHT },
    aspectRatio: { ideal: CAMERA_ASPECT },
  }
}

export function isUltraWide(label: string): boolean {
  return /ultra\s*wide|0\.5x/i.test(label)
}

interface DeviceLike {
  deviceId: string
  kind: string
  label: string
}

/**
 * The rear main (1x) camera to switch to, or null to keep the one the browser chose. Only when the browser chose an
 * ultra-wide and names its lenses (iPhone: "Back Camera", "Back Ultra Wide Camera", ...); Android labels such as
 * "camera2 0, facing back" never match, so Android keeps its camera.
 */
export function mainCameraId(currentLabel: string, devices: readonly DeviceLike[]): string | null {
  if (!isUltraWide(currentLabel)) return null
  const rear = devices.filter(
    (d) => d.kind === 'videoinput' && /back|rear|environment/i.test(d.label) && !isUltraWide(d.label) && !/tele/i.test(d.label),
  )
  const main = rear.find((d) => /^back camera$/i.test(d.label.trim())) ?? rear.find((d) => !/dual|triple/i.test(d.label)) ?? rear[0]
  return main?.deviceId ?? null
}

// ----- What the camera actually gives (Brief 26 debug line) -----

export interface CameraInfo {
  /** track.getSettings(): the camera's own size (often landscape even when the phone is upright). */
  width: number | null
  height: number | null
  aspectRatio: number | null
  zoom: number | null
  facingMode: string | null
  label: string
  /** The frame the app captures from (video.videoWidth / videoHeight, upright). */
  frameWidth: number | null
  frameHeight: number | null
  /** The browser first chose an ultra-wide; the app switched to the main camera. */
  switched: boolean
}

let info: CameraInfo | null = null
const infoListeners = new Set<() => void>()

function setInfo(next: CameraInfo | null): void {
  info = next
  infoListeners.forEach((l) => l())
}

export function cameraInfo(): CameraInfo | null {
  return info
}

export function onCameraInfo(listener: () => void): () => void {
  infoListeners.add(listener)
  return () => {
    infoListeners.delete(listener)
  }
}

function readInfo(stream: MediaStream, switched: boolean): CameraInfo {
  const track = stream.getVideoTracks()[0]
  const st = (track?.getSettings?.() ?? {}) as MediaTrackSettings & { zoom?: number }
  return {
    width: st.width ?? null,
    height: st.height ?? null,
    aspectRatio: st.aspectRatio ?? (st.width && st.height ? st.width / st.height : null),
    zoom: st.zoom ?? null,
    facingMode: st.facingMode ?? null,
    label: track?.label ?? '',
    frameWidth: null,
    frameHeight: null,
    switched,
  }
}

/** Not 16:9 (either way up), within 2 %: the app keeps working, and the field of view follows the real aspect. */
export function isSixteenNine(w: number, h: number): boolean {
  const aspect = Math.max(w, h) / Math.min(w, h)
  return Math.abs(aspect - CAMERA_ASPECT) / CAMERA_ASPECT < 0.02
}

async function getVideo(constraints: MediaTrackConstraints): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: false, video: constraints })
  } catch (err) {
    const name = err instanceof DOMException ? err.name : ''
    const denied = name === 'NotAllowedError' || name === 'SecurityError'
    throw new CameraError(denied ? 'denied' : 'unavailable', String(err))
  }
}

export async function openRearCamera(): Promise<MediaStream> {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw new CameraError('insecure', 'getUserMedia needs a secure context')
  }
  let stream = await getVideo(cameraConstraints())
  let switched = false
  const label = stream.getVideoTracks()[0]?.label ?? ''
  let id: string | null = null
  if (isUltraWide(label)) {
    try {
      id = mainCameraId(label, await navigator.mediaDevices.enumerateDevices())
    } catch (err) {
      console.warn('[camera] could not list cameras; keeping the first one', err)
    }
  }
  if (id) {
    stopStream(stream) // phones open one camera at a time
    try {
      stream = await getVideo(cameraConstraints(id))
      switched = true
    } catch {
      stream = await getVideo(cameraConstraints()) // the main camera would not open: back to what we had
    }
  }
  const next = readInfo(stream, switched)
  if (next.width && next.height && !isSixteenNine(next.width, next.height)) {
    console.info(`[camera] asked for 16:9, got ${next.width} x ${next.height}; distances use the real aspect`)
  }
  setInfo(next)
  return stream
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
  /** Brief 26 debug: the stages of this capture, ms. */
  stages: CaptureStages
}

export interface CaptureStages {
  /** drawImage of the video frame onto the canvas. */
  drawMs: number
  /** getImageData (pixels for the face detector). */
  readMs: number
  /** Face detector + blur (putImageData when faces were found). */
  detectMs: number
  /** JPEG encode (toDataURL). */
  encodeMs: number
}

/**
 * Grabs the current video frame, downscaled to FRAME_LONG_EDGE_PX, finds and blurs faces on it (only this
 * captured frame, never the live preview), and encodes it as JPEG. Every frame sent to the backend comes from here.
 */
export async function captureGuarded(video: HTMLVideoElement): Promise<SentFrame> {
  const { videoWidth: w, videoHeight: h } = video
  if (!w || !h) throw new CameraError('unavailable', 'video has no frame yet')
  if (info && (info.frameWidth !== w || info.frameHeight !== h)) setInfo({ ...info, frameWidth: w, frameHeight: h })
  const scale = Math.min(1, FRAME_LONG_EDGE_PX / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * scale)
  canvas.height = Math.round(h * scale)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new CameraError('unavailable', 'no 2d canvas context')
  const t0 = performance.now()
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  const started = performance.now()
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const read = performance.now()
  const guard = await guardPixels(pixels)
  if (guard.blurred.length) ctx.putImageData(pixels, 0, 0)
  const blurred = performance.now()
  const blurMs = Math.round(blurred - started)
  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
  const stages = {
    drawMs: Math.round(started - t0),
    readMs: Math.round(read - started),
    detectMs: Math.round(blurred - read),
    encodeMs: Math.round(performance.now() - blurred),
  }
  return { imageB64: dataUrl.slice(dataUrl.indexOf(',') + 1), dataUrl, blur: guard.status, faces: guard.blurred.length, blurMs, stages }
}

/**
 * Brief 27: resolves when the video has a frame to capture (or after `maxMs`), so the first capture of a run does not
 * fail on an empty video and wait a whole loop step for the next one.
 */
export function firstFrame(video: Pick<HTMLVideoElement, 'videoWidth' | 'addEventListener' | 'removeEventListener'>, maxMs: number): Promise<void> {
  if (video.videoWidth > 0) return Promise.resolve()
  const events = ['loadedmetadata', 'loadeddata', 'resize'] as const
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer)
      events.forEach((e) => video.removeEventListener(e, check))
      resolve()
    }
    const check = () => video.videoWidth > 0 && done()
    const timer = setTimeout(done, maxMs)
    events.forEach((e) => video.addEventListener(e, check))
  })
}
