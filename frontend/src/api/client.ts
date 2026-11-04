// The only module that talks to the backend.
import { API_BASE, DETECT_REQUEST_TIMEOUT_MS, REQUEST_TIMEOUT_MS } from '../config'
import type {
  AnalyzeRequest,
  AnalyzeResponse,
  AskRequest,
  AskResponse,
  DetectRequest,
  DetectResponse,
  ErrorCode,
  ErrorDetail,
  HealthResponse,
} from './types'

export type ApiErrorKind = 'unreachable' | 'failed'

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  /** Backend error code, when the backend sent one. */
  readonly code: ErrorCode | null
  constructor(kind: ApiErrorKind, message: string, code: ErrorCode | null = null) {
    super(message)
    this.kind = kind
    this.code = code
  }
}

function isErrorDetail(value: unknown): value is ErrorDetail {
  return typeof value === 'object' && value !== null && 'code' in value && 'message' in value
}

async function request<T>(path: string, init?: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
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
    let message = `HTTP ${res.status}`
    let code: ErrorCode | null = null
    try {
      const body = (await res.json()) as { detail?: unknown }
      if (isErrorDetail(body.detail)) {
        message = body.detail.message
        code = body.detail.code
      } else if (typeof body.detail === 'string') {
        message = body.detail
      }
    } catch {
      // Non-JSON error body (e.g. the dev proxy's own 500 when the backend is down).
    }
    throw new ApiError('failed', message, code)
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

/** Fast warning: SAM steps and kerb hits for one frame. */
export function detect(body: DetectRequest): Promise<DetectResponse> {
  return request<DetectResponse>(
    '/detect',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    DETECT_REQUEST_TIMEOUT_MS,
  )
}

/** A spoken question about the current frame -> a short answer in the chosen language. */
export function ask(body: AskRequest, timeoutMs: number): Promise<AskResponse> {
  return request<AskResponse>(
    '/ask',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    timeoutMs,
  )
}

/** The /api/listen WebSocket URL on this page's host (the Vite proxy forwards it to the backend). */
export function listenUrl(language: string): string {
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${scheme}://${window.location.host}${API_BASE}/listen?lang=${encodeURIComponent(language)}`
}
