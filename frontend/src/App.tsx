import { useState } from 'react'
import { BoxOverlay } from './components/BoxOverlay'
import { Button } from './components/Button'
import { Chips } from './components/Chips'
import { Home } from './components/Home'
import { Notice } from './components/Notice'
import { PhraseCard } from './components/PhraseCard'
import { Settings } from './components/Settings'
import { TimingPanel } from './components/TimingPanel'
import { TimingPill } from './components/TimingPill'
import { useLanguage, useVoices } from './hooks/useLanguage'
import { useSecondEyes } from './hooks/useSecondEyes'
import { strings } from './strings'

export default function App() {
  const [lang, setLang] = useLanguage()
  const voices = useVoices()
  const eyes = useSecondEyes(lang, voices)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { videoRef, camera, backend, answer } = eyes
  const cameraOn = camera === 'on'

  return (
    <div className={cameraOn ? 'app app--camera' : 'app'}>
      <video ref={videoRef} className="camera" playsInline muted autoPlay hidden={!cameraOn} />
      {cameraOn && <BoxOverlay hazardBox={eyes.hazardBox} videoRef={videoRef} lang={lang} />}

      {!cameraOn &&
        (settingsOpen ? (
          <Settings lang={lang} voices={voices} onLang={setLang} onDone={() => setSettingsOpen(false)} />
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
            <Chips mode={eyes.mode} backend={backend} />
          </header>
          {backend === 'unreachable' && <Notice {...strings.state.backendUnreachable} />}
          <PhraseCard answer={answer} budget={eyes.budget} slow={eyes.slow} loop={eyes.loop} lang={lang} />
          <div className="app__clear" />
          <footer className="bottom">
            {eyes.loop ? (
              <TimingPill timings={eyes.timings} lastUsage={eyes.lastUsage} />
            ) : (
              <TimingPanel timings={eyes.timings} lastUsage={eyes.lastUsage} />
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
