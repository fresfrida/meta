# Architecture - Second Eyes

Status: Brief 31 (5 Nov; cloud demo on Coolify, prompt v9). Sections below were written as each brief landed.
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

Later hosting target: **AWS Lightsail (Singapore) running Coolify** - see "Cloud (Brief 17)" below.

## Cloud (Brief 17): one container on Lightsail + Coolify
| Piece | Runs on | Notes |
|---|---|---|
| Pages (built PWA) | Inside the app container, served by FastAPI (`STATIC_DIR=/app/static`), SPA fallback to `index.html` | Same origin as the API: no CORS. Built with `vite build` in the Dockerfile's first stage. |
| Backend | The same container: uvicorn on `PORT` (default 8000), plain HTTP | `/api/*` and the `/api/listen` WebSocket. |
| HTTPS | Coolify's proxy (Traefik) in front of the container | Domain from sslip.io (`<name>.<server-ip>.sslip.io`), Let's Encrypt certificate. WebSockets pass through. |
| Stored data | Coolify persistent volume mounted at `/data` (`DATA_DIR`) | `spend.json` (total live spend) and `demo.json` (today's slots, today's spend, running slots per hashed browser id). Atomic writes. No frames, no personal data. |
| Vision / detection / ASR | Meta Model API (`api.meta.ai`), key from Coolify env `MODEL_API_KEY` | Never in the image or the repo. |
| Background jobs | None | |

Public demo limits (`PUBLIC_DEMO=1`, `backend/app/demo.py`): a signed slot per Start (`DEMO_SLOT_S`, 180 s), required on
every `/api/analyze`, `/api/detect`, `/api/ask` and on `/api/listen` (as `?slot=`); `DEMO_SLOTS_PER_DAY` (10) new slots per
Singapore day; `DAILY_BUDGET_USD` (default 8; the cloud demo uses 20) per day on top of `BUDGET_USD` (the cloud demo uses 100); one running slot per browser; 6 slot requests per IP
per minute. Live cost is about $32 per hour of use, so $8 a day covers about 15 minutes of live use (about 5 full slots).

What makes moving hosts easy: one image, every setting from env vars, state in one small volume, no host-specific code.
What makes it harder: the `/data` volume must move with it (or spend / slot counts reset); the WebSocket needs a proxy that
passes upgrades; the per-IP limit trusts `X-Forwarded-For` (fine behind Coolify's proxy, forgeable if exposed directly -
the daily slot count and budget are the hard guards).

## How the phone reaches the backend

1. Mac and iPhone are on the same Wi-Fi.
2. iPhone Safari opens `https://<mac-lan-ip>:5173` and accepts the
   self-signed certificate warning once. HTTPS is required: `getUserMedia`
   (camera) only works in a secure context, and `localhost` is not available
   on the phone.
3. The page calls `/api/analyze` on the same origin. Vite proxies it to
   FastAPI on `127.0.0.1:8000`. So the phone talks to one secure address only,
   and there are no CORS rules to maintain.
4. Asking (Brief 6) adds a WebSocket on the same origin: `/api/listen`
   (`wss://` on the phone; the Vite proxy has `ws: true`) and `POST /api/ask`.

## Faces are blurred on the phone (Brief 7)

Every frame that leaves the phone - the hazard loop and Ask - goes through one function,
`captureGuarded()` in `frontend/src/lib/camera.ts`:

```
video -> canvas (640 px long edge, only the captured frame; the live preview is never processed)
  -> lib/faceGuard.ts -> lib/yunet.ts: OpenCV YuNet 2023mar (MIT, frontend/public/models/) on
     onnxruntime-web 1.31.1 (wasm, bundled by Vite; nothing from a CDN at runtime); 640 x 640 input,
     frame placed at full resolution, score >= FACE_MIN_SCORE (0.3)
  -> lib/faceBlur.ts: each face box grown by FACE_PAD (20%) and replaced by a 4 x 4 mosaic; bodies untouched
  -> JPEG -> POST /api/analyze or /api/ask
```

- Always on; there is no setting to turn it off. The camera screen shows a chip ("Faces blurred" /
  "Face blur off") and the expanded timing panel shows a thumbnail of the last frame actually sent.
- **Fail-open:** if the model cannot load (or is not ready within 8 s) or errors on a frame, the frame is
  still sent unblurred (hazard warnings matter more) and the chip turns to "Face blur off" (white, alert
  style); a console warning is logged. A later good frame turns it back on.
- Range (CC0 crowd photo, desktop): faces down to ~7 px wide are found, roughly 10 m on an iPhone's main
  camera in our 640 px frame; misses remain for small, turned or backlit faces.
- **Frames are not stored** anywhere: not on the phone, not on the backend (the backend passes them to the
  model and drops them; only spend and timings are kept). Audio is not stored either (Brief 6).

## Asking a question (Brief 6) - audio leaves the phone

**Microphone audio leaves the phone.** While the camera runs with hands-free
listening on (Settings, default on), the phone streams microphone audio to the
backend, which streams it to Meta's realtime speech recogniser. With hands-free
off, audio is sent only during a touch-and-hold. Settings says so ("While
running, microphone audio is sent to Meta to hear your questions.", TENTATIVE).

```
phone mic (getUserMedia, echo cancellation) -> AudioWorklet (public/mic-worklet.js)
  -> lib/pcm.ts: resample to 16 kHz, PCM16 mono, 80 ms frames
  -> lib/micGate.ts: frames dropped while the phone speaks or plays the earcon, +300 ms
  -> WebSocket /api/listen?lang=en|zh|ms|ta  (binary frames; {"type":"hold"|"end"} text controls)
backend app/listen.py (key added here only)
  -> wss://api.meta.ai/v1/asr/realtime, first JSON frame: authorization.accessToken "Bearer <key>",
     model muse-voice-transcribe-1.0, audioEncoding PCM_16KHZ, mode ENDPOINTING,
     languageBias ["English"] or ["English", Mandarin Chinese|Malay|Tamil], keywords ["Hey Eyes"]
  -> audio paced at real time in 80 ms frames; silence fills gaps (the ASR closes idle sessions);
     at most 2 s queued (docs: never more than 5 s ahead); reconnect once, then {"type":"stopped"}
  -> each whole second streamed adds $0.18/3600 to the budget
  -> speechComplete turns -> app/wake.py: only questions go back to the phone
     ({"type":"wake"} and {"type":"question","text"}); every other turn is dropped, never logged or stored
phone: earcon, hazard speech pauses, card shows "You asked: ..." in the chosen language (strings.ts askText)
  -> POST /api/ask {question, image_b64 (current frame), last_warning, language}
backend app/ask.py -> muse-spark-1.3 with the Owner-approved prompt (plain text), trimmed to 2 sentences,
  tokens billed -> {question, answer, model_ms, tokens, cost}
phone: speaks the answer in the chosen language; failure -> fixed "Sorry, I could not answer." (English)
```

## Fast warning: two speeds (Brief 11)
```
phone loop: capture every 900 ms (at most 2 /api/detect in flight), face blur once
  -> POST /api/detect { image_b64 }  every frame
       backend/app/detect.py: SAM 3.1, POST https://api.meta.ai/v1/responses (same key), "stairs" and "curb" as two
       requests in parallel on one keep-alive httpx client; each bounded by 4 s wall clock and 2 MB; masks dropped
       -> detect_rule.py: confidence >= 0.5, below the horizon, side from the box, distance from the box bottom
       -> { hits: [{kind, box, confidence, side, distance, distance_m}] nearest first, found, source, sam_ms, cost_usd }
       budget: $0.0025 per image per concept (2 per frame)
  -> POST /api/analyze { image_b64 }  every 2nd frame (Muse, as below), at most 2 in flight
phone: lib/merge.ts decides what is shown; lib/announce.ts what is spoken; a spoken fast hit gets tone + vibration
```
Live cost per hour of Start time (measured on the Mac: ~1.1 frames/s to SAM, ~0.3 Muse calls/s): SAM ~1.1 x $0.005 x
3600 = ~$20; Muse ~0.3 x $0.002 x 3600 = ~$2; ASR $0.18. About **$22/hour**. Mock: `DETECT_MODE` follows
`VISION_MODE`; `MOCK_DETECT_DELAY_MS` / `MOCK_VISION_DELAY_MS` add pretend latency.

## Request flow (one capture)

Loop mode (default): after Start, the phone starts a capture every
`LOOP_STAGGER_MS` (1750) after the previous one started, with at most
`MAX_IN_FLIGHT` (2) requests open. Answers are handled in capture order; an
answer older than one already handled is dropped (counted, not shown, not
spoken). `?loop=0` in the URL gives the single Capture button instead (Brief 1
behaviour, every answer spoken). `?mictest=1` renders only the mic test page
(no backend calls).

```
capture (loop tick, or tap Capture with ?loop=0)
  -> grab one video frame, downscale to 640px long edge, JPEG (quality from config)
  -> POST /api/analyze { image_b64 }                  (phone -> Vite proxy -> FastAPI)
  -> backend: checks image_b64 is valid base64
     mock: fixed list of 6, each held for MOCK_HOLD_CALLS (4) calls (the image is not looked at)
     live: refuse with 402 budget_reached if spent >= BUDGET_USD; else one call
           to muse-spark; unparseable output -> hazard "unsure"; add token cost
           to backend/.data/spend.json
     side from box: if box present, side = box centre x (<= LEFT_MAX 333 left, >= RIGHT_MIN 667 right,
     else ahead), side_source "box"; otherwise the model's side, side_source "model"
     response { hazard, side, side_source, distance, distance_m, box, source, model_ms, input_tokens, output_tokens, cost_usd }
     (box = [x_min, y_min, x_max, y_max] on 0..1000, or null; malformed -> null;
      distance_m = whole metres 1..10 or null, invalid -> null; prompt v3)
  -> phone: phraseFor(answer, lang) picks the language's template (strings.ts): metres when
     distance_m is set, else near/far; lampFor(answer) lights the traffic light (lib/light.ts)
  -> warnings with a box: BoxOverlay draws it over the video (lib/boxMap.ts maps the frame grid
     through the video's object-fit: cover crop); fades after BOX_STALE_MS (2000) without a new answer
  -> no-repeat rule (frontend/src/lib/announce.ts) decides speak or stay silent
  -> speechSynthesis.speak(phrase) in the chosen language (en-GB / zh-CN / ms-MY / ta-IN) with a
     matching installed voice; no voice -> shown only, with a notice
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
| `LISTEN_MODE` / `ASK_MODE` | backend | = `VISION_MODE` | Live ASR proxy / live Ask, set separately (e.g. live Ask while the camera loop stays on mock). |
| `META_ASR_URL` / `ASR_MODEL` / `ASR_PRICE_PER_HOUR` | backend | `wss://api.meta.ai/v1/asr/realtime` / `muse-voice-transcribe-1.0` / `0.18` | Realtime speech recognition. |
| `MODEL_API_KEY` | backend only | none | Live only. Never `VITE_`, never logged, never committed. Missing in live -> 503 `key_missing`. |
| `META_BASE_URL` | backend | `https://api.meta.ai/v1` | Model API base URL. |
| `VISION_MODEL` | backend | `muse-spark-1.3` | Standard mode model ID (`-contributor` would be Contributor mode). |
| `VISION_REASONING_EFFORT` | backend | `minimal` | Lowest level Muse Spark accepts (`none` returns 400 per the docs). |
| `VISION_TIMEOUT_S` | backend | `10` | Per-call timeout; timeout -> 504 `model_timeout`. |
| `BUDGET_USD` | backend | `25` | Live calls refused (402 `budget_reached`) once spent >= this. |
| `PRICE_INPUT_PER_M` / `PRICE_CACHED_INPUT_PER_M` / `PRICE_OUTPUT_PER_M` | backend | `1.25` / `0.15` / `4.25` | USD per 1M tokens (muse-spark-1.3 Standard). Output includes reasoning tokens. |
| `SPEND_FILE` | backend | `backend/.data/spend.json` | Where the spend counter lives. |
| `MOCK_HOLD_CALLS` | backend | `4` | Mock repeats each answer this many calls. |
| `?loop=0` | page URL | loop on | Single-capture mode for timing tests. |
| `?mictest=1` | page URL | off | Mic test page (iPhone speech with the mic open); no backend calls. |
| `second-eyes.lang` | localStorage | `en` | Chosen speech language (Settings). |

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
  one model call (expected a few seconds).
- **Face model runtime size.** The onnxruntime wasm is ~15 MB (kept out of the PWA precache; loaded on
  first Start). A host should serve it compressed (~3.9 MB gzip) and cacheable.
- **Long-lived WebSocket.** `/api/listen` stays open for the whole session (ASR
  sessions run up to 60 min). Serverless functions cannot hold it; a host needs a
  long-running server (container/VM) and a proxy that passes WebSockets.
