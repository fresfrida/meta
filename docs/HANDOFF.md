# Handoff - Second Eyes

Last updated: 3 Nov 2026, Brief 4b (live speed test, 18 calls; $0.044 spent in total). Branch `claude/second-eyes`.

## What it is
Hackathon prototype (deadline Thu 5 Nov 10:00 SGT). Phone camera frame ->
FastAPI backend -> structured obstacle answer -> fixed phrase spoken on the
phone. Controlled demo only; nobody walks guided by it. UI says
"beta - research prototype".

## Current state (true of the code today)
- Mock vision by default. `VISION_MODE=live` calls muse-spark-1.3 (OpenAI SDK,
  json_schema answer, reasoning `minimal`, 8 s timeout). First real calls 3 Nov
  (Part B): schema with nullable anyOf and box, and `minimal`, accepted (no 400);
  no billing error. Measured on 640px synthetic images: model_ms 1820 / 3968 / 6433
  (min / median / max), $0.0013-0.0022 per frame, 563 input tokens, 156-484 output
  tokens (reasoning included). **Median is above the 2500 ms target.**
- Speed test (Brief 4b, `backend/scripts/speed_test.py`, 18 streamed calls): the
  time is the model thinking before its first token (TTFT = total - ~150 ms);
  model_ms ~ 1.24 s + 8.9 ms x output tokens. Medians: baseline 3509 ms, output cap
  150 broke every answer (empty / cut JSON -> unsure), prompt line 3252 ms, 320 px
  frame 3775 ms (half the input tokens, no speed gain), line + 320 px 3362 ms. No
  lever reaches 2500 ms. App defaults unchanged; Owner decides.
- Live spend guard: tokens x prices added to `backend/.data/spend.json`; at
  >= $25 live calls get 402 `budget_reached`. Unreadable spend file also refuses.
- Model prompt v2 with bounding box (Owner approved 3 Nov, verbatim;
  `VISION_PROMPT_VERSION = "v2"`) lives in `backend/app/config.py`.
- Answers carry `box` ([x_min, y_min, x_max, y_max] on 0..1000, or null).
- Side from box (backend, `resolve_side` in `schemas.py`): when a box is present,
  `side` comes from its centre x (<= `LEFT_MAX` 333 left, >= `RIGHT_MIN` 667 right,
  else ahead; `config.py`) and `side_source` is "box"; otherwise the model's side
  stands and `side_source` is "model". So the spoken side always matches the drawn box.
- Hazard box on screen (`components/BoxOverlay.tsx`): amber rounded outline with a
  small hazard tag, over the video, warnings only (hidden for clear / unsure / no box).
  `lib/boxMap.ts` maps the 0..1000 frame grid to the screen through the same
  `object-fit: cover` crop as the video (centred), clipped to the screen; a box
  wholly in the cropped-off part is not drawn (the phrase is still spoken).
  Fades after `BOX_STALE_MS` (2000) without a new answer; no fade with reduced
  motion; `aria-hidden`.
- Loop mode (default): Start captures a frame, waits 1 s after each answer,
  repeats; Stop ends it. No-repeat rule (`frontend/src/lib/announce.ts`): speak
  only when the phrase changed and >= 1.5 s since the last speech; "Not sure"
  is shown, never spoken; a new warning cuts off speech, "Clear" waits for it.
  `?loop=0` in the URL restores the single Capture button (every answer spoken).
- Mock holds each answer 4 calls, so in loop mode the phone speaks about every 4 s.
- Badges (MOCK / Live) are neutral outlines; amber is only for hazards.
- Timing on screen: last capture-to-speech ms, min / median / max of the last
  10 spoken frames, a breakdown (frame, round trip, model, speech), counts of
  spoken and silent frames, and silent frames' round trip min / median / max.
- States shown: camera off, opening camera, permission denied, camera not
  available, needs HTTPS, backend unreachable, waiting for answer, answer
  failed, speech did not start; live: model is slow (> 3 s), model failed,
  budget reached, no API key. Timing panel adds tokens and cost for live answers.
- Tested in a desktop browser with a fake camera stream at 320 and 390 px (Brief 4:
  a portrait 720x1280 fake camera that paints each mock box, so the overlay can be
  checked against it).
  **Not yet tested on the iPhone.**

## Architecture
See `docs/ARCHITECTURE.md`. Short version: Vite dev server on the Mac
(`https://0.0.0.0:5173`, self-signed) proxies `/api` to FastAPI on
`127.0.0.1:8000`. iPhone on the same Wi-Fi opens `https://<mac-lan-ip>:5173`.

## Data flow
loop tick (or tap Capture with `?loop=0`) -> `captureFrame` (640px, JPEG 0.7) ->
`POST /api/analyze { image_b64 }` -> `{ hazard, side, distance, box, source, model_ms, ... }`
-> `phraseFor()` (`lib/phrase.ts`) -> `decide()` (`lib/announce.ts`) -> `speak()` or silent
-> timing record (spoken: capture-to-speech; silent: round trip).

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
For the Brief 1 per-tap timing test use `https://<mac-lan-ip>:5173/?loop=0`.

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
- The phrase band and timing panel cover the lower half of the screen, where
  floor hazards (steps, curbs) are, so most of the box sits under them.

- Live answers that fail to parse are billed and shown as "Not sure"; the reason
  is logged (never the frame or key).

## How to resume
Brief 4b speed test done (see `007-meta-artifacts/reports/brief-04b.md`); waiting
for the Owner's pick of levers. Brief 5 (layout, language picker, distance in
metres) comes next and uses them. Read
`docs/KANBAN.md` and `plan/hackathon.md` first.
