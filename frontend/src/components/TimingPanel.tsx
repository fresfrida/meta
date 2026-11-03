import { type TimingRecord, stats } from '../lib/timing'
import { strings } from '../strings'

const t = strings.timing

export function TimingPanel({ history }: { history: TimingRecord[] }) {
  const last = history[0]
  const s = stats(history.map((r) => r.totalMs))

  return (
    <section className="timing" aria-label={t.heading}>
      <div className="timing__row">
        <span className="timing__heading">{t.heading}</span>
        {last ? (
          <span className="timing__last">
            {t.last} {last.totalMs} {t.ms}
          </span>
        ) : (
          <span className="timing__none">{t.none}</span>
        )}
      </div>
      {s && last && (
        <>
          <div className="timing__row timing__stats">
            <span>
              {t.min} {s.min} · {t.median} {s.median} · {t.max} {s.max} {t.ms}
            </span>
          </div>
          <div className="timing__breakdown">
            {t.breakdown(last.frameMs, last.roundTripMs, last.modelMs, last.speechMs)}
          </div>
          <ol className="timing__list">
            {history.map((r, i) => (
              <li key={i}>{r.totalMs}</li>
            ))}
          </ol>
        </>
      )}
    </section>
  )
}
