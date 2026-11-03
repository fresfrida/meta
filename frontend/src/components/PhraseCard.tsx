import { useLayoutEffect, useRef } from 'react'
import type { Lang } from '../config'
import type { AskView } from '../hooks/useAsk'
import type { Answer, Budget } from '../hooks/useSecondEyes'
import { languages, strings } from '../strings'
import { AlertIcon } from './Icons'
import { TrafficLight } from './TrafficLight'

const st = strings.state
/** The phrase may take this many lines at full size before it steps down one size. */
const MAX_LINES_FULL_SIZE = 2

function failureText(reason: Extract<Answer, { kind: 'failed' }>['reason'], budget: Budget | null) {
  switch (reason) {
    case 'budget':
      return {
        title: st.budgetReached.title,
        body: budget ? st.budgetReached.body(budget.spent_usd, budget.budget_usd) : st.budgetReached.bodyUnknown,
      }
    case 'key':
      return st.keyMissing
    case 'model':
      return st.modelFailed
    case 'answer':
      return st.answerFailed
  }
}

/** Steps the phrase down one size when it would take more than MAX_LINES_FULL_SIZE lines (long languages, narrow phones). */
function useFitPhrase(text: string) {
  const ref = useRef<HTMLSpanElement | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => {
      delete el.dataset.fit
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight)
      const lines = lineHeight ? Math.round(el.getBoundingClientRect().height / lineHeight) : 1
      if (lines > MAX_LINES_FULL_SIZE) el.dataset.fit = 'small'
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(el.parentElement ?? el)
    return () => observer.disconnect()
  }, [text])
  return ref
}

interface PhraseCardProps {
  answer: Answer
  budget: Budget | null
  slow: boolean
  loop: boolean
  lang: Lang
  ask?: AskView | null
}

/** Traffic light + the phrase. The phrase region stays mounted so screen readers announce changes. */
export function PhraseCard({ answer, budget, slow, loop, lang, ask = null }: PhraseCardProps) {
  let text = ''
  let quiet = true
  let error = false
  let note: React.ReactNode = null
  let hint: string | null = null

  switch (answer.kind) {
    case 'none':
      text = loop ? st.watching : st.ready
      break
    case 'waiting':
      text = slow ? st.modelSlow.title : st.waiting
      if (slow) note = st.modelSlow.body
      break
    case 'failed': {
      const f = failureText(answer.reason, budget)
      text = f.title
      note = f.body
      quiet = false
      error = true
      break
    }
    case 'phrase':
      text = answer.text
      quiet = answer.quiet
      if (answer.quiet && lang === 'en') hint = st.notSureHint
      if (answer.noVoice) note = st.noVoice(languages[lang].english ?? languages[lang].name)
      else if (answer.speechFailed) note = st.speechFailed
      else if (slow) note = st.modelSlow.title
      break
  }

  const phraseRef = useFitPhrase(text)
  const lamp = answer.kind === 'phrase' ? answer.lamp : 'off'
  const speaking = answer.kind === 'phrase' && answer.speaking
  const key = answer.kind === 'phrase' ? answer.id : answer.kind

  return (
    <div className="card">
      <TrafficLight lamp={lamp} speaking={speaking} />
      <div className="card__body">
        <p className="card__phrase-wrap" aria-live="polite" aria-atomic="true" lang={answer.kind === 'phrase' ? lang : 'en'}>
          {error && <AlertIcon />}
          {/* key forces a remount so the crossfade replays for every new answer */}
          <span key={key} ref={phraseRef} className={quiet ? 'card__phrase card__phrase--quiet' : 'card__phrase'}>
            {text}
          </span>
        </p>
        {hint && <p className="card__hint">{hint}</p>}
        {ask && (
          <div className="card__ask" aria-live="polite">
            <p className="card__ask-question">
              {ask.question ? strings.ask.youAsked(ask.question) : strings.ask.listening}
            </p>
            {ask.status === 'thinking' && <p className="card__ask-answer card__ask-answer--quiet">{strings.ask.thinking}</p>}
            {ask.answer && (
              <p className="card__ask-answer" lang={lang}>
                {ask.answer}
              </p>
            )}
            {ask.status === 'failed' && <p className="card__ask-answer">{strings.ask.sorry}</p>}
          </div>
        )}
        {note && (
          <p className="card__note">
            {!error && <AlertIcon />}
            <span>{note}</span>
          </p>
        )}
      </div>
    </div>
  )
}
