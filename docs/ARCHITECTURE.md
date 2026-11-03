# Architecture - Second Eyes

Status: Brief 3 (1 fps loop + no-repeat on mock; live path built and unit-tested; no live call made yet).
First written before the app code, per the Owner's standing architecture rule.

## Where every piece runs

| Piece | Runs on | Address | Notes |
|---|---|---|---|
| Pages (PWA) | Owner's Mac: Vite dev server | `https://0.0.0.0:5173` (phone uses `https://<mac-lan-ip>:5173`) | HTTPS from `@vitejs/plugin-basic-ssl` (self-signed cert, generated at start, not committed). |
| Backend ("brain") | Owner's Mac: FastAPI under uvicorn | `http://127.0.0.1:8000` | Only reachable from the Mac itself. The phone never calls it directly. |
| API path from the phone | Vite dev proxy | `/api/*` on the page's own origin -> `BACKEND_URL` | `BACKEND_URL` is an env var read by `frontend/vite.config.ts` (default `http://127.0.0.1:8000`). |
| Vision model | `mock`: fixed list inside the backend. `live`: Meta Model API `https://api.meta.ai/v1`, model `muse-spark-1.3` (Standard), via the OpenAI Python SDK | n/a | Chosen by `VISION_MODE` (default `mock`). Live call: Chat Completions, one base64 JPEG, `response_format` json_schema, `reasoning_effort` `minimal`, 8 s timeout, no retries. |
| Speech | The phone's browser (Web Speech API `speechSynthesis`) | n/a | No server involved. |
| Database | None | n/a | The only stored data is the live spend counter, `backend/.data/spend.json` (gitignored, local file). Frames are never stored or logged. |
| Background jobs | None | n/a | Every request is one frame in, one answer out. |

Later hosting target: **not decided**.

## How the phone reaches the backend

1. Mac and iPhone are on the same Wi-Fi.
2. iPhone Safari opens `https://<mac-lan-ip>:5173` and accepts the
   self-signed certificate warning once. HTTPS is required: `getUserMedia`
   (camera) only works in a secure context, and `localhost` is not available
   on the phone.
3. The page calls `/api/analyze` on the same origin. Vite proxies it to
   FastAPI on `127.0.0.1:8000`. So the phone talks to one secure address only,
   and there are no CORS rules to maintain.

## Request flow (one capture)

Loop mode (default): after Start, the phone runs the flow below, waits
`LOOP_INTERVAL_MS` (1000) after each answer or failure, then captures again.
One request in flight at most. `?loop=0` in the URL gives the single Capture
button instead (Brief 1 behaviour, every answer spoken).

```
capture (loop tick, or tap Capture with ?loop=0)
  -> grab one video frame, downscale to 640px long edge, JPEG (quality from config)
  -> POST /api/analyze { image_b64 }                  (phone -> Vite proxy -> FastAPI)
  -> backend: checks image_b64 is valid base64
     mock: fixed list of 6, each held for MOCK_HOLD_CALLS (4) calls (the image is not looked at)
     live: refuse with 402 budget_reached if spent >= BUDGET_USD; else one call
           to muse-spark; unparseable output -> hazard "unsure"; add token cost
           to backend/.data/spend.json
     response { hazard, side, distance, box, source, model_ms, input_tokens, output_tokens, cost_usd }
     (box = [x_min, y_min, x_max, y_max] on 0..1000, or null; malformed -> null)
  -> phone: shared helper maps { hazard, side, distance } -> fixed phrase (strings.ts)
  -> no-repeat rule (frontend/src/lib/announce.ts) decides speak or stay silent
  -> speechSynthesis.speak(phrase) when it says speak
  -> timing marks: capture start, request sent, response received, speech start
```

`GET /api/health` returns `{ status, vision_mode, model, key_present, spent_usd, budget_usd }`
(never the key); the page calls it on load,
on Start, and after a failed capture, to show the mode badge and to tell
"backend unreachable" apart from "answer failed".

PWA: `vite-plugin-pwa` builds a manifest and a service worker for production
builds only (`npm run build`). The dev server the phone uses has no service
worker. The service worker never answers `/api/*`.

## Configuration (all from env vars, nothing hardcoded)

| Var | Side | Default | Purpose |
|---|---|---|---|
| `BACKEND_URL` | frontend dev server (`vite.config.ts`, not exposed to the browser) | `http://127.0.0.1:8000` | Proxy target for `/api`. |
| `DEV_HTTPS` | frontend dev server | on | `0` serves plain HTTP. Only for desktop testing on `localhost`; the phone always needs HTTPS. |
| `VISION_MODE` | backend | `mock` | `mock` or `live`; any other value fails at startup. |
| `MODEL_API_KEY` | backend only | none | Live only. Never `VITE_`, never logged, never committed. Missing in live -> 503 `key_missing`. |
| `META_BASE_URL` | backend | `https://api.meta.ai/v1` | Model API base URL. |
| `VISION_MODEL` | backend | `muse-spark-1.3` | Standard mode model ID (`-contributor` would be Contributor mode). |
| `VISION_REASONING_EFFORT` | backend | `minimal` | Lowest level Muse Spark accepts (`none` returns 400 per the docs). |
| `VISION_TIMEOUT_S` | backend | `8` | Per-call timeout; timeout -> 504 `model_timeout`. |
| `BUDGET_USD` | backend | `25` | Live calls refused (402 `budget_reached`) once spent >= this. |
| `PRICE_INPUT_PER_M` / `PRICE_CACHED_INPUT_PER_M` / `PRICE_OUTPUT_PER_M` | backend | `1.25` / `0.15` / `4.25` | USD per 1M tokens (muse-spark-1.3 Standard). Output includes reasoning tokens. |
| `SPEND_FILE` | backend | `backend/.data/spend.json` | Where the spend counter lives. |
| `MOCK_HOLD_CALLS` | backend | `4` | Mock repeats each answer this many calls. |
| `?loop=0` | page URL | loop on | Single-capture mode for timing tests. |

The backend reads `backend/.env` at startup (python-dotenv); real environment
variables win over the file. `backend/.env` and `backend/.data/` are gitignored.

Tunable values live in one module per side: `frontend/src/config.ts` and
`backend/app/config.py`.

## Things that make deploying later hard (flagged)

- **Self-signed certificate.** Works only after the Owner accepts the warning
  on each device. A real host needs a real certificate (any managed host gives
  one).
- **Dev proxy.** `/api` routing exists only inside the Vite dev server. A
  production build served elsewhere needs the same-origin `/api` route
  re-created by the host (reverse proxy or rewrite), or a configured API base
  URL plus CORS on the backend.
- **Spend counter is a local file.** `backend/.data/spend.json` does not survive
  on a stateless or multi-instance host (each instance would count separately, and
  serverless disks are wiped). A host needs a shared store for it.
- **Backend bound to 127.0.0.1.** Intentional for the LAN demo; a host would
  bind to its own interface.
- **Latency of a hosted backend.** Each frame would travel phone -> host ->
  Meta API -> back; the LAN numbers measured here do not transfer.
- **Model calls take time.** A serverless host's function time limit must fit
  one model call (expected a few seconds); no long-running work exists.
