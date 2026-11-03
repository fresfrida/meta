import type { Source } from '../api/types'
import { strings } from '../strings'

export function ModeBadge({ mode }: { mode: Source | null }) {
  if (mode === null) return <span className="badge badge--checking">{strings.mode.checking}</span>
  return <span className={`badge badge--${mode}`}>{strings.mode[mode]}</span>
}
