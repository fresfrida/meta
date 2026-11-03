import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/client'
import { failureReason } from './failure'

describe('failureReason', () => {
  it('maps backend codes', () => {
    expect(failureReason(new ApiError('failed', 'x', 'budget_reached'))).toBe('budget')
    expect(failureReason(new ApiError('failed', 'x', 'key_missing'))).toBe('key')
    expect(failureReason(new ApiError('failed', 'x', 'model_timeout'))).toBe('model')
    expect(failureReason(new ApiError('failed', 'x', 'model_billing'))).toBe('model')
    expect(failureReason(new ApiError('failed', 'x', 'invalid_image'))).toBe('answer')
    expect(failureReason(new ApiError('failed', 'timeout'))).toBe('answer')
  })

  it('maps unreachable and unknown errors', () => {
    expect(failureReason(new ApiError('unreachable', 'x'))).toBe('unreachable')
    expect(failureReason(new Error('boom'))).toBe('answer')
  })
})
