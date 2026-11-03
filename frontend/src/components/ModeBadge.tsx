import type { Source } from '../api/types'
import type { BackendState } from '../hooks/useSecondEyes'
import { strings } from '../strings'

/** Shows the last mode the backend reported. Unknown + unreachable shows nothing (the banner explains). */
export function ModeBadge({ mode, backend }: { mode: Source | null; backend: BackendState }) {
  if (mode !== null) return <span className={`badge badge--${mode}`}>{strings.mode[mode]}</span>
  if (backend === 'checking') return <span className="badge badge--checking">{strings.mode.checking}</span>
  return null
}
