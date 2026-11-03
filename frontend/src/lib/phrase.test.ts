import { describe, expect, it } from 'vitest'
import { isWarning, phraseFor } from './phrase'

describe('phraseFor', () => {
  it('says the brief examples', () => {
    expect(phraseFor({ hazard: 'step_down', side: 'left', distance: null })).toBe('Step down ahead, left')
    expect(phraseFor({ hazard: 'obstacle', side: 'ahead', distance: null })).toBe('Obstacle ahead')
    expect(phraseFor({ hazard: 'clear', side: null, distance: null })).toBe('Clear')
  })

  it('adds close only when near', () => {
    expect(phraseFor({ hazard: 'curb', side: 'right', distance: 'near' })).toBe('Curb ahead, right, close')
    expect(phraseFor({ hazard: 'step_up', side: 'ahead', distance: 'far' })).toBe('Step up ahead')
    expect(phraseFor({ hazard: 'step_down', side: null, distance: 'near' })).toBe('Step down ahead, close')
  })

  it('ignores side and distance for clear and unsure', () => {
    expect(phraseFor({ hazard: 'clear', side: 'left', distance: 'near' })).toBe('Clear')
    expect(phraseFor({ hazard: 'unsure', side: null, distance: null })).toBe('Not sure')
  })
})

describe('isWarning', () => {
  it('is true for hazards only', () => {
    expect(isWarning({ hazard: 'curb', side: null, distance: null })).toBe(true)
    expect(isWarning({ hazard: 'clear', side: null, distance: null })).toBe(false)
    expect(isWarning({ hazard: 'unsure', side: null, distance: null })).toBe(false)
  })
})
