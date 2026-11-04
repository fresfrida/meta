# Kanban - Second Eyes

## Backlog
- Brief 29 (sent 5 Nov ~00:35, Coder building): "Where does the path go?" by Hey Eyes (Ask prompt sentence approved); fast SAM "car" warning behind a switch, after a near-car test
- 中文 / Bahasa Melayu / தமிழ் for the Brief 27 getting-ready lines and card (English only for now)
- Restart the Mac backend so the Mac link uses prompt v8 (stop any page loop first)
- iPad and Android re-test after Briefs 25-28
- Getting-ready polish: centre the Home card; bring back "Allow camera access if asked."; hold "Connection lost" until the first answer; screen-reader "done" (TENTATIVE)
- Decide: 'playback' audio session pauses the user's own music on iPhone while running
- Public demo copy in ZH / MS / TA (English only for now)
- Decide DAILY_BUDGET_USD vs DEMO_SLOTS_PER_DAY: at ~$32/h, $8/day covers ~5 full slots of 10
- Side lines: hysteresis (or a wider ahead band) so a box near 400 / 600 does not flip side between answers; log Muse's own side vs box side live
- Backend access log has no timestamps: gaps and per-request times of a walk cannot be measured (use a uvicorn log config with times when restarting live)
- Two-speed mode: "Model is slow…" shows whenever Muse > 6 s, and a Muse timeout shows "Model failed / Tap Capture" while SAM still answers; proposed fix in brief-13.md (start the slow timer only without SAM; treat Muse failures like SAM's)
- Native-speaker check of the v5 words (ZH / MS / TA)
- Polish pass: head-height boxes sit under the phrase card (top of the screen), so their outline and tag are hidden
- Native-speaker check of the 中文 / Bahasa Melayu / தமிழ் screen phrases and voice sentences
- README privacy paragraph (proposed in brief-07.md; Owner approves the wording first)
- Face blur recall: 2x tiles for distant faces (~4x time) if the iPhone has headroom
- Native-speaker check of the ZH / MS / TA Ask texts (Brief 8)
- Translations of the Ask chip, "Listening stopped", "Microphone not available" (EN only for now)
- Native-speaker check of the ZH / MS / TA fast phrase words (Owner approved 4 Nov)
- Set `VISION_MODE=mock` again after the Owner's filming
- Design polish on the demo path
- README (privacy note: no people or personal details in frames)

## Doing
- Brief 28 on the cloud demo: waiting for the Owner's Deploy (merged and verified, 404812d / 1531d0b)

## Done
- Brief 28: ready line after the start line, iPhone tick fix, prompt v8 (lift, double / glass doors), lift words in 4 languages (Owner approved); live check 21 calls $0.0473; vitest 465, pytest 228 (5 Nov)
- Brief 27: iPhone sound (one session per run, AudioContext suspended between tones, resume + re-speak, route watcher, picture recovery, test flags) and the getting-ready phase; vitest 443, pytest 227; iPhone sound confirmed by the Owner; live on the cloud demo 23:23 (4 Nov)
- Brief 26: audio session, 16:9 ideal camera, main-lens rule, field of view from the real aspect, debug lines; vitest 412, pytest 227; live 22:41 (4 Nov)
- Brief 25: WebKit cancel gap, failed phrase not remembered, speech debug line; vitest 392, pytest 226; live 22:06 (4 Nov)
- Brief 17: cloud demo live on Coolify / Lightsail with public demo limits (4 Nov)
- Brief 24: voice rule reads tags robustly (lower case, _ -> -, cmn / yue, scripts) and locale words in names; Singapore first per language; no Cantonese for 中文; Indonesian only as the last Malay fallback; `?voices=1` diagnostic; vitest 376 (4 Nov). Waiting: the Owner's `?voices=1` screenshot from the S23+
- Brief 22: Android voice list fix - unique row ids (voiceURI, numbered when repeated), list rebuilt per language, one row selected, repeated names " · 2", choice stored per language by id; vitest 369 (4 Nov)
- Brief 21: Settings gear on the public welcome screen (welcome -> Settings -> Done -> welcome); vitest 365; on `claude/second-eyes-cloud` and `claude/second-eyes` (4 Nov)
- Brief 20: steadier voice - default-voice rule, Settings voice list ("Recommended", remembered per language), wait for voices before the first speech, rate 0.95; vitest 362, pytest 226; on `claude/second-eyes-cloud` and merged into `claude/second-eyes` (4 Nov)
- Briefs 15 / 16 / 16b: in-path rule (doors by frame centre 250..750), big far hits, path guide, distance at speaking time, walking detection, side hysteresis, Muse side logging; pytest 211, vitest 350; merged and live (`b6a6465`, 4 Nov)
- Brief 14: wording v2 (person-centred, 4 languages, Owner approved) + Start / Stop lines; pytest 198, vitest 330; merged and live (`e73bcb4`, 4 Nov)
- Brief 13 / 13b / 13c: prompt v7 (roads never clear, kerb sentence, sure), hedges ("There might be ..."), Kerb, SAM door, heartbeat, connection lost / back, Talk more; pytest 198, vitest 324; merged into `claude/second-eyes` and live (4 Nov)
- Brief 12: prompt v5 (11 named kinds + catch-all), words in 4 languages, person/people repeat rule; 12 live photos (steps / kerbs all right); merged into `claude/second-eyes` and live (4 Nov)
- Brief 11: two-speed fast warning - `/api/detect` (SAM 3.1 stairs + curb, parallel, bounded), geometry distance rule, merge rule (kind key, up/down adds, 3 s holds, 10 s per-kind memory), tone + vibrate cue, fast/detail pill, `?fast=0`; pytest x173, vitest x122; live desktop first speech 1.2-1.7 s vs 5.2 s; live for the Owner with a $15 cap (4 Nov)
- Brief 10: backend back to mock; `MAX_OUTPUT_TOKENS` 2000 on every live vision / Ask call, cut reply = billed failure; pytest x151; SAM 3.1 timed (3 calls, $0.0075) (4 Nov)
- Brief 9 (partial): model timings at `minimal` (1.3 / 1.2 / 1.1); stopped after a runaway 1.1 call ($0.63 vs cap $0.05) (4 Nov)
- Brief 8: ASR bias English + chosen language; wake spellings measured per language (Latin in all 4, 16/16 woke, 0/8 distractors); Ask texts and spoken sorry per language; Android permission copy; pytest x149, vitest x95; live for the Android test, $2 cap (4 Nov)
- Brief 7b: face threshold 0.2 (Owner); offline range and false-hit re-run (4 Nov)
- Brief 7: on-device face blur (YuNet + onnxruntime-web bundled, padded mosaic) on every sent frame, fail-open with visible chip, sent-frame thumbnail; Home/Settings light/dark, Larger Text (rem), Increase Contrast; vitest x86; live 6 calls on Steps3/CC0 (cap was 4 - see report) (3 Nov)
- Brief 6: hands-free Ask ("Hey Eyes") - realtime ASR proxy `/api/listen` with wake rule, `/api/ask` with the approved prompt, AudioWorklet mic + 16 kHz PCM16 encoder, self-speech gate, earcon, touch-and-hold fallback, Settings toggle; prompt v4; side lines 400 / 600; pytest x135, vitest x71; live: 5 asks, ~2.5 min listening, 2 photo calls (3 Nov)
- Brief 5b: plain-language voice table per language (screen unchanged), side change never re-speaks (flap test speaks once), 13 real-photo live calls reported; vitest x60 (3 Nov)
- Brief 5: monochrome design v2 + traffic light, Home + Settings, 4 languages with approved templates, prompt v3 + `distance_m`, repeat rule with metres, 2-in-flight loop (1.75 s stagger, in-order, late answers dropped), mic test page `?mictest=1`; vitest x48, pytest x78; live check 10 calls (3 Nov)
- Brief 4b live speed test: `backend/scripts/speed_test.py`, 18 streamed calls, $0.027; time = reasoning before first token; cap breaks answers; 320 px halves input tokens, no speed gain (3 Nov)
- Brief 2 Part B live spike: connectivity OK, 10 image calls OK, $0.0169 total; schema + `minimal` accepted; boxes land on the hazards (3 Nov)
- Hazard box overlay (amber outline + tag, cover-crop mapping `lib/boxMap.ts` + 7 tests, 2 s stale fade); side from box centre in the backend with `side_source` + 18 tests; pytest x60, vitest x26 (3 Nov)
- 1 fps loop (one request in flight, 1 s after each answer), no-repeat rule in `announce.ts` + 9 tests, unsure never spoken, mock hold 4, neutral badges, spoken/silent timing; `?loop=0` single mode (3 Nov)
- Prompt v2 with bounding box (Owner approved); `box` field, schema and malformed-box rule + tests; pytest x42 (3 Nov)
- Live path behind `VISION_MODE=live`: OpenAI SDK, json_schema answer, reasoning `minimal`, 8 s timeout; `.env` loading; $25 budget guard with spend file; pytest x22 with fake client, zero network (3 Nov)
- Live UI states: model slow, model failed, budget reached, no key; token/cost line (3 Nov)
- Repo on `claude/second-eyes` off `origin/main`; `admin/` ignored (3 Nov)
- `docs/ARCHITECTURE.md` (3 Nov)
- FastAPI `/api/health`, `/api/analyze` mock cycling 6 answers incl. clear and unsure; pytest x6 (3 Nov)
- Vite React PWA: rear camera, single-frame capture, phrase helper + tests, speech, timing panel, designed states (3 Nov)
- Screenshots at 320 / 390 px in desktop browser with a fake camera (3 Nov)

## Blocked
- Filming (Mac link, own budget; cloud demo $5.14 of $10 at 23:23)
- iPhone test (Owner runs the test script in `007-meta-artifacts/reports/brief-01.md`, now at `/?loop=0`): camera over self-signed HTTPS, speech on speaker and Bluetooth, silent switch, mock latency numbers
- iPhone mic test (`/?mictest=1`): does speech get quieter or move to the earpiece with the mic open (speaker and Bluetooth) - Owner runs it; decides `HANDS_FREE_DEFAULT`
- iPhone "Hey Eyes" test (real voice, real room)
- iPhone face blur + Larger Text test (first Start downloads ~15 MB wasm)
