// Public demo screens (Brief 17, copy TENTATIVE): the notice before the first Start, and "slots full".
import { strings } from '../strings'
import { Button } from './Button'
import { Chip } from './Chips'

const d = strings.demo

/** Before Start: what this is and is not. Nothing is stored; "I understand" starts the demo (inside the tap). */
export function DemoNotice({ onUnderstand, onBack }: { onUnderstand: () => void; onBack: () => void }) {
  return (
    <div className="home">
      <div className="home__top">
        <header className="topbar">
          <div className="chips">
            <Chip label={strings.chip.betaLong} />
          </div>
        </header>
        <h1 className="home__title">{strings.home.title}</h1>
        <p className="home__help demo__notice" role="alert">
          {d.notice}
        </p>
      </div>
      <div className="home__bottom">
        <Button label={d.understand} onClick={onUnderstand} />
        <Button label={d.back} onClick={onBack} variant="secondary" />
      </div>
    </div>
  )
}

/** No slot: today's slots or budget are used up (with the video link when there is one), or too many tries. */
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
        <h1 className="home__title">{strings.home.title}</h1>
        <p className="home__help" role="status">
          {reason === 'full' ? d.full : d.tryLater}
        </p>
        {reason === 'full' && videoUrl && (
          <p className="home__help">
            <a href={videoUrl} target="_blank" rel="noopener noreferrer">
              {d.watchVideo}
            </a>
          </p>
        )}
      </div>
      <div className="home__bottom">
        <Button label={d.back} onClick={onBack} variant="secondary" />
      </div>
    </div>
  )
}
