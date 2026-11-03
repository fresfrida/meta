import { describe, expect, it } from 'vitest'
import type { VisionAnswer } from '../api/types'
import { isWarning, phraseFor } from './phrase'

type A = Pick<VisionAnswer, 'hazard' | 'side' | 'distance' | 'distance_m'>
const a = (hazard: A['hazard'], side: A['side'], distance: A['distance'], distance_m: A['distance_m']): A => ({
  hazard,
  side,
  distance,
  distance_m,
})

describe('phraseFor with metres', () => {
  it('English: "<Hazard>, N metres[, left|right]", 1 -> metre', () => {
    expect(phraseFor(a('step_down', 'ahead', 'near', 2), 'en')).toBe('Step down, 2 metres')
    expect(phraseFor(a('obstacle', 'left', 'far', 5), 'en')).toBe('Obstacle, 5 metres, left')
    expect(phraseFor(a('curb', 'right', 'near', 1), 'en')).toBe('Curb, 1 metre, right')
  })
  it('Chinese: "[左前方|右前方|前方]N米，<hazard>"', () => {
    expect(phraseFor(a('step_down', 'ahead', 'near', 2), 'zh')).toBe('前方2米，下台阶')
    expect(phraseFor(a('obstacle', 'left', 'far', 5), 'zh')).toBe('左前方5米，障碍物')
    expect(phraseFor(a('curb', 'right', 'near', 1), 'zh')).toBe('右前方1米，路缘')
    expect(phraseFor(a('step_up', null, 'far', 6), 'zh')).toBe('前方6米，上台阶')
  })
  it('Malay: "<Hazard>, N meter[, sebelah kiri|sebelah kanan]"', () => {
    expect(phraseFor(a('step_up', 'ahead', 'far', 6), 'ms')).toBe('Tangga naik, 6 meter')
    expect(phraseFor(a('obstacle', 'left', 'far', 5), 'ms')).toBe('Halangan, 5 meter, sebelah kiri')
    expect(phraseFor(a('curb', 'right', 'near', 1), 'ms')).toBe('Bebendul jalan, 1 meter, sebelah kanan')
  })
  it('Tamil: "<Hazard>, N மீட்டர்[, இடது பக்கம்|வலது பக்கம்]"', () => {
    expect(phraseFor(a('step_down', 'ahead', 'near', 2), 'ta')).toBe('இறங்கு படி, 2 மீட்டர்')
    expect(phraseFor(a('obstacle', 'left', 'far', 5), 'ta')).toBe('தடை, 5 மீட்டர், இடது பக்கம்')
    expect(phraseFor(a('curb', 'right', 'near', 1), 'ta')).toBe('நடைபாதை விளிம்பு, 1 மீட்டர், வலது பக்கம்')
  })
})

describe('phraseFor without metres', () => {
  it('English', () => {
    expect(phraseFor(a('step_down', 'left', null, null), 'en')).toBe('Step down ahead, left')
    expect(phraseFor(a('obstacle', 'ahead', 'far', null), 'en')).toBe('Obstacle ahead')
    expect(phraseFor(a('curb', 'right', 'near', null), 'en')).toBe('Curb ahead, right, close')
  })
  it('Chinese', () => {
    expect(phraseFor(a('curb', 'right', 'near', null), 'zh')).toBe('右前方路缘，很近')
    expect(phraseFor(a('obstacle', 'ahead', 'far', null), 'zh')).toBe('前方障碍物')
  })
  it('Malay', () => {
    expect(phraseFor(a('curb', 'left', 'near', null), 'ms')).toBe('Bebendul jalan di hadapan, sebelah kiri, dekat')
    expect(phraseFor(a('step_up', 'ahead', 'far', null), 'ms')).toBe('Tangga naik di hadapan')
  })
  it('Tamil', () => {
    expect(phraseFor(a('obstacle', 'right', 'near', null), 'ta')).toBe('முன்னால் தடை, வலது பக்கம், அருகில்')
    expect(phraseFor(a('step_down', 'ahead', 'far', null), 'ta')).toBe('முன்னால் இறங்கு படி')
  })
})

describe('clear and unsure', () => {
  it('are their word alone in every language', () => {
    expect(phraseFor(a('clear', 'left', 'near', 3), 'en')).toBe('Clear')
    expect(phraseFor(a('clear', null, null, null), 'zh')).toBe('畅通')
    expect(phraseFor(a('clear', null, null, null), 'ms')).toBe('Tiada halangan')
    expect(phraseFor(a('clear', null, null, null), 'ta')).toBe('தடை இல்லை')
    expect(phraseFor(a('unsure', null, null, null), 'en')).toBe('Not sure')
    expect(phraseFor(a('unsure', null, null, null), 'zh')).toBe('不确定')
    expect(phraseFor(a('unsure', null, null, null), 'ms')).toBe('Tidak pasti')
    expect(phraseFor(a('unsure', null, null, null), 'ta')).toBe('உறுதியில்லை')
  })
})

describe('isWarning', () => {
  it('is true for hazards only', () => {
    expect(isWarning({ hazard: 'curb' })).toBe(true)
    expect(isWarning({ hazard: 'clear' })).toBe(false)
    expect(isWarning({ hazard: 'unsure' })).toBe(false)
  })
})
