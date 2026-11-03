import type { Source } from '../api/types'
import type { BackendState } from '../hooks/useSecondEyes'
import type { FaceBlurStatus } from '../lib/faceGuard'
import { strings } from '../strings'

export function Chip({ label }: { label: string }) {
  return <span className="chip">{label}</span>
}

/** Camera screen chips: Beta, then the last mode the backend reported (nothing when unknown and unreachable). */
interface ChipsProps {
  mode: Source | null
  backend: BackendState
  listening: boolean
  faceBlur: FaceBlurStatus
}

export function Chips({ mode, backend, listening, faceBlur }: ChipsProps) {
  const modeLabel = mode !== null ? strings.mode[mode] : backend === 'checking' ? strings.mode.checking : null
  return (
    <div className="chips">
      <Chip label={strings.chip.beta} />
      {modeLabel && <Chip label={modeLabel} />}
      {/* Proof that no face leaves the phone; "off" says plainly when frames go unblurred. */}
      <span className={faceBlur === 'off' ? 'chip chip--alert' : 'chip'} role="status">
        {strings.chip.faceBlur[faceBlur]}
      </span>
      {/* Says the microphone is streaming to Meta. */}
      {listening && <Chip label={strings.ask.micChip} />}
    </div>
  )
}
