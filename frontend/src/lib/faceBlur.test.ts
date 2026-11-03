import { describe, expect, it } from 'vitest'
import { type FaceBox, type Pixels, blurFaces, mosaic, padBox } from './faceBlur'

/** A noisy synthetic frame: every pixel different, so any change is visible. */
function frame(width: number, height: number): Pixels {
  const data = new Uint8ClampedArray(width * height * 4)
  let seed = 7
  for (let i = 0; i < data.length; i++) {
    seed = (seed * 1103515245 + 12345) % 2 ** 31
    data[i] = i % 4 === 3 ? 255 : seed % 256
  }
  return { data, width, height }
}

const inside = (b: FaceBox, x: number, y: number) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h

describe('padBox', () => {
  it('grows by 20% each side and clips to the frame', () => {
    expect(padBox({ x: 100, y: 100, w: 50, h: 40 }, 0.2, 640, 480)).toEqual({ x: 90, y: 92, w: 70, h: 56 })
    expect(padBox({ x: 2, y: 3, w: 50, h: 50 }, 0.2, 40, 40)).toEqual({ x: 0, y: 0, w: 40, h: 40 })
  })
})

describe('blurFaces (fixture with faces)', () => {
  // Three "faces" of different sizes, as a detector would report them (near, mid, far).
  const faces: FaceBox[] = [
    { x: 50, y: 40, w: 60, h: 72 },
    { x: 300, y: 200, w: 24, h: 28 },
    { x: 500, y: 100, w: 10, h: 12 },
  ]

  it('every padded face box is replaced, and every pixel outside them is unchanged', () => {
    const img = frame(640, 360)
    const before = img.data.slice()
    const boxes = blurFaces(img, faces)
    expect(boxes).toHaveLength(3)
    let changedInside = 0
    let changedOutside = 0
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        const i = (y * img.width + x) * 4
        const changed = [0, 1, 2].some((c) => img.data[i + c] !== before[i + c])
        if (boxes.some((b) => inside(b, x, y))) changedInside += changed ? 1 : 0
        else changedOutside += changed ? 1 : 0
      }
    }
    expect(changedOutside).toBe(0)
    const area = boxes.reduce((n, b) => n + b.w * b.h, 0)
    expect(changedInside / area).toBeGreaterThan(0.98) // noise: nearly every pixel takes its cell's average
  })

  it('no face detail survives: each face box has at most 4 x 4 distinct colours (16 cells)', () => {
    const img = frame(640, 360)
    const [near] = blurFaces(img, [faces[0]])
    const colours = new Set<string>()
    for (let y = near.y; y < near.y + near.h; y++)
      for (let x = near.x; x < near.x + near.w; x++) {
        const i = (y * img.width + x) * 4
        colours.add(`${img.data[i]},${img.data[i + 1]},${img.data[i + 2]}`)
      }
    expect(colours.size).toBeLessThanOrEqual(16)
  })

  it('no faces: the frame is untouched', () => {
    const img = frame(64, 48)
    const before = img.data.slice()
    expect(blurFaces(img, [])).toEqual([])
    expect(img.data).toEqual(before)
  })
})

describe('mosaic', () => {
  it('averages each cell', () => {
    const img: Pixels = { data: new Uint8ClampedArray([0, 0, 0, 255, 100, 100, 100, 255, 200, 200, 200, 255, 100, 100, 100, 255]), width: 2, height: 2 }
    mosaic(img, { x: 0, y: 0, w: 2, h: 2 }, 1)
    expect(Array.from(img.data)).toEqual([100, 100, 100, 255, 100, 100, 100, 255, 100, 100, 100, 255, 100, 100, 100, 255])
  })
})
