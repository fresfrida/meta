import { useEffect, useState } from 'react'
import {
  BOX_STALE_MS,
  CAMERA_HEIGHT_M,
  type Lang,
  PATH_GUIDE,
  PATH_HALF_WIDTH_M,
  VFOV_BASE_ASPECT,
  VFOV_LANDSCAPE_DEG,
  VFOV_PORTRAIT_DEG,
} from '../config'
import type { HazardBox } from '../hooks/useSecondEyes'
import { type Size, fitOf, mapBox } from '../lib/boxMap'
import { pathGuideLines } from '../lib/pathGuide'
import { phrases } from '../strings'

/** Tracks the video element's on-screen size and object-fit, and the camera frame's size. */
function useViewOf(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const [view, setView] = useState<(Size & { fit: string; frame: Size }) | null>(null)
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const update = () =>
      setView({
        width: video.clientWidth,
        height: video.clientHeight,
        fit: getComputedStyle(video).objectFit,
        frame: { width: video.videoWidth, height: video.videoHeight },
      })
    const observer = new ResizeObserver(update)
    observer.observe(video)
    video.addEventListener('loadedmetadata', update)
    return () => {
      observer.disconnect()
      video.removeEventListener('loadedmetadata', update)
    }
  }, [videoRef])
  return view
}

/** Faint, static edges of the walking path (Brief 15, TENTATIVE). Drawn under the hazard box. */
function PathGuide({ view }: { view: Size & { fit: string; frame: Size } }) {
  const lines = pathGuideLines(view.frame, view, fitOf(view.fit), {
    halfWidthM: PATH_HALF_WIDTH_M,
    heightM: CAMERA_HEIGHT_M,
    vfovPortraitDeg: VFOV_PORTRAIT_DEG,
    vfovLandscapeDeg: VFOV_LANDSCAPE_DEG,
    baseAspect: VFOV_BASE_ASPECT,
  })
  if (!lines) return null
  return (
    <svg className="path-guide" width={view.width} height={view.height}>
      {lines.map((l, i) => (
        <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} />
      ))}
    </svg>
  )
}

/** One answer's box. Remounted per answer (key), so the stale timer restarts with every new answer. */
function HazardBoxOutline({ hazardBox, view, lang }: { hazardBox: HazardBox; view: Size & { fit: string }; lang: Lang }) {
  const [stale, setStale] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setStale(true), BOX_STALE_MS)
    return () => clearTimeout(timer)
  }, [])

  const rect = mapBox(hazardBox.box, hazardBox.frame, view, fitOf(view.fit))
  if (!rect) return null
  return (
    <div
      className={stale ? 'hazard-box hazard-box--stale' : 'hazard-box'}
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
    >
      <span className="hazard-box__label" lang={lang}>
        {phrases[lang].hazard[hazardBox.hazard]}
      </span>
    </div>
  )
}

/** Decorative: the phrase card already announces the hazard, so this layer is hidden from screen readers. */
export function BoxOverlay({
  hazardBox,
  videoRef,
  lang,
}: {
  hazardBox: HazardBox | null
  videoRef: React.RefObject<HTMLVideoElement | null>
  lang: Lang
}) {
  const view = useViewOf(videoRef)
  return (
    <div className="box-layer" aria-hidden="true">
      {PATH_GUIDE && view && <PathGuide view={view} />}
      {hazardBox && view && <HazardBoxOutline key={hazardBox.seq} hazardBox={hazardBox} view={view} lang={lang} />}
    </div>
  )
}
