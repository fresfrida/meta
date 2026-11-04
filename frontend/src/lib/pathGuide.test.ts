import { describe, expect, it } from 'vitest'
import { pathGuideLines, vfovDeg } from './pathGuide'

const CAM = { halfWidthM: 0.75, heightM: 1.3, vfovPortraitDeg: 67, vfovLandscapeDeg: 53, baseAspect: 4 / 3 }

describe('path guide geometry', () => {
  it('portrait frame shown full size: lines meet at the centre of the horizon', () => {
    const [l, r] = pathGuideLines({ width: 360, height: 640 }, { width: 360, height: 640 }, 'fill', CAM)!
    expect([l.x2, l.y2]).toEqual([180, 320])
    expect([r.x2, r.y2]).toEqual([180, 320])
    // half-width at the frame bottom = 0.75 * (h / 2) / 1.3 = 184.6 px either side of centre
    expect(l.x1).toBeCloseTo(180 - 184.6, 0)
    expect(r.x1).toBeCloseTo(180 + 184.6, 0)
    expect(l.y1).toBe(640)
  })
  it('follows the same cover crop as the hazard box (390 x 844 view of a 360 x 640 frame)', () => {
    const [l] = pathGuideLines({ width: 360, height: 640 }, { width: 390, height: 844 }, 'cover', CAM)!
    const scale = 844 / 640
    expect(l.y2).toBeCloseTo(844 / 2, 5)
    expect(l.x2).toBeCloseTo(195, 5)
    expect(l.x1).toBeCloseTo(195 - 184.6 * scale, 0)
  })
  it('nothing for a zero size', () => {
    expect(pathGuideLines({ width: 0, height: 0 }, { width: 390, height: 844 }, 'cover', CAM)).toBeNull()
  })
})

describe('field of view from the frame aspect (Brief 26, same as backend detect_rule.vfov_deg)', () => {
  it('4:3 and portrait 16:9 keep the measured angles exactly (Android today: unchanged)', () => {
    expect(vfovDeg(480, 640, CAM)).toBeCloseTo(67, 6)
    expect(vfovDeg(640, 480, CAM)).toBeCloseTo(53, 6)
    expect(vfovDeg(720, 1280, CAM)).toBeCloseTo(67, 6)
    expect(vfovDeg(360, 640, CAM)).toBeCloseTo(67, 6)
  })
  it('landscape 16:9 crops the short side: about 41 degrees', () => {
    expect(vfovDeg(1280, 720, CAM)).toBeCloseTo(41.0, 1)
  })
  it('a square frame crops the long side: the short-side angle', () => {
    expect(vfovDeg(640, 640, CAM)).toBeCloseTo(53, 6)
  })
})
