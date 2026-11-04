import { afterEach, describe, expect, it, vi } from 'vitest'
import { chooseVoice, pickVoice, recommendedVoice, voiceStatus, voicesFor, waitForVoices } from './voices'

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
