// ?mictest=1: does an open microphone make iPhone speech quieter or move it to the earpiece? (de-risks Brief 6)
// Camera stays off. No network calls: this page never talks to the backend.
import { useCallback, useEffect, useRef, useState } from 'react'
import { MIC_TEST_INTERVAL_MS, SPEECH_LANGS } from '../config'
import { cancelSpeech, speak, unlockSpeech } from '../lib/speech'
import { pickVoice } from '../lib/voices'
import { strings } from '../strings'
import { Button } from './Button'
import { Chip } from './Chips'
import { Notice } from './Notice'

const t = strings.micTest
const LEVEL_UPDATE_MS = 100

interface MicInfo {
  contextRate: number | null
  trackRate: number | null
  echo: boolean | null
}

export function MicTest() {
  const [running, setRunning] = useState(false)
  const [micOn, setMicOn] = useState(false)
  const [level, setLevel] = useState(0)
  const [info, setInfo] = useState<MicInfo>({ contextRate: null, trackRate: null, echo: null })
  const [spokenCount, setSpokenCount] = useState(0)
  const [failed, setFailed] = useState(false)
  const ctxRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const meterRef = useRef<number | null>(null)
  const speechTimerRef = useRef<number | null>(null)

  const closeMic = useCallback(() => {
    if (meterRef.current !== null) clearInterval(meterRef.current)
    meterRef.current = null
    sourceRef.current?.disconnect()
    sourceRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setMicOn(false)
    setLevel(0)
  }, [])

  const openMic = useCallback(async () => {
    const ctx = ctxRef.current
    if (!ctx) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true }, video: false })
      streamRef.current = stream
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      source.connect(analyser)
      sourceRef.current = source
      const settings = stream.getAudioTracks()[0]?.getSettings() ?? {}
      setInfo({ contextRate: ctx.sampleRate, trackRate: settings.sampleRate ?? null, echo: typeof settings.echoCancellation === 'boolean' ? settings.echoCancellation : null })
      const samples = new Float32Array(analyser.fftSize)
      meterRef.current = window.setInterval(() => {
        analyser.getFloatTimeDomainData(samples)
        let sum = 0
        for (const x of samples) sum += x * x
        setLevel(Math.min(1, Math.sqrt(sum / samples.length) * 4)) // RMS, scaled so speech fills the bar
      }, LEVEL_UPDATE_MS)
      setMicOn(true)
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [])

  const speakTest = useCallback(() => {
    const lang = SPEECH_LANGS.en
    speak(t.sentence, { lang, voice: pickVoice(window.speechSynthesis.getVoices(), lang) }).started.then(
      () => setSpokenCount((n) => n + 1),
      () => undefined,
    )
  }, [])

  const stopAll = useCallback(() => {
    if (speechTimerRef.current !== null) clearInterval(speechTimerRef.current)
    speechTimerRef.current = null
    cancelSpeech()
    closeMic()
    void ctxRef.current?.close()
    ctxRef.current = null
    setRunning(false)
  }, [closeMic])

  const start = () => {
    unlockSpeech() // inside the tap, for iOS
    ctxRef.current = new AudioContext()
    void ctxRef.current.resume()
    setRunning(true)
    setSpokenCount(0)
    void openMic()
    speakTest()
    speechTimerRef.current = window.setInterval(speakTest, MIC_TEST_INTERVAL_MS)
  }

  useEffect(() => stopAll, [stopAll])

  return (
    <div className="app app--auto">
      <div className="mictest">
      <header className="topbar">
        <div className="chips">
          <Chip label={strings.chip.betaLong} />
        </div>
      </header>
      <h1 className="home__title">{t.title}</h1>
      <p className="home__help">{t.help}</p>

      {running && (
        <section className="mictest__panel" aria-live="polite">
          <button
            type="button"
            className={micOn ? 'mictest__toggle mictest__toggle--on' : 'mictest__toggle'}
            aria-pressed={micOn}
            onClick={() => (micOn ? closeMic() : void openMic())}
          >
            {micOn ? t.micOn : t.micOff}
          </button>
          <div className="label">{t.level}</div>
          <div className="meter" role="meter" aria-label={t.level} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>
            <div className="meter__fill" style={{ transform: `scaleX(${level})` }} />
          </div>
          <p className="mictest__line">{t.sampleRate(info.contextRate, info.trackRate)}</p>
          <p className="mictest__line">{t.echo(info.echo)}</p>
          <p className="mictest__line">{t.spoken(spokenCount)}</p>
        </section>
      )}
      {failed && <Notice title={t.micFailed} />}

      <div className="home__bottom">
        <Button label={running ? t.stop : t.start} onClick={running ? stopAll : start} />
      </div>
      </div>
    </div>
  )
}
