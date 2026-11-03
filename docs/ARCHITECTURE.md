# Architecture - Second Eyes

Status: Phase A (mock vision answers only). Written before the app code, per
the Owner's standing architecture rule.

## Where every piece runs

| Piece | Runs on | Address | Notes |
|---|---|---|---|
| Pages (PWA) | Owner's Mac: Vite dev server | `https://0.0.0.0:5173` (phone uses `https://<mac-lan-ip>:5173`) | HTTPS from `@vitejs/plugin-basic-ssl` (self-signed cert, generated at start, not committed). |
| Backend ("brain") | Owner's Mac: FastAPI under uvicorn | `http://127.0.0.1:8000` | Only reachable from the Mac itself. The phone never calls it directly. |
| API path from the phone | Vite dev proxy | `/api/*` on the page's own origin -> `BACKEND_URL` | `BACKEND_URL` is an env var read by `frontend/vite.config.ts` (default `http://127.0.0.1:8000`). |
| Vision model | Mock inside the backend (Phase A). Later: Meta Model API `https://api.meta.ai/v1`, model `muse-spark-1.3` Standard (planned, not built) | n/a | Chosen by `VISION_MODE` env var: `mock` (default) or `live`. `live` is rejected with a clear error in Phase A. |
| Speech | The phone's browser (Web Speech API `speechSynthesis`) | n/a | No server involved. |
| Database | None | n/a | No stored data. Nothing is persisted on the server or phone except the browser's own PWA cache. |
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

```
tap Capture
  -> grab one video frame, downscale to 640px long edge, JPEG (quality from config)
  -> POST /api/analyze { image_b64 }                  (phone -> Vite proxy -> FastAPI)
  -> backend: checks image_b64 is valid base64; VISION_MODE=mock -> next answer
     from a fixed list of 6 (the image itself is not looked at)
     response { hazard, side, distance, source, model_ms }
  -> phone: shared helper maps { hazard, side, distance } -> fixed phrase (strings.ts)
  -> speechSynthesis.speak(phrase)
  -> timing marks: capture start, request sent, response received, speech start
```

`GET /api/health` returns `{ status, vision_mode }`; the page calls it on load,
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
| `VISION_MODE` | backend | `mock` | `mock` or `live` (live returns HTTP 501 in Phase A; any other value fails at startup). |
| `MODEL_API_KEY` | backend only | none | Not used in Phase A. Never `VITE_`, never logged, never committed. |

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
- **Backend bound to 127.0.0.1.** Intentional for the LAN demo; a host would
  bind to its own interface.
- **Latency of a hosted backend.** Each frame would travel phone -> host ->
  Meta API -> back; the LAN numbers measured here do not transfer.
- **Model calls take time.** A serverless host's function time limit must fit
  one model call (expected a few seconds); no long-running work exists.
