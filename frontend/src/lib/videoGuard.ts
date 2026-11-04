// Brief 27: on iOS an audio session change, route change or interruption can pause the camera picture while speech
// goes on (a blank preview, and black frames sent). While running, this notices it and recovers without a tap:
// play() again, or reopen the camera once; if that fails too, the app shows its camera notice.

export interface VideoDebug {
  paused: number
  recovered: number
}

let debug: VideoDebug = { paused: 0, recovered: 0 }
const listeners = new Set<() => void>()

function setDebug(next: Partial<VideoDebug>): void {
  debug = { ...debug, ...next }
  listeners.forEach((l) => l())
}

export function videoDebug(): VideoDebug {
  return debug
}

export function onVideoDebug(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function resetVideoDebug(): void {
  setDebug({ paused: 0, recovered: 0 })
}

type Target = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>
export interface GuardedVideo extends Target {
  play: () => Promise<void>
}
export interface GuardedTrack extends Target {
  muted: boolean
  readyState: string
}

export interface VideoGuardOptions {
  /** Opens the camera again and shows it; resolves false when it could not. Called at most once per run. */
  reopen: () => Promise<boolean>
  /** Recovery failed: show the camera notice. */
  onFailed: () => void
  muteWaitMs: number
  /** Shared across re-guards of one run: the camera is reopened once at most. */
  run: { reopened: boolean }
}

/** Watches one video element and its camera track; returns the function that stops watching. */
export function guardVideo(video: GuardedVideo, track: GuardedTrack | null, o: VideoGuardOptions): () => void {
  let stopped = false
  let muteTimer: ReturnType<typeof setTimeout> | null = null
  const reopenOnce = () => {
    if (stopped) return
    if (o.run.reopened) return o.onFailed()
    o.run.reopened = true
    void o.reopen().then(
      (ok) => (ok ? setDebug({ recovered: debug.recovered + 1 }) : o.onFailed()),
      () => o.onFailed(),
    )
  }
  const onPause = () => {
    if (stopped) return
    setDebug({ paused: debug.paused + 1 })
    video.play().then(
      () => !stopped && setDebug({ recovered: debug.recovered + 1 }),
      () => reopenOnce(),
    )
  }
  const onEnded = () => {
    if (stopped) return
    setDebug({ paused: debug.paused + 1 })
    reopenOnce()
  }
  const onMute = () => {
    if (stopped) return
    setDebug({ paused: debug.paused + 1 })
    if (muteTimer) clearTimeout(muteTimer)
    muteTimer = setTimeout(() => {
      muteTimer = null
      if (!stopped && track?.muted) reopenOnce()
    }, o.muteWaitMs)
  }
  const onUnmute = () => {
    if (stopped || !muteTimer) return
    clearTimeout(muteTimer)
    muteTimer = null
    setDebug({ recovered: debug.recovered + 1 })
  }
  video.addEventListener('pause', onPause)
  track?.addEventListener('ended', onEnded)
  track?.addEventListener('mute', onMute)
  track?.addEventListener('unmute', onUnmute)
  return () => {
    stopped = true
    if (muteTimer) clearTimeout(muteTimer)
    video.removeEventListener('pause', onPause)
    track?.removeEventListener('ended', onEnded)
    track?.removeEventListener('mute', onMute)
    track?.removeEventListener('unmute', onUnmute)
  }
}
