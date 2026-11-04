import { describe, expect, it } from 'vitest'
import type { DetectHit } from '../api/types'
import { type AnnounceState, INITIAL_ANNOUNCE, decide, spoke } from './announce'
import { lampFor } from './light'
import {
  NOTHING_SHOWN,
  type ShownState,
  fastCue,
  fastRecentlySaid,
  hitAsShown,
  mergedLamp,
  rememberSpoken,
  replaces,
} from './merge'
import { type Shown, phraseFor, speechFor } from './phrase'

const GAP = 1500
const CLOSER = 2
const HOLD = 3000
const hit = (kind: DetectHit['kind'], distance_m: number | null, side: DetectHit['side'] = 'ahead'): DetectHit => ({
  kind,
  box: [100, 600, 900, 750],
  confidence: 0.9,
  side,
  distance: distance_m === null ? 'near' : 'far',
  distance_m,
})
const muse = (hazard: Shown['hazard'], distance_m: number | null = null, side: Shown['side'] = 'ahead'): Shown => ({
  hazard,
  side,
  distance: hazard === 'clear' || hazard === 'unsure' ? null : distance_m === null ? 'near' : 'far',
  distance_m,
})
const run = (x: Shown, s: AnnounceState, now: number) => decide(x, s, now, GAP, CLOSER)
const after = (x: Shown, at: number): AnnounceState => ({ ...spoke(x, at), speaking: false })
const fastShown = (at: number, seq = 5): ShownState => ({ channel: 'fast', hazard: 'steps', seq, lamp: 'amber', at })

describe('fast hit -> spoken at once, with the cue', () => {
  it('a new steps hit speaks, and the cue plays', () => {
    const d = run(hitAsShown(hit('steps', 3)), INITIAL_ANNOUNCE, 10_000)
    expect(d).toEqual({ speak: true, interrupt: false })
    expect(fastCue('fast', d)).toBe(true)
    expect(speechFor(hitAsShown(hit('steps', 3)), 'en')).toBe('Steps, about 3 metres ahead.')
  })

  it('the same steps hit again stays silent, with no cue', () => {
    const s = after(hitAsShown(hit('steps', 3)), 10_000)
    const d = run(hitAsShown(hit('steps', 3)), s, 12_000)
    expect(d).toEqual({ speak: false, why: 'repeat' })
    expect(fastCue('fast', d)).toBe(false)
  })

  it('no cue for Muse answers, even spoken ones', () => {
    expect(fastCue('detail', { speak: true, interrupt: false })).toBe(false)
  })

  it('a kerb hit after steps is a new kind and speaks', () => {
    const s = after(hitAsShown(hit('steps', 3)), 10_000)
    expect(run(hitAsShown(hit('curb', 4)), s, 12_000).speak).toBe(true)
  })
})

describe('a later Muse answer about the same kind speaks only if it adds something', () => {
  const s = after(hitAsShown(hit('steps', 4)), 10_000)

  it('up / down is new: "steps going down" speaks after "steps"', () => {
    expect(run(muse('step_down', 4), s, 13_000).speak).toBe(true)
    expect(run(muse('step_up', null), s, 13_000).speak).toBe(true)
  })

  it('a Muse kerb after a SAM kerb at about the same distance is silent; 2 m closer speaks', () => {
    const k = after(hitAsShown(hit('curb', 5)), 10_000)
    expect(run(muse('curb', 4), k, 13_000)).toEqual({ speak: false, why: 'repeat' })
    expect(run(muse('curb', 3), k, 13_000).speak).toBe(true)
  })

  it('after Muse said "going down", SAM "steps" adds nothing and stays silent', () => {
    const down = after(muse('step_down', 4), 10_000)
    expect(run(hitAsShown(hit('steps', 4)), down, 13_000)).toEqual({ speak: false, why: 'repeat' })
    expect(run(hitAsShown(hit('steps', 2)), down, 13_000).speak).toBe(true) // 2 m closer
  })

  it('Muse alone behaves as before: down then up speaks, down then down does not', () => {
    const down = after(muse('step_down', 4), 10_000)
    expect(run(muse('step_up', 4), down, 13_000).speak).toBe(true)
    expect(run(muse('step_down', 4), down, 13_000)).toEqual({ speak: false, why: 'repeat' })
  })

  it('Muse obstacles behave as today', () => {
    expect(run(muse('obstacle', 3), s, 13_000).speak).toBe(true)
  })
})

describe('replaces: a Muse "clear" / "not sure" does not cancel a young fast warning', () => {
  it('clear and unsure are held back while the fast warning is younger than the hold', () => {
    expect(replaces('detail', muse('clear'), fastShown(10_000), 12_999, HOLD, false)).toBe(false)
    expect(replaces('detail', muse('unsure'), fastShown(10_000), 12_000, HOLD, false)).toBe(false)
  })

  it('after the hold, or over a Muse answer, clear shows as today', () => {
    expect(replaces('detail', muse('clear'), fastShown(10_000), 13_000, HOLD, false)).toBe(true)
    expect(replaces('detail', muse('clear'), { ...fastShown(10_000), channel: 'detail', hazard: 'obstacle' }, 11_000, HOLD, false)).toBe(true)
  })

  it('Muse warnings always replace; a fast hit replaces when nothing of its kind from Muse is young', () => {
    expect(replaces('detail', muse('obstacle', 3), fastShown(10_000), 10_500, HOLD, false)).toBe(true)
    expect(replaces('fast', hitAsShown(hit('curb', 3)), NOTHING_SHOWN, 0, HOLD, false)).toBe(true)
  })
})

describe('replaces: a silent fast hit does not overwrite Muse detail of the same kind', () => {
  const museDown: ShownState = { channel: 'detail', hazard: 'step_down', seq: 6, lamp: 'red', at: 10_000 }
  it('silent "steps" keeps "steps going down" on screen while it is young', () => {
    expect(replaces('fast', hitAsShown(hit('steps', 6)), museDown, 11_000, HOLD, false)).toBe(false)
    expect(replaces('fast', hitAsShown(hit('steps', 6)), museDown, 13_000, HOLD, false)).toBe(true)
  })
  it('a fast hit that is spoken (closer, or another kind) always shows', () => {
    expect(replaces('fast', hitAsShown(hit('steps', 1)), museDown, 11_000, HOLD, true)).toBe(true)
    expect(replaces('fast', hitAsShown(hit('curb', 6)), museDown, 11_000, HOLD, true)).toBe(true)
  })
  it('a silent fast hit of another kind does not flip the screen away from a young Muse answer', () => {
    const museObstacle: ShownState = { channel: 'detail', hazard: 'obstacle', seq: 6, lamp: 'amber', at: 10_000 }
    expect(replaces('fast', hitAsShown(hit('curb', 3)), museObstacle, 11_000, HOLD, false)).toBe(false)
    expect(replaces('fast', hitAsShown(hit('curb', 3)), museObstacle, 13_500, HOLD, false)).toBe(true)
  })
})

describe('traffic light: newest, the more severe on a tie (same frame)', () => {
  const shown: ShownState = { channel: 'fast', hazard: 'steps', seq: 7, lamp: 'red', at: 0 }
  it('Muse amber about the same frame keeps the fast red', () => {
    expect(mergedLamp('amber', 7, shown)).toBe('red')
  })
  it('a newer frame wins even when less severe', () => {
    expect(mergedLamp('amber', 8, shown)).toBe('amber')
  })
  it('same rule as today: <= 2 m or near is red', () => {
    expect(lampFor(hitAsShown(hit('steps', null)))).toBe('red')
    expect(lampFor(hitAsShown(hit('steps', 2)))).toBe('red')
    expect(lampFor(hitAsShown(hit('curb', 3)))).toBe('amber')
  })
})

describe('fast phrase per language (TENTATIVE words)', () => {
  it('voice, with metres', () => {
    const x = hitAsShown(hit('steps', 3))
    expect(speechFor(x, 'zh')).toBe('前面大约3米，有台阶。')
    expect(speechFor(x, 'ms')).toBe('Ada tangga kira-kira 3 meter di hadapan.')
    expect(speechFor(x, 'ta')).toBe('சுமார் 3 மீட்டர் முன்னால், படிகள் உள்ளன.')
  })
  it('kerb reuses the approved kerb words', () => {
    expect(speechFor(hitAsShown(hit('curb', 3, 'right')), 'en')).toBe('A kerb, about 3 metres ahead, on your right.')
  })
  it('near (touching the frame bottom) uses the near template', () => {
    expect(speechFor(hitAsShown(hit('steps', null)), 'en')).toBe('Steps just ahead.')
  })
  it('screen phrase', () => {
    expect(phraseFor(hitAsShown(hit('steps', 3)), 'en')).toBe('Steps, 3 metres')
    expect(phraseFor(hitAsShown(hit('steps', 3)), 'ta')).toBe('படிகள், 3 மீட்டர்')
  })
})

describe('fastRecentlySaid: no "kerb, obstacle, kerb, obstacle" ping-pong (Brief 11 live run)', () => {
  const WINDOW = 10_000
  const kerbNear = hitAsShown(hit('curb', null, 'left'))
  // Spoken: SAM kerb (near) at 1 s, then Muse obstacle at 6 s.
  const kinds = rememberSpoken(rememberSpoken({}, kerbNear, 1_000), muse('obstacle', 3, 'right'), 6_000)

  it('the repeat rule alone would re-say the kerb after the obstacle', () => {
    const state = after(muse('obstacle', 3, 'right'), 6_000)
    expect(run(kerbNear, state, 8_000).speak).toBe(true)
  })
  it('the per-kind memory keeps the fast kerb silent within the window', () => {
    expect(fastRecentlySaid(kerbNear, kinds, 7_000, WINDOW, CLOSER)).toBe(true)
  })
  it('after the window, or when closer, the fast hit speaks again', () => {
    expect(fastRecentlySaid(kerbNear, kinds, 11_000, WINDOW, CLOSER)).toBe(false)
    const far = rememberSpoken({}, hitAsShown(hit('curb', 6)), 1_000)
    expect(fastRecentlySaid(hitAsShown(hit('curb', 4)), far, 3_000, WINDOW, CLOSER)).toBe(false)
    expect(fastRecentlySaid(hitAsShown(hit('curb', 5)), far, 3_000, WINDOW, CLOSER)).toBe(true)
    expect(fastRecentlySaid(hitAsShown(hit('curb', null)), rememberSpoken({}, muse('curb', null), 1_000), 3_000, WINDOW, CLOSER)).toBe(true)
  })
  it('steps spoken by Muse ("going down") count for the fast "steps"', () => {
    const down = rememberSpoken({}, muse('step_down', 4), 1_000)
    expect(fastRecentlySaid(hitAsShown(hit('steps', 4)), down, 3_000, WINDOW, CLOSER)).toBe(true)
  })
  it('a kind never spoken is not held back', () => {
    expect(fastRecentlySaid(hitAsShown(hit('steps', 4)), kinds, 7_000, WINDOW, CLOSER)).toBe(false)
  })
})

describe('Talk more (fake clock)', () => {
  const TALK = 4000
  const k = hitAsShown(hit('curb', 3))
  it('off: a repeat stays silent', () => {
    expect(decide(k, after(k, 10_000), 20_000, GAP, CLOSER, null)).toEqual({ speak: false, why: 'repeat' })
  })
  it('on: the same warning is said again after 4 s, not before, and never over speech', () => {
    expect(decide(k, after(k, 10_000), 13_999, GAP, CLOSER, TALK)).toEqual({ speak: false, why: 'repeat' })
    expect(decide(k, after(k, 10_000), 14_000, GAP, CLOSER, TALK)).toEqual({ speak: true, interrupt: false, again: true })
    expect(decide(k, { ...spoke(k, 10_000), speaking: true }, 14_500, GAP, CLOSER, TALK)).toEqual({ speak: false, why: 'repeat' })
  })
  it('on: clear is said again too', () => {
    const c = muse('clear')
    expect(decide(c, after(c, 0), 4_000, GAP, CLOSER, TALK).speak).toBe(true)
  })
  it('a Talk more repeat of a fast hit has no cue', () => {
    expect(fastCue('fast', { speak: true, interrupt: false, again: true })).toBe(false)
  })
})
