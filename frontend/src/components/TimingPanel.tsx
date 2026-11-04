import type { AskTiming } from '../hooks/useAsk'
import type { Timings, Usage } from '../hooks/useSecondEyes'
import { useSyncExternalStore } from 'react'
import { audioSessionType, audioState } from '../lib/audio'
import { type CameraInfo, type SentFrame, cameraInfo, onCameraInfo } from '../lib/camera'
import { onSpeechDebug, speechDebug } from '../lib/speech'
import { vfovDeg } from '../lib/pathGuide'
import { stats } from '../lib/timing'
import { VFOV_BASE_ASPECT, VFOV_LANDSCAPE_DEG, VFOV_PORTRAIT_DEG } from '../config'
import { strings } from '../strings'

const t = strings.timing

const seconds = (ms: number | null) => (ms === null ? '?' : (ms / 1000).toFixed(1))
const CAM = { vfovPortraitDeg: VFOV_PORTRAIT_DEG, vfovLandscapeDeg: VFOV_LANDSCAPE_DEG, baseAspect: VFOV_BASE_ASPECT }

/** The camera debug line's values (Brief 26). */
function cameraLine(c: CameraInfo): string {
  const size = (w: number | null, h: number | null) => (w && h ? `${w}x${h}` : '?')
  const fw = c.frameWidth
  const fh = c.frameHeight
  return t.camera({
    size: size(c.width, c.height),
    aspect: c.aspectRatio ? c.aspectRatio.toFixed(2) : '?',
    frame: size(fw, fh),
    zoom: c.zoom === null ? '–' : String(c.zoom),
    facing: c.facingMode ?? '–',
    label: c.label || '?',
    switched: c.switched,
    vfov: fw && fh ? `${vfovDeg(fw, fh, CAM).toFixed(0)}°` : '?',
  })
}

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
  const speech = useSyncExternalStore(onSpeechDebug, speechDebug)
  const camera = useSyncExternalStore(onCameraInfo, cameraInfo)

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
      {(timings.lastSamMs !== null || timings.lastModelMs !== null) && (
        <div className="timing__breakdown">
          {t.channels(String(timings.lastSamMs ?? '–'), String(timings.lastModelMs ?? '–'))}
        </div>
      )}
      {timings.lastDistance && (
        <div className="timing__breakdown">
          {t.distanceNow(
            timings.lastDistance.capturedM === null ? '–' : `${timings.lastDistance.capturedM} m`,
            timings.lastDistance.nowM === null ? 'very close' : `${timings.lastDistance.nowM} m`,
          )}
        </div>
      )}
      <div className="timing__breakdown">
        {t.speech(speech.unlocked, speech.last, speech.detail, audioState(), audioSessionType())}
      </div>
      {camera && <div className="timing__breakdown">{cameraLine(camera)}</div>}
      {timings.lastStages && <div className="timing__breakdown">{t.stages(timings.lastStages)}</div>}
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
