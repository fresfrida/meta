// Debug (Brief 30), English only: is the microphone reaching the speech recogniser? Read on the phone in the timing
// panel: "mic: sent N · gated M · listen open / closed / stopped".

/** none: never opened this page · connecting · open · closed: by the app (Stop, hands-free off) · stopped: by the
 *  server or the network. */
export type ListenSocket = 'none' | 'connecting' | 'open' | 'closed' | 'stopped'

export interface MicDebug {
  /** Mic frames sent on the open socket. */
  sent: number
  /** Mic frames dropped by the self-sound gate (the phone was making sound). */
  gated: number
  socket: ListenSocket
  /** The device's capture rate before resampling to 16 kHz (null until the mic opens). */
  inputRate: number | null
}

let debug: MicDebug = { sent: 0, gated: 0, socket: 'none', inputRate: null }
const listeners = new Set<() => void>()

export function noteMic(next: Partial<MicDebug> | ((d: MicDebug) => Partial<MicDebug>)): void {
  debug = { ...debug, ...(typeof next === 'function' ? next(debug) : next) }
  listeners.forEach((l) => l())
}

export function micDebug(): MicDebug {
  return debug
}

export function onMicDebug(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
