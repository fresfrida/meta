import { useState } from 'react'
import type { AskTiming } from '../hooks/useAsk'
import type { Timings, Usage } from '../hooks/useSecondEyes'
import type { SentFrame } from '../lib/camera'
import { stats } from '../lib/timing'
import { strings } from '../strings'
import { TimingPanel } from './TimingPanel'

const seconds = (ms: number) => (ms / 1000).toFixed(1)

/** Median capture to answer for one channel, in seconds, or "–" before its first answer. */
const medianS = (values: number[]) => {
  const s = stats(values)
  return s ? seconds(s.median) : '–'
}

/**
 * Loop mode: one line, capture to answer. One channel: "Last 3.9 s · median 4.1 s". Two speeds: medians per
 * channel, "fast 1.9 s · detail 4.4 s". Tap to expand the full panel.
 */
export function TimingPill({
  timings,
  lastUsage,
  askTimings,
  lastSent,
  fast = false,
}: {
  timings: Timings
  lastUsage: Usage | null
  askTimings: AskTiming[]
  lastSent: SentFrame | null
  fast?: boolean
}) {
  const [open, setOpen] = useState(false)
  const s = stats(timings.answerMs)
  const last = timings.answerMs[0]
  const any = timings.answerMs.length + timings.fastMs.length > 0
  const label = fast
    ? any
      ? strings.timing.pillTwo(medianS(timings.fastMs), medianS(timings.answerMs))
      : strings.timing.pillNone
    : s && last !== undefined
      ? strings.timing.pill(seconds(last), seconds(s.median))
      : strings.timing.pillNone
  return (
    <>
      {open && <TimingPanel timings={timings} lastUsage={lastUsage} askTimings={askTimings} lastSent={lastSent} />}
      <button type="button" className="pill" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {label}
      </button>
    </>
  )
}
