import { useEffect, useState } from 'react'
import { BOX_STALE_MS } from '../config'
import type { HazardBox } from '../hooks/useSecondEyes'
import { type Size, fitOf, mapBox } from '../lib/boxMap'
import { strings } from '../strings'

/** Tracks the video element's on-screen size and object-fit. */
function useViewOf(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const [view, setView] = useState<(Size & { fit: string }) | null>(null)
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const observer = new ResizeObserver(() =>
      setView({ width: video.clientWidth, height: video.clientHeight, fit: getComputedStyle(video).objectFit }),
    )
    observer.observe(video)
    return () => observer.disconnect()
  }, [videoRef])
  return view
}

/** One answer's box. Remounted per answer (key), so the stale timer restarts with every new answer. */
function HazardBoxOutline({ hazardBox, view }: { hazardBox: HazardBox; view: Size & { fit: string } }) {
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
      <span className="hazard-box__label">{strings.boxLabel[hazardBox.hazard]}</span>
    </div>
  )
}

/** Decorative: the phrase band already announces the hazard, so this layer is hidden from screen readers. */
export function BoxOverlay({
  hazardBox,
  videoRef,
}: {
  hazardBox: HazardBox | null
  videoRef: React.RefObject<HTMLVideoElement | null>
}) {
  const view = useViewOf(videoRef)
  return (
    <div className="box-layer" aria-hidden="true">
      {hazardBox && view && <HazardBoxOutline key={hazardBox.seq} hazardBox={hazardBox} view={view} />}
    </div>
  )
}
