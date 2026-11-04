// Face blur on pixels: pad each face box, then replace it with a coarse mosaic. Pure functions on RGBA pixels.
import { FACE_MOSAIC_CELLS, FACE_PAD } from '../config'

/** Pixels in the frame. */
export interface FaceBox {
  x: number
  y: number
  w: number
  h: number
}

/** RGBA pixels, like ImageData (also works on a plain object in tests). */
export interface Pixels {
  data: Uint8ClampedArray
  width: number
  height: number
}

/** Grows a box by `pad` (fraction of its size) on every side, clipped to the frame, in whole pixels. */
export function padBox(box: FaceBox, pad: number, width: number, height: number): FaceBox {
  const x0 = Math.max(0, Math.floor(box.x - box.w * pad))
  const y0 = Math.max(0, Math.floor(box.y - box.h * pad))
  const x1 = Math.min(width, Math.ceil(box.x + box.w * (1 + pad)))
  const y1 = Math.min(height, Math.ceil(box.y + box.h * (1 + pad)))
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) }
}

/** Replaces the box with square cells of its average colour; `cells` across the longer side. */
export function mosaic(img: Pixels, box: FaceBox, cells: number): void {
  if (box.w <= 0 || box.h <= 0) return
  const cell = Math.max(2, Math.ceil(Math.max(box.w, box.h) / cells))
  const { data, width } = img
  for (let cy = box.y; cy < box.y + box.h; cy += cell) {
    for (let cx = box.x; cx < box.x + box.w; cx += cell) {
      const x1 = Math.min(cx + cell, box.x + box.w)
      const y1 = Math.min(cy + cell, box.y + box.h)
      const sum = [0, 0, 0, 0]
      for (let y = cy; y < y1; y++) for (let x = cx; x < x1; x++) for (let c = 0; c < 4; c++) sum[c] += data[(y * width + x) * 4 + c]
      const n = (x1 - cx) * (y1 - cy)
      for (let y = cy; y < y1; y++) for (let x = cx; x < x1; x++) for (let c = 0; c < 4; c++) data[(y * width + x) * 4 + c] = Math.round(sum[c] / n)
    }
  }
}

/** Blurs every face (padded); returns the boxes actually blurred. Everything outside them is untouched. */
export function blurFaces(img: Pixels, faces: FaceBox[], pad = FACE_PAD, cells = FACE_MOSAIC_CELLS): FaceBox[] {
  const boxes = faces.map((f) => padBox(f, pad, img.width, img.height)).filter((b) => b.w > 0 && b.h > 0)
  for (const b of boxes) mosaic(img, b, cells)
  return boxes
}
