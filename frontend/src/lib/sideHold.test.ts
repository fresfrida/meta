import { describe, expect, it } from 'vitest'
import type { DetectHit } from '../api/types'
import { hitAsShown } from './merge'
import type { Shown } from './phrase'
import { heldSide, holdSide, rememberSide } from './sideHold'

const L = { leftMax: 400, rightMin: 600, hyst: 50 }

describe('heldSide', () => {
  it('no side spoken yet: the plain lines', () => {
    expect(heldSide(399, null, L)).toBe('left')
    expect(heldSide(500, null, L)).toBe('ahead')
    expect(heldSide(610, null, L)).toBe('right')
  })
  it('ahead stays ahead until the centre is 50 past a line', () => {
    expect(heldSide(610, 'ahead', L)).toBe('ahead') // the Brief 16 flipped door (centre 610)
    expect(heldSide(650, 'ahead', L)).toBe('right')
    expect(heldSide(360, 'ahead', L)).toBe('ahead')
    expect(heldSide(350, 'ahead', L)).toBe('left')
  })
  it('left / right stay until the centre is 50 back inside', () => {
    expect(heldSide(440, 'left', L)).toBe('left')
    expect(heldSide(451, 'left', L)).toBe('ahead')
    expect(heldSide(560, 'right', L)).toBe('right')
    expect(heldSide(549, 'right', L)).toBe('ahead')
    expect(heldSide(700, 'left', L)).toBe('right') // far across: changes
  })
})

describe('holdSide on both channels', () => {
  const muse = (side: Shown['side']): Shown => ({
    hazard: 'door',
    side,
    distance: 'far',
    distance_m: 3,
  })
  it('Muse: a door spoken "ahead" whose next box drifts to centre 610 stays "ahead"', () => {
    const spoken = rememberSide({}, muse('ahead'))
    const box: [number, number, number, number] = [430, 110, 790, 680]
    expect(holdSide(muse('right'), box, spoken, L).side).toBe('ahead')
  })
  it('SAM: a kerb spoken "left" at centre 390 then at 420 stays "left"', () => {
    const hit = (x1: number, x2: number): DetectHit => ({
      kind: 'curb',
      box: [x1, 600, x2, 750],
      confidence: 0.9,
      side: (x1 + x2) / 2 <= 400 ? 'left' : (x1 + x2) / 2 >= 600 ? 'right' : 'ahead',
      distance: 'far',
      distance_m: 3,
    })
    const first = hitAsShown(hit(280, 500))
    const spoken = rememberSide({}, first)
    const next = hit(300, 540)
    expect(next.side).toBe('ahead')
    expect(holdSide(hitAsShown(next), next.box, spoken, L).side).toBe('left')
  })
  it('per kind: a door\'s side does not hold a kerb', () => {
    const spoken = rememberSide({}, muse('left'))
    const kerb: Shown = { hazard: 'curb', side: 'ahead', distance: 'far', distance_m: 3 }
    expect(holdSide(kerb, [380, 600, 600, 700], spoken, L).side).toBe('ahead')
  })
  it('no box: unchanged', () => {
    const s: Shown = { hazard: 'wall', side: 'right', distance: 'near', distance_m: null }
    expect(holdSide(s, null, { wall: 'left' }, L)).toBe(s)
  })
})
