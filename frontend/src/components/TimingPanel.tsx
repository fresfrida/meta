import type { AskTiming } from '../hooks/useAsk'
import type { Timings, Usage } from '../hooks/useSecondEyes'
import type { SentFrame } from '../lib/camera'
import { stats } from '../lib/timing'
import { strings } from '../strings'

const t = strings.timing

const seconds = (ms: number | null) => (ms === null ? '?' : (ms / 1000).toFixed(1))

export function TimingPanel({
  timings,
  lastUsage,
  askTimings = [],
  lastSent = null,
}: {
  timings: Timings
  lastUsage: Usage | null
  askTimings?: AskTiming[]
  lastSent?: SentFrame | null
}) {
  const lastAsk = askTimings[0]
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
          <span>
            {t.counts(timings.spokenCount, timings.silentCount)}
            {timings.droppedCount > 0 && ` · ${t.dropped(timings.droppedCount)}`}
          </span>
          {silent && <span>{t.silentRoundTrip(silent.min, silent.median, silent.max)}</span>}
        </div>
      )}
      {lastSent && (
        <figure className="timing__sent">
          <img className="timing__thumb" src={lastSent.dataUrl} alt={t.sentFrame} />
          <figcaption className="timing__breakdown">
            {t.sentFrame}
            <br />
            {t.sentFrameLine(lastSent.blur, lastSent.faces, lastSent.blurMs)}
          </figcaption>
        </figure>
      )}
      {lastAsk && (
        <div className="timing__breakdown">
          {strings.ask.timing(seconds(lastAsk.totalMs), seconds(lastAsk.asrMs), seconds(lastAsk.modelMs))}
        </div>
      )}
    </section>
  )
}
