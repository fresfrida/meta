import { Banner } from './components/Banner'
import { Button } from './components/Button'
import { ModeBadge } from './components/ModeBadge'
import { PhraseBand } from './components/PhraseBand'
import { StateCard } from './components/StateCard'
import { TimingPanel } from './components/TimingPanel'
import { type CameraState, useSecondEyes } from './hooks/useSecondEyes'
import { strings } from './strings'

const s = strings.state

function CameraStateCard({ camera }: { camera: Exclude<CameraState, 'on'> }) {
  switch (camera) {
    case 'off':
      return <StateCard {...s.cameraOff} />
    case 'starting':
      return <StateCard {...s.cameraStarting} />
    case 'denied':
      return <StateCard {...s.permissionDenied} tone="error" />
    case 'unavailable':
      return <StateCard {...s.cameraUnavailable} tone="error" />
    case 'insecure':
      return <StateCard {...s.insecure} tone="error" />
  }
}

export default function App() {
  const eyes = useSecondEyes()
  const { videoRef, camera, backend, answer } = eyes
  const cameraOn = camera === 'on'
  const failedCamera = camera === 'denied' || camera === 'unavailable' || camera === 'insecure'

  return (
    <div className="app">
      <video ref={videoRef} className="camera" playsInline muted autoPlay hidden={!cameraOn} />

      <header className="topbar">
        <span className="beta">{strings.betaLabel}</span>
        <ModeBadge mode={eyes.mode} />
      </header>

      {backend === 'unreachable' && <Banner {...s.backendUnreachable} />}

      <main className="main">
        {cameraOn ? <PhraseBand answer={answer} /> : <CameraStateCard camera={camera} />}
        <TimingPanel history={eyes.history} />
      </main>

      <nav className="controls" aria-label={strings.appName}>
        {cameraOn ? (
          <>
            <Button label={strings.button.capture} onClick={eyes.capture} disabled={answer.kind === 'waiting'} />
            <Button label={strings.button.stop} onClick={eyes.stop} variant="secondary" />
          </>
        ) : (
          <Button
            label={failedCamera ? strings.button.tryAgain : strings.button.start}
            onClick={eyes.start}
            disabled={camera === 'starting'}
          />
        )}
      </nav>
    </div>
  )
}
