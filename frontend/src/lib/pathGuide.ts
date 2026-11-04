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
  vfovPortraitDeg: number
  vfovLandscapeDeg: number
}

/** Two lines (left edge, right edge) in element pixels, or null when a size is zero. */
export function pathGuideLines(frame: Size, view: Size, fit: Fit, cam: Camera): [Line, Line] | null {
  if (frame.width <= 0 || frame.height <= 0 || view.width <= 0 || view.height <= 0) return null
  const { width: w, height: h } = frame
  const vfov = ((h > w ? cam.vfovPortraitDeg : cam.vfovLandscapeDeg) * Math.PI) / 180
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
