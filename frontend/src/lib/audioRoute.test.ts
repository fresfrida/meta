// Brief 27: route changes and interruptions are noticed, counted and handed to the app.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetRouteDebug, routeDebug, watchAudioRoute } from './audioRoute'

class Source extends EventTarget {
  state = 'running'
}

beforeEach(() => resetRouteDebug())

describe('audio route watcher', () => {
  it('headphones in / out (devicechange), audio session and context changes each call the handler', () => {
    const session = new Source()
    const devices = new Source()
    const context = new Source()
    const onChange = vi.fn()
    watchAudioRoute({ session, devices, context }, onChange)
    devices.dispatchEvent(new Event('devicechange'))
    session.state = 'interrupted'
    session.dispatchEvent(new Event('statechange'))
    context.state = 'interrupted'
    context.dispatchEvent(new Event('statechange'))
    expect(onChange.mock.calls.map((c) => c[0])).toEqual(['devicechange', 'session interrupted', 'audio interrupted'])
    expect(routeDebug()).toEqual({ changes: 3, last: 'audio interrupted' })
  })

  it("the app's own suspend / resume of the context is not a route change", () => {
    const context = new Source()
    const onChange = vi.fn()
    watchAudioRoute({ session: null, devices: null, context }, onChange)
    context.state = 'suspended'
    context.dispatchEvent(new Event('statechange'))
    context.state = 'running'
    context.dispatchEvent(new Event('statechange'))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('stops listening when removed; missing sources (Android: no audioSession) are fine', () => {
    const devices = new Source()
    const onChange = vi.fn()
    const stop = watchAudioRoute({ session: null, devices, context: null }, onChange)
    stop()
    devices.dispatchEvent(new Event('devicechange'))
    expect(onChange).not.toHaveBeenCalled()
  })
})
