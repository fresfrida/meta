// On-device face detector: OpenCV YuNet (2023mar, MIT, public/models/) on onnxruntime-web (wasm, bundled; no CDN).
// The model takes a fixed 640 x 640 BGR image. Our frames are at most 640 on the long side, so they are placed
// top-left at full resolution and the rest is zero padding - small, distant faces keep every pixel.
import type { Pixels } from './faceBlur'
import type { DetectedFace, FaceDetector } from './faceGuard'

export const YUNET_SIZE = 640
export const YUNET_MODEL_URL = '/models/face_detection_yunet_2023mar.onnx'
const STRIDES = [8, 16, 32] as const
const NMS_IOU = 0.3

/** RGBA pixels -> BGR float32 NCHW (0..255, as OpenCV's blobFromImage), padded to size x size. Downscales if larger. */
export function toBgrTensor(px: Pixels, size = YUNET_SIZE): { data: Float32Array; scale: number } {
  const scale = Math.min(1, size / Math.max(px.width, px.height))
  const w = Math.round(px.width * scale)
  const h = Math.round(px.height * scale)
  const plane = size * size
  const data = new Float32Array(3 * plane)
  for (let y = 0; y < h; y++) {
    const sy = Math.min(px.height - 1, Math.floor(y / scale))
    for (let x = 0; x < w; x++) {
      const sx = Math.min(px.width - 1, Math.floor(x / scale))
      const i = (sy * px.width + sx) * 4
      const o = y * size + x
      data[o] = px.data[i + 2] // B
      data[plane + o] = px.data[i + 1] // G
      data[2 * plane + o] = px.data[i] // R
    }
  }
  return { data, scale }
}

export type YunetOutputs = Record<string, Float32Array>

/** YuNet heads -> faces in model pixels (as OpenCV FaceDetectorYN decodes them): score = sqrt(cls * obj). */
export function decodeYunet(out: YunetOutputs, minScore: number, size = YUNET_SIZE): DetectedFace[] {
  const faces: DetectedFace[] = []
  for (const s of STRIDES) {
    const cols = size / s
    const cls = out[`cls_${s}`]
    const obj = out[`obj_${s}`]
    const bbox = out[`bbox_${s}`]
    for (let idx = 0; idx < cls.length; idx++) {
      const c = Math.min(1, Math.max(0, cls[idx]))
      const o = Math.min(1, Math.max(0, obj[idx]))
      const score = Math.sqrt(c * o)
      if (score < minScore) continue
      const row = Math.floor(idx / cols)
      const col = idx % cols
      const cx = (col + bbox[idx * 4]) * s
      const cy = (row + bbox[idx * 4 + 1]) * s
      const w = Math.exp(bbox[idx * 4 + 2]) * s
      const h = Math.exp(bbox[idx * 4 + 3]) * s
      faces.push({ x: cx - w / 2, y: cy - h / 2, w, h, score })
    }
  }
  return faces
}

function iou(a: DetectedFace, b: DetectedFace): number {
  const x0 = Math.max(a.x, b.x)
  const y0 = Math.max(a.y, b.y)
  const x1 = Math.min(a.x + a.w, b.x + b.w)
  const y1 = Math.min(a.y + a.h, b.y + b.h)
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0)
  return inter / (a.w * a.h + b.w * b.h - inter || 1)
}

/** Non-maximum suppression: keep the best of overlapping boxes. */
export function nms(faces: DetectedFace[], threshold = NMS_IOU): DetectedFace[] {
  const kept: DetectedFace[] = []
  for (const f of [...faces].sort((a, b) => b.score - a.score)) if (kept.every((k) => iou(k, f) <= threshold)) kept.push(f)
  return kept
}

/** Loads the runtime and model (both served by this app). Rejects if anything fails, so the guard fails open. */
export async function loadYunet(minScore: number): Promise<FaceDetector> {
  const [ort, wasm] = await Promise.all([
    import('onnxruntime-web/wasm'),
    import('onnxruntime-web/ort-wasm-simd-threaded.wasm?url'),
  ])
  ort.env.wasm.wasmPaths = { wasm: wasm.default }
  ort.env.wasm.numThreads = 1 // no cross-origin isolation on the dev server
  const session = await ort.InferenceSession.create(YUNET_MODEL_URL, { executionProviders: ['wasm'] })
  return {
    async detect(px: Pixels): Promise<DetectedFace[]> {
      const { data, scale } = toBgrTensor(px)
      const input = new ort.Tensor('float32', data, [1, 3, YUNET_SIZE, YUNET_SIZE])
      const result = await session.run({ [session.inputNames[0]]: input })
      const out: YunetOutputs = {}
      for (const name of session.outputNames) out[name] = result[name].data as Float32Array
      return nms(decodeYunet(out, minScore)).map((f) => ({ ...f, x: f.x / scale, y: f.y / scale, w: f.w / scale, h: f.h / scale }))
    },
  }
}
