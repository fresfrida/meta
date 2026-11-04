// Public demo (Brief 17): the current slot token (sent with every API call and on the listen WebSocket), a random
// per-browser id (nothing personal), and the countdown text.

let token: string | null = null

export function setSlotToken(next: string | null): void {
  token = next
}

export function slotToken(): string | null {
  return token
}

const DEVICE_KEY = 'second-eyes.device'

/** A random id for this browser, so a second tap on Start gets the same running slot. Not linked to anyone. */
export function deviceId(): string {
  try {
    const saved = window.localStorage.getItem(DEVICE_KEY)
    if (saved && saved.length >= 8) return saved
    const made = randomId()
    window.localStorage.setItem(DEVICE_KEY, made)
    return made
  } catch {
    return randomId() // storage blocked: a fresh id for this visit
  }
}

function randomId(): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** "2:41" for the time left (rounded up to the second, never negative). */
export function formatLeft(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** "3 minutes" from the slot length in seconds (rounded; "1 minute" for one). */
export function minutesText(slotS: number): string {
  const m = Math.max(1, Math.round(slotS / 60))
  return m === 1 ? '1 minute' : `${m} minutes`
}
