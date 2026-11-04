import { afterEach, describe, expect, it, vi } from 'vitest'
import { chooseVoice, pickVoice, recommendedVoice, voiceIds, voiceRows, voiceStatus, voicesFor, waitForVoices } from './voices'

const v = (lang: string, name = lang, localService = true) => ({ lang, name, localService })
const voices = [v('en-US', 'Samantha'), v('en-GB', 'Daniel'), v('zh_CN', 'Tingting'), v('ms-MY', 'Amira')]

describe('voicesFor / recommendedVoice', () => {
  it('exact lang first, accepts _ separators; base language when no exact match', () => {
    expect(recommendedVoice(voices, 'en-GB')?.name).toBe('Daniel')
    expect(recommendedVoice(voices, 'zh-CN')?.name).toBe('Tingting')
    expect(recommendedVoice([v('en-US', 'Samantha')], 'en-GB')?.name).toBe('Samantha')
    expect(recommendedVoice(voices, 'ta-IN')).toBeNull()
  })
  it('prefers an on-device higher-quality voice (Android style list)', () => {
    const android = [
      v('en-GB', 'English United Kingdom'),
      v('en-GB', 'Google UK English Female', true),
      v('en-GB', 'English (UK) Enhanced Network', false),
      v('en-US', 'Google US English'),
    ]
    expect(recommendedVoice(android, 'en-GB')?.name).toBe('Google UK English Female')
  })
  it('a network-only quality voice loses to an on-device one', () => {
    const list = [v('en-GB', 'Google UK English Male', false), v('en-GB', 'Kate')]
    expect(recommendedVoice(list, 'en-GB')?.name).toBe('Kate')
  })
  it('deterministic: the same list in any order gives the same voice', () => {
    const list = [v('en-GB', 'Serena Premium'), v('en-GB', 'Daniel Enhanced'), v('en-GB', 'Arthur')]
    const reversed = [...list].reverse()
    expect(recommendedVoice(list, 'en-GB')?.name).toBe('Daniel Enhanced')
    expect(recommendedVoice(reversed, 'en-GB')?.name).toBe('Daniel Enhanced')
  })
  it('voicesFor lists the language, sorted by name', () => {
    expect(voicesFor([v('en-GB', 'Zoe'), v('en-GB', 'Amy'), v('ms-MY', 'Amira')], 'en-GB').map((x) => x.name)).toEqual(['Amy', 'Zoe'])
  })
})

describe('remembered choice', () => {
  const list = [v('en-GB', 'Google UK English Female'), v('en-GB', 'Daniel')]
  it('uses the remembered voice while the phone has it', () => {
    expect(chooseVoice(list, 'en-GB', 'Daniel')?.name).toBe('Daniel')
  })
  it('falls back to the recommended voice when it disappears', () => {
    expect(chooseVoice(list, 'en-GB', 'Gone Voice')?.name).toBe('Google UK English Female')
    expect(chooseVoice(list, 'en-GB', null)?.name).toBe('Google UK English Female')
  })
  afterEach(() => vi.unstubAllGlobals())
  it('pickVoice reads the choice per language from storage (blocked storage = no choice)', () => {
    const store = new Map([['second-eyes.voice.en-gb', 'Daniel']])
    vi.stubGlobal('window', { localStorage: { getItem: (k: string) => store.get(k) ?? null } })
    expect(pickVoice(list, 'en-GB')?.name).toBe('Daniel')
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('blocked')
        },
      },
    })
    expect(pickVoice(list, 'en-GB')?.name).toBe('Google UK English Female')
  })
})

describe('voiceStatus', () => {
  it('installed / missing / unknown', () => {
    expect(voiceStatus(voices, 'ms-MY')).toBe('installed')
    expect(voiceStatus(voices, 'ta-IN')).toBe('missing')
    expect(voiceStatus([], 'en-GB')).toBe('unknown')
  })
})

describe('waitForVoices', () => {
  const fakeSynth = (initial: SpeechSynthesisVoice[]) => {
    let list = initial
    const listeners = new Set<() => void>()
    return {
      getVoices: () => list,
      addEventListener: (_: string, f: () => void) => listeners.add(f),
      removeEventListener: (_: string, f: () => void) => listeners.delete(f),
      load: (next: SpeechSynthesisVoice[]) => {
        list = next
        listeners.forEach((f) => f())
      },
      listeners,
    }
  }
  const voice = { lang: 'en-GB', name: 'Daniel' } as SpeechSynthesisVoice
  it('already loaded: resolves at once', async () => {
    expect(await waitForVoices(fakeSynth([voice]) as never, 1500)).toEqual([voice])
  })
  it('waits for voiceschanged', async () => {
    vi.useFakeTimers()
    const synth = fakeSynth([])
    const p = waitForVoices(synth as never, 1500)
    vi.advanceTimersByTime(400)
    synth.load([voice])
    expect(await p).toEqual([voice])
    expect(synth.listeners.size).toBe(0)
    vi.useRealTimers()
  })
  it('gives up after the wait (no voices at all)', async () => {
    vi.useFakeTimers()
    const p = waitForVoices(fakeSynth([]) as never, 1500)
    vi.advanceTimersByTime(1500)
    expect(await p).toEqual([])
    vi.useRealTimers()
  })
})

describe('Android-like list (Brief 22)', () => {
  // Several voices share a name and URI; zh has CN / HK / MO / MY; one Tamil voice.
  const a = (lang: string, name: string, voiceURI = name, localService = true) => ({ lang, name, voiceURI, localService })
  const android = [
    a('zh-HK', 'Chinese Hong Kong'),
    a('zh-HK', 'Chinese Hong Kong'),
    a('zh-MO', 'Chinese Macao'),
    a('zh-MY', 'Chinese Malaysia'),
    a('zh-CN', 'Chinese China'),
    a('zh-CN', 'Chinese China'),
    a('zh-CN', 'Chinese China', 'Chinese China', false),
    a('ta-IN', 'Tamil India'),
    a('en-GB', 'English United Kingdom'),
  ]
  const one = (rows: { selected: boolean }[]) => rows.filter((r) => r.selected).length
  it('zh -> ta -> zh: only that language, exactly one selected, unique keys', () => {
    const zh = voiceRows(android, 'zh-CN', null)
    expect(zh.map((r) => r.label)).toEqual(['Chinese China', 'Chinese China · 2', 'Chinese China · 3'])
    expect(new Set(zh.map((r) => r.key)).size).toBe(3)
    expect(one(zh)).toBe(1)
    expect(zh.find((r) => r.recommended)?.voice.lang).toBe('zh-CN')

    const ta = voiceRows(android, 'ta-IN', null)
    expect(ta.map((r) => r.label)).toEqual(['Tamil India'])
    expect(ta[0]).toMatchObject({ selected: true, recommended: true })

    const pick = zh[1].key // the second "Chinese China"
    const zhAgain = voiceRows(android, 'zh-CN', pick)
    expect(zhAgain.map((r) => r.label)).toEqual(['Chinese China', 'Chinese China · 2', 'Chinese China · 3'])
    expect(one(zhAgain)).toBe(1)
    expect(zhAgain.find((r) => r.selected)?.key).toBe(pick)
  })
  it('no zh-CN voice: the base language (other zh) as before', () => {
    const noCN = android.filter((v) => v.lang !== 'zh-CN')
    expect(voiceRows(noCN, 'zh-CN', null).map((r) => r.label)).toEqual([
      'Chinese Hong Kong',
      'Chinese Hong Kong · 2',
      'Chinese Macao',
      'Chinese Malaysia',
    ])
  })
  it('a remembered id that is gone falls back to the recommended voice; an old name still matches', () => {
    expect(chooseVoice(android, 'zh-CN', 'Chinese China#9')?.voiceURI).toBe('Chinese China')
    expect(chooseVoice(android, 'ta-IN', 'Tamil India')?.lang).toBe('ta-IN')
  })
  it('ids: voiceURI, numbered when repeated; name + lang when the URI is empty', () => {
    expect(voiceIds([a('zh-CN', 'X'), a('zh-CN', 'X'), a('zh-CN', 'Y', '')])).toEqual(['X', 'X#2', 'Y|zh-CN'])
  })
})
