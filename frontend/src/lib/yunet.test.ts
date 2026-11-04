import { describe, expect, it } from 'vitest'
import type { Pixels } from './faceBlur'
import { decodeYunet, nms, toBgrTensor } from './yunet'

const SIZE = 64 // small grid for tests: strides 8 / 16 / 32 -> 8x8, 4x4, 2x2 cells

function heads(entries: { s: 8 | 16 | 32; idx: number; cls: number; obj: number; box: [number, number, number, number] }[]) {
  const out: Record<string, Float32Array> = {}
  for (const s of [8, 16, 32] as const) {
    const n = (SIZE / s) ** 2
    out[`cls_${s}`] = new Float32Array(n)
    out[`obj_${s}`] = new Float32Array(n)
    out[`bbox_${s}`] = new Float32Array(n * 4)
  }
  for (const e of entries) {
    out[`cls_${e.s}`][e.idx] = e.cls
    out[`obj_${e.s}`][e.idx] = e.obj
    out[`bbox_${e.s}`].set(e.box, e.idx * 4)
  }
  return out
}

describe('decodeYunet', () => {
  it('decodes a cell into a box like OpenCV FaceDetectorYN', () => {
    // stride 8, row 2, col 3 (idx 2*8+3 = 19); offsets 0.5, 0.5; w = h = exp(ln 2) * 8 = 16
    const [f] = decodeYunet(heads([{ s: 8, idx: 19, cls: 0.81, obj: 1, box: [0.5, 0.5, Math.log(2), Math.log(2)] }]), 0.5, SIZE)
    expect(f.score).toBeCloseTo(0.9)
    expect([f.x, f.y, f.w, f.h].map((v) => +v.toFixed(3))).toEqual([20, 12, 16, 16])
  })

  it('drops low scores and clamps cls / obj to 0..1', () => {
    const faces = decodeYunet(
      heads([
        { s: 16, idx: 5, cls: 0.2, obj: 0.2, box: [0, 0, 0, 0] },
        { s: 32, idx: 1, cls: 1.7, obj: 0.9, box: [0, 0, 0, 0] },
      ]),
      0.6,
      SIZE,
    )
    expect(faces).toHaveLength(1)
    expect(faces[0].score).toBeCloseTo(Math.sqrt(0.9))
  })
})

describe('nms', () => {
  it('keeps the best of overlapping boxes and separate faces', () => {
    const kept = nms([
      { x: 0, y: 0, w: 10, h: 10, score: 0.7 },
      { x: 1, y: 1, w: 10, h: 10, score: 0.9 },
      { x: 50, y: 50, w: 10, h: 10, score: 0.8 },
    ])
    expect(kept.map((k) => k.score)).toEqual([0.9, 0.8])
  })
})

describe('toBgrTensor', () => {
  it('packs RGBA as BGR planes, top-left, zero-padded to size', () => {
    const px: Pixels = { data: new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255]), width: 2, height: 1 }
    const { data, scale } = toBgrTensor(px, 4)
    expect(scale).toBe(1)
    const plane = 16
    expect([data[0], data[plane], data[2 * plane]]).toEqual([30, 20, 10]) // pixel (0,0) B G R
    expect([data[1], data[plane + 1], data[2 * plane + 1]]).toEqual([60, 50, 40]) // pixel (1,0)
    expect(data[4]).toBe(0) // padding row
  })

  it('downscales frames larger than the model input', () => {
    const px: Pixels = { data: new Uint8ClampedArray(8 * 2 * 4).fill(100), width: 8, height: 2 }
    expect(toBgrTensor(px, 4).scale).toBe(0.5)
  })
})
