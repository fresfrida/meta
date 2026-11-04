# Handoff - Second Eyes

Last updated: 4 Nov 2026, Brief 8 (Ask in 4 languages; live for the Owner's Android test with a $2 cap; $0.1203 in spend.json, plus $0.0045 of direct ASR measurement not in it). Branch `claude/second-eyes`.

## What it is
Hackathon prototype (deadline Thu 5 Nov 10:00 SGT). Phone camera frame ->
FastAPI backend -> structured obstacle answer -> fixed phrase spoken on the
phone. Controlled demo only; nobody walks guided by it. UI says
"Beta · research prototype".

## Current state (true of the code today)
- **Mock again (Brief 10, 4 Nov):** `backend/.env` is back to `VISION_MODE=mock` (listening and Ask follow it);
  `BUDGET_USD=2.12` left in place. The Owner's Android test ran live before this (spend.json $0.2803).
- **Output cap (Brief 10):** every live vision and Ask call sends `max_completion_tokens` = `MAX_OUTPUT_TOKENS`
  (2000, `backend/app/config.py`; normal answers use ~270-650). A reply cut by it (`finish_reason` "length") is a
  model failure (`model_error`, 502; the phone shows "Model failed" / says its "sorry"), still billed, never a half
  answer. The realtime ASR has no per-session time limit: it is bounded by the budget guard (checked every 80 ms
  frame) and by the phone stopping; $0.18/hour.
- SAM 3.1 measured (Brief 10, 3 calls, Mac Wi-Fi): 0.81 / 2.23 / 1.78 s total, all boxes on the real stairs / kerbs;
  not in the app (decision pending).
- Ask in 4 languages (Brief 8): the realtime ASR gets `languageBias` ["English", <chosen language>] (["English"]
  for English), because "Hey Eyes" is said in English inside a Chinese / Malay / Tamil question. Measured with
  macOS `say` clips: the ASR wrote "Hey Eyes" / "Hey eyes" in Latin letters in all 4 languages, so `wake.py` needed
  no new spellings (the measured transcripts are unit tests). 16 of 16 wake clips woke, 0 of 8 distractors did.
  The card texts ("Listening for your question…", "Looking…", "You asked: …", "Sorry, I could not answer.") come
  from `askText` in `strings.ts` per language (Owner approved 4 Nov; ZH / MS / TA pending a native check); "sorry"
  is shown and spoken in the chosen language. Chip, "Listening stopped" and "mic failed" stay English.
- Permission-denied body: "Allow camera access for this site in your browser settings, then tap Try again."
- Face blur (Brief 7): every frame that leaves the phone (loop and Ask) is checked
  on the device by YuNet (onnxruntime-web, bundled) and each face box (+20%) is
  replaced by a 4 x 4 mosaic; bodies stay. Always on. Chip "Faces blurred" / "Face
  blur off" (fail-open: frames still go if the model fails); thumbnail of the last
  sent frame in the expanded timing panel. Desktop: +34-43 ms per frame (median 39;
  first frame ~0.3 s with model load). Faces found down to ~7 px (~10 m); some
  turned / small / backlit faces are missed. **Not tested on the iPhone.**
- Appearance (Brief 7): the camera screen is always dark; Home, Settings and the
  mic test follow light/dark (`.app--auto`), scale with Larger Text (rem from
  `-apple-system-body`), and strengthen hairlines and muted text with Increase
  Contrast. The camera phrase keeps its fixed size.
- Asking (Brief 6): while running, say "Hey Eyes, what is there?" (or "Hey Eyes",
  then the question within 6 s) and hear a short answer about the current view in
  the chosen language. Mic -> AudioWorklet -> 16 kHz PCM16 -> `/api/listen`
  WebSocket -> backend -> Meta realtime ASR (muse-voice-transcribe-1.0); the wake
  rule (`backend/app/wake.py`) passes only questions back; `POST /api/ask` sends
  the question + current frame + last warning to muse-spark-1.3 with the
  Owner-approved prompt. Mic frames are not sent while the phone speaks (+300 ms).
  Fallback: touch and hold the camera view >= 600 ms. Settings "Hands-free
  listening" (default on, `HANDS_FREE_DEFAULT`); off = hold only. Desktop live run:
  5 of 5 real wake attempts woke it; question end -> answer speech 2.9-4.8 s.
  **Not tested on the iPhone; the iPhone mic test (`?mictest=1`) has not been run.**
- Prompt v4 = v3 + "Flat things lying on the ground, such as mats, rugs or painted
  lines, are not hazards." Side lines 400 / 600. Live: the corridor doormat is now
  "clear"; the doorway bench is "obstacle, right, 1 m".
- Mock vision by default. `VISION_MODE=live` calls muse-spark-1.3 (OpenAI SDK,
  json_schema answer, reasoning `minimal`, 10 s timeout). First real calls 3 Nov
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
- Model prompt **v3** = v2 (box) + the metres sentence (both Owner approved 3 Nov,
  verbatim; `VISION_PROMPT_VERSION = "v3"`) in `backend/app/config.py`. Answers
  carry `distance_m` (whole metres 1..10, or null; invalid -> null, rest kept;
  near/far stays the fallback). Live check (Brief 5, 10 calls): distance_m came
  back on every call. Real photos (6 calls, re-encoded without EXIF, never in the
  repo): step down from a deck and night stairs down/up all correct with metres;
  a street photo with distant stairs gave the near curb instead (8.0 s). Brief 5b,
  7 more photos: steps x2 and a car-park wheel stop correct; a top-down kerb called
  step_up; a doorway bench missed; a bench boxed correctly but its side read
  "ahead" (centre x 597 < 667).
- Answers carry `box` ([x_min, y_min, x_max, y_max] on 0..1000, or null).
- Side from box (backend, `resolve_side` in `schemas.py`): when a box is present,
  `side` comes from its centre x (<= `LEFT_MAX` 333 left, >= `RIGHT_MIN` 667 right,
  else ahead; `config.py`) and `side_source` is "box"; otherwise the model's side
  stands and `side_source` is "model". So the spoken side always matches the drawn box.
- Hazard box on screen (`components/BoxOverlay.tsx`): white 2px rounded outline with
  a black halo and a white tag in the chosen language, over the video, warnings only (hidden for clear / unsure / no box).
  `lib/boxMap.ts` maps the 0..1000 frame grid to the screen through the same
  `object-fit: cover` crop as the video (centred), clipped to the screen; a box
  wholly in the cropped-off part is not drawn (the phrase is still spoken).
  Fades after `BOX_STALE_MS` (2000) without a new answer; no fade with reduced
  motion; `aria-hidden`.
- Loop mode (default): Start begins a capture every 1.75 s (after the previous
  one started), at most 2 requests in flight; answers handled in capture order,
  an older answer arriving late is dropped (counted). Live check: answers every
  ~1.8 s instead of ~4.5 s. Stop ends it. `?loop=0` restores the single Capture
  button (every answer spoken, full timing panel).
- No-repeat rule (`frontend/src/lib/announce.ts`): "Not sure" shown, never spoken;
  a side change alone never re-speaks. With metres the key is the hazard type: the
  same hazard stays silent unless it is >= 2 m (`REPEAT_CLOSER_M`) closer than when
  last spoken. Without metres the key is hazard type + near/far: it speaks again on
  a new hazard type or far -> near. >= 1.5 s between speech; a new warning cuts off
  speech, "Clear" waits. Changing language resets it.
- Screen vs voice: the screen shows the short phrase (`phraseFor`); speech says a
  plain-language sentence (`speechFor`, the `voice` table per language in
  `strings.ts`), e.g. "Steps going down, about 2 metres ahead." Box tags use the
  short words. Settings "Test voice" says the plain version.
- Design v2 (monochrome, `styles/tokens.css`): colour only in the traffic light
  (`components/TrafficLight.tsx`, rule in `lib/light.ts`: red = warning <= 2 m or
  near without metres, amber = other warning, green = clear, dark = unsure /
  waiting / stopped / error). Errors are white text with an icon.
- Screens: Home (stopped: title, help, "Voice <language> ›", Start, gear) ->
  Settings (language list in its own script with voice installed / missing,
  Test voice, About). Camera screen: chips, phrase card (light + phrase, steps
  down 28 -> 20 px past 2 lines), clear middle for the box, timing pill
  ("Last 3.4 s · median 3.6 s", capture to answer; tap to expand), Stop.
- Languages: English, 中文, Bahasa Melayu, தமிழ் - one template per language in
  `strings.ts` (Owner approved, pending a native check). Speech lang en-GB /
  zh-CN / ms-MY / ta-IN with a matching installed voice; no voice -> phrase shown
  with a notice, not spoken. Choice remembered in localStorage.
- Mic test page `?mictest=1`: mic on (echo cancellation requested), level meter,
  sample rate, a test sentence every 3 s, mic on/off toggle. No backend calls.
- Mock holds each answer 4 calls (boxes and distance_m set for each warning).
- States shown: opening camera, permission denied, camera not available, needs
  HTTPS (on Home), backend unreachable, waiting, answer failed, speech did not
  start, no voice; live: model is slow (> 6 s), model failed, budget reached, no
  API key.
- Tested in a desktop browser with a fake camera stream at 390x844 and 320x568
  (portrait 720x1280 fake camera that paints each mock box): each language's
  spoken text and lang, the light for every mock answer, and every box clear of
  the card and the bottom controls.
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
- One live call costs at most ~2000 output tokens (~$0.009) since Brief 10. Before that, a muse-spark-1.1 call in Brief 9 ran away to 147,757 tokens ($0.63).
- iOS speech: needs the Start tap to unlock; behaviour with the silent switch
  and Bluetooth is unmeasured.
- The self-signed certificate must be accepted on the iPhone; camera access
  over it is unverified on the device.
- Face blur misses faces it cannot see well (small, turned, backlit). Threshold is
  0.2 (Owner, 4 Nov): on the demo crowd frame it blurs 32 faces (16 at 0.3); false
  hits seen only on building fronts, none on kerbs, steps or path edges.
- The onnxruntime wasm is ~15 MB; the first Start on the phone downloads it over
  Wi-Fi (not precached).
- Hands-free listening on iOS: listening and speaking at once is unverified on
  the iPhone (speech may get quieter or move to the earpiece with the mic open).
  `HANDS_FREE_DEFAULT` can turn it off by default if so.
- Audio leaves the phone while hands-free is on (to the backend, then Meta). The
  app's logs never contain transcripts; only questions reach the phone.
- The no-voice note makes the phrase card taller (~215 px at 320x568), close to
  the top of high boxes.

- Live answers that fail to parse are billed and shown as "Not sure"; the reason
  is logged (never the frame or key).

## How to resume
Brief 7 done (see `007-meta-artifacts/reports/brief-07.md`). Next: the Owner runs
the iPhone tests (mic test `/?mictest=1`, a real "Hey Eyes", face blur on the
phone, Larger Text). README privacy paragraph is proposed in the report, waiting
for the Owner's wording approval. Read
`docs/KANBAN.md` and `plan/hackathon.md` first.
