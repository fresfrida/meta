import { strings } from '../strings'

const t = strings.state.gettingReady

export interface ReadySteps {
  camera: boolean
  privacy: boolean
  firstLook: boolean
}

/** A step mark: a tick when done, a quiet ring while waiting. Static (no spinner), so it is reduced-motion safe. */
function Mark({ done }: { done: boolean }) {
  return (
    <svg className="ready__mark" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      {done ? (
        <path d="M5 10.5l3.2 3.2L15 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" />
      )}
    </svg>
  )
}

/**
 * Brief 27: one calm card from the Start tap until the first answer: what is happening, and three steps that tick
 * when done. English for every language until the ZH / MS / TA wording comes (lang="en").
 */
export function GettingReady({ steps }: { steps: ReadySteps }) {
  const rows: [keyof ReadySteps, string][] = [
    ['camera', t.steps.camera],
    ['privacy', t.steps.privacy],
    ['firstLook', t.steps.firstLook],
  ]
  return (
    <section className="card ready" role="status" aria-live="polite" lang="en">
      <div className="card__body">
        <h2 className="ready__title">{t.title}</h2>
        <p className="ready__body">{t.body}</p>
        <ol className="ready__steps">
          {rows.map(([key, label]) => (
            <li key={key} className={steps[key] ? 'ready__step ready__step--done' : 'ready__step'}>
              <Mark done={steps[key]} />
              <span>{label}</span>
              {steps[key] && <span className="visually-hidden">, {t.done}</span>}
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
