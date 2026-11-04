// Where the walking path's edges run on screen: from the bottom of the frame to the horizon (a level phone at chest
// height, the same pinhole camera as the backend's path rule). Pure geometry; the component only draws it.
import { type Fit, type Size, viewTransform } from './boxMap'

export interface Line {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface Camera {
  halfWidthM: number
  heightM: number
  /** Vertical angle with the long side vertical, for a `baseAspect` (4:3) frame. */
  vfovPortraitDeg: number
  /** Vertical angle with the short side vertical, for a `baseAspect` frame. */
  vfovLandscapeDeg: number
  baseAspect: number
}

const rad = (deg: number) => (deg * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI

/**
 * Vertical field of view of a w x h frame (Brief 26; the backend's detect_rule.vfov_deg). A wider frame than the base
 * (16:9) crops the short side, a squarer one crops the long side. 4:3 and portrait 16:9 keep the base angles exactly.
 */
export function vfovDeg(w: number, h: number, cam: Pick<Camera, 'vfovPortraitDeg' | 'vfovLandscapeDeg' | 'baseAspect'>): number {
  const aspect = Math.max(w, h) / Math.min(w, h)
  const wide = aspect >= cam.baseAspect
  const longDeg = wide ? cam.vfovPortraitDeg : deg(2 * Math.atan((Math.tan(rad(cam.vfovPortraitDeg) / 2) * aspect) / cam.baseAspect))
  const shortDeg = wide ? deg(2 * Math.atan((Math.tan(rad(cam.vfovLandscapeDeg) / 2) * cam.baseAspect) / aspect)) : cam.vfovLandscapeDeg
  return h > w ? longDeg : shortDeg
}

/** Two lines (left edge, right edge) in element pixels, or null when a size is zero. */
export function pathGuideLines(frame: Size, view: Size, fit: Fit, cam: Camera): [Line, Line] | null {
  if (frame.width <= 0 || frame.height <= 0 || view.width <= 0 || view.height <= 0) return null
  const { width: w, height: h } = frame
  const vfov = rad(vfovDeg(w, h, cam))
  const focal = h / 2 / Math.tan(vfov / 2)
  // At the frame bottom the ground is heightM * focal / (h / 2) ahead; the path half-width there, in pixels:
  const halfPx = (cam.halfWidthM * focal) / ((cam.heightM * focal) / (h / 2))
  const { scaleX, scaleY, offsetX, offsetY } = viewTransform(frame, view, fit)
  const at = (x: number, y: number) => [x * scaleX + offsetX, y * scaleY + offsetY] as const
  const [hx, hy] = at(w / 2, h / 2) // the vanishing point: centre of the horizon
  const [lx, by] = at(w / 2 - halfPx, h)
  const [rx] = at(w / 2 + halfPx, h)
  return [
    { x1: lx, y1: by, x2: hx, y2: hy },
    { x1: rx, y1: by, x2: hx, y2: hy },
  ]
}
