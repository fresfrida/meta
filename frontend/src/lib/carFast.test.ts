// Brief 29: the fast car warning on the phone: the ?car= switch, the request body, and the approved vehicle words.
import { describe, expect, it } from 'vitest'
import { detectBody } from '../api/client'
import type { DetectHit } from '../api/types'
import { readOptionalFlag } from '../config'
import { lampFor } from './light'
import { hitAsShown } from './merge'
import { phraseFor, speechFor } from './phrase'

describe('?car= switch', () => {
  it('?car=1 on, ?car=0 off, no flag = the server decides', () => {
    expect(readOptionalFlag('car', '?car=1')).toBe(true)
    expect(readOptionalFlag('car', '?car=0')).toBe(false)
    expect(readOptionalFlag('car', '')).toBeNull()
    expect(readOptionalFlag('car', '?fast=0')).toBeNull()
  })
  it('the detect body carries the override only when there is one', () => {
    expect(detectBody('IMG', null)).toEqual({ image_b64: 'IMG' })
    expect(detectBody('IMG', true)).toEqual({ image_b64: 'IMG', car: true })
    expect(detectBody('IMG', false)).toEqual({ image_b64: 'IMG', car: false })
  })
})

describe('a fast car hit uses the existing, approved vehicle words', () => {
  const hit = (over: Partial<DetectHit> = {}): DetectHit => ({
    kind: 'vehicle', box: [100, 500, 900, 900], confidence: 0.93, side: 'ahead', distance: 'far', distance_m: 3, ...over,
  })
  it('EN: "A vehicle, about 3 metres ahead." and screen "Vehicle, 3 metres", amber', () => {
    const shown = hitAsShown(hit())
    expect(speechFor(shown, 'en')).toBe('A vehicle, about 3 metres ahead.')
    expect(phraseFor(shown, 'en')).toBe('Vehicle, 3 metres')
    expect(lampFor(shown)).toBe('amber')
  })
  it('touching the frame bottom: "very close", red', () => {
    const shown = hitAsShown(hit({ distance: 'near', distance_m: null }))
    expect(speechFor(shown, 'en')).toBe('A vehicle very close.')
    expect(lampFor(shown)).toBe('red')
  })
  it('ZH uses its approved vehicle word', () => {
    expect(speechFor(hitAsShown(hit()), 'zh')).toContain('车')
  })
})
