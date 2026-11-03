// API shapes. Keep in sync with backend/app/schemas.py.

export type Hazard = 'step_down' | 'step_up' | 'curb' | 'obstacle' | 'clear' | 'unsure'
export type Side = 'left' | 'ahead' | 'right'
export type Distance = 'near' | 'far'
export type Source = 'mock' | 'live'
export type ErrorCode =
  | 'invalid_image'
  | 'key_missing'
  | 'budget_reached'
  | 'model_timeout'
  | 'model_auth'
  | 'model_billing'
  | 'model_error'

export interface VisionAnswer {
  hazard: Hazard
  side: Side | null
  distance: Distance | null
}

export interface AnalyzeRequest {
  image_b64: string
}

export interface AnalyzeResponse extends VisionAnswer {
  source: Source
  model_ms: number
  input_tokens: number | null
  output_tokens: number | null
  cost_usd: number | null
}

export interface HealthResponse {
  status: 'ok'
  vision_mode: Source
  model: string | null
  key_present: boolean
  spent_usd: number
  budget_usd: number
}

export interface ErrorDetail {
  code: ErrorCode
  message: string
}
