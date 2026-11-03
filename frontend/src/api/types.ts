// API shapes. Keep in sync with backend/app/schemas.py.

export type Hazard = 'step_down' | 'step_up' | 'curb' | 'obstacle' | 'clear' | 'unsure'
export type Side = 'left' | 'ahead' | 'right'
export type Distance = 'near' | 'far'
export type Source = 'mock' | 'live'

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
}

export interface HealthResponse {
  status: 'ok'
  vision_mode: Source
}
