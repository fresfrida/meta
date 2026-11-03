// Asking a question: "Hey Eyes, ..." (hands-free) or touch and hold -> spoken answer about the current frame.
import { useCallback, useEffect, useRef, useState } from 'react'
import { ask } from '../api/client'
import type { ListenEvent } from '../api/types'
import {
  ASK_HOLD_TAIL_MS,
  ASK_SHOW_MS,
  ASK_TIMEOUT_MS,
  ASK_WINDOW_MS,
  type Lang,
  SPEECH_LANGS,
  TIMING_HISTORY_SIZE,
} from '../config'
import { unlockAudio } from '../lib/audio'
import { captureFrame } from '../lib/camera'
import { playEarcon } from '../lib/earcon'
import { ListenClient } from '../lib/listen'
import { type MicHandle, startMic } from '../lib/mic'
import { speak } from '../lib/speech'
import { pushHistory } from '../lib/timing'
import { pickVoice } from '../lib/voices'
import { strings } from '../strings'

/** off: not listening · connecting · on: live ASR · mock: backend in mock mode (no questions) · stopped: lost after one
 *  reconnect · failed: no mic, no key or no budget. */
export type ListenState = 'off' | 'connecting' | 'on' | 'mock' | 'stopped' | 'failed'

export interface AskView {
  status: 'listening' | 'thinking' | 'answering' | 'answered' | 'failed'
  question: string | null
  answer: string | null
}

/** End of the question (speechEnd on the backend) to the start of the spoken answer, and its parts. */
export interface AskTiming {
  totalMs: number
  asrMs: number | null
  modelMs: number | null
}

interface AskOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>
  langRef: React.RefObject<Lang>
  voicesRef: React.RefObject<SpeechSynthesisVoice[]>
  /** English plain sentence of the last warning, or null. */
  lastWarningRef: React.RefObject<string | null>
  /** Camera running. */
  running: boolean
  handsFree: boolean
  /** Stops hazard speech in progress (the user is about to talk). */
  pauseHazardSpeech: () => void
  isHazardSpeaking: () => boolean
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const QUIET_WAIT_MS = 3_000

export function useAsk(o: AskOptions) {
  const clientRef = useRef<ListenClient | null>(null)
  const micRef = useRef<MicHandle | null>(null)
  const askIdRef = useRef(0)
  const holdingRef = useRef(false)
  const windowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** True from the wake phrase (or hold) until the question arrives: hazard speech stays quiet meanwhile. */
  const suppressRef = useRef(false)
  const onEventRef = useRef<(e: ListenEvent) => void>(() => undefined)
  const [listen, setListen] = useState<ListenState>('off')
  const [askView, setAskView] = useState<AskView | null>(null)
  const [askTimings, setAskTimings] = useState<AskTiming[]>([])

  const clearTimer = (ref: React.RefObject<ReturnType<typeof setTimeout> | null>) => {
    if (ref.current) clearTimeout(ref.current)
    ref.current = null
  }

  const stopListening = useCallback(() => {
    clearTimer(stopTimerRef)
    clientRef.current?.end()
    clientRef.current = null
    micRef.current?.stop()
    micRef.current = null
    setListen('off')
  }, [])

  const startListening = useCallback(() => {
    if (clientRef.current) return
    setListen('connecting')
    const client = new ListenClient(
      o.langRef.current,
      (e) => onEventRef.current(e),
      (byUs) => {
        if (clientRef.current !== client) return
        clientRef.current = null
        micRef.current?.stop()
        micRef.current = null
        setListen(byUs ? 'off' : 'stopped')
      },
    )
    clientRef.current = client
    startMic((pcm) => client.sendAudio(pcm)).then(
      (mic) => {
        if (clientRef.current === client) micRef.current = mic
        else mic.stop()
      },
      () => {
        if (clientRef.current === client) {
          clientRef.current = null
          client.end()
        }
        setListen('failed')
      },
    )
  }, [o.langRef])

  /** Wake phrase heard (or hold started): earcon, hazard speech pauses, wait for the question. */
  const beginListening = useCallback(() => {
    askIdRef.current += 1
    const id = askIdRef.current
    suppressRef.current = true
    clearTimer(clearTimerRef)
    o.pauseHazardSpeech()
    void playEarcon()
    setAskView({ status: 'listening', question: null, answer: null })
    clearTimer(windowTimerRef)
    if (!holdingRef.current) {
      windowTimerRef.current = setTimeout(() => {
        if (askIdRef.current !== id) return
        suppressRef.current = false
        setAskView((a) => (a?.status === 'listening' ? null : a))
      }, ASK_WINDOW_MS)
    }
  }, [o])

  const answerQuestion = useCallback(
    async (question: string, asrMs: number | null) => {
      if (!suppressRef.current) beginListening() // a hold question without a wake event
      const id = askIdRef.current
      clearTimer(windowTimerRef)
      suppressRef.current = false // a new warning while waiting for the answer is still spoken
      const questionAt = performance.now()
      setAskView({ status: 'thinking', question, answer: null })
      const lang = o.langRef.current
      let text: string = strings.ask.sorry
      let speechLang = SPEECH_LANGS.en // the fixed "sorry" is English only (no approved translation)
      let modelMs: number | null = null
      let failed = true
      try {
        const video = o.videoRef.current
        if (!video) throw new Error('no camera')
        const res = await ask(
          { question, image_b64: captureFrame(video), last_warning: o.lastWarningRef.current, language: lang },
          ASK_TIMEOUT_MS,
        )
        text = res.answer
        speechLang = SPEECH_LANGS[lang]
        modelMs = Math.round(res.model_ms)
        failed = false
      } catch {
        // spoken as the fixed sorry below
      }
      if (askIdRef.current !== id) return // a newer question took over
      setAskView({ status: failed ? 'failed' : 'answering', question, answer: failed ? null : text })
      for (let waited = 0; o.isHazardSpeaking() && waited < QUIET_WAIT_MS; waited += 100) await sleep(100)
      const handle = speak(text, { lang: speechLang, voice: pickVoice(o.voicesRef.current, speechLang) })
      handle.started.then(
        (startedAt) => {
          const timing = { totalMs: Math.round(startedAt - questionAt + (asrMs ?? 0)), asrMs, modelMs }
          setAskTimings((t) => pushHistory(t, timing, TIMING_HISTORY_SIZE))
        },
        () => undefined,
      )
      void handle.ended.then(() => {
        if (askIdRef.current !== id) return
        setAskView((a) => (a ? { ...a, status: failed ? 'failed' : 'answered' } : a))
        clearTimerRef.current = setTimeout(() => {
          if (askIdRef.current === id) setAskView(null)
        }, ASK_SHOW_MS)
      })
    },
    [beginListening, o],
  )

  useEffect(() => {
    onEventRef.current = (e: ListenEvent) => {
      switch (e.type) {
        case 'ready':
          setListen(e.source === 'mock' ? 'mock' : 'on')
          break
        case 'wake':
          beginListening()
          break
        case 'question':
          void answerQuestion(e.text, e.asr_ms ?? null)
          break
        case 'stopped':
          setListen('stopped')
          break
        case 'error':
          setListen('failed')
          break
      }
    }
  }, [answerQuestion, beginListening])

  // Hands-free: listen while the camera runs. Off: only during a touch-and-hold.
  useEffect(() => {
    if (o.running && o.handsFree) startListening()
    else if (!holdingRef.current) stopListening()
  }, [o.running, o.handsFree, startListening, stopListening])

  useEffect(() => {
    if (o.running) return
    askIdRef.current += 1 // late answers from before Stop are ignored
    suppressRef.current = false
    clearTimer(windowTimerRef)
    clearTimer(clearTimerRef)
  }, [o.running])

  useEffect(() => stopListening, [stopListening])

  /** Touch and hold (>= HOLD_TO_ASK_MS) on the camera view: a question without the wake phrase. */
  const holdStart = useCallback(() => {
    unlockAudio() // inside the touch
    holdingRef.current = true
    clearTimer(stopTimerRef)
    startListening()
    clientRef.current?.hold(true)
    beginListening()
  }, [beginListening, startListening])

  const holdEnd = useCallback(() => {
    if (!holdingRef.current) return
    holdingRef.current = false
    clientRef.current?.hold(false)
    const id = askIdRef.current
    windowTimerRef.current = setTimeout(() => {
      if (askIdRef.current !== id) return
      suppressRef.current = false
      setAskView((a) => (a?.status === 'listening' ? null : a))
    }, ASK_HOLD_TAIL_MS + 1_000)
    if (!o.handsFree) stopTimerRef.current = setTimeout(stopListening, ASK_HOLD_TAIL_MS + 1_000)
  }, [o.handsFree, stopListening])

  // Nothing about a question is shown once the camera has stopped.
  return { listen, ask: o.running ? askView : null, askTimings, suppressRef, holdStart, holdEnd }
}
