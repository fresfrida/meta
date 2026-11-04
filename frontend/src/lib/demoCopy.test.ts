// Brief 19: the public demo wording, verbatim (Owner approved 4 Nov), and the minutes taken from DEMO_SLOT_S.
import { describe, expect, it } from 'vitest'
import { strings } from '../strings'
import { formatLeft, minutesText } from './demoSlot'

const d = strings.demo

describe('public demo copy (verbatim)', () => {
  it('welcome screen', () => {
    expect(d.welcomeTitle).toBe('Try Second Eyes')
    expect(d.welcomeLine).toBe(
      'Point your phone ahead. Second Eyes tells you about steps, kerbs and other things in your path, out loud.',
    )
    expect(d.youHave(minutesText(180))).toBe('You have 3 minutes.')
    expect(d.askBullet).toBe('Ask anything: say "Hey Eyes, what\'s in front of me?"')
    expect(d.privacyBullet).toBe(
      "Faces are blurred on your phone. Images and questions go to Meta's AI to be understood, and we don't keep them.",
    )
    expect(d.safety).toBe('This is an early demo. Please keep using your cane or guide, and take extra care near roads.')
    expect(d.start(minutesText(180))).toBe('Start my 3 minutes')
  })
  it('countdown, time up, spots taken, rate limited', () => {
    expect(d.left(formatLeft(161_000))).toBe('2:41 left')
    expect(d.timeUp(minutesText(180))).toBe("That's your 3 minutes. Thank you for trying Second Eyes.")
    expect(d.full(true)).toBe("Today's demo spots are all taken. Please come back tomorrow, or watch the demo video.")
    expect(d.full(false)).toBe("Today's demo spots are all taken. Please come back tomorrow.")
    expect(d.watchVideo).toBe('Watch the video')
    expect(d.tryLater).toBe('Lots of people are trying Second Eyes right now. Please try again in a minute.')
  })
  it('minutes follow DEMO_SLOT_S', () => {
    expect(minutesText(180)).toBe('3 minutes')
    expect(minutesText(300)).toBe('5 minutes')
    expect(minutesText(60)).toBe('1 minute')
    expect(minutesText(20)).toBe('1 minute')
  })
})
