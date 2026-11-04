// The one rule that turns a failed capture into what the screen says.
import { ApiError } from '../api/client'

export type FailureReason = 'unreachable' | 'budget' | 'key' | 'model' | 'answer'

export function failureReason(err: unknown): FailureReason {
  if (!(err instanceof ApiError)) return 'answer'
  if (err.kind === 'unreachable') return 'unreachable'
  switch (err.code) {
    case 'budget_reached':
      return 'budget'
    case 'key_missing':
      return 'key'
    case 'model_timeout':
    case 'model_error':
    case 'model_auth':
    case 'model_billing':
      return 'model'
    default:
      return 'answer'
  }
}
