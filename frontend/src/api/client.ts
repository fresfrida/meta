// The only module that talks to the backend.
import { API_BASE, REQUEST_TIMEOUT_MS } from '../config'
import type { AnalyzeRequest, AnalyzeResponse, HealthResponse } from './types'

export type ApiErrorKind = 'unreachable' | 'failed'

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  constructor(kind: ApiErrorKind, message: string) {
    super(message)
    this.kind = kind
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, signal: controller.signal })
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === 'AbortError'
    throw new ApiError(timedOut ? 'failed' : 'unreachable', timedOut ? 'timeout' : String(err))
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const body = (await res.json()) as { detail?: unknown }
      if (typeof body.detail === 'string') detail = body.detail
    } catch {
      // Non-JSON error body (e.g. the dev proxy's own 500 when the backend is down).
    }
    throw new ApiError('failed', detail)
  }
  return (await res.json()) as T
}

/** Any failure here means the backend cannot be reached. */
export async function getHealth(): Promise<HealthResponse> {
  try {
    return await request<HealthResponse>('/health')
  } catch (err) {
    throw new ApiError('unreachable', err instanceof Error ? err.message : String(err))
  }
}

/**
 * Sends one frame. On a non-network failure, asks /health to tell
 * "backend down behind the proxy" apart from "the answer itself failed".
 */
export async function analyze(body: AnalyzeRequest): Promise<AnalyzeResponse> {
  try {
    return await request<AnalyzeResponse>('/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (err) {
    // getHealth() throws an 'unreachable' ApiError if the backend is down.
    if (err instanceof ApiError && err.kind === 'failed') await getHealth()
    throw err
  }
}
