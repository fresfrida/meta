// Orchestrates camera -> frame -> backend -> phrase -> speech, and the visible states.
import { useCallback, useEffect, useRef, useState } from 'react'
import { analyze, getHealth } from '../api/client'
import type { AnalyzeResponse, Box, HealthResponse, Source } from '../api/types'
import {
  LOOP_ENABLED,
  LOOP_STAGGER_MS,
  type Lang,
  MAX_IN_FLIGHT,
  MIN_GAP_MS,
  MODEL_SLOW_MS,
  REPEAT_CLOSER_M,
  SPEECH_LANGS,
  TIMING_HISTORY_SIZE,
} from '../config'
import { type AnnounceState, type Decision, INITIAL_ANNOUNCE, decide, spoke } from '../lib/announce'
import type { Size } from '../lib/boxMap'
import { CameraError, type CameraFailure, captureFrame, openRearCamera, stopStream } from '../lib/camera'
import { type FailureReason, failureReason } from '../lib/failure'
import { type Lamp, lampFor } from '../lib/light'
import { type WarningHazard, isWarning, phraseFor } from '../lib/phrase'
import { cancelSpeech, speak, unlockSpeech } from '../lib/speech'
import { type TimingRecord, pushHistory, toRecord } from '../lib/timing'
import { pickVoice, voiceStatus } from '../lib/voices'

export type CameraState = 'off' | 'starting' | 'on' | CameraFailure
export type BackendState = 'checking' | 'ok' | 'unreachable'

export type Answer =
  | { kind: 'none' }
  | { kind: 'waiting' }
  | {
      kind: 'phrase'
      id: number
      text: string
      lamp: Lamp
      /** Shown but not spoken (unsure). */
      quiet: boolean
      speaking: boolean
      speechFailed: boolean
      /** The chosen language has no installed voice: shown only. */
      noVoice: boolean
    }
  | { kind: 'failed'; reason: Exclude<FailureReason, 'unreachable'> }

/** The latest warning's box, with the size of the frame it was found on. */
export interface HazardBox {
  /** New for every answer, so the overlay restarts its stale timer. */
  seq: number
  hazard: WarningHazard
  box: Box
  frame: Size
}

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
  /** Every handled answer: capture to answer, ms, newest first. */
  answerMs: number[]
  spokenCount: number
  silentCount: number
  /** Answers that arrived after a newer capture's answer had been handled (not shown, not spoken). */
  droppedCount: number
}

export interface SecondEyes {
  videoRef: React.RefObject<HTMLVideoElement | null>
  loop: boolean
  camera: CameraState
  backend: BackendState
  mode: Source | null
  budget: Budget | null
  answer: Answer
  /** Box of the latest answer when it is a warning with a box; null for clear, unsure, no box, or stopped. */
  hazardBox: HazardBox | null
  /** A request has taken longer than MODEL_SLOW_MS. */
  slow: boolean
  timings: Timings
  lastUsage: Usage | null
  start: () => void
  stop: () => void
  capture: () => void
}

const EMPTY_TIMINGS: Timings = {
  spoken: [],
  silentRoundTrips: [],
  answerMs: [],
  spokenCount: 0,
  silentCount: 0,
  droppedCount: 0,
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Loop mode uses the no-repeat rule; single-capture mode speaks every answer (Brief 1 timing test). */
function decideFor(res: AnalyzeResponse, phrase: string, state: AnnounceState, now: number): Decision {
  if (!LOOP_ENABLED) return { speak: true, interrupt: state.speaking }
  return decide(res, phrase, state, now, MIN_GAP_MS, REPEAT_CLOSER_M)
}

export function useSecondEyes(lang: Lang, voices: SpeechSynthesisVoice[]): SecondEyes {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const answerIdRef = useRef(0)
  const boxSeqRef = useRef(0)
  const speechIdRef = useRef(0)
  const announceRef = useRef<AnnounceState>(INITIAL_ANNOUNCE)
  // Requests in flight, capture order, and the newest capture whose answer has been handled.
  const inFlightRef = useRef(0)
  const captureSeqRef = useRef(0)
  const handledSeqRef = useRef(0)
  // Bumped on Start and Stop so the loop and late responses from an old session stop.
  const sessionRef = useRef(0)
  // Set to the session when the loop must stop itself (budget reached, no key).
  const haltedRef = useRef(-1)
  // The loop reads the current language and voices without restarting.
  const langRef = useRef(lang)
  const voicesRef = useRef(voices)
  const [camera, setCamera] = useState<CameraState>('off')
  const [backend, setBackend] = useState<BackendState>('checking')
  const [mode, setMode] = useState<Source | null>(null)
  const [budget, setBudget] = useState<Budget | null>(null)
  const [answer, setAnswer] = useState<Answer>({ kind: 'none' })
  const [hazardBox, setHazardBox] = useState<HazardBox | null>(null)
  const [slow, setSlow] = useState(false)
  const [timings, setTimings] = useState<Timings>(EMPTY_TIMINGS)
  const [lastUsage, setLastUsage] = useState<Usage | null>(null)

  useEffect(() => {
    // Changing language resets the last spoken phrase, so the next answer is spoken in the new language.
    if (langRef.current !== lang) announceRef.current = INITIAL_ANNOUNCE
    langRef.current = lang
  }, [lang])

  useEffect(() => {
    voicesRef.current = voices
  }, [voices])

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
  const showAnswer = useCallback((res: AnalyzeResponse, text: string, noVoice: boolean) => {
    setAnswer((a) => {
      const same = a.kind === 'phrase' && a.text === text
      return {
        kind: 'phrase',
        id: same ? a.id : ++answerIdRef.current,
        text,
        lamp: lampFor(res),
        quiet: res.hazard === 'unsure',
        speaking: announceRef.current.speaking && announceRef.current.lastSpoken === text,
        speechFailed: same ? a.speechFailed : false,
        noVoice,
      }
    })
  }, [])

  const say = useCallback((res: AnalyzeResponse, text: string, onStart: (speechStart: number) => void) => {
    const speechId = ++speechIdRef.current
    announceRef.current = spoke(res, text, performance.now())
    const done = (failed: boolean) => {
      if (speechId !== speechIdRef.current) return // a newer phrase took over
      announceRef.current = { ...announceRef.current, speaking: false }
      setAnswer((a) => (a.kind === 'phrase' && a.text === text ? { ...a, speaking: false, speechFailed: failed } : a))
    }
    const speechLang = SPEECH_LANGS[langRef.current]
    const handle = speak(text, { lang: speechLang, voice: pickVoice(voicesRef.current, speechLang) })
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

  /** One frame through the pipeline. Several can be in flight; answers are handled in capture order. */
  const captureOnce = useCallback(
    async (session: number): Promise<void> => {
      const video = videoRef.current
      if (!video) return
      const seq = ++captureSeqRef.current
      const captureStart = performance.now()
      const frame = { width: video.videoWidth, height: video.videoHeight }
      let image: string
      try {
        image = captureFrame(video)
      } catch {
        setAnswer({ kind: 'failed', reason: 'answer' })
        return
      }
      inFlightRef.current += 1
      const requestSent = performance.now()
      if (!LOOP_ENABLED) {
        cancelSpeech()
        setAnswer({ kind: 'waiting' })
      } else {
        setAnswer((a) => (a.kind === 'phrase' ? a : { kind: 'waiting' }))
      }
      const slowTimer = setTimeout(() => session === sessionRef.current && setSlow(true), MODEL_SLOW_MS)
      // An answer older than one already handled is dropped: counted, not shown, not spoken.
      const isLate = () => {
        if (seq > handledSeqRef.current) {
          handledSeqRef.current = seq
          return false
        }
        setTimings((t) => ({ ...t, droppedCount: t.droppedCount + 1 }))
        return true
      }

      try {
        const res = await analyze({ image_b64: image })
        const responseReceived = performance.now()
        if (session !== sessionRef.current || isLate()) return
        setSlow(false)
        setBackend('ok')
        setMode(res.source)
        if (res.input_tokens !== null && res.output_tokens !== null && res.cost_usd !== null) {
          setLastUsage({ inputTokens: res.input_tokens, outputTokens: res.output_tokens, costUsd: res.cost_usd })
          setBudget((b) => (b ? { ...b, spent_usd: b.spent_usd + (res.cost_usd ?? 0) } : b))
        }

        setHazardBox(
          isWarning(res) && res.box ? { seq: ++boxSeqRef.current, hazard: res.hazard, box: res.box, frame } : null,
        )
        const text = phraseFor(res, langRef.current)
        const noVoice = voiceStatus(voicesRef.current, SPEECH_LANGS[langRef.current]) === 'missing'
        const decision = decideFor(res, text, announceRef.current, performance.now())
        showAnswer(res, text, noVoice)
        const answerMs = Math.round(responseReceived - captureStart)
        if (decision.speak && !noVoice) {
          say(res, text, (speechStart) => {
            const record = toRecord({ captureStart, requestSent, responseReceived, speechStart, modelMs: res.model_ms })
            setTimings((t) => ({
              ...t,
              spoken: pushHistory(t.spoken, record, TIMING_HISTORY_SIZE),
              answerMs: pushHistory(t.answerMs, answerMs, TIMING_HISTORY_SIZE),
              spokenCount: t.spokenCount + 1,
            }))
          })
        } else {
          const roundTrip = Math.round(responseReceived - requestSent)
          setTimings((t) => ({
            ...t,
            silentRoundTrips: pushHistory(t.silentRoundTrips, roundTrip, TIMING_HISTORY_SIZE),
            answerMs: pushHistory(t.answerMs, answerMs, TIMING_HISTORY_SIZE),
            silentCount: t.silentCount + 1,
          }))
        }
      } catch (err) {
        if (session !== sessionRef.current || isLate()) return
        const reason = failureReason(err)
        if (reason === 'unreachable') {
          setBackend('unreachable')
          setAnswer({ kind: 'none' })
          return // keep retrying
        }
        setBackend('ok')
        setAnswer({ kind: 'failed', reason })
        void checkHealth() // refresh spend / budget for the message
        if (reason === 'budget' || reason === 'key') haltedRef.current = session // these will not fix themselves
      } finally {
        clearTimeout(slowTimer)
        inFlightRef.current -= 1
        if (inFlightRef.current === 0 && session === sessionRef.current) setSlow(false)
      }
    },
    [checkHealth, say, showAnswer],
  )

  /** Starts a capture every LOOP_STAGGER_MS (after the previous one started), at most MAX_IN_FLIGHT at once. */
  const runLoop = useCallback(
    async (session: number) => {
      const running = () => session === sessionRef.current && haltedRef.current !== session
      while (running()) {
        void captureOnce(session)
        await sleep(LOOP_STAGGER_MS)
        while (running() && inFlightRef.current >= MAX_IN_FLIGHT) await sleep(50)
      }
    },
    [captureOnce],
  )

  const start = useCallback(() => {
    unlockSpeech() // must run synchronously inside the tap
    const session = ++sessionRef.current
    announceRef.current = INITIAL_ANNOUNCE
    handledSeqRef.current = captureSeqRef.current
    setCamera('starting')
    setAnswer({ kind: 'none' })
    setHazardBox(null)
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
    setHazardBox(null)
  }, [])

  const capture = useCallback(() => {
    if (camera === 'on' && inFlightRef.current === 0) void captureOnce(sessionRef.current)
  }, [camera, captureOnce])

  return {
    videoRef,
    loop: LOOP_ENABLED,
    camera,
    backend,
    mode,
    budget,
    answer,
    hazardBox,
    slow,
    timings,
    lastUsage,
    start,
    stop,
    capture,
  }
}
