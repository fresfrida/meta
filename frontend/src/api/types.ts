// API shapes. Keep in sync with backend/app/schemas.py.

export type Hazard = 'step_down' | 'step_up' | 'curb' | 'obstacle' | 'clear' | 'unsure'
export type Side = 'left' | 'ahead' | 'right'
export type Distance = 'near' | 'far'
export type Source = 'mock' | 'live'
/** Where `side` came from: the box centre, or the model's own side when there is no box. */
export type SideSource = 'box' | 'model'
export type ErrorCode =
  | 'invalid_image'
  | 'key_missing'
  | 'budget_reached'
  | 'model_timeout'
  | 'model_auth'
  | 'model_billing'
  | 'model_error'

/** [x_min, y_min, x_max, y_max] on a 0..1000 grid. */
export type Box = [number, number, number, number]

export interface VisionAnswer {
  hazard: Hazard
  side: Side | null
  distance: Distance | null
  box: Box | null
  /** Whole metres from the camera, 1..10, or null (clear, unsure, or the model gave none). */
  distance_m: number | null
}

export interface AnalyzeRequest {
  image_b64: string
}

export interface AnalyzeResponse extends VisionAnswer {
  side_source: SideSource
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
