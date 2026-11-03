import type { Answer, Budget } from '../hooks/useSecondEyes'
import { strings } from '../strings'

const st = strings.state

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

/** The huge spoken phrase. The live region stays mounted so screen readers announce changes. */
export function PhraseBand({ answer, budget }: { answer: Answer; budget: Budget | null }) {
  let tone = ''
  let phrase: React.ReactNode
  let note: React.ReactNode = null

  switch (answer.kind) {
    case 'none':
      phrase = <span className="band__phrase band__phrase--quiet">{st.ready}</span>
      break
    case 'waiting':
      phrase = (
        <span className="band__phrase band__phrase--quiet">{answer.slow ? st.modelSlow.title : st.waiting}</span>
      )
      if (answer.slow) note = <p className="band__note">{st.modelSlow.body}</p>
      break
    case 'failed': {
      const text = failureText(answer.reason, budget)
      tone = 'band--error'
      phrase = <span className="band__phrase">{text.title}</span>
      note = <p className="band__note">{text.body}</p>
      break
    }
    case 'phrase':
      tone = [answer.warning ? 'band--warning' : '', answer.speaking ? 'band--speaking' : ''].join(' ')
      // key forces a remount so the crossfade replays for every new answer
      phrase = (
        <span key={answer.id} className="band__phrase">
          {answer.text}
        </span>
      )
      if (answer.speechFailed) note = <p className="band__note band__note--error">{st.speechFailed}</p>
      break
  }

  return (
    <div className={`band ${tone}`}>
      <p className="band__phrase-wrap" aria-live="polite" aria-atomic="true">
        {phrase}
      </p>
      {note}
    </div>
  )
}
