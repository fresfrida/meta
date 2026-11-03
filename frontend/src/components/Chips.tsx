import type { Source } from '../api/types'
import type { BackendState } from '../hooks/useSecondEyes'
import { strings } from '../strings'

export function Chip({ label }: { label: string }) {
  return <span className="chip">{label}</span>
}

/** Camera screen chips: Beta, then the last mode the backend reported (nothing when unknown and unreachable). */
export function Chips({ mode, backend }: { mode: Source | null; backend: BackendState }) {
  const modeLabel = mode !== null ? strings.mode[mode] : backend === 'checking' ? strings.mode.checking : null
  return (
    <div className="chips">
      <Chip label={strings.chip.beta} />
      {modeLabel && <Chip label={modeLabel} />}
    </div>
  )
}
