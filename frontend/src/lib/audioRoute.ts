// Brief 27: audio route changes and interruptions (headphones in / out, a call, Siri) while running.
// iOS can leave speech or the AudioContext silent after one; this notices them, counts them for the debug line, and
// lets the app recover (resume the context, wake speech, say the current warning again).

export interface RouteDebug {
  changes: number
  last: string | null
}

let debug: RouteDebug = { changes: 0, last: null }
const listeners = new Set<() => void>()

export function routeDebug(): RouteDebug {
  return debug
}

export function onRouteDebug(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function resetRouteDebug(): void {
  debug = { changes: 0, last: null }
  listeners.forEach((l) => l())
}

type Source = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>

export interface RouteSources {
  /** navigator.audioSession (Safari 16.4+): 'statechange'. */
  session: (Source & { state?: string }) | null
  /** navigator.mediaDevices: 'devicechange' (headphones, Bluetooth). */
  devices: Source | null
  /** The AudioContext: 'statechange' ('interrupted' on iOS). */
  context: (Source & { state?: string }) | null
}

/** Default sources from the browser; any of them may be missing. */
export function browserRouteSources(context: RouteSources['context']): RouteSources {
  const nav = typeof navigator === 'undefined' ? null : (navigator as Navigator & { audioSession?: Source & { state?: string } })
  return { session: nav?.audioSession ?? null, devices: nav?.mediaDevices ?? null, context }
}

/**
 * Calls `onChange(event)` for every route change or interruption; returns the function that stops listening.
 * Context 'statechange' counts only when it is not our own suspend / resume (states other than running / suspended).
 */
export function watchAudioRoute(sources: RouteSources, onChange: (event: string) => void): () => void {
  const note = (event: string) => {
    debug = { changes: debug.changes + 1, last: event }
    listeners.forEach((l) => l())
    onChange(event)
  }
  const onSession = () => note(`session ${sources.session?.state ?? ''}`.trim())
  const onDevices = () => note('devicechange')
  const onContext = () => {
    const state = sources.context?.state
    if (state && state !== 'running' && state !== 'suspended') note(`audio ${state}`)
  }
  sources.session?.addEventListener('statechange', onSession)
  sources.devices?.addEventListener('devicechange', onDevices)
  sources.context?.addEventListener('statechange', onContext)
  return () => {
    sources.session?.removeEventListener('statechange', onSession)
    sources.devices?.removeEventListener('devicechange', onDevices)
    sources.context?.removeEventListener('statechange', onContext)
  }
}
