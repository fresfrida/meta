import { describe, expect, it } from 'vitest'
import type { Box } from '../api/types'
import { fitOf, mapBox } from './boxMap'

const FULL: Box = [0, 0, 1000, 1000]

function rounded(r: ReturnType<typeof mapBox>) {
  return r && { left: +r.left.toFixed(2), top: +r.top.toFixed(2), width: +r.width.toFixed(2), height: +r.height.toFixed(2) }
}

describe('mapBox', () => {
  it('maps 1:1 when frame and view have the same aspect', () => {
    expect(mapBox([250, 500, 750, 1000], { width: 720, height: 1280 }, { width: 360, height: 640 }, 'cover')).toEqual({
      left: 90,
      top: 320,
      width: 180,
      height: 320,
    })
  })

  it('portrait frame in a wider view (cover): crops top and bottom', () => {
    // 720x1280 frame shown in a 390x600 view: scale = 390/720, displayed height 693.33, 46.67 cut each end.
    const view = { width: 390, height: 600 }
    const frame = { width: 720, height: 1280 }
    expect(rounded(mapBox(FULL, frame, view, 'cover'))).toEqual({ left: 0, top: 0, width: 390, height: 600 })
    expect(rounded(mapBox([0, 500, 1000, 600], frame, view, 'cover'))).toEqual({
      left: 0,
      top: 300,
      width: 390,
      height: 69.33,
    })
    // A box entirely in the cropped top strip is not visible at all.
    expect(mapBox([0, 0, 1000, 60], frame, view, 'cover')).toBeNull()
    // A box straddling the crop is clipped to the view.
    expect(rounded(mapBox([0, 0, 1000, 100], frame, view, 'cover'))).toEqual({
      left: 0,
      top: 0,
      width: 390,
      height: 22.67,
    })
  })

  it('landscape frame in a portrait view (cover): crops left and right', () => {
    // 1280x720 frame in a 390x844 view: scale = 844/720, displayed width 1500.44, 555.22 cut each side.
    const view = { width: 390, height: 844 }
    const frame = { width: 1280, height: 720 }
    // A box centred on the frame stays centred on screen.
    const centred = mapBox([450, 250, 550, 750], frame, view, 'cover')!
    expect(centred.left + centred.width / 2).toBeCloseTo(view.width / 2)
    expect(rounded(centred)).toEqual({
      left: 119.98,
      top: 211,
      width: 150.04,
      height: 422,
    })
    // Visible slice is 370..630 of the grid; a box at the left edge is cropped away.
    expect(mapBox([0, 0, 300, 1000], frame, view, 'cover')).toBeNull()
    expect(rounded(mapBox([300, 0, 400, 1000], frame, view, 'cover'))).toEqual({
      left: 0,
      top: 0,
      width: 44.96,
      height: 844,
    })
  })

  it('contain: letterbox bars offset the box', () => {
    // 1280x720 in 390x844: scale = 390/1280, displayed height 219.38, bars of 312.31 above and below.
    expect(rounded(mapBox(FULL, { width: 1280, height: 720 }, { width: 390, height: 844 }, 'contain'))).toEqual({
      left: 0,
      top: 312.31,
      width: 390,
      height: 219.38,
    })
  })

  it('fill: stretches each axis', () => {
    expect(mapBox([500, 500, 1000, 1000], { width: 1280, height: 720 }, { width: 400, height: 800 }, 'fill')).toEqual({
      left: 200,
      top: 400,
      width: 200,
      height: 400,
    })
  })

  it('returns null for zero sizes', () => {
    expect(mapBox(FULL, { width: 0, height: 0 }, { width: 390, height: 844 }, 'cover')).toBeNull()
    expect(mapBox(FULL, { width: 720, height: 1280 }, { width: 0, height: 844 }, 'cover')).toBeNull()
  })

  it('fitOf reads object-fit', () => {
    expect(fitOf('cover')).toBe('cover')
    expect(fitOf('contain')).toBe('contain')
    expect(fitOf('scale-down')).toBe('fill')
  })
})
