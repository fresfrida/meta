import { useState } from 'react'
import type { AskTiming } from '../hooks/useAsk'
import type { Timings, Usage } from '../hooks/useSecondEyes'
import type { SentFrame } from '../lib/camera'
import { stats } from '../lib/timing'
import { strings } from '../strings'
import { TimingPanel } from './TimingPanel'

const seconds = (ms: number) => (ms / 1000).toFixed(1)

/** Loop mode: one line, capture to answer ("Last 3.9 s · median 4.1 s"). Tap to expand the full panel. */
export function TimingPill({
  timings,
  lastUsage,
  askTimings,
  lastSent,
}: {
  timings: Timings
  lastUsage: Usage | null
  askTimings: AskTiming[]
  lastSent: SentFrame | null
}) {
  const [open, setOpen] = useState(false)
  const s = stats(timings.answerMs)
  const last = timings.answerMs[0]
  const label = s && last !== undefined ? strings.timing.pill(seconds(last), seconds(s.median)) : strings.timing.pillNone
  return (
    <>
      {open && <TimingPanel timings={timings} lastUsage={lastUsage} askTimings={askTimings} lastSent={lastSent} />}
      <button type="button" className="pill" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {label}
      </button>
    </>
  )
}
