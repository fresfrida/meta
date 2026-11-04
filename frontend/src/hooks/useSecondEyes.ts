// Orchestrates camera -> frame -> backend -> phrase -> speech, and the visible states.
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, analyze, detect, getHealth } from '../api/client'
import type { Box, HealthResponse, Source } from '../api/types'
import {
  DETAIL_EVERY,
  FAST_ENABLED,
  FAST_MAX_IN_FLIGHT,
  FAST_REPEAT_MS,
  CONNECTION_CHECK_MS,
  CONNECTION_LOST_MS,
  CONNECTION_REPEAT_MS,
  HEARTBEAT_MIN_GAP_MS,
  SIDE_HYST,
  SIDE_LEFT_MAX,
  SIDE_RIGHT_MIN,
  STALE_MS,
  WALK_ACCEL_VAR,
  WALK_SPEED_M_S,
  WALK_WINDOW_MS,
  TALK_MORE_MS,
  FAST_STAGGER_MS,
  LOOP_ENABLED,
  LOOP_STAGGER_MS,
  type Lang,
  MAX_IN_FLIGHT,
  MIN_GAP_MS,
  MODEL_SLOW_MS,
  REPEAT_CLOSER_M,
  SAM_HOLD_MS,
  SPEECH_LANGS,
  TIMING_HISTORY_SIZE,
  VOICE_WAIT_MS,
} from '../config'
import { type AnnounceState, type Decision, INITIAL_ANNOUNCE, decide, spoke } from '../lib/announce'
import type { Size } from '../lib/boxMap'
import { CameraError, type CameraFailure, type SentFrame, captureGuarded, openRearCamera, stopStream } from '../lib/camera'
import { warmUpFaceDetector } from '../lib/faceGuard'
import { type FailureReason, failureReason } from '../lib/failure'
import { type Lamp, lampFor } from '../lib/light'
import {
  type Channel,
  NOTHING_SHOWN,
  type ShownState,
  type SpokenKinds,
  fastCue,
  fastRecentlySaid,
  hitAsShown,
  mergedLamp,
  rememberSpoken,
  replaces,
} from '../lib/merge'
import { type Shown, type WarningHazard, isWarning, phraseFor, speechFor } from '../lib/phrase'
import { unlockAudio } from '../lib/audio'
import { playTick, playWarnCue } from '../lib/earcon'
import { type LinkState, onAnswer, onCheck, startLink } from '../lib/connection'
import { shouldTick } from '../lib/heartbeat'
import { museHedged } from '../lib/hedge'
import { minutesText, setSlotToken } from '../lib/demoSlot'
import { type SpokenSides, holdSide, rememberSide } from '../lib/sideHold'
import { atSpeakingTime } from '../lib/distanceNow'
import { WalkDetector } from '../lib/motion'
import {
  SESSION_IDLE,
  type SessionVoice,
  greetAtOnce,
  greetingDone,
  holdForGreeting,
  onStart,
  onStop,
} from '../lib/sessionVoice'
import { connectionText, sessionText, strings } from '../strings'
import { cancelSpeech, speak, speechSupported, unlockSpeech, webKitSpeech } from '../lib/speech'
import { type TimingRecord, pushHistory, toRecord } from '../lib/timing'
import { pickVoice, voiceStatus, waitForVoices } from '../lib/voices'
import { type AskTiming, type AskView, type ListenState, useAsk } from './useAsk'

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
  /** No answer on any channel for CONNECTION_LOST_MS while running (lamp dark, "Connection lost"). */
  | { kind: 'lost' }

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

export interface DemoInfo {
  public: boolean
  videoUrl: string | null
  /** Slot length in seconds (DEMO_SLOT_S). */
  slotS: number | null
}

export interface Timings {
  /** Spoken frames: capture-to-speech records, newest first. */
  spoken: TimingRecord[]
  /** Silent frames: round trip ms only, newest first. */
  silentRoundTrips: number[]
  /** Every handled Muse answer: capture to answer, ms, newest first. */
  answerMs: number[]
  /** Every handled fast (SAM) answer, hits or not: capture to answer, ms, newest first. */
  fastMs: number[]
  /** Server-side time of the last SAM answer and the last Muse answer. */
  lastSamMs: number | null
  lastModelMs: number | null
  /** Debug (Brief 16): metres of the last shown warning at capture and at speaking time (null = no metres / very close). */
  lastDistance: { capturedM: number | null; nowM: number | null } | null
  spokenCount: number
  silentCount: number
  /** Answers that arrived after a newer capture's answer had been handled (not shown, not spoken). */
  droppedCount: number
}

export interface SecondEyes {
  videoRef: React.RefObject<HTMLVideoElement | null>
  loop: boolean
  /** The fast channel (SAM) runs next to Muse. */
  fast: boolean
  camera: CameraState
  backend: BackendState
  mode: Source | null
  budget: Budget | null
  answer: Answer
  /** Box of the latest answer when it is a warning with a box; null for clear, unsure, no box, or stopped. */
  hazardBox: HazardBox | null
  /** The last frame actually sent (after face blur), for the thumbnail. */
  lastSent: SentFrame | null
  /** A request has taken longer than MODEL_SLOW_MS. */
  slow: boolean
  timings: Timings
  lastUsage: Usage | null
  start: (prepare?: () => Promise<boolean>) => void
  stop: (say?: unknown) => void
  /** Public demo (from /api/health). */
  demo: DemoInfo
  capture: () => void
  /** Asking: listening state, the current question / answer, and the touch-and-hold fallback. */
  listen: ListenState
  ask: AskView | null
  askTimings: AskTiming[]
  holdStart: () => void
  holdEnd: () => void
}

const EMPTY_TIMINGS: Timings = {
  spoken: [],
  silentRoundTrips: [],
  answerMs: [],
  fastMs: [],
  lastSamMs: null,
  lastModelMs: null,
  lastDistance: null,
  spokenCount: 0,
  silentCount: 0,
  droppedCount: 0,
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Two channels: every frame to SAM (fast), every DETAIL_EVERY-th to Muse. `?fast=0` or `?loop=0`: Muse only. */
const TWO_SPEED = LOOP_ENABLED && FAST_ENABLED
const SIDE_LINES = { leftMax: SIDE_LEFT_MAX, rightMin: SIDE_RIGHT_MIN, hyst: SIDE_HYST }

/** Loop mode uses the no-repeat rule; single-capture mode speaks every answer (Brief 1 timing test). */
function decideFor(res: Shown, state: AnnounceState, now: number, talkMore: boolean): Decision {
  if (!LOOP_ENABLED) return { speak: true, interrupt: state.speaking }
  return decide(res, state, now, MIN_GAP_MS, REPEAT_CLOSER_M, talkMore ? TALK_MORE_MS : null)
}

export function useSecondEyes(
  lang: Lang,
  voices: SpeechSynthesisVoice[],
  handsFree: boolean,
  talkMore = false,
): SecondEyes {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const answerIdRef = useRef(0)
  const boxSeqRef = useRef(0)
  const speechIdRef = useRef(0)
  const announceRef = useRef<AnnounceState>(INITIAL_ANNOUNCE)
  // Screen phrase of the answer being spoken now (speech says the plain-language version of it).
  const speakingTextRef = useRef<string | null>(null)
  // Requests in flight (the loop waits on these: SAM with two speeds, else Muse), Muse requests in flight, capture
  // order, and per channel the newest capture whose answer has been handled.
  const inFlightRef = useRef(0)
  const detailInFlightRef = useRef(0)
  const captureSeqRef = useRef(0)
  const handledSeqRef = useRef<Record<Channel, number>>({ fast: 0, detail: 0 })
  // What is on screen (channel, frame, lamp, when), for the merge rule.
  const shownRef = useRef<ShownState>(NOTHING_SHOWN)
  // When each kind was last spoken (either channel), so a fast hit does not re-say a kind Muse just interrupted.
  const spokenKindsRef = useRef<SpokenKinds>({})
  // The side last spoken per kind (side hysteresis).
  const spokenSidesRef = useRef<SpokenSides>({})
  // Talk more (Settings), read by the loop without restarting it.
  const talkMoreRef = useRef(talkMore)
  // Connection rule state (lost / back) and the last heartbeat tick.
  const linkRef = useRef<LinkState>(startLink(0))
  const lastTickAtRef = useRef(-Infinity)
  // A question is being asked or answered (no tick, no connection alert over it).
  const askActiveRef = useRef(false)
  // Walking or still (DeviceMotion), for the distance at speaking time.
  const walkRef = useRef(new WalkDetector(WALK_WINDOW_MS, WALK_ACCEL_VAR))
  // Start / Stop lines (said once per tap; hazard speech waits for the start line).
  const sessionVoiceRef = useRef<SessionVoice>(SESSION_IDLE)
  // Bumped on Start and Stop so the loop and late responses from an old session stop.
  const sessionRef = useRef(0)
  // Set to the session when the loop must stop itself (budget reached, no key).
  const haltedRef = useRef(-1)
  // The loop reads the current language and voices without restarting.
  const langRef = useRef(lang)
  const voicesRef = useRef(voices)
  // English plain sentence of the last warning, for the Ask prompt ("Their last warning was: ...").
  const lastWarningRef = useRef<string | null>(null)
  const [camera, setCamera] = useState<CameraState>('off')
  const [backend, setBackend] = useState<BackendState>('checking')
  const [mode, setMode] = useState<Source | null>(null)
  const [budget, setBudget] = useState<Budget | null>(null)
  // Public demo (Brief 17): from /api/health.
  const [demo, setDemo] = useState<DemoInfo>({ public: false, videoUrl: null, slotS: null })
  const demoRef = useRef(demo)
  useEffect(() => {
    demoRef.current = demo
  }, [demo])
  // The stop function, for the server ending a public-demo slot from inside a request (defined below).
  const stopRef = useRef<(say?: unknown) => void>(() => undefined)
  const [answer, setAnswer] = useState<Answer>({ kind: 'none' })
  const [hazardBox, setHazardBox] = useState<HazardBox | null>(null)
  const [lastSent, setLastSent] = useState<SentFrame | null>(null)
  const [slow, setSlow] = useState(false)
  const [timings, setTimings] = useState<Timings>(EMPTY_TIMINGS)
  const [lastUsage, setLastUsage] = useState<Usage | null>(null)

  useEffect(() => {
    // Changing language resets the last spoken phrase, so the next answer is spoken in the new language.
    if (langRef.current !== lang) {
      announceRef.current = INITIAL_ANNOUNCE
      spokenKindsRef.current = {}
      spokenSidesRef.current = {}
    }
    langRef.current = lang
  }, [lang])

  useEffect(() => {
    voicesRef.current = voices
  }, [voices])

  useEffect(() => {
    talkMoreRef.current = talkMore
  }, [talkMore])

  const checkHealth = useCallback(
    () =>
      getHealth().then(
        (h) => {
          setMode(h.vision_mode)
          setBudget({ spent_usd: h.spent_usd, budget_usd: h.budget_usd })
          setDemo({ public: h.public_demo === true, videoUrl: h.video_url ?? null, slotS: h.demo_slot_s ?? null })
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

  /** The user is about to ask: stop hazard speech now (it is not replayed; the repeat rule continues). */
  const pauseHazardSpeech = useCallback(() => {
    speechIdRef.current += 1
    cancelSpeech()
    announceRef.current = { ...announceRef.current, speaking: false }
    setAnswer((a) => (a.kind === 'phrase' ? { ...a, speaking: false } : a))
  }, [])
  const isHazardSpeaking = useCallback(() => announceRef.current.speaking, [])

  const { suppressRef, listen, ask: askView, askTimings, holdStart, holdEnd } = useAsk({
    videoRef,
    langRef,
    voicesRef,
    lastWarningRef,
    running: camera === 'on',
    handsFree,
    pauseHazardSpeech,
    isHazardSpeaking,
  })

  useEffect(() => {
    askActiveRef.current = askView !== null
  }, [askView])

  /** Heartbeat: a soft tick for a fresh answer that is not spoken (never over speech or during Ask). */
  const maybeTick = useCallback(() => {
    const now = performance.now()
    const asking = askActiveRef.current || suppressRef.current
    const input = { speaking: announceRef.current.speaking, asking, now, lastTickAt: lastTickAtRef.current }
    if (!shouldTick({ ...input, minGapMs: HEARTBEAT_MIN_GAP_MS })) return
    lastTickAtRef.current = now
    playTick()
  }, [suppressRef])

  /** Speaks a connection alert. What was said before is forgotten, so the current warning is said again after it. */
  const sayAlert = useCallback((text: string) => {
    const speechId = ++speechIdRef.current
    announceRef.current = { ...INITIAL_ANNOUNCE, lastSpokenAt: performance.now(), speaking: true }
    spokenKindsRef.current = {}
    spokenSidesRef.current = {}
    const speechLang = SPEECH_LANGS[langRef.current]
    const handle = speak(text, { lang: speechLang, voice: pickVoice(voicesRef.current, speechLang) })
    const done = () => {
      if (speechId === speechIdRef.current) announceRef.current = { ...announceRef.current, speaking: false }
    }
    handle.started.then(() => void handle.ended.then(done), done)
  }, [])

  /** A fresh answer arrived on either channel: the connection rule may say "Back online". */
  const noteAnswer = useCallback(() => {
    const [next, said] = onAnswer(linkRef.current, performance.now(), !askActiveRef.current)
    const wasLost = linkRef.current.lost
    linkRef.current = next
    if (wasLost) setAnswer((a) => (a.kind === 'lost' ? { kind: 'none' } : a))
    if (said === 'back') sayAlert(connectionText[langRef.current].back)
  }, [sayAlert])

  /** Shows the answer; keeps the same id (no crossfade) while the phrase is unchanged. */
  const showAnswer = useCallback((res: Shown, text: string, noVoice: boolean, lamp: Lamp) => {
    setAnswer((a) => {
      const same = a.kind === 'phrase' && a.text === text
      return {
        kind: 'phrase',
        id: same ? a.id : ++answerIdRef.current,
        text,
        lamp,
        quiet: res.hazard === 'unsure',
        speaking: announceRef.current.speaking && speakingTextRef.current === text,
        speechFailed: same ? a.speechFailed : false,
        noVoice,
      }
    })
  }, [])

  /**
   * Speaks `speech` for the answer whose screen phrase is `text`. If it never started (timeout, error, dropped), the
   * repeat rule forgets it (`onFailed` undoes the caller's memory too), so the next answer tries again (Brief 25).
   */
  const say = useCallback(
    (res: Shown, text: string, speech: string, onStart: (speechStart: number) => void, onFailed?: () => void) => {
      const speechId = ++speechIdRef.current
      const announceBefore = announceRef.current
      announceRef.current = spoke(res, performance.now())
      speakingTextRef.current = text
      const done = (failed: boolean) => {
        if (speechId !== speechIdRef.current) return // a newer phrase took over
        announceRef.current = failed ? { ...announceBefore, speaking: false } : { ...announceRef.current, speaking: false }
        if (failed) onFailed?.()
        setAnswer((a) => (a.kind === 'phrase' && a.text === text ? { ...a, speaking: false, speechFailed: failed } : a))
      }
      const speechLang = SPEECH_LANGS[langRef.current]
      const handle = speak(speech, { lang: speechLang, voice: pickVoice(voicesRef.current, speechLang) })
      handle.started.then(
        (speechStart) => {
          if (speechId !== speechIdRef.current) return
          setAnswer((a) => (a.kind === 'phrase' && a.text === text ? { ...a, speaking: true } : a))
          onStart(speechStart)
          void handle.ended.then(() => done(false))
        },
        () => done(true),
      )
    },
    [],
  )

  /**
   * An answer from either channel: the merge rule decides whether it replaces what is shown, the repeat rule whether
   * it is spoken. A fast warning that is spoken gets the cue (tone + vibration) first.
   */
  const present = useCallback(
    (
      channel: Channel,
      captured: Shown,
      box: Box | null,
      seq: number,
      frame: Size,
      marks: { captureStart: number; requestSent: number; responseReceived: number; serverMs: number },
    ) => {
      const now = performance.now()
      // Brief 16: say the metres left now, not the metres at capture (the person kept walking meanwhile).
      const atNow = atSpeakingTime(captured, marks.captureStart, now, walkRef.current.walking(now), WALK_SPEED_M_S, STALE_MS)
      const answerMs = Math.round(marks.responseReceived - marks.captureStart)
      const countAnswer = (t: Timings): Timings =>
        channel === 'fast'
          ? { ...t, fastMs: pushHistory(t.fastMs, answerMs, TIMING_HISTORY_SIZE) }
          : { ...t, answerMs: pushHistory(t.answerMs, answerMs, TIMING_HISTORY_SIZE) }
      if (atNow.drop) {
        setTimings((t) => ({ ...countAnswer(t), silentCount: t.silentCount + 1 }))
        maybeTick()
        return // stale, and already walked past
      }
      // Brief 16b: the side changes only when the box is clearly past a side line (per kind, last spoken side).
      const shown = holdSide(atNow.shown, box, spokenSidesRef.current, SIDE_LINES)
      if (isWarning(shown)) setTimings((t) => ({ ...t, lastDistance: { capturedM: atNow.capturedM, nowM: atNow.nowM } }))
      // Hazard speech waits while the start line plays (it is said on the next answer).
      let decision = holdForGreeting(decideFor(shown, announceRef.current, now, talkMoreRef.current), sessionVoiceRef.current)
      const recent = () => fastRecentlySaid(shown, spokenKindsRef.current, now, FAST_REPEAT_MS, REPEAT_CLOSER_M)
      // A Talk more repeat of a fast hit waits for Muse when Muse's detail of it is on screen (Muse repeats that).
      const museShown = shownRef.current.channel === 'detail' && now - shownRef.current.at < SAM_HOLD_MS
      if (channel === 'fast' && decision.speak && (decision.again ? museShown : recent())) {
        decision = { speak: false, why: 'repeat' }
      }
      if (!replaces(channel, shown, shownRef.current, now, SAM_HOLD_MS, decision.speak)) {
        setTimings((t) => ({ ...countAnswer(t), silentCount: t.silentCount + 1 }))
        maybeTick()
        return // see merge.ts: kept off screen and not spoken
      }
      const lamp = mergedLamp(lampFor(shown), seq, shownRef.current)
      shownRef.current = { channel, hazard: shown.hazard, seq, lamp, at: now }
      setHazardBox(
        isWarning(shown) && box ? { seq: ++boxSeqRef.current, hazard: shown.hazard, box, frame } : null,
      )
      if (isWarning(shown)) lastWarningRef.current = speechFor(shown, 'en')
      const text = phraseFor(shown, langRef.current)
      const speech = speechFor(shown, langRef.current)
      const noVoice = voiceStatus(voicesRef.current, SPEECH_LANGS[langRef.current]) === 'missing'
      showAnswer(shown, text, noVoice, lamp)
      // While waiting for the user's question, hazard speech stays quiet (and is not marked as spoken).
      if (decision.speak && speech !== null && !noVoice && !suppressRef.current) {
        if (fastCue(channel, decision)) playWarnCue()
        const kindsBefore = spokenKindsRef.current
        const sidesBefore = spokenSidesRef.current
        spokenKindsRef.current = rememberSpoken(spokenKindsRef.current, shown, now)
        spokenSidesRef.current = rememberSide(spokenSidesRef.current, shown)
        say(
          shown,
          text,
          speech,
          (speechStart) => {
            const record = toRecord({ ...marks, speechStart, modelMs: marks.serverMs })
            setTimings((t) => ({
              ...countAnswer(t),
              spoken: pushHistory(t.spoken, record, TIMING_HISTORY_SIZE),
              spokenCount: t.spokenCount + 1,
            }))
          },
          () => {
            // Not heard, so not remembered as said either.
            spokenKindsRef.current = kindsBefore
            spokenSidesRef.current = sidesBefore
          },
        )
      } else {
        const roundTrip = Math.round(marks.responseReceived - marks.requestSent)
        setTimings((t) => ({
          ...countAnswer(t),
          silentRoundTrips: pushHistory(t.silentRoundTrips, roundTrip, TIMING_HISTORY_SIZE),
          silentCount: t.silentCount + 1,
        }))
        maybeTick()
      }
    },
    [maybeTick, say, showAnswer, suppressRef],
  )

  /** An answer older than one already handled on its channel is dropped: counted, not shown, not spoken. */
  const isLate = useCallback((channel: Channel, seq: number) => {
    if (seq > handledSeqRef.current[channel]) {
      handledSeqRef.current[channel] = seq
      return false
    }
    setTimings((t) => ({ ...t, droppedCount: t.droppedCount + 1 }))
    return true
  }, [])

  /** A failed request on either channel. Returns true when the loop must stop (budget, no key). */
  const onFailure = useCallback(
    (err: unknown, session: number, channel: Channel) => {
      if (err instanceof ApiError && err.code === 'slot_ended') {
        // Public demo: the server says this visitor's time is up.
        haltedRef.current = session
        setSlotToken(null)
        stopRef.current(strings.demo.timeUp(minutesText(demoRef.current.slotS ?? 180)))
        return
      }
      const reason = failureReason(err)
      if (reason === 'unreachable') {
        setBackend('unreachable')
        setAnswer((a) => (a.kind === 'lost' ? a : { kind: 'none' }))
        return // keep retrying
      }
      setBackend('ok')
      if (channel === 'fast' && reason !== 'budget' && reason !== 'key') return // Muse still answers this frame
      setAnswer({ kind: 'failed', reason })
      void checkHealth() // refresh spend / budget for the message
      if (reason === 'budget' || reason === 'key') haltedRef.current = session // these will not fix themselves
    },
    [checkHealth],
  )

  /** Muse (detail): obstacles, up / down, metres, clear. */
  const runDetail = useCallback(
    async (session: number, seq: number, image: string, frame: Size, captureStart: number, requestSent: number) => {
      detailInFlightRef.current += 1
      const slowTimer = setTimeout(() => session === sessionRef.current && setSlow(true), MODEL_SLOW_MS)
      try {
        const res = await analyze({ image_b64: image })
        const responseReceived = performance.now()
        if (session !== sessionRef.current) return
        noteAnswer() // even a late answer shows the connection is alive
        if (isLate('detail', seq)) return
        setSlow(false)
        setBackend('ok')
        setMode(res.source)
        if (res.input_tokens !== null && res.output_tokens !== null && res.cost_usd !== null) {
          setLastUsage({ inputTokens: res.input_tokens, outputTokens: res.output_tokens, costUsd: res.cost_usd })
          setBudget((b) => (b ? { ...b, spent_usd: b.spent_usd + (res.cost_usd ?? 0) } : b))
        }
        setTimings((t) => ({ ...t, lastModelMs: Math.round(res.model_ms) }))
        const shown = { ...res, hedged: museHedged(res) }
        present('detail', shown, res.box, seq, frame, { captureStart, requestSent, responseReceived, serverMs: res.model_ms })
      } catch (err) {
        if (session !== sessionRef.current || isLate('detail', seq)) return
        onFailure(err, session, 'detail')
      } finally {
        clearTimeout(slowTimer)
        detailInFlightRef.current -= 1
        if (detailInFlightRef.current === 0 && session === sessionRef.current) setSlow(false)
      }
    },
    [isLate, noteAnswer, onFailure, present],
  )

  /** SAM (fast): the nearest kept steps / kerb hit, if any. "Nothing found" changes nothing on screen. */
  const runFast = useCallback(
    async (session: number, seq: number, image: string, frame: Size, captureStart: number, requestSent: number) => {
      try {
        const res = await detect({ image_b64: image })
        const responseReceived = performance.now()
        if (session !== sessionRef.current) return
        noteAnswer()
        if (isLate('fast', seq)) return
        setBackend('ok')
        if (res.cost_usd !== null) setBudget((b) => (b ? { ...b, spent_usd: b.spent_usd + (res.cost_usd ?? 0) } : b))
        const answerMs = Math.round(responseReceived - captureStart)
        const nearest = res.hits[0]
        if (!nearest) {
          setTimings((t) => ({
            ...t,
            lastSamMs: Math.round(res.sam_ms),
            fastMs: pushHistory(t.fastMs, answerMs, TIMING_HISTORY_SIZE),
          }))
          maybeTick()
          return
        }
        setTimings((t) => ({ ...t, lastSamMs: Math.round(res.sam_ms) }))
        present('fast', hitAsShown(nearest), nearest.box, seq, frame, {
          captureStart,
          requestSent,
          responseReceived,
          serverMs: res.sam_ms,
        })
      } catch (err) {
        if (session !== sessionRef.current || isLate('fast', seq)) return
        onFailure(err, session, 'fast')
      }
    },
    [isLate, maybeTick, noteAnswer, onFailure, present],
  )

  /**
   * One frame through the pipeline: face blur once, then the same frame to SAM (two speeds) and, every
   * DETAIL_EVERY-th frame while Muse has room, to Muse. Several frames can be in flight; each channel handles its
   * answers in capture order.
   */
  const captureOnce = useCallback(
    async (session: number): Promise<void> => {
      const video = videoRef.current
      if (!video) return
      const seq = ++captureSeqRef.current
      const captureStart = performance.now()
      const frame = { width: video.videoWidth, height: video.videoHeight }
      inFlightRef.current += 1 // counted from capture, so face blur time is inside the in-flight limit
      try {
        let image: string
        try {
          const sent = await captureGuarded(video)
          image = sent.imageB64
          setLastSent(sent)
        } catch {
          setAnswer({ kind: 'failed', reason: 'answer' })
          return
        }
        if (session !== sessionRef.current) return
        const requestSent = performance.now()
        if (!LOOP_ENABLED) {
          cancelSpeech()
          setAnswer({ kind: 'waiting' })
        } else {
          setAnswer((a) => (a.kind === 'phrase' ? a : { kind: 'waiting' }))
        }
        if (!TWO_SPEED) {
          await runDetail(session, seq, image, frame, captureStart, requestSent)
          return
        }
        const toMuse = seq % DETAIL_EVERY === 0 && detailInFlightRef.current < MAX_IN_FLIGHT
        if (toMuse) void runDetail(session, seq, image, frame, captureStart, requestSent)
        await runFast(session, seq, image, frame, captureStart, requestSent)
      } finally {
        inFlightRef.current -= 1
      }
    },
    [runDetail, runFast],
  )

  /** Walking detection: the phone's acceleration while running (no data = assume walking). */
  useEffect(() => {
    if (camera !== 'on') return
    walkRef.current = new WalkDetector(WALK_WINDOW_MS, WALK_ACCEL_VAR)
    const onMotion = (e: DeviceMotionEvent) => {
      const a = e.acceleration ?? e.accelerationIncludingGravity
      if (!a || a.x === null || a.y === null || a.z === null) return
      walkRef.current.add(performance.now(), Math.hypot(a.x, a.y, a.z))
    }
    window.addEventListener('devicemotion', onMotion)
    return () => window.removeEventListener('devicemotion', onMotion)
  }, [camera])

  /** Connection rule: while running, no answer for CONNECTION_LOST_MS -> lamp dark, "Connection lost" said and shown. */
  useEffect(() => {
    if (camera !== 'on' || !LOOP_ENABLED) return
    linkRef.current = startLink(performance.now())
    const timer = setInterval(() => {
      const before = linkRef.current
      const now = performance.now()
      const [next, said] = onCheck(before, now, CONNECTION_LOST_MS, CONNECTION_REPEAT_MS, !askActiveRef.current)
      linkRef.current = next
      if (next.lost && !before.lost) {
        shownRef.current = NOTHING_SHOWN
        setHazardBox(null)
        setAnswer((a) => (a.kind === 'failed' ? a : { kind: 'lost' })) // budget / model failures keep their state
      }
      if (said === 'lost') sayAlert(connectionText[langRef.current].lost)
    }, CONNECTION_CHECK_MS)
    return () => clearInterval(timer)
  }, [camera, sayAlert])

  /**
   * Starts a capture every LOOP_STAGGER_MS (two speeds: FAST_STAGGER_MS) after the previous one started, with at
   * most MAX_IN_FLIGHT (two speeds: FAST_MAX_IN_FLIGHT SAM requests) at once.
   */
  const runLoop = useCallback(
    async (session: number) => {
      const running = () => session === sessionRef.current && haltedRef.current !== session
      const stagger = TWO_SPEED ? FAST_STAGGER_MS : LOOP_STAGGER_MS
      const maxInFlight = TWO_SPEED ? FAST_MAX_IN_FLIGHT : MAX_IN_FLIGHT
      while (running()) {
        void captureOnce(session)
        await sleep(stagger)
        while (running() && inFlightRef.current >= maxInFlight) await sleep(50)
      }
    },
    [captureOnce],
  )

  /**
   * Start. `prepare` (public demo): runs after the unlocks inside the tap and must succeed (a slot) before the camera
   * opens and the start line is said; false leaves everything off.
   */
  const start = useCallback((prepare?: () => Promise<boolean>) => {
    unlockSpeech() // must run synchronously inside the tap
    // iOS asks for motion access inside a tap; refused or unsupported -> the distance rule assumes walking.
    const motion = (window as unknown as { DeviceMotionEvent?: { requestPermission?: () => Promise<string> } })
      .DeviceMotionEvent
    motion?.requestPermission?.().catch(() => undefined)
    unlockAudio() // earcons and the microphone (iOS)
    warmUpFaceDetector() // load the face model now, before the first frame
    lastWarningRef.current = null
    const session = ++sessionRef.current
    announceRef.current = INITIAL_ANNOUNCE
    spokenKindsRef.current = {}
    spokenSidesRef.current = {}
    shownRef.current = NOTHING_SHOWN
    handledSeqRef.current = { fast: captureSeqRef.current, detail: captureSeqRef.current }
    setCamera('starting')
    setAnswer({ kind: 'none' })
    setHazardBox(null)
    void checkHealth()
    const go = () => {
      const [voice, greet] = onStart(sessionVoiceRef.current)
      sessionVoiceRef.current = voice
      if (greet) {
        // Said inside the tap (iOS allows speech then; unlockSpeech above keeps it allowed for a public-demo start
        // that waits for its slot); no tick and no hazard speech over it.
        const speechId = ++speechIdRef.current
        announceRef.current = { ...INITIAL_ANNOUNCE, speaking: true }
        const speechLang = SPEECH_LANGS[langRef.current]
        const done = () => {
          sessionVoiceRef.current = greetingDone(sessionVoiceRef.current)
          if (speechId === speechIdRef.current) announceRef.current = { ...announceRef.current, speaking: false }
        }
        const greetNow = (voices: readonly SpeechSynthesisVoice[]) => {
          if (speechId !== speechIdRef.current) return done() // stopped while waiting
          const handle = speak(sessionText[langRef.current].start, { lang: speechLang, voice: pickVoice(voices, speechLang) })
          handle.started.then(() => void handle.ended.then(done), done)
        }
        // The first speech waits (at most VOICE_WAIT_MS) for the phone's voices, so it never gets a random fallback
        // voice (Brief 20). Already loaded, or WebKit (iPhone: said inside the tap, Brief 25): said at once.
        if (greetAtOnce(voicesRef.current.length > 0, !speechSupported() || webKitSpeech())) greetNow(voicesRef.current)
        else void waitForVoices(window.speechSynthesis, VOICE_WAIT_MS).then(greetNow)
      }
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
    }
    if (!prepare) return go()
    void prepare().then((ok) => {
      if (session !== sessionRef.current) return
      if (ok) go()
      else setCamera('off')
    })
  }, [checkHealth, runLoop])

  /** Stop. `say` replaces the stop line (public demo: the time-up line). Button clicks pass an event: ignored. */
  const stop = useCallback((say?: unknown) => {
    sessionRef.current += 1
    speechIdRef.current += 1
    announceRef.current = INITIAL_ANNOUNCE
    spokenKindsRef.current = {}
    spokenSidesRef.current = {}
    cancelSpeech()
    const [voice, bye] = onStop(sessionVoiceRef.current)
    sessionVoiceRef.current = voice
    if (bye) {
      const speechLang = SPEECH_LANGS[langRef.current]
      const line = typeof say === 'string' ? say : sessionText[langRef.current].stop
      speak(line, { lang: speechLang, voice: pickVoice(voicesRef.current, speechLang) })
    }
    stopStream(streamRef.current)
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCamera('off')
    setSlow(false)
    setAnswer({ kind: 'none' })
    setHazardBox(null)
  }, [])

  useEffect(() => {
    stopRef.current = stop
  }, [stop])

  const capture = useCallback(() => {
    if (camera === 'on' && inFlightRef.current === 0) void captureOnce(sessionRef.current)
  }, [camera, captureOnce])

  return {
    videoRef,
    loop: LOOP_ENABLED,
    fast: TWO_SPEED,
    camera,
    backend,
    mode,
    budget,
    answer,
    hazardBox,
    lastSent,
    slow,
    timings,
    lastUsage,
    start,
    stop,
    capture,
    demo,
    listen,
    ask: askView,
    askTimings,
    holdStart,
    holdEnd,
  }
}
