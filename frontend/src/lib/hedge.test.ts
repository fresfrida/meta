// Brief 13b: the hedge rule, the repeat rule around it, and "There might be ..." in every kind x 4 languages.
import { describe, expect, it } from 'vitest'
import type { DetectHit, ShownHazard } from '../api/types'
import type { Lang } from '../config'
import { type AnnounceState, decide, spoke } from './announce'
import { museHedged, samHedged } from './hedge'
import { lampFor } from './light'
import { fastRecentlySaid, hitAsShown, rememberSpoken } from './merge'
import { type Shown, phraseFor, speechFor } from './phrase'
import { TA_VERB, phrases } from '../strings'

const GAP = 1500
const CLOSER = 2
const after = (x: Shown, at: number): AnnounceState => ({ ...spoke(x, at), speaking: false })
const hit = (confidence: number, distance_m: number | null = 3): DetectHit => ({
  kind: 'curb',
  box: [100, 600, 900, 750],
  confidence,
  side: 'ahead',
  distance: distance_m === null ? 'near' : 'far',
  distance_m,
})

describe('hedge rule', () => {
  it('Muse: a warning with sure=false is hedged; sure=true, clear and unsure are not', () => {
    expect(museHedged({ hazard: 'curb', sure: false })).toBe(true)
    expect(museHedged({ hazard: 'curb', sure: true })).toBe(false)
    expect(museHedged({ hazard: 'clear', sure: false })).toBe(false)
    expect(museHedged({ hazard: 'unsure', sure: false })).toBe(false)
  })
  it('SAM: a kept hit below 0.7 is hedged, 0.7 and above is not', () => {
    expect(samHedged({ confidence: 0.69 }, 0.7)).toBe(true)
    expect(samHedged({ confidence: 0.7 }, 0.7)).toBe(false)
    expect(hitAsShown(hit(0.55)).hedged).toBe(true)
    expect(hitAsShown(hit(0.86)).hedged).toBe(false)
  })
  it('hedged warnings keep the same lamp', () => {
    expect(lampFor({ ...hitAsShown(hit(0.55)) })).toBe('amber')
    expect(lampFor({ ...hitAsShown(hit(0.55, null)) })).toBe('red')
  })
})

describe('repeat rule with hedges', () => {
  const maybe = hitAsShown(hit(0.55))
  const sure = hitAsShown(hit(0.9))
  it('a sure answer of the same kind and distance after a hedged one speaks once', () => {
    const s = after(maybe, 0)
    expect(decide(sure, s, 5_000, GAP, CLOSER).speak).toBe(true)
    expect(decide(sure, after(sure, 5_000), 9_000, GAP, CLOSER)).toEqual({ speak: false, why: 'repeat' })
  })
  it('hedged again after hedged, or hedged after sure, stays silent', () => {
    expect(decide(maybe, after(maybe, 0), 5_000, GAP, CLOSER)).toEqual({ speak: false, why: 'repeat' })
    expect(decide(maybe, after(sure, 0), 5_000, GAP, CLOSER)).toEqual({ speak: false, why: 'repeat' })
  })
  it('the fast per-kind memory lets the sure version through too', () => {
    const kinds = rememberSpoken({}, maybe, 0)
    expect(fastRecentlySaid(sure, kinds, 3_000, 10_000, CLOSER)).toBe(false)
    expect(fastRecentlySaid(maybe, kinds, 3_000, 10_000, CLOSER)).toBe(true)
  })
})

// The approved templates, filled by hand (3 m on the right; near ahead), for every voice word.
const HEDGE: Record<Lang, { m: (w: string) => string; near: (w: string) => string }> = {
  en: {
    m: (w) => `There might be ${w.charAt(0).toLowerCase() + w.slice(1)} about 3 metres ahead, on your right.`,
    near: (w) => `There might be ${w.charAt(0).toLowerCase() + w.slice(1)} very close.`,
  },
  zh: { m: (w) => `右前方大约3米，可能有${w}。`, near: (w) => `前面很近的地方可能有${w}。` },
  ms: {
    m: (w) => `Mungkin ada ${w} kira-kira 3 meter di hadapan, di sebelah kanan.`,
    near: (w) => `Mungkin ada ${w} sangat dekat di hadapan.`,
  },
  ta: {
    m: (w) => `சுமார் 3 மீட்டர் முன்னால், உங்கள் வலது பக்கம், ${w.replace(TA_VERB, ' இருக்கலாம்')}.`,
    near: (w) => `மிக அருகில் முன்னால், ${w.replace(TA_VERB, ' இருக்கலாம்')}.`,
  },
}

describe.each(Object.keys(HEDGE) as Lang[])('hedged speech in %s', (lang) => {
  const words = phrases[lang].voice.hazard
  it.each(Object.keys(words) as Exclude<ShownHazard, 'clear' | 'unsure'>[])('%s', (kind) => {
    const m: Shown = { hazard: kind, side: 'right', distance: 'far', distance_m: 3, hedged: true }
    const n: Shown = { hazard: kind, side: 'ahead', distance: 'near', distance_m: null, hedged: true }
    expect(speechFor(m, lang)).toBe(HEDGE[lang].m(words[kind]))
    expect(speechFor(n, lang)).toBe(HEDGE[lang].near(words[kind]))
    if (lang === 'ta') expect(words[kind]).toMatch(TA_VERB) // every Tamil word has a verb to replace
  })
})

describe('hedged examples, verbatim', () => {
  const kerb: Shown = { hazard: 'curb', side: 'ahead', distance: 'far', distance_m: 3, hedged: true }
  it('voice', () => {
    expect(speechFor(kerb, 'en')).toBe('There might be a kerb about 3 metres ahead.')
    expect(speechFor({ ...kerb, hazard: 'step_down' }, 'en')).toBe('There might be steps going down about 3 metres ahead.')
    expect(speechFor(kerb, 'zh')).toBe('前面大约3米，可能有路缘石。')
    expect(speechFor(kerb, 'ms')).toBe('Mungkin ada bebendul jalan kira-kira 3 meter di hadapan.')
    expect(speechFor(kerb, 'ta')).toBe('சுமார் 3 மீட்டர் முன்னால், நடைபாதை ஓரம் இருக்கலாம்.')
  })
  it('screen: "?" at the end of the whole phrase (ZH full-width ？)', () => {
    expect(phraseFor(kerb, 'en')).toBe('Kerb, 3 metres?')
    expect(phraseFor({ ...kerb, distance: 'near', distance_m: null }, 'en')).toBe('Kerb ahead, close?')
    expect(phraseFor(kerb, 'ms')).toBe('Bebendul jalan, 3 meter?')
    expect(phraseFor(kerb, 'ta')).toBe('நடைபாதை விளிம்பு, 3 மீட்டர்?')
    expect(phraseFor(kerb, 'zh')).toBe('前方3米，路缘？')
    expect(phraseFor({ ...kerb, side: 'left', distance: 'near', distance_m: null }, 'zh')).toBe('左前方路缘，很近？')
    expect(phraseFor({ ...kerb, hedged: false }, 'en')).toBe('Kerb, 3 metres')
  })
})
