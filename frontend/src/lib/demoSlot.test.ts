import { describe, expect, it } from 'vitest'
import { formatLeft } from './demoSlot'

describe('countdown text', () => {
  it('m:ss, rounded up, never negative', () => {
    expect(formatLeft(180_000)).toBe('3:00')
    expect(formatLeft(161_200)).toBe('2:42')
    expect(formatLeft(161_000)).toBe('2:41')
    expect(formatLeft(9_000)).toBe('0:09')
    expect(formatLeft(-500)).toBe('0:00')
  })
})
