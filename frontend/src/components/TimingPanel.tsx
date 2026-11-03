import type { Timings, Usage } from '../hooks/useSecondEyes'
import { stats } from '../lib/timing'
import { strings } from '../strings'

const t = strings.timing

export function TimingPanel({ timings, lastUsage }: { timings: Timings; lastUsage: Usage | null }) {
  const history = timings.spoken
  const last = history[0]
  const s = stats(history.map((r) => r.totalMs))
  const silent = stats(timings.silentRoundTrips)

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
          {lastUsage && (
            <div className="timing__breakdown">
              {t.usage(lastUsage.inputTokens, lastUsage.outputTokens, lastUsage.costUsd)}
            </div>
          )}
          <ol className="timing__list">
            {history.map((r, i) => (
              <li key={i}>{r.totalMs}</li>
            ))}
          </ol>
        </>
      )}
      {timings.spokenCount + timings.silentCount > 0 && (
        <div className="timing__row timing__breakdown">
          <span>{t.counts(timings.spokenCount, timings.silentCount)}</span>
          {silent && <span>{t.silentRoundTrip(silent.min, silent.median, silent.max)}</span>}
        </div>
      )}
    </section>
  )
}
