// Orchestrates camera -> frame -> backend -> phrase -> speech, and the visible states.
import { useCallback, useEffect, useRef, useState } from 'react'
import { analyze, getHealth } from '../api/client'
import type { AnalyzeResponse, HealthResponse, Source } from '../api/types'
import { LOOP_ENABLED, LOOP_INTERVAL_MS, MIN_GAP_MS, MODEL_SLOW_MS, TIMING_HISTORY_SIZE } from '../config'
import { type AnnounceState, type Decision, INITIAL_ANNOUNCE, decide, spoke } from '../lib/announce'
import { CameraError, type CameraFailure, captureFrame, openRearCamera, stopStream } from '../lib/camera'
import { type FailureReason, failureReason } from '../lib/failure'
import { isWarning, phraseFor } from '../lib/phrase'
import { cancelSpeech, speak, unlockSpeech } from '../lib/speech'
import { type TimingRecord, pushHistory, toRecord } from '../lib/timing'

export type CameraState = 'off' | 'starting' | 'on' | CameraFailure
export type BackendState = 'checking' | 'ok' | 'unreachable'

export type Answer =
  | { kind: 'none' }
  | { kind: 'waiting' }
  | {
      kind: 'phrase'
      id: number
      text: string
      warning: boolean
      /** Shown but not spoken (unsure). */
      quiet: boolean
      speaking: boolean
      speechFailed: boolean
    }
  | { kind: 'failed'; reason: Exclude<FailureReason, 'unreachable'> }

export interface Usage {
  inputTokens: number
  outputTokens: number
  costUsd: number
}

export type Budget = Pick<HealthResponse, 'spent_usd' | 'budget_usd'>

export interface Timings {
  /** Spoken frames: capture-to-speech records, newest first. */
  spoken: TimingRecord[]
  /** Silent frames: round trip ms only, newest first. */
  silentRoundTrips: number[]
  spokenCount: number
  silentCount: number
}

export interface SecondEyes {
  videoRef: React.RefObject<HTMLVideoElement | null>
  loop: boolean
  camera: CameraState
  backend: BackendState
  mode: Source | null
  budget: Budget | null
  answer: Answer
  /** The current request has taken longer than MODEL_SLOW_MS. */
  slow: boolean
  timings: Timings
  lastUsage: Usage | null
  start: () => void
  stop: () => void
  capture: () => void
}

const EMPTY_TIMINGS: Timings = { spoken: [], silentRoundTrips: [], spokenCount: 0, silentCount: 0 }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Loop mode uses the no-repeat rule; single-capture mode speaks every answer (Brief 1 timing test). */
function decideFor(res: AnalyzeResponse, phrase: string, state: AnnounceState, now: number): Decision {
  if (!LOOP_ENABLED) return { speak: true, interrupt: state.speaking }
  return decide(res, phrase, state, now, MIN_GAP_MS)
}

export function useSecondEyes(): SecondEyes {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const answerIdRef = useRef(0)
  const speechIdRef = useRef(0)
  const announceRef = useRef<AnnounceState>(INITIAL_ANNOUNCE)
  const busyRef = useRef(false)
  // Bumped on Start and Stop so the loop and late responses from an old session stop.
  const sessionRef = useRef(0)
  const [camera, setCamera] = useState<CameraState>('off')
  const [backend, setBackend] = useState<BackendState>('checking')
  const [mode, setMode] = useState<Source | null>(null)
  const [budget, setBudget] = useState<Budget | null>(null)
  const [answer, setAnswer] = useState<Answer>({ kind: 'none' })
  const [slow, setSlow] = useState(false)
  const [timings, setTimings] = useState<Timings>(EMPTY_TIMINGS)
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

  useEffect(
    () => () => {
      sessionRef.current += 1
      stopStream(streamRef.current)
    },
    [],
  )

  /** Shows the answer; keeps the same id (no crossfade) while the phrase is unchanged. */
  const showAnswer = useCallback((res: AnalyzeResponse, text: string) => {
    setAnswer((a) => {
      const same = a.kind === 'phrase' && a.text === text
      const id = same ? a.id : ++answerIdRef.current
      return {
        kind: 'phrase',
        id,
        text,
        warning: isWarning(res),
        quiet: res.hazard === 'unsure',
        speaking: announceRef.current.speaking && announceRef.current.lastSpoken === text,
        speechFailed: same ? a.speechFailed : false,
      }
    })
  }, [])

  const say = useCallback((text: string, onStart: (speechStart: number) => void) => {
    const speechId = ++speechIdRef.current
    announceRef.current = spoke(text, performance.now())
    const done = (failed: boolean) => {
      if (speechId !== speechIdRef.current) return // a newer phrase took over
      announceRef.current = { ...announceRef.current, speaking: false }
      setAnswer((a) => (a.kind === 'phrase' && a.text === text ? { ...a, speaking: false, speechFailed: failed } : a))
    }
    const handle = speak(text)
    handle.started.then(
      (speechStart) => {
        if (speechId !== speechIdRef.current) return
        setAnswer((a) => (a.kind === 'phrase' && a.text === text ? { ...a, speaking: true } : a))
        onStart(speechStart)
        void handle.ended.then(() => done(false))
      },
      () => done(true),
    )
  }, [])

  /** One frame through the pipeline. Resolves once the answer is handled; false = stop looping. */
  const captureOnce = useCallback(
    async (session: number): Promise<boolean> => {
      const video = videoRef.current
      if (!video || busyRef.current) return true
      busyRef.current = true
      const captureStart = performance.now()
      let image: string
      try {
        image = captureFrame(video)
      } catch {
        busyRef.current = false
        setAnswer({ kind: 'failed', reason: 'answer' })
        return true
      }
      const requestSent = performance.now()
      if (!LOOP_ENABLED) {
        cancelSpeech()
        setAnswer({ kind: 'waiting' })
      } else {
        setAnswer((a) => (a.kind === 'phrase' ? a : { kind: 'waiting' }))
      }
      const slowTimer = setTimeout(() => session === sessionRef.current && setSlow(true), MODEL_SLOW_MS)

      try {
        const res = await analyze({ image_b64: image })
        const responseReceived = performance.now()
        if (session !== sessionRef.current) return false
        setBackend('ok')
        setMode(res.source)
        if (res.input_tokens !== null && res.output_tokens !== null && res.cost_usd !== null) {
          setLastUsage({ inputTokens: res.input_tokens, outputTokens: res.output_tokens, costUsd: res.cost_usd })
          setBudget((b) => (b ? { ...b, spent_usd: b.spent_usd + (res.cost_usd ?? 0) } : b))
        }

        const text = phraseFor(res)
        const decision = decideFor(res, text, announceRef.current, performance.now())
        showAnswer(res, text)
        if (decision.speak) {
          say(text, (speechStart) => {
            const record = toRecord({ captureStart, requestSent, responseReceived, speechStart, modelMs: res.model_ms })
            setTimings((t) => ({
              ...t,
              spoken: pushHistory(t.spoken, record, TIMING_HISTORY_SIZE),
              spokenCount: t.spokenCount + 1,
            }))
          })
        } else {
          const roundTrip = Math.round(responseReceived - requestSent)
          setTimings((t) => ({
            ...t,
            silentRoundTrips: pushHistory(t.silentRoundTrips, roundTrip, TIMING_HISTORY_SIZE),
            silentCount: t.silentCount + 1,
          }))
        }
        return true
      } catch (err) {
        if (session !== sessionRef.current) return false
        const reason = failureReason(err)
        if (reason === 'unreachable') {
          setBackend('unreachable')
          setAnswer({ kind: 'none' })
          return true // keep retrying
        }
        setBackend('ok')
        setAnswer({ kind: 'failed', reason })
        void checkHealth() // refresh spend / budget for the message
        return reason !== 'budget' && reason !== 'key' // these will not fix themselves
      } finally {
        clearTimeout(slowTimer)
        busyRef.current = false
        if (session === sessionRef.current) setSlow(false)
      }
    },
    [checkHealth, say, showAnswer],
  )

  const runLoop = useCallback(
    async (session: number) => {
      while (session === sessionRef.current) {
        const keepGoing = await captureOnce(session)
        if (!keepGoing) return
        await sleep(LOOP_INTERVAL_MS)
      }
    },
    [captureOnce],
  )

  const start = useCallback(() => {
    unlockSpeech() // must run synchronously inside the tap
    const session = ++sessionRef.current
    announceRef.current = INITIAL_ANNOUNCE
    setCamera('starting')
    setAnswer({ kind: 'none' })
    void checkHealth()
    openRearCamera()
      .then(async (stream) => {
        if (session !== sessionRef.current) return stopStream(stream)
        streamRef.current = stream
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          await video.play().catch(() => undefined)
        }
        setCamera('on')
        if (LOOP_ENABLED) void runLoop(session)
      })
      .catch((err) => setCamera(err instanceof CameraError ? err.failure : 'unavailable'))
  }, [checkHealth, runLoop])

  const stop = useCallback(() => {
    sessionRef.current += 1
    speechIdRef.current += 1
    announceRef.current = INITIAL_ANNOUNCE
    cancelSpeech()
    stopStream(streamRef.current)
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCamera('off')
    setSlow(false)
    setAnswer({ kind: 'none' })
  }, [])

  const capture = useCallback(() => {
    if (camera === 'on') void captureOnce(sessionRef.current)
  }, [camera, captureOnce])

  return {
    videoRef,
    loop: LOOP_ENABLED,
    camera,
    backend,
    mode,
    budget,
    answer,
    slow,
    timings,
    lastUsage,
    start,
    stop,
    capture,
  }
}
