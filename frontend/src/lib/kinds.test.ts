// Prompt v5 / v6 kinds (Briefs 12, 13): every kind's screen and voice words in 4 languages, verbatim as the Owner
// approved them through the existing templates; and the repeat rule for person / people.
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
    people: ['People', 'A group of people'],
    bike: ['Bike', 'A bicycle or scooter'],
    vehicle: ['Vehicle', 'A vehicle'],
    pole: ['Pole', 'A pole'],
    barrier: ['Barrier', 'A barrier'],
    ramp: ['Ramp', 'A ramp'],
    door: ['Door', 'A door'],
    wall: ['Wall', 'A wall'],
    road: ['Road', 'The edge of a road'],
    crossing: ['Crossing', 'A pedestrian crossing'],
    cycle_path: ['Cycle path', 'A cycle path'],
    escalator: ['Escalator', 'An escalator'],
    lift: ['Lift', 'A lift'], // Brief 28, Owner approved 5 Nov
    uneven: ['Uneven ground', 'Uneven ground'],
    obstacle: ['In your path', 'Something in your path'],
  },
  zh: {
    drain: ['水沟', '敞开的水沟'],
    head_height: ['头顶障碍', '头部高度的障碍物'],
    person: ['行人', '人'],
    people: ['人群', '一群人'],
    bike: ['自行车', '自行车或滑板车'],
    vehicle: ['车辆', '车'],
    pole: ['柱子', '柱子'],
    barrier: ['路障', '路障'],
    ramp: ['坡道', '坡道'],
    door: ['门', '门'],
    wall: ['墙', '墙'],
    road: ['路边', '马路边缘'],
    crossing: ['人行横道', '人行横道'],
    cycle_path: ['自行车道', '自行车道'],
    escalator: ['扶梯', '自动扶梯'],
    lift: ['电梯', '电梯'],
    uneven: ['地面不平', '不平的地面'],
    obstacle: ['挡路物', '挡路的东西'],
  },
  ms: {
    drain: ['Longkang', 'longkang terbuka'],
    head_height: ['Paras kepala', 'sesuatu di paras kepala'],
    person: ['Orang', 'orang'],
    people: ['Sekumpulan orang', 'sekumpulan orang'],
    bike: ['Basikal', 'basikal atau skuter'],
    vehicle: ['Kenderaan', 'kenderaan'],
    pole: ['Tiang', 'tiang'],
    barrier: ['Penghadang', 'penghadang'],
    ramp: ['Landaian', 'landaian'],
    door: ['Pintu', 'pintu'],
    wall: ['Dinding', 'dinding'],
    road: ['Tepi jalan', 'tepi jalan raya'],
    crossing: ['Lintasan', 'lintasan pejalan kaki'],
    cycle_path: ['Laluan basikal', 'laluan basikal'],
    escalator: ['Eskalator', 'eskalator'],
    lift: ['Lif', 'lif'],
    uneven: ['Tidak rata', 'permukaan tidak rata'],
    obstacle: ['Di laluan anda', 'sesuatu di laluan anda'],
  },
  ta: {
    drain: ['வடிகால்', 'திறந்த வடிகால் உள்ளது'],
    head_height: ['தலை உயரத் தடை', 'தலை உயரத்தில் ஏதோ உள்ளது'],
    person: ['நபர்', 'ஒருவர் இருக்கிறார்'],
    people: ['மக்கள் கூட்டம்', 'மக்கள் கூட்டம் உள்ளது'],
    bike: ['மிதிவண்டி', 'மிதிவண்டி அல்லது ஸ்கூட்டர் உள்ளது'],
    vehicle: ['வாகனம்', 'வாகனம் உள்ளது'],
    pole: ['கம்பம்', 'கம்பம் உள்ளது'],
    barrier: ['தடுப்பு', 'தடுப்பு உள்ளது'],
    ramp: ['சாய்வுப் பாதை', 'சாய்வுப் பாதை உள்ளது'],
    door: ['கதவு', 'கதவு உள்ளது'],
    wall: ['சுவர்', 'சுவர் உள்ளது'],
    road: ['சாலை ஓரம்', 'சாலையின் ஓரம் உள்ளது'],
    crossing: ['பாதசாரி கடவை', 'பாதசாரி கடவை உள்ளது'],
    cycle_path: ['மிதிவண்டிப் பாதை', 'மிதிவண்டிப் பாதை உள்ளது'],
    escalator: ['நகரும் படிக்கட்டு', 'நகரும் படிக்கட்டு உள்ளது'],
    lift: ['லிஃப்ட்', 'லிஃப்ட் உள்ளது'],
    uneven: ['சீரற்ற தரை', 'சீரற்ற தரை உள்ளது'],
    obstacle: ['பாதையில் தடை', 'உங்கள் பாதையில் ஏதோ ஒன்று உள்ளது'],
  },
}

// The existing templates (unchanged), filled by hand: metres = 3 m on the right; plain = near, ahead.
const EXPECT: Record<Lang, { screenM: (h: string) => string; screenNear: (h: string) => string; voiceM: (w: string) => string; voiceNear: (w: string) => string }> = {
  en: {
    screenM: (h) => `${h}, 3 metres, right`,
    screenNear: (h) => `${h} ahead, close`,
    voiceM: (w) => `${w}, about 3 metres ahead, on your right.`,
    voiceNear: (w) => `${w} very close.`,
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
    voiceNear: (w) => `Ada ${w} sangat dekat di hadapan.`,
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

describe('ZH drain voice word (Owner approved 4 Nov: 敞开的水沟)', () => {
  it('reads as a statement, not a question', () => {
    const drain = (distance_m: number | null): Shown => ({
      hazard: 'drain',
      side: distance_m === null ? 'ahead' : 'right',
      distance: distance_m === null ? 'near' : 'far',
      distance_m,
    })
    expect(speechFor(drain(3), 'zh')).toBe('右前方大约3米，有敞开的水沟。')
    expect(speechFor(drain(null), 'zh')).toBe('前面很近的地方有敞开的水沟。')
    expect(phraseFor(drain(3), 'zh')).toBe('右前方3米，水沟')
  })
})

describe('clear words (Brief 13): never "the path looks clear"', () => {
  const clear: Shown = { hazard: 'clear', side: null, distance: null, distance_m: null }
  it.each([
    ['en', 'Nothing seen', 'Nothing seen in your path.'],
    ['zh', '未见障碍', '前面的路上没有看到障碍。'],
    ['ms', 'Tiada apa-apa', 'Tiada apa-apa dilihat di laluan anda.'],
    ['ta', 'எதுவும் தெரியவில்லை', 'உங்கள் பாதையில் எதுவும் தெரியவில்லை.'],
  ] as [Lang, string, string][])('%s', (lang, screen, voice) => {
    expect(phraseFor(clear, lang)).toBe(screen)
    expect(speechFor(clear, lang)).toBe(voice)
  })
})

describe('road kinds are never green: amber, red when near or <= 2 m', () => {
  it.each(['road', 'crossing', 'cycle_path'] as Kind[])('%s', (kind) => {
    expect(lampFor({ hazard: kind, distance: 'far', distance_m: 8 })).toBe('amber')
    expect(lampFor({ hazard: kind, distance: 'far', distance_m: null })).toBe('amber')
    expect(lampFor({ hazard: kind, distance: 'far', distance_m: 2 })).toBe('red')
    expect(lampFor({ hazard: kind, distance: 'near', distance_m: null })).toBe('red')
  })
})

describe('lift (Brief 28, Owner approved 5 Nov): the full spoken lines', () => {
  const lift = (distance_m: number | null, near = false) =>
    ({ hazard: 'lift', side: 'ahead', distance: near ? 'near' : 'far', distance_m, hedged: false }) as Shown
  it('EN "A lift, about 3 metres ahead." and screen "Lift, 3 metres"', () => {
    expect(speechFor(lift(3), 'en')).toBe('A lift, about 3 metres ahead.')
    expect(phraseFor(lift(3), 'en')).toBe('Lift, 3 metres')
  })
  it('ZH / MS / TA use the approved words', () => {
    expect(speechFor(lift(3), 'zh')).toContain('电梯')
    expect(speechFor(lift(3), 'ms')).toContain('lif')
    expect(speechFor(lift(3), 'ta')).toContain('லிஃப்ட் உள்ளது')
  })
})
