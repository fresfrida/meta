// API shapes. Keep in sync with backend/app/schemas.py.

/** Prompt v6 (Brief 13): 19 named kinds; "obstacle" is the catch-all ("something else the person could walk into"). */
export type Hazard =
  | 'step_down'
  | 'step_up'
  | 'curb'
  | 'drain'
  | 'head_height'
  | 'person'
  | 'people'
  | 'bike'
  | 'vehicle'
  | 'pole'
  | 'barrier'
  | 'ramp'
  | 'door'
  | 'wall'
  | 'road'
  | 'crossing'
  | 'cycle_path'
  | 'escalator'
  | 'uneven'
  | 'obstacle'
  | 'clear'
  | 'unsure'
/** What the phone can show: Muse's hazards, plus SAM's "steps" (direction unknown). */
export type ShownHazard = Hazard | 'steps'
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
  | 'empty_answer'

/** [x_min, y_min, x_max, y_max] on a 0..1000 grid. */
export type Box = [number, number, number, number]

export interface VisionAnswer {
  hazard: Hazard
  side: Side | null
  distance: Distance | null
  box: Box | null
  /** Whole metres from the camera, 1..10, or null (clear, unsure, or the model gave none). */
  distance_m: number | null
  /** Prompt v7: the model is sure what the hazard is (missing / invalid counts as sure). */
  sure: boolean
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

/** Spoken languages (codes); the backend maps them to names for the model and the ASR. */
export type Language = 'en' | 'zh' | 'ms' | 'ta'

export interface AskRequest {
  question: string
  image_b64: string
  last_warning: string | null
  language: Language
}

export interface AskResponse {
  question: string
  answer: string
  source: Source
  model_ms: number
  input_tokens: number | null
  output_tokens: number | null
  cost_usd: number | null
}

/** Messages from the /api/listen WebSocket. Only questions are ever sent: other speech stays on the backend. */
export type ListenEvent =
  | { type: 'ready'; source: Source }
  | { type: 'wake' }
  | { type: 'question'; text: string; asr_ms?: number }
  | { type: 'stopped' }
  | { type: 'error'; code: 'bad_language' | 'key_missing' | 'budget_reached' }

/** Fast warning (SAM 3.1). Hits are already filtered on the backend (detect_rule.py), nearest first. */
export type DetectKind = 'steps' | 'curb' | 'door'

export interface DetectHit {
  kind: DetectKind
  box: Box
  confidence: number
  side: Side
  /** "near" when the box touches the frame bottom (then distance_m is null). */
  distance: Distance
  distance_m: number | null
}

export interface DetectRequest {
  image_b64: string
}

export interface DetectResponse {
  hits: DetectHit[]
  /** Boxes SAM returned before the rule. */
  found: number
  source: Source
  sam_ms: number
  cost_usd: number | null
}
