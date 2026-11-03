import { useRef, useState, useSyncExternalStore } from 'react'
import { BoxOverlay } from './components/BoxOverlay'
import { Button } from './components/Button'
import { Chips } from './components/Chips'
import { Home } from './components/Home'
import { Notice } from './components/Notice'
import { PhraseCard } from './components/PhraseCard'
import { Settings } from './components/Settings'
import { TimingPanel } from './components/TimingPanel'
import { TimingPill } from './components/TimingPill'
import { HOLD_TO_ASK_MS } from './config'
import { useHandsFree, useLanguage, useVoices } from './hooks/useLanguage'
import { unlockAudio } from './lib/audio'
import { getFaceBlurStatus, subscribeFaceBlur } from './lib/faceGuard'
import { useSecondEyes } from './hooks/useSecondEyes'
import { strings } from './strings'

export default function App() {
  const [lang, setLang] = useLanguage()
  const voices = useVoices()
  const [handsFree, setHandsFree] = useHandsFree()
  const eyes = useSecondEyes(lang, voices, handsFree)
  const faceBlur = useSyncExternalStore(subscribeFaceBlur, getFaceBlurStatus)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { videoRef, camera, backend, answer, holdStart, holdEnd } = eyes
  const cameraOn = camera === 'on'

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
      className={cameraOn ? 'app app--camera' : 'app'}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onPointerLeave={onPointerEnd}
      onContextMenu={(e) => cameraOn && e.preventDefault()}
    >
      <video ref={videoRef} className="camera" playsInline muted autoPlay hidden={!cameraOn} />
      {cameraOn && <BoxOverlay hazardBox={eyes.hazardBox} videoRef={videoRef} lang={lang} />}

      {!cameraOn &&
        (settingsOpen ? (
          <Settings
            lang={lang}
            voices={voices}
            onLang={setLang}
            handsFree={handsFree}
            onHandsFree={setHandsFree}
            onDone={() => setSettingsOpen(false)}
          />
        ) : (
          <Home
            camera={camera}
            backend={backend}
            lang={lang}
            onStart={eyes.start}
            onSettings={() => setSettingsOpen(true)}
          />
        ))}

      {cameraOn && (
        <>
          <header className="topbar">
            <Chips mode={eyes.mode} backend={backend} listening={eyes.listen === 'on'} faceBlur={faceBlur} />
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
                onClick={eyes.stop}
                variant={eyes.loop ? 'primary' : 'secondary'}
              />
            </nav>
          </footer>
        </>
      )}
    </div>
  )
}
