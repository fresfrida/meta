// Orchestrates camera -> frame -> backend -> phrase -> speech, and the visible states.
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, analyze, getHealth } from '../api/client'
import type { Source } from '../api/types'
import { TIMING_HISTORY_SIZE } from '../config'
import { CameraError, type CameraFailure, captureFrame, openRearCamera, stopStream } from '../lib/camera'
import { isWarning, phraseFor } from '../lib/phrase'
import { cancelSpeech, speak, unlockSpeech } from '../lib/speech'
import { type TimingRecord, pushHistory, toRecord } from '../lib/timing'

export type CameraState = 'off' | 'starting' | 'on' | CameraFailure
export type BackendState = 'checking' | 'ok' | 'unreachable'

export type Answer =
  | { kind: 'none' }
  | { kind: 'waiting' }
  | { kind: 'phrase'; id: number; text: string; warning: boolean; speaking: boolean; speechFailed: boolean }
  | { kind: 'failed' }

export interface SecondEyes {
  videoRef: React.RefObject<HTMLVideoElement | null>
  camera: CameraState
  backend: BackendState
  mode: Source | null
  answer: Answer
  history: TimingRecord[]
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
  const [answer, setAnswer] = useState<Answer>({ kind: 'none' })
  const [history, setHistory] = useState<TimingRecord[]>([])

  const checkHealth = useCallback(
    () =>
      getHealth().then(
        (h) => {
          setMode(h.vision_mode)
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
      setAnswer({ kind: 'failed' })
      return
    }
    const requestSent = performance.now()
    const session = sessionRef.current
    setAnswer({ kind: 'waiting' })

    analyze({ image_b64: image })
      .then(async (res) => {
        const responseReceived = performance.now()
        if (session !== sessionRef.current) return
        setBackend('ok')
        setMode(res.source)
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
        if (session !== sessionRef.current) return
        if (err instanceof ApiError && err.kind === 'unreachable') {
          setBackend('unreachable')
          setAnswer({ kind: 'none' })
        } else {
          setBackend('ok')
          setAnswer({ kind: 'failed' })
        }
      })
  }, [camera])

  return { videoRef, camera, backend, mode, answer, history, start, stop, capture }
}
