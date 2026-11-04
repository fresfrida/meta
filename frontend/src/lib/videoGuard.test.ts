// Brief 27: a paused or stopped camera picture while running is brought back without a tap.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { guardVideo, resetVideoDebug, videoDebug } from './videoGuard'

class Target extends EventTarget {}

function setup(playOk = true, reopenOk = true) {
  const video = Object.assign(new Target(), { play: vi.fn(() => (playOk ? Promise.resolve() : Promise.reject(new Error('no')))) })
  const track = Object.assign(new Target(), { muted: false, readyState: 'live' })
  const reopen = vi.fn(async () => reopenOk)
  const onFailed = vi.fn()
  const run = { reopened: false }
  const stop = guardVideo(video, track, { reopen, onFailed, muteWaitMs: 2000, run })
  return { video, track, reopen, onFailed, run, stop }
}

beforeEach(() => {
  vi.useFakeTimers()
  resetVideoDebug()
})
afterEach(() => vi.useRealTimers())

describe('video recovery', () => {
  it('a pause: play() again, counted as paused and recovered', async () => {
    const g = setup()
    g.video.dispatchEvent(new Event('pause'))
    await vi.advanceTimersByTimeAsync(0)
    expect(g.video.play).toHaveBeenCalledTimes(1)
    expect(g.reopen).not.toHaveBeenCalled()
    expect(videoDebug()).toEqual({ paused: 1, recovered: 1 })
  })

  it('play() refused: the camera is reopened once', async () => {
    const g = setup(false)
    g.video.dispatchEvent(new Event('pause'))
    await vi.advanceTimersByTimeAsync(0)
    expect(g.reopen).toHaveBeenCalledTimes(1)
    expect(videoDebug().recovered).toBe(1)
  })

  it('the camera track ends: reopen once; a second failure in the same run shows the camera notice', async () => {
    const g = setup()
    g.track.dispatchEvent(new Event('ended'))
    await vi.advanceTimersByTimeAsync(0)
    expect(g.reopen).toHaveBeenCalledTimes(1)
    g.track.dispatchEvent(new Event('ended'))
    expect(g.reopen).toHaveBeenCalledTimes(1)
    expect(g.onFailed).toHaveBeenCalledTimes(1)
  })

  it('reopening fails: the camera notice', async () => {
    const g = setup(true, false)
    g.track.dispatchEvent(new Event('ended'))
    await vi.advanceTimersByTimeAsync(0)
    expect(g.onFailed).toHaveBeenCalledTimes(1)
  })

  it('muted for the wait: reopen; unmuted in time: nothing to do', async () => {
    const g = setup()
    g.track.muted = true
    g.track.dispatchEvent(new Event('mute'))
    await vi.advanceTimersByTimeAsync(1999)
    expect(g.reopen).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(g.reopen).toHaveBeenCalledTimes(1)

    const h = setup()
    h.track.muted = true
    h.track.dispatchEvent(new Event('mute'))
    h.track.muted = false
    h.track.dispatchEvent(new Event('unmute'))
    await vi.advanceTimersByTimeAsync(3000)
    expect(h.reopen).not.toHaveBeenCalled()
  })

  it('after Stop (guard removed) a pause is ignored', async () => {
    const g = setup()
    g.stop()
    g.video.dispatchEvent(new Event('pause'))
    await vi.advanceTimersByTimeAsync(0)
    expect(g.video.play).not.toHaveBeenCalled()
    expect(videoDebug().paused).toBe(0)
  })
})
