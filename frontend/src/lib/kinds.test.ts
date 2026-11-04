// Prompt v5 kinds (Brief 12): every kind's screen and voice words in 4 languages, verbatim as the Owner approved
// them, through the existing templates; and the repeat rule for person / people.
import { describe, expect, it } from 'vitest'
import type { Hazard } from '../api/types'
import type { Lang } from '../config'
import { type AnnounceState, INITIAL_ANNOUNCE, decide, kindOf, spoke } from './announce'
import { lampFor } from './light'
import { type Shown, phraseFor, speechFor } from './phrase'

type Kind = Exclude<Hazard, 'step_down' | 'step_up' | 'curb' | 'clear' | 'unsure'>

// Screen word / voice word, verbatim from Brief 12.
const WORDS: Record<Lang, Record<Kind, [string, string]>> = {
  en: {
    drain: ['Drain', 'An open drain'],
    head_height: ['Head height', 'Something at head height'],
    person: ['Person', 'A person'],
    people: ['People', 'Several people'],
    bike: ['Bike', 'A bicycle or scooter'],
    vehicle: ['Vehicle', 'A vehicle'],
    pole: ['Pole', 'A pole'],
    barrier: ['Barrier', 'A barrier'],
    ramp: ['Ramp', 'A ramp'],
    door: ['Door', 'A door'],
    wall: ['Wall', 'A wall'],
    obstacle: ['In the way', 'Something you could walk into'],
  },
  zh: {
    drain: ['水沟', '没有盖的水沟'],
    head_height: ['头顶障碍', '头部高度的障碍物'],
    person: ['行人', '人'],
    people: ['人群', '很多人'],
    bike: ['自行车', '自行车或滑板车'],
    vehicle: ['车辆', '车'],
    pole: ['柱子', '柱子'],
    barrier: ['路障', '路障'],
    ramp: ['坡道', '坡道'],
    door: ['门', '门'],
    wall: ['墙', '墙'],
    obstacle: ['障碍物', '可能会撞到的东西'],
  },
  ms: {
    drain: ['Longkang', 'longkang terbuka'],
    head_height: ['Paras kepala', 'sesuatu di paras kepala'],
    person: ['Orang', 'orang'],
    people: ['Ramai orang', 'ramai orang'],
    bike: ['Basikal', 'basikal atau skuter'],
    vehicle: ['Kenderaan', 'kenderaan'],
    pole: ['Tiang', 'tiang'],
    barrier: ['Penghadang', 'penghadang'],
    ramp: ['Landaian', 'landaian'],
    door: ['Pintu', 'pintu'],
    wall: ['Dinding', 'dinding'],
    obstacle: ['Halangan', 'sesuatu yang boleh dilanggar'],
  },
  ta: {
    drain: ['வடிகால்', 'திறந்த வடிகால் உள்ளது'],
    head_height: ['தலை உயரத் தடை', 'தலை உயரத்தில் ஏதோ உள்ளது'],
    person: ['நபர்', 'ஒருவர் இருக்கிறார்'],
    people: ['மக்கள் கூட்டம்', 'பலர் இருக்கிறார்கள்'],
    bike: ['மிதிவண்டி', 'மிதிவண்டி அல்லது ஸ்கூட்டர் உள்ளது'],
    vehicle: ['வாகனம்', 'வாகனம் உள்ளது'],
    pole: ['கம்பம்', 'கம்பம் உள்ளது'],
    barrier: ['தடுப்பு', 'தடுப்பு உள்ளது'],
    ramp: ['சாய்வுப் பாதை', 'சாய்வுப் பாதை உள்ளது'],
    door: ['கதவு', 'கதவு உள்ளது'],
    wall: ['சுவர்', 'சுவர் உள்ளது'],
    obstacle: ['தடை', 'மோதக்கூடிய ஒன்று உள்ளது'],
  },
}

// The existing templates (unchanged), filled by hand: metres = 3 m on the right; plain = near, ahead.
const EXPECT: Record<Lang, { screenM: (h: string) => string; screenNear: (h: string) => string; voiceM: (w: string) => string; voiceNear: (w: string) => string }> = {
  en: {
    screenM: (h) => `${h}, 3 metres, right`,
    screenNear: (h) => `${h} ahead, close`,
    voiceM: (w) => `${w}, about 3 metres ahead, on your right.`,
    voiceNear: (w) => `${w} just ahead.`,
  },
  zh: {
    screenM: (h) => `右前方3米，${h}`,
    screenNear: (h) => `前方${h}，很近`,
    voiceM: (w) => `右前方大约3米，有${w}。`,
    voiceNear: (w) => `前面很近的地方有${w}。`,
  },
  ms: {
    screenM: (h) => `${h}, 3 meter, sebelah kanan`,
    screenNear: (h) => `${h} di hadapan, dekat`,
    voiceM: (w) => `Ada ${w} kira-kira 3 meter di hadapan, di sebelah kanan.`,
    voiceNear: (w) => `Ada ${w} dekat di hadapan.`,
  },
  ta: {
    screenM: (h) => `${h}, 3 மீட்டர், வலது பக்கம்`,
    screenNear: (h) => `முன்னால் ${h}, அருகில்`,
    voiceM: (w) => `சுமார் 3 மீட்டர் முன்னால், உங்கள் வலது பக்கம், ${w}.`,
    voiceNear: (w) => `மிக அருகில் முன்னால், ${w}.`,
  },
}

const metres = (hazard: Kind): Shown => ({ hazard, side: 'right', distance: 'far', distance_m: 3 })
const near = (hazard: Kind): Shown => ({ hazard, side: 'ahead', distance: 'near', distance_m: null })

describe.each(Object.keys(WORDS) as Lang[])('every v5 kind in %s', (lang) => {
  it.each(Object.keys(WORDS[lang]) as Kind[])('%s: screen and voice, with metres and near', (kind) => {
    const [screen, voice] = WORDS[lang][kind]
    const e = EXPECT[lang]
    expect(phraseFor(metres(kind), lang)).toBe(e.screenM(screen))
    expect(phraseFor(near(kind), lang)).toBe(e.screenNear(screen))
    expect(speechFor(metres(kind), lang)).toBe(e.voiceM(voice))
    expect(speechFor(near(kind), lang)).toBe(e.voiceNear(voice))
  })
})

describe('traffic light is unchanged for the new kinds', () => {
  it.each(Object.keys(WORDS.en) as Kind[])('%s: amber at 3 m, red at 2 m or near', (kind) => {
    expect(lampFor(metres(kind))).toBe('amber')
    expect(lampFor({ ...metres(kind), distance_m: 2 })).toBe('red')
    expect(lampFor(near(kind))).toBe('red')
  })
})

describe('repeat rule: person and people are one kind; switching between them adds something', () => {
  const GAP = 1500
  const CLOSER = 2
  const after = (x: Shown, at: number): AnnounceState => ({ ...spoke(x, at), speaking: false })
  const p = (hazard: 'person' | 'people', m = 4): Shown => ({ hazard, side: 'ahead', distance: 'far', distance_m: m })

  it('kindOf joins them', () => {
    expect(kindOf('person')).toBe(kindOf('people'))
    expect(kindOf('pole')).toBe('pole')
  })
  it('person -> people speaks, and back', () => {
    expect(decide(p('people'), after(p('person'), 0), 5_000, GAP, CLOSER).speak).toBe(true)
    expect(decide(p('person'), after(p('people'), 0), 5_000, GAP, CLOSER).speak).toBe(true)
  })
  it('the same again stays silent unless 2 m closer', () => {
    expect(decide(p('people'), after(p('people'), 0), 5_000, GAP, CLOSER)).toEqual({ speak: false, why: 'repeat' })
    expect(decide(p('people', 2), after(p('people'), 0), 5_000, GAP, CLOSER).speak).toBe(true)
  })
  it('other new kinds are their own kind: pole after door speaks, door after door does not', () => {
    const door: Shown = { hazard: 'door', side: 'ahead', distance: 'far', distance_m: 3 }
    expect(decide({ ...door, hazard: 'pole' }, after(door, 0), 5_000, GAP, CLOSER).speak).toBe(true)
    expect(decide(door, after(door, 0), 5_000, GAP, CLOSER)).toEqual({ speak: false, why: 'repeat' })
  })
  it('steps still behave as before', () => {
    const down: Shown = { hazard: 'step_down', side: 'ahead', distance: 'far', distance_m: 4 }
    expect(decide({ ...down, hazard: 'step_up' }, after(down, 0), 5_000, GAP, CLOSER).speak).toBe(true)
    expect(decide(down, after(down, 0), 5_000, GAP, CLOSER)).toEqual({ speak: false, why: 'repeat' })
    expect(decide(down, INITIAL_ANNOUNCE, 5_000, GAP, CLOSER).speak).toBe(true)
  })
})
