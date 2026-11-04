import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { DemoWelcome } from '../components/Demo'
import { strings } from '../strings'
import { stoppedScreen } from './screen'

describe('stopped screens (Brief 21)', () => {
  it('public: welcome -> settings -> done -> welcome', () => {
    const at = (settingsOpen: boolean) => stoppedScreen({ refused: false, settingsOpen, publicDemo: true })
    expect(at(false)).toBe('welcome')
    expect(at(true)).toBe('settings')
    expect(at(false)).toBe('welcome')
  })
  it('Mac (not public): home -> settings -> home; spots taken wins', () => {
    expect(stoppedScreen({ refused: false, settingsOpen: false, publicDemo: false })).toBe('home')
    expect(stoppedScreen({ refused: false, settingsOpen: true, publicDemo: false })).toBe('settings')
    expect(stoppedScreen({ refused: true, settingsOpen: true, publicDemo: true })).toBe('full')
  })
  it('the welcome screen has the same Settings gear as Home', () => {
    const html = renderToStaticMarkup(
      createElement(DemoWelcome, { minutes: '3 minutes', canAsk: false, onStart: () => {}, onSettings: () => {}, disabled: false }),
    )
    expect(html).toContain(`class="icon-button" aria-label="${strings.home.settings}"`)
  })
})
