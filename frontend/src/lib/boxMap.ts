// The one rule that maps a model box (0..1000 frame grid) onto the displayed video element.
import type { Box } from '../api/types'

export const BOX_GRID_MAX = 1000

export interface Size {
  width: number
  height: number
}

/** Pixels, relative to the video element's top-left corner. */
export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

/** The CSS object-fit values the video can use. object-position is assumed to be the default (centre). */
export type Fit = 'cover' | 'contain' | 'fill'

/**
 * Maps a box on the captured frame to the element showing that frame, with the same crop or letterbox
 * the browser applies for `fit` (centred). The result is clipped to the element; null when nothing of
 * the box is visible (it is in the cropped-away part) or a size is zero.
 */
export function mapBox(box: Box, frame: Size, view: Size, fit: Fit): Rect | null {
  if (frame.width <= 0 || frame.height <= 0 || view.width <= 0 || view.height <= 0) return null
  const { scaleX, scaleY, offsetX, offsetY } = viewTransform(frame, view, fit)

  const [xMin, yMin, xMax, yMax] = box
  const toX = (v: number) => offsetX + (v / BOX_GRID_MAX) * frame.width * scaleX
  const toY = (v: number) => offsetY + (v / BOX_GRID_MAX) * frame.height * scaleY

  const left = Math.max(0, toX(xMin))
  const top = Math.max(0, toY(yMin))
  const right = Math.min(view.width, toX(xMax))
  const bottom = Math.min(view.height, toY(yMax))
  if (right <= left || bottom <= top) return null
  return { left, top, width: right - left, height: bottom - top }
}

/** Reads the element's computed object-fit; anything we do not model counts as the CSS default, fill. */
export function fitOf(value: string): Fit {
  return value === 'cover' || value === 'contain' ? value : 'fill'
}

/** Frame pixels -> element pixels for `fit` (centred): view = frame * scale + offset. */
export function viewTransform(frame: Size, view: Size, fit: Fit) {
  let scaleX = view.width / frame.width
  let scaleY = view.height / frame.height
  if (fit !== 'fill') {
    const scale = fit === 'cover' ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY)
    scaleX = scale
    scaleY = scale
  }
  // Centred: the overflow (cover, negative) or the bars (contain, positive) split evenly.
  const offsetX = (view.width - frame.width * scaleX) / 2
  const offsetY = (view.height - frame.height * scaleY) / 2
  return { scaleX, scaleY, offsetX, offsetY }
}
