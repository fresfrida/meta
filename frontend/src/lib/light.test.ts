import { describe, expect, it } from 'vitest'
import type { VisionAnswer } from '../api/types'
import { RED_MAX_M } from '../config'
import { lampFor } from './light'

type A = Pick<VisionAnswer, 'hazard' | 'distance' | 'distance_m'>
const w = (distance_m: number | null, distance: A['distance'] = null): A => ({ hazard: 'curb', distance, distance_m })

describe('lampFor', () => {
  it('red at or under RED_MAX_M metres, amber above', () => {
    expect(RED_MAX_M).toBe(2)
    expect(lampFor(w(1))).toBe('red')
    expect(lampFor(w(2))).toBe('red')
    expect(lampFor(w(3))).toBe('amber')
    expect(lampFor(w(10))).toBe('amber')
  })
  it('metres win over near/far when both are given', () => {
    expect(lampFor(w(5, 'near'))).toBe('amber')
    expect(lampFor(w(2, 'far'))).toBe('red')
  })
  it('without metres: near is red, far or unknown is amber', () => {
    expect(lampFor(w(null, 'near'))).toBe('red')
    expect(lampFor(w(null, 'far'))).toBe('amber')
    expect(lampFor(w(null, null))).toBe('amber')
  })
  it('every warning hazard follows the rule', () => {
    for (const hazard of ['step_down', 'step_up', 'curb', 'obstacle'] as const) {
      expect(lampFor({ hazard, distance: null, distance_m: 1 })).toBe('red')
      expect(lampFor({ hazard, distance: null, distance_m: 6 })).toBe('amber')
    }
  })
  it('clear is green; unsure and no answer are dark', () => {
    expect(lampFor({ hazard: 'clear', distance: null, distance_m: null })).toBe('green')
    expect(lampFor({ hazard: 'unsure', distance: 'near', distance_m: 1 })).toBe('off')
    expect(lampFor(null)).toBe('off')
  })
})
