// Orchestrates camera -> frame -> backend -> phrase -> speech, and the visible states.
import { useCallback, useEffect, useRef, useState } from 'react'
import { analyze, getHealth } from '../api/client'
import type { HealthResponse, Source } from '../api/types'
import { MODEL_SLOW_MS, TIMING_HISTORY_SIZE } from '../config'
import { CameraError, type CameraFailure, captureFrame, openRearCamera, stopStream } from '../lib/camera'
import { type FailureReason, failureReason } from '../lib/failure'
import { isWarning, phraseFor } from '../lib/phrase'
import { cancelSpeech, speak, unlockSpeech } from '../lib/speech'
import { type TimingRecord, pushHistory, toRecord } from '../lib/timing'

export type CameraState = 'off' | 'starting' | 'on' | CameraFailure
export type BackendState = 'checking' | 'ok' | 'unreachable'

export type Answer =
  | { kind: 'none' }
  | { kind: 'waiting'; slow: boolean }
  | { kind: 'phrase'; id: number; text: string; warning: boolean; speaking: boolean; speechFailed: boolean }
  | { kind: 'failed'; reason: Exclude<FailureReason, 'unreachable'> }

export interface Usage {
  inputTokens: number
  outputTokens: number
  costUsd: number
}

export type Budget = Pick<HealthResponse, 'spent_usd' | 'budget_usd'>

export interface SecondEyes {
  videoRef: React.RefObject<HTMLVideoElement | null>
  camera: CameraState
  backend: BackendState
  mode: Source | null
  budget: Budget | null
  answer: Answer
  history: TimingRecord[]
  lastUsage: Usage | null
  start: () => void
  stop: () => void
  capture: () => void
}

export function useSecondEyes(): SecondEyes {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const answerIdRef = useRef(0)
  // Bumped on Stop so a late response from an old capture is ignored.
  const sessionRef = useRef(0)
  const [camera, setCamera] = useState<CameraState>('off')
  const [backend, setBackend] = useState<BackendState>('checking')
  const [mode, setMode] = useState<Source | null>(null)
  const [budget, setBudget] = useState<Budget | null>(null)
  const [answer, setAnswer] = useState<Answer>({ kind: 'none' })
  const [history, setHistory] = useState<TimingRecord[]>([])
  const [lastUsage, setLastUsage] = useState<Usage | null>(null)

  const checkHealth = useCallback(
    () =>
      getHealth().then(
        (h) => {
          setMode(h.vision_mode)
          setBudget({ spent_usd: h.spent_usd, budget_usd: h.budget_usd })
          setBackend('ok')
        },
        () => setBackend('unreachable'),
      ),
    [],
  )

  useEffect(() => {
    void checkHealth()
  }, [checkHealth])

  useEffect(() => () => stopStream(streamRef.current), [])

  const start = useCallback(() => {
    unlockSpeech() // must run synchronously inside the tap
    setCamera('starting')
    setAnswer({ kind: 'none' })
    void checkHealth()
    openRearCamera()
      .then(async (stream) => {
        streamRef.current = stream
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          await video.play().catch(() => undefined)
        }
        setCamera('on')
      })
      .catch((err) => setCamera(err instanceof CameraError ? err.failure : 'unavailable'))
  }, [checkHealth])

  const stop = useCallback(() => {
    sessionRef.current += 1
    cancelSpeech()
    stopStream(streamRef.current)
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCamera('off')
    setAnswer({ kind: 'none' })
  }, [])

  const capture = useCallback(() => {
    const video = videoRef.current
    if (!video || camera !== 'on') return
    cancelSpeech()
    const captureStart = performance.now()
    let image: string
    try {
      image = captureFrame(video)
    } catch {
      setAnswer({ kind: 'failed', reason: 'answer' })
      return
    }
    const requestSent = performance.now()
    const session = sessionRef.current
    setAnswer({ kind: 'waiting', slow: false })
    const slowTimer = setTimeout(() => {
      if (session !== sessionRef.current) return
      setAnswer((a) => (a.kind === 'waiting' ? { kind: 'waiting', slow: true } : a))
    }, MODEL_SLOW_MS)

    analyze({ image_b64: image })
      .then(async (res) => {
        const responseReceived = performance.now()
        clearTimeout(slowTimer)
        if (session !== sessionRef.current) return
        setBackend('ok')
        setMode(res.source)
        if (res.input_tokens !== null && res.output_tokens !== null && res.cost_usd !== null) {
          setLastUsage({ inputTokens: res.input_tokens, outputTokens: res.output_tokens, costUsd: res.cost_usd })
          setBudget((b) => (b ? { ...b, spent_usd: b.spent_usd + (res.cost_usd ?? 0) } : b))
        }
        const id = ++answerIdRef.current
        const base = { kind: 'phrase' as const, id, text: phraseFor(res), warning: isWarning(res) }
        setAnswer({ ...base, speaking: false, speechFailed: false })

        const handle = speak(base.text)
        try {
          const speechStart = await handle.started
          setAnswer((a) => (a.kind === 'phrase' && a.id === id ? { ...a, speaking: true } : a))
          const record = toRecord({ captureStart, requestSent, responseReceived, speechStart, modelMs: res.model_ms })
          setHistory((h) => pushHistory(h, record, TIMING_HISTORY_SIZE))
          await handle.ended
          setAnswer((a) => (a.kind === 'phrase' && a.id === id ? { ...a, speaking: false } : a))
        } catch {
          setAnswer((a) => (a.kind === 'phrase' && a.id === id ? { ...a, speaking: false, speechFailed: true } : a))
        }
      })
      .catch((err) => {
        clearTimeout(slowTimer)
        if (session !== sessionRef.current) return
        const reason = failureReason(err)
        if (reason === 'unreachable') {
          setBackend('unreachable')
          setAnswer({ kind: 'none' })
        } else {
          setBackend('ok')
          setAnswer({ kind: 'failed', reason })
          void checkHealth() // refresh spend / budget for the message
        }
      })
  }, [camera, checkHealth])

  return { videoRef, camera, backend, mode, budget, answer, history, lastUsage, start, stop, capture }
}
