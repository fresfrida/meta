// Public demo screens (Brief 19, Owner-approved wording): the welcome screen (one tap starts the demo) and
// "spots taken" / "try again in a minute".
import { strings } from '../strings'
import { Button } from './Button'
import { Chip } from './Chips'

const d = strings.demo

/**
 * Before Start, public mode only. Reads in order: heading, line, list, safety line, button. Nothing is stored.
 * The button starts the slot and the camera in the same tap.
 */
export function DemoWelcome({
  minutes,
  canAsk,
  onStart,
  disabled,
}: {
  minutes: string
  canAsk: boolean
  onStart: () => void
  disabled: boolean
}) {
  return (
    <div className="home">
      <div className="home__top">
        <header className="topbar">
          <div className="chips">
            <Chip label={strings.chip.betaLong} />
          </div>
        </header>
        <h1 className="home__title">{d.welcomeTitle}</h1>
        <p className="demo__line">{d.welcomeLine}</p>
        <ul className="demo__list">
          <li>{d.youHave(minutes)}</li>
          {canAsk && <li>{d.askBullet}</li>}
          <li>{d.privacyBullet}</li>
        </ul>
        <p className="demo__safety">{d.safety}</p>
      </div>
      <div className="home__bottom">
        <Button label={d.start(minutes)} onClick={onStart} disabled={disabled} />
      </div>
    </div>
  )
}

/** No slot: today's spots or budget are used up (video button only when there is a video), or too many tries now. */
export function DemoFull({
  reason,
  videoUrl,
  onBack,
}: {
  reason: 'full' | 'later'
  videoUrl: string | null
  onBack: () => void
}) {
  return (
    <div className="home">
      <div className="home__top">
        <header className="topbar">
          <div className="chips">
            <Chip label={strings.chip.betaLong} />
          </div>
        </header>
        <h1 className="home__title">{d.welcomeTitle}</h1>
        <p className="demo__line" role="status">
          {reason === 'full' ? d.full(videoUrl !== null) : d.tryLater}
        </p>
      </div>
      <div className="home__bottom">
        {reason === 'full' && videoUrl && (
          <a className="button button--primary demo__video" href={videoUrl} target="_blank" rel="noopener noreferrer">
            {d.watchVideo}
          </a>
        )}
        <Button label={d.back} onClick={onBack} variant="secondary" />
      </div>
    </div>
  )
}
