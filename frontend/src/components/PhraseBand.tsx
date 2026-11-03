import type { Answer } from '../hooks/useSecondEyes'
import { strings } from '../strings'

/** The huge spoken phrase. The live region stays mounted so screen readers announce changes. */
export function PhraseBand({ answer }: { answer: Answer }) {
  let tone = ''
  let phrase: React.ReactNode
  let note: React.ReactNode = null

  switch (answer.kind) {
    case 'none':
      phrase = <span className="band__phrase band__phrase--quiet">{strings.state.ready}</span>
      break
    case 'waiting':
      phrase = <span className="band__phrase band__phrase--quiet">{strings.state.waiting}</span>
      break
    case 'failed':
      tone = 'band--error'
      phrase = <span className="band__phrase">{strings.state.answerFailed.title}</span>
      note = <p className="band__note">{strings.state.answerFailed.body}</p>
      break
    case 'phrase':
      tone = [answer.warning ? 'band--warning' : '', answer.speaking ? 'band--speaking' : ''].join(' ')
      // key forces a remount so the crossfade replays for every new answer
      phrase = (
        <span key={answer.id} className="band__phrase">
          {answer.text}
        </span>
      )
      if (answer.speechFailed) note = <p className="band__note band__note--error">{strings.state.speechFailed}</p>
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
