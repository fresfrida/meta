import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Pixels } from './faceBlur'
import { type FaceDetector, getFaceBlurStatus, guardPixels, setFaceDetectorLoader, subscribeFaceBlur } from './faceGuard'

const frame = (): Pixels => {
  const data = new Uint8ClampedArray(64 * 48 * 4).map((_, i) => (i * 37) % 256)
  return { data, width: 64, height: 48 }
}
const face = { x: 10, y: 10, w: 12, h: 14, score: 0.9 }
const ok = (faces = [face]): FaceDetector => ({ detect: async () => faces })

afterEach(() => vi.restoreAllMocks())

describe('guardPixels', () => {
  it('blurs detected faces and reports "on"', async () => {
    setFaceDetectorLoader(async () => ok())
    const px = frame()
    const before = px.data.slice()
    const r = await guardPixels(px)
    expect(r.status).toBe('on')
    expect(r.blurred).toHaveLength(1)
    expect(px.data).not.toEqual(before)
    expect(getFaceBlurStatus()).toBe('on')
  })

  it('ignores low-confidence detections', async () => {
    setFaceDetectorLoader(async () => ok([{ ...face, score: 0.3 }]))
    const px = frame()
    const before = px.data.slice()
    expect((await guardPixels(px)).blurred).toEqual([])
    expect(px.data).toEqual(before)
  })

  it('model fails to load: frame unchanged, status "off", listeners told, loud warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    setFaceDetectorLoader(() => Promise.reject(new Error('404 model')))
    const seen: string[] = []
    const unsubscribe = subscribeFaceBlur(() => seen.push(getFaceBlurStatus()))
    const px = frame()
    const before = px.data.slice()
    const r = await guardPixels(px)
    unsubscribe()
    expect(r).toEqual({ status: 'off', blurred: [] })
    expect(px.data).toEqual(before) // fail-open: the frame still goes
    expect(seen).toContain('off')
    expect(warn).toHaveBeenCalled()
  })

  it('detector errors on a frame: that frame goes unblurred, status "off"; a later good frame turns it back "on"', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    let fail = true
    setFaceDetectorLoader(async () => ({
      detect: async () => {
        if (fail) throw new Error('inference error')
        return [face]
      },
    }))
    expect((await guardPixels(frame())).status).toBe('off')
    fail = false
    expect((await guardPixels(frame())).status).toBe('on')
  })

  it('model too slow to load: times out, status "off"', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    setFaceDetectorLoader(() => new Promise(() => undefined))
    expect((await guardPixels(frame(), 20)).status).toBe('off')
  })
})
