// The /api/listen WebSocket: mic audio out, wake / question events in. The API key never comes near the phone.
import { listenUrl } from '../api/client'
import type { Language, ListenEvent } from '../api/types'
import { noteMic } from './micDebug'

/** How long to wait for the backend to finish (last question) after we ask it to end. */
const END_GRACE_MS = 4_000

export class ListenClient {
  private ws: WebSocket
  private closedByUs = false
  // A hold pressed before the socket opened is sent once it opens (the backend buffers the audio meanwhile).
  private pendingHold: boolean | null = null
  private readonly onEvent: (event: ListenEvent) => void
  private readonly onClosed: (byUs: boolean) => void

  constructor(language: Language, onEvent: (event: ListenEvent) => void, onClosed: (byUs: boolean) => void) {
    this.onEvent = onEvent
    this.onClosed = onClosed
    noteMic({ socket: 'connecting' })
    this.ws = new WebSocket(listenUrl(language))
    this.ws.binaryType = 'arraybuffer'
    this.ws.onmessage = (e) => {
      if (typeof e.data === 'string') this.onEvent(JSON.parse(e.data) as ListenEvent)
    }
    this.ws.onopen = () => {
      noteMic({ socket: 'open' })
      if (this.pendingHold !== null) this.hold(this.pendingHold)
      this.pendingHold = null
    }
    this.ws.onclose = () => {
      noteMic({ socket: this.closedByUs ? 'closed' : 'stopped' })
      this.onClosed(this.closedByUs)
    }
  }

  get open(): boolean {
    return this.ws.readyState === WebSocket.OPEN
  }

  sendAudio(pcm: Int16Array<ArrayBuffer>): void {
    if (!this.open) return
    this.ws.send(pcm)
    noteMic((d) => ({ sent: d.sent + 1 }))
  }

  hold(on: boolean): void {
    if (this.open) this.ws.send(JSON.stringify({ type: 'hold', on }))
    else this.pendingHold = on
  }

  /** Ends the session: the backend sends its last events, then closes. */
  end(): void {
    this.closedByUs = true
    if (this.open) this.ws.send(JSON.stringify({ type: 'end' }))
    setTimeout(() => this.ws.close(), END_GRACE_MS)
  }
}
