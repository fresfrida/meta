# Handoff - Second Eyes

Last updated: 3 Nov 2026, Brief 2 Part A (live path built, no live call yet). Branch `claude/second-eyes`.

## What it is
Hackathon prototype (deadline Thu 5 Nov 10:00 SGT). Phone camera frame ->
FastAPI backend -> structured obstacle answer -> fixed phrase spoken on the
phone. Controlled demo only; nobody walks guided by it. UI says
"beta - research prototype".

## Current state (true of the code today)
- Mock vision by default. `VISION_MODE=live` calls muse-spark-1.3 (OpenAI SDK,
  json_schema answer, reasoning `minimal`, 8 s timeout). **Never run against the
  real API yet**: tested only with fake clients and an in-memory HTTP transport.
- Live spend guard: tokens x prices added to `backend/.data/spend.json`; at
  >= $25 live calls get 402 `budget_reached`. Unreadable spend file also refuses.
- Model prompt (TENTATIVE, `VISION_PROMPT_VERSION = "v1-tentative"`) lives in
  `backend/app/config.py`; Owner approves before the first live call.
- One frame per tap of Capture (no 1 fps loop, no no-repeat rule yet).
- Timing on screen: last capture-to-speech ms, min / median / max of the last
  10, and a breakdown (frame, round trip, model, speech).
- States shown: camera off, opening camera, permission denied, camera not
  available, needs HTTPS, backend unreachable, waiting for answer, answer
  failed, speech did not start; live: model is slow (> 3 s), model failed,
  budget reached, no API key. Timing panel adds tokens and cost for live answers.
- Tested in a desktop browser with a fake camera stream at 320 and 390 px.
  **Not yet tested on the iPhone.**

## Architecture
See `docs/ARCHITECTURE.md`. Short version: Vite dev server on the Mac
(`https://0.0.0.0:5173`, self-signed) proxies `/api` to FastAPI on
`127.0.0.1:8000`. iPhone on the same Wi-Fi opens `https://<mac-lan-ip>:5173`.

## Data flow
tap Capture -> `captureFrame` (640px long edge, JPEG quality 0.7) ->
`POST /api/analyze { image_b64 }` -> `{ hazard, side, distance, source, model_ms }`
-> `phraseFor()` (`frontend/src/lib/phrase.ts`) -> `speak()` -> timing record.

## Commands
First time only:
```bash
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
```
```bash
cd frontend && npm install
```
Live mode setup (only after the Owner's go): create `backend/.env` with
`VISION_MODE=live` and `MODEL_API_KEY=...` (see `backend/.env.example`). Never commit it.

Run backend (from repo root):
```bash
backend/.venv/bin/uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```
Run frontend (from repo root):
```bash
npm --prefix frontend run dev
```
Then on the iPhone: `https://<mac-lan-ip>:5173` (Mac LAN IP: `ipconfig getifaddr en0`).

Checks:
```bash
npm --prefix frontend run typecheck && npm --prefix frontend run lint && npm --prefix frontend test && npm --prefix frontend run build
```
```bash
cd backend && .venv/bin/python -m pytest -q
```

Desktop-only testing without the certificate warning: `DEV_HTTPS=0 npm --prefix frontend run dev`
and open `http://localhost:5173` on the Mac.

## Where things live
- Text: `frontend/src/strings.ts`. Tunables: `frontend/src/config.ts`, `backend/app/config.py`.
- Types: `frontend/src/api/types.ts` <-> `backend/app/schemas.py` (keep in sync).
- Design tokens: `frontend/src/styles/tokens.css`.
- Mock answers and the live client: `backend/app/vision.py`. Budget: `backend/app/budget.py`.
- Failure -> screen text rule: `frontend/src/lib/failure.ts`.

## Deployment
None. Later host: not decided. See ARCHITECTURE "Things that make deploying later hard".

## Known risks
- iOS speech: needs the Start tap to unlock; behaviour with the silent switch
  and Bluetooth is unmeasured.
- The self-signed certificate must be accepted on the iPhone; camera access
  over it is unverified on the device.
- Long phrases ("Step down ahead, close") wrap to 3-4 lines at 64px.

- Live answers that fail to parse are billed and shown as "Not sure"; the reason
  is logged (never the frame or key).

## How to resume
Next is Brief 2 Part B (connectivity check, then 10 image calls) - only after the
Owner's go-ahead relayed by the Advisor and the key in `backend/.env`. Read
`docs/KANBAN.md` and `plan/hackathon.md` first.
