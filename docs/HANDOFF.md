# Handoff - Second Eyes

Last updated: 5 Nov 2026 09:00 SGT. Briefs 34-35 merged into `claude/second-eyes` (2bb171b) and `claude/second-eyes-cloud` (90d1712); `main` is a13c4bb (through Brief 31, PR #2). Mac: backend 3b8357c (prompt v9), Vite serves 2bb171b, $10.92 of $15.91. Cloud demo serves Briefs 30-31 (bundle index-BTSWlPiJ), $9.57 of $100; Briefs 34-35 wait for the Owner's Deploy. Demo video: `007-meta-video` (local repo), launch cut 1:14.

## What it is
Hackathon prototype (deadline Thu 5 Nov 10:00 SGT). Phone camera frame ->
FastAPI backend -> structured obstacle answer -> fixed phrase spoken on the
phone. Controlled demo only; nobody walks guided by it. UI says
"Beta · research prototype".

## Features to show in the video (keep in step with the code)
Each item is in the code on `claude/second-eyes` (3b8357c) unless marked.
1. Point the phone ahead and hear what is in your path: a fast warning (SAM 3.1: steps, kerbs, doors) about 1.5 s after a frame, with a short tone, then detail from Muse Spark 1.3 (about 4 s) with the kind, side and metres.
2. Only what is in your walking path: doors and kerbs beside you stay quiet (in-path rule).
3. Distance at speaking time: metres are counted down for walking time since the photo; close means "very close".
4. Honest, never "safe": "No hazard seen", "There might be a kerb...", and roads are named ("The edge of a road"), never when to cross.
5. Four languages, Singapore voices first: English, 中文, Bahasa Melayu, தமிழ் (screen and voice).
6. Hands-free "Hey Eyes, what's in front of me?" in four languages (speech recognition plus Muse), and "Hey Eyes, where does the path go?": it describes the path ("The path bends to the left ahead"), never gives directions (Brief 29: 5 of 5 live answers described). Brief 30: after "Ready" the app says once "You can ask me anything. Just say "Hey Eyes", then your question." (English, hands-free on) and shows "Say "Hey Eyes", then ask" above Stop; the heartbeat tick no longer cuts the question (live wake replay: 0/2 woke before, 2/2 after).
7. Privacy: faces are blurred on the phone before any frame leaves it.
8. Calm start: "Getting ready..." card (Camera, Privacy, First look), "Second Eyes is getting ready. Please wait a moment before you walk.", then "Ready. I'll tell you what I see in your path."
9. Stays honest about the connection: soft tick while answers arrive, "Connection lost. Warnings have stopped." / "Back online."
10. Lifts, escalators, double and glass doors (prompt v9; "A lift, about 3 metres ahead."; the fast check may say "A door" first, then Muse says "A lift").
11. Works in the browser, no install: Android, iPhone (sound confirmed by the Owner 4 Nov after Brief 27), iPad.
12. Accessibility: Larger Text, Increase Contrast, light and dark.
13. Public demo with 3-minute slots and daily caps, so anyone can try it safely.
14. Fast car warning: built but OFF by default (`CAR_FAST`; try with `?car=1`). The near-car test warned on 2 of 4 close cars and kept quiet on 2 of 4 parked ones, so do not show it as a feature.
15. Phone on a lanyard: frames from an upside-down phone are turned the right way up (auto from the motion sensor, or Settings "Phone hangs upside down"; Brief 34-35). Covered camera: "I can't see right now. Please check the camera." (Brief 34).

## Current state (true of the code today)
- **Briefs 34-35 (5 Nov, `claude/second-eyes` 2bb171b / cloud 90d1712), frontend only, not tested on a real phone by the Coder:**
  - Upside-down phone (lanyard): `lib/orientation.ts` reads gravity from `devicemotion` (steady 1 s, hysteresis,
    `FLIP_*` in config.ts, TENTATIVE); when upside down, `captureGuarded()` turns the frame 180 degrees before face blur
    and JPEG, so SAM, Muse and Ask get an upright picture. `?flip=1` / `?flip=0` force it; Settings switch "Phone hangs
    upside down" (TENTATIVE name, off by default, remembered) turns every frame. Owner test 5 Nov: `?flip=1` works;
    the auto rule did not fire on the Owner's phone (likely no motion data in the browser), so the switch is the
    dependable way.
  - Covered camera: `lib/cover.ts` luma rule (`COVER_*`, TENTATIVE); covered for 2 s -> "I can't see right now. Please
    check the camera." once (EN only, Owner approved), lamp dark, no tick, covered frames not sent. A very dark place
    (about 10% brightness) also counts as covered.
  - The "Hey Eyes" hint line has its own gap above Stop at 360-430 px wide and 150% text; the open timing panel scrolls.
  - vitest 509, pytest 239.
- **Demo video (Briefs 32-36, 5 Nov, local repo `/Users/ff/Desktop/ProjectsAI/ProjectsHackathons/007-meta-video`,
  never pushed):** Remotion 4.0.539 (Free License for an individual). Final: `out/second-eyes-launch.mp4`, 1:14,
  1920x1080 (commit 8502019; branding pass 36c in progress at 09:00). Story: the Owner's real "Hey Eyes" path answer as
  the hook, title, the Owner's drawings of how the phone is worn, real steps, the fast warning, four languages, faces
  blurred, the rule line, end card. Owner footage in `incoming/` (two screen recordings 07:57, drawings 9.png and
  10.png). Music: Pixabay "Peaceful" (licence in `assets/LICENSES.md`).
- **Briefs 30-31 (5 Nov, `claude/second-eyes` 3b8357c / cloud 9250538):**
  - Speech end safety net (`speech.ts`): a phrase that started but never sent onend / onerror is ended after
    max(4 s, characters x 120 ms) + 2 s (`SPEECH_END_*`, TENTATIVE); the mic gate reopens and ticks resume; debug
    "ends lost N". Sized for English: a long Chinese answer can end early (open item).
  - The heartbeat tick no longer closes the mic (the warn cue and the earcon still do). With the old gate a tick
    every 700 ms let through only 28% of mic frames; live wake replay 0/2 woke before, 2/2 after.
  - Timing panel line "mic: sent N · gated M · listen none / connecting / open / closed / stopped · in <rate> Hz".
  - Ask hint (Owner approved): welcome bullet 'Ask me anything. Say "Hey Eyes", then your question, like "What's in
    front of me?" or "Where does the path go?"'; spoken once per Start after the ready line with hands-free on
    (English only) "You can ask me anything. Just say "Hey Eyes", then your question."; screen line above Stop
    'Say "Hey Eyes", then ask' while listening (`lib/askHint.ts`).
  - Prompt **v9** = v8 + "If a door is a lift (elevator) door, for example with call buttons beside it, call it a
    lift." (Owner approved). Live: lifts 10/12 (v8 6/9), plain doors 6/6 stay door, 0/20 timeouts. Briefs 30-31
    direct live calls $0.1065 (not in spend.json).
  - Not tested on a real iPhone yet.
- **Brief 29 (5 Nov, 7d1f250 / cloud 780923b):** Ask prompt adds, verbatim, "Describe where the path goes; never
  tell the person which way to go." (live 5/5 described, 0 directions, $0.0091); welcome Ask bullet now lists both
  examples (Owner approved 5 Nov). SAM "car" mapped to the vehicle kind behind `CAR_FAST` (env, default off; phone `?car=0/1`);
  near-car test 9 calls $0.0225 failed the rule (close cars in the path 2/4, parked beside 2/4 quiet), so it stays
  off. With cars about $42/h; $1.65 -> $2.15 per 3-minute slot.
- **Briefs 25-28 (4-5 Nov night, `claude/second-eyes` 404812d; cloud branch 1531d0b):**
  - Brief 25: WebKit speech. Cancel-then-speak drops the phrase on WebKit (reproduced in the iOS Simulator; WebKit
    bug 238189), so `speak()` cancels only when busy and waits `SPEECH_CANCEL_GAP_MS` 100 ms; a phrase ended without
    starting fails at once; a failed phrase is not remembered as said; timing-panel debug line.
  - Brief 26: `navigator.audioSession` type set in the Start tap (feature-detected); camera asked for 16:9 1280x720
    with ideal constraints only (`CAMERA_ASPECT`), ultra-wide replaced by "Back Camera" when labelled, real size read
    back; field of view follows the real frame aspect (`VFOV_BASE_ASPECT` 4/3, frontend and backend; portrait and 4:3
    unchanged); per-stage timing and camera debug lines.
  - Brief 27: one audio session type per run; WebKit AudioContext suspended between tones; `resume()` and one
    re-speak of a stuck phrase (`SPEECH_STUCK_MS` 1 s); route / interruption watcher; camera picture recovery;
    "Tap to turn the sound back on"; test flags `?session=0`, `?tone=0`, `?resume=0`; "Getting ready" phase
    (card, approved English lines, ready line, still-preparing line at `GETTING_READY_STILL_MS` 8 s, no "Model is
    slow"); face model warmed while Home is idle. The Owner's iPhone then worked ("all good!", 4 Nov ~23:40).
  - Brief 28: the ready line always after the start line's real end (start line said again if it never started);
    iPhone tick waits for a running AudioContext; prompt **v8** (`VISION_PROMPT_VERSION`) adds "a lift (elevator)
    door" and "A door can be a single door, double doors or a glass door."; kind `lift` with approved words (EN Lift
    / A lift; 电梯; Lif / lif; லிஃப்ட் / லிஃப்ட் உள்ளது). Live check 21 calls, $0.0473 (direct, not in spend.json): v8
    right 6/6; SAM "road" too broad (not used); SAM "car" precise but untested on near cars.
  - Live state (5 Nov 01:35): the cloud demo serves Briefs 28-29 (bundle index-NrB8CYJw); the Mac backend runs
    3b8357c (prompt v9) since 01:27.
- **Cloud demo (Brief 17), LIVE since 4 Nov:** https://second-eyes.52.76.242.161.sslip.io (Coolify on AWS
  Lightsail, Singapore), deploys from `claude/second-eyes-cloud` when the Owner clicks Deploy (no auto-deploy).
  `PUBLIC_DEMO=1`: 180 s slots, 10 per Singapore day, $20 per day, $100 total (Owner, 5 Nov); $9.57 spent at 01:35 on 5 Nov (slots reset at Singapore midnight). Repo still
  private. How to deploy: `docs/DEPLOY.md`.
- **Distance at speaking time (Brief 16, live 4 Nov):** metres said = metres at capture - 0.8 m/s x
  time since capture while walking (DeviceMotion; no data = walking); <= 1 m -> "very close"; stale and walked past ->
  dropped. Debug line in the timing panel.
- **In-path rule + path guide (Briefs 15 / 16b, live 4 Nov):** SAM steps / kerbs are kept only when their box overlaps
  the walking path (+-0.75 m at the ground point; bottom-touching: centre half of the frame); SAM doors only when the
  box centre is in the centre half of the frame (grid 250..750); a tall hit centred there beyond the geometry is
  kept as "far, no metres"; others are counted as `beside` and stay quiet. Side hysteresis 50 grid points; Muse
  side vs box side logged per live answer. A faint path guide is drawn under hazard boxes
  (`PATH_GUIDE`, tentative).
- **Wording v2 (Brief 14), merged and live 4 Nov (`e73bcb4`):** person-centred English (Owner
  approved) - "Nothing seen in your path.", "Something in your path", "A group of people", "The edge of a road",
  "A pedestrian crossing", near = "very close", the new connection lines, and Start / Stop lines. ZH / MS / TA
  approved by the Owner 4 Nov (native check pending).
- **Brief 13 / 13b (merged into `claude/second-eyes`, live 4 Nov):** prompt **v7** = v6 + "Also say whether you are
  sure what the hazard is." + "A single raised edge between a footpath and a road is a curb, not a step."; answers
  carry `sure`; hedge rule `lib/hedge.ts` (Muse sure=false, or SAM confidence < 0.7) -> "There might be ..." and a
  screen phrase ending in ? (ZH ？); EN screen "Kerb".
  - Prompt **v6** = v5 + road for cars / road crossing / cycle path / escalator / uneven ground, "Prefer roads,
    drops and things at head height", and "Never answer clear if the path leads onto a road for cars, a road
    crossing or a cycle path". Owner approved all of v6, road part included (4 Nov).
  - Schema + words for road, crossing, cycle_path, escalator, uneven (4 languages). Clear is now "No hazard seen"
    / "No hazard seen." (and translations). Road kinds are warnings, so never green (amber; red when near / <= 2 m).
  - SAM "door" added as a third concept (`SAM_CONCEPTS`); measured: found the glass door in both doorway photos
    (0.81 / 0.85), nothing on Steps2; also 2 cabinet doors at 0.53 / 0.55. Cost ~ +50%: about $32/hour of Start.
  - Heartbeat: soft 330 Hz 35 ms tick (gain 0.05) when a fresh answer arrives and nothing is spoken; not while
    speaking or during Ask; at most one per 700 ms (`lib/heartbeat.ts`).
  - Connection alerts (`lib/connection.ts`): no answer for 6 s while running -> lamp dark, card + speech
    "Connection lost. Warnings have stopped." (4 languages), repeated every 10 s; next answer -> "Back online." once,
    and the current warning is said again. Not over an Ask answer. Budget / model failures keep their state.
  - Talk more (Settings, off by default, remembered): repeats the current warning or clear about every 4 s, never
    over speech; no fast cue on repeats.
- **Prompt v5 (Brief 12), live since 4 Nov (merged into `claude/second-eyes`):**
  Muse names the hazard from a fixed list: step_down, step_up, curb, drain, head_height, person, people (3+),
  bike, vehicle, pole, barrier, ramp, door (incl. glass), wall (incl. glass), obstacle (catch-all: "something
  else the person could walk into"), clear, unsure. Prompt verbatim in `backend/app/config.py`
  (`VISION_PROMPT_VERSION = "v5"`). Words per kind in `strings.ts` (screen / voice, 4 languages, Owner approved
  4 Nov; ZH / MS / TA native check pending); same templates, traffic light and side / metres rules. Repeat key:
  person and people are one kind; person <-> people speaks (like up / down). SAM fast path unchanged. Live, 12
  photos: every step and kerb right (Curb1 now "curb", was "step_up" in v3), doors named in both doorway photos,
  the CC0 pole named "pole"; median 4.3 s.
- **Live for the Owner (Brief 11, 4 Nov):** `backend/.env` has `VISION_MODE=live` (listening, Ask and detect
  follow it) and `BUDGET_USD=15.91` = spend.json $0.9178 + the Owner's $15 cap (rounded down). Links: Tailscale
  `https://100.113.121.44:5173`, LAN `https://192.168.50.177:5173` (certificate warning: Advanced -> Proceed).
  Live costs about **$22 per hour of Start time** (SAM ~$20/h, Muse ~$2/h, ASR $0.18/h), so $15 is ~40 min.
  Set `VISION_MODE=mock` again after filming.
- **Two-speed fast warning (Brief 11):** every frame (900 ms apart, at most 2 in flight) goes to `/api/detect`:
  SAM 3.1 "stairs" + "curb", two requests in parallel on one keep-alive client, 4 s / 2 MB bounds, $0.0025 per image
  per concept. `backend/app/detect_rule.py` keeps hits with confidence >= 0.5 whose box bottom is below the frame
  centre, side from the box centre (400 / 600), distance = 1.3 m / tan(angle below the horizon) with a 67 deg
  (portrait) / 53 deg (landscape) vertical field of view, 1..10 m (further dropped), box touching the frame bottom
  = near (red), nearest first. Every 2nd frame also goes to Muse, as before. `frontend/src/lib/merge.ts`: a fast hit
  the repeat rule would speak is spoken at once after a short tone + vibration (Android); the repeat key is the kind
  (step_up / step_down / steps are one kind; up / down is new information); a Muse "clear" / "not sure" does not
  replace a fast warning younger than 3 s; a silent fast hit does not replace a Muse answer younger than 3 s; a fast
  hit whose kind was spoken in the last 10 s stays silent unless closer (stops kerb / obstacle ping-pong). Lamp:
  newest, the more severe for the same frame. Fast phrase words Owner approved 4 Nov ("Steps" / 台阶 / Tangga / படிகள்; ZH / MS / TA native check pending).
  Pill "fast 1.6 s · detail 4.1 s"; panel "last SAM … ms · last model … ms". `?fast=0` = Muse only, as before.
  Live desktop (CC0 tram stop): first speech 1.2-1.7 s (two speeds) vs 5.2-5.3 s (Muse only).
- **Output cap (Brief 10):** every live vision and Ask call sends `max_completion_tokens` = `MAX_OUTPUT_TOKENS`
  (2000, `backend/app/config.py`; normal answers use ~270-650). A reply cut by it (`finish_reason` "length") is a
  model failure (`model_error`, 502; the phone shows "Model failed" / says its "sorry"), still billed, never a half
  answer. The realtime ASR has no per-session time limit: it is bounded by the budget guard (checked every 80 ms
  frame) and by the phone stopping; $0.18/hour.
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
- Screens: Home (stopped: title, help, "Voice <language> ›", Start, gear; in
  public mode the welcome screen replaces Home and has the same gear, Brief 21) ->
  Settings (language list in its own script with voice installed / missing,
  Voice list for the chosen language with "Recommended" on the default, Test
  voice, About). Camera screen: chips, phrase card (light + phrase, steps
  down 28 -> 20 px past 2 lines), clear middle for the box, timing pill
  ("Last 3.4 s · median 3.6 s", capture to answer; tap to expand), Stop.
- Languages: English, 中文, Bahasa Melayu, தமிழ் - one template per language in
  `strings.ts` (Owner approved, pending a native check). Speech lang en-GB /
  zh-CN / ms-MY / ta-IN with a matching installed voice; no voice -> phrase shown
  with a notice, not spoken. Choice remembered in localStorage.
- Voice (Briefs 20 / 24, `lib/voices.ts`): `voiceInfo` reads each voice's
  language and region from its tag (lower case, _ -> -, cmn = zh, yue) and the
  locale words in its name (a region in the name wins). The list per language is
  ordered Singapore first (zh: SG, CN, MY, TW; en: SG, GB; ms: SG, MY; ta: SG,
  IN; then others), then on-device Google / Enhanced / Premium / Natural / Neural,
  then on-device, then by name; the first is Recommended. 中文 never offers
  Cantonese (yue, Hong Kong, Macao); Malay falls back to Indonesian only when
  there is no Malay. `?voices=1` lists every voice for a screenshot. The Settings choice is kept per
  language (`second-eyes.voice.<lang>`) by voice id (voiceURI, numbered when
  Android repeats it; Brief 22); gone -> the default. Repeated names show " · 2". The first speech
  of a session waits up to `VOICE_WAIT_MS` (1.5 s) for voices. `SPEECH_RATE` 0.95.
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
Cloud demo on Coolify (AWS Lightsail Singapore), deployed from `claude/second-eyes-cloud` when the Owner clicks
Deploy: see `docs/DEPLOY.md`. Caps: `BUDGET_USD` 100 (confirmed by /api/health), `DAILY_BUDGET_USD` 20 (Owner set;
not shown by /api/health). The Mac version stays for filming (Tailscale / LAN links above).

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
Start with the CURRENT STATE section of `007-meta-artifacts/reports/advisor-handoff.md`, then `docs/KANBAN.md`
and the newest `007-meta-artifacts/reports/brief-*.md` (Briefs 34-36, 5 Nov morning).
