import { describe, expect, it } from 'vitest'
import { pickVoice, voiceStatus } from './voices'

const v = (lang: string, name = lang) => ({ lang, name })
const voices = [v('en-US', 'Samantha'), v('en-GB', 'Daniel'), v('zh_CN', 'Tingting'), v('ms-MY', 'Amira')]

describe('pickVoice', () => {
  it('prefers the exact lang, accepts _ separators', () => {
    expect(pickVoice(voices, 'en-GB')?.name).toBe('Daniel')
    expect(pickVoice(voices, 'zh-CN')?.name).toBe('Tingting')
  })
  it('falls back to the same base language', () => {
    expect(pickVoice([v('en-US', 'Samantha')], 'en-GB')?.name).toBe('Samantha')
  })
  it('returns null when the language is missing', () => {
    expect(pickVoice(voices, 'ta-IN')).toBeNull()
  })
})

describe('voiceStatus', () => {
  it('installed / missing / unknown', () => {
    expect(voiceStatus(voices, 'ms-MY')).toBe('installed')
    expect(voiceStatus(voices, 'ta-IN')).toBe('missing')
    expect(voiceStatus([], 'en-GB')).toBe('unknown')
  })
})
