import type { Lang } from '../config'
import type { BackendState, CameraState } from '../hooks/useSecondEyes'
import { languages, strings } from '../strings'
import { Button } from './Button'
import { Chip } from './Chips'
import { GearIcon } from './Icons'
import { Notice } from './Notice'

const s = strings.state

function CameraNotice({ camera }: { camera: CameraState }) {
  switch (camera) {
    case 'starting':
      return <Notice {...s.cameraStarting} role="status" />
    case 'denied':
      return <Notice {...s.permissionDenied} />
    case 'unavailable':
      return <Notice {...s.cameraUnavailable} />
    case 'insecure':
      return <Notice {...s.insecure} />
    default:
      return null
  }
}

interface HomeProps {
  camera: CameraState
  backend: BackendState
  lang: Lang
  onStart: () => void
  onSettings: () => void
}

/** The stopped state: title, one line of help, the voice language, Start. */
export function Home({ camera, backend, lang, onStart, onSettings }: HomeProps) {
  const failed = camera === 'denied' || camera === 'unavailable' || camera === 'insecure'
  return (
    <div className="home">
      <div className="home__top">
        <header className="topbar">
          <div className="chips">
            <Chip label={strings.chip.betaLong} />
          </div>
          <button type="button" className="icon-button" aria-label={strings.home.settings} onClick={onSettings}>
            <GearIcon />
          </button>
        </header>
        <h1 className="home__title">{strings.home.title}</h1>
        <p className="home__help">{strings.home.help}</p>
      </div>
      <div className="home__bottom">
        {backend === 'unreachable' && <Notice {...s.backendUnreachable} />}
        <CameraNotice camera={camera} />
        <button type="button" className="home__voice" onClick={onSettings}>
          <span>{strings.home.voice}</span>
          <span className="home__voice-value" lang={lang}>
            {languages[lang].name} ›
          </span>
        </button>
        <Button
          label={failed ? strings.button.tryAgain : strings.button.start}
          onClick={onStart}
          // Until /api/health answers, the page does not know whether this is the public demo (notice + slot first).
          disabled={camera === 'starting' || backend === 'checking'}
        />
      </div>
    </div>
  )
}
