import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ApiError, requestSlot } from './api/client'
import { BoxOverlay } from './components/BoxOverlay'
import { Button } from './components/Button'
import { Chips } from './components/Chips'
import { DemoFull, DemoNotice } from './components/Demo'
import { Home } from './components/Home'
import { Notice } from './components/Notice'
import { PhraseCard } from './components/PhraseCard'
import { Settings } from './components/Settings'
import { TimingPanel } from './components/TimingPanel'
import { TimingPill } from './components/TimingPill'
import { HOLD_TO_ASK_MS } from './config'
import { useHandsFree, useLanguage, useTalkMore, useVoices } from './hooks/useLanguage'
import { unlockAudio } from './lib/audio'
import { deviceId, formatLeft, setSlotToken } from './lib/demoSlot'
import { getFaceBlurStatus, subscribeFaceBlur } from './lib/faceGuard'
import { useSecondEyes } from './hooks/useSecondEyes'
import { strings } from './strings'

export default function App() {
  const [lang, setLang] = useLanguage()
  const voices = useVoices()
  const [handsFree, setHandsFree] = useHandsFree()
  const [talkMore, setTalkMore] = useTalkMore()
  const eyes = useSecondEyes(lang, voices, handsFree, talkMore)
  const faceBlur = useSyncExternalStore(subscribeFaceBlur, getFaceBlurStatus)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { videoRef, camera, backend, answer, holdStart, holdEnd } = eyes
  const cameraOn = camera === 'on'

  // Public demo (Brief 17): notice once per visit (kept in memory only), a slot per Start, a countdown, the end.
  const [noticeOpen, setNoticeOpen] = useState(false)
  const [understood, setUnderstood] = useState(false)
  const [refused, setRefused] = useState<'full' | 'later' | null>(null)
  const [slotEndsAt, setSlotEndsAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => performance.now())

  const getSlot = useCallback(async () => {
    try {
      const slot = await requestSlot(deviceId())
      setSlotToken(slot.token)
      setSlotEndsAt(performance.now() + slot.expires_in_s * 1000)
      return true
    } catch (err) {
      const code = err instanceof ApiError ? err.code : null
      setRefused(code === 'slots_full' || code === 'daily_budget' ? 'full' : 'later')
      return false
    }
  }, [])

  const begin = useCallback(() => eyes.start(eyes.demo.public ? getSlot : undefined), [eyes, getSlot])
  const onStart = () => {
    if (eyes.demo.public && !understood) setNoticeOpen(true)
    else begin()
  }

  // Countdown while running; at zero the demo stops with the time-up line. (A slot the server ends early is
  // stopped by the hook.)
  const { stop } = eyes
  useEffect(() => {
    if (!cameraOn || slotEndsAt === null) return
    const timer = setInterval(() => {
      const t = performance.now()
      setNow(t)
      if (t >= slotEndsAt) {
        setSlotEndsAt(null)
        setSlotToken(null)
        stop(strings.demo.timeUp)
      }
    }, 250)
    return () => clearInterval(timer)
  }, [cameraOn, slotEndsAt, stop])
  const leftMs = slotEndsAt === null ? null : slotEndsAt - now
  const stopNow = () => {
    setSlotEndsAt(null) // the slot keeps running on the server until it expires; Start again resumes it
    eyes.stop()
  }

  // Fallback: touch and hold anywhere on the camera view (not on a button) to ask without the wake phrase.
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const holding = useRef(false)
  const onPointerDown = (e: React.PointerEvent) => {
    if (!cameraOn || (e.target as HTMLElement).closest('button')) return
    unlockAudio() // inside the touch, for iOS
    holdTimer.current = setTimeout(() => {
      holding.current = true
      holdStart()
    }, HOLD_TO_ASK_MS)
  }
  const onPointerEnd = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current)
    holdTimer.current = null
    if (holding.current) {
      holding.current = false
      holdEnd()
    }
  }

  return (
    <div
      className={cameraOn ? 'app app--camera' : 'app app--auto'}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onPointerLeave={onPointerEnd}
      onContextMenu={(e) => cameraOn && e.preventDefault()}
    >
      <video ref={videoRef} className="camera" playsInline muted autoPlay hidden={!cameraOn} />
      {cameraOn && <BoxOverlay hazardBox={eyes.hazardBox} videoRef={videoRef} lang={lang} />}

      {!cameraOn && refused !== null && (
        <DemoFull reason={refused} videoUrl={eyes.demo.videoUrl} onBack={() => setRefused(null)} />
      )}
      {!cameraOn && refused === null && noticeOpen && (
        <DemoNotice
          onUnderstand={() => {
            setUnderstood(true)
            setNoticeOpen(false)
            begin() // inside this tap: speech and audio unlock as on Start
          }}
          onBack={() => setNoticeOpen(false)}
        />
      )}
      {!cameraOn &&
        refused === null &&
        !noticeOpen &&
        (settingsOpen ? (
          <Settings
            lang={lang}
            voices={voices}
            onLang={setLang}
            handsFree={handsFree}
            onHandsFree={setHandsFree}
            talkMore={talkMore}
            onTalkMore={setTalkMore}
            onDone={() => setSettingsOpen(false)}
          />
        ) : (
          <Home
            camera={camera}
            backend={backend}
            lang={lang}
            onStart={onStart}
            onSettings={() => setSettingsOpen(true)}
          />
        ))}

      {cameraOn && (
        <>
          <header className="topbar">
            <Chips
              mode={eyes.mode}
              backend={backend}
              listening={eyes.listen === 'on'}
              faceBlur={faceBlur}
              timeLeft={leftMs === null ? null : strings.demo.left(formatLeft(leftMs))}
            />
          </header>
          {backend === 'unreachable' && <Notice {...strings.state.backendUnreachable} />}
          {eyes.listen === 'stopped' && <Notice {...strings.ask.stopped} />}
          {eyes.listen === 'failed' && <Notice {...strings.ask.micFailed} />}
          <PhraseCard
            answer={answer}
            budget={eyes.budget}
            slow={eyes.slow}
            loop={eyes.loop}
            lang={lang}
            ask={eyes.ask}
          />
          <div className="app__clear" />
          <footer className="bottom">
            {eyes.loop ? (
              <TimingPill
                timings={eyes.timings}
                lastUsage={eyes.lastUsage}
                askTimings={eyes.askTimings}
                lastSent={eyes.lastSent}
                fast={eyes.fast}
              />
            ) : (
              <TimingPanel
                timings={eyes.timings}
                lastUsage={eyes.lastUsage}
                askTimings={eyes.askTimings}
                lastSent={eyes.lastSent}
              />
            )}
            <nav className="controls" aria-label={strings.appName}>
              {!eyes.loop && (
                <Button label={strings.button.capture} onClick={eyes.capture} disabled={answer.kind === 'waiting'} />
              )}
              <Button
                label={strings.button.stop}
                onClick={stopNow}
                variant={eyes.loop ? 'primary' : 'secondary'}
              />
            </nav>
          </footer>
        </>
      )}
    </div>
  )
}
