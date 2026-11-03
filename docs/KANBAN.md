# Kanban - Second Eyes

## Backlog
- Layout: band + timing panel cover where floor hazards are drawn (design pass, Wed)
- Design polish on the demo path
- README (privacy note: no people or personal details in frames)

## Doing
- (none)

## Done
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
- Live latency: median model_ms 3968 > 2500 target; Owner to pick an option (smaller frame, lower quality, shorter prompt, every 2 s, stills demo)
- iPhone test (Owner runs the test script in `007-meta-artifacts/reports/brief-01.md`, now at `/?loop=0`): camera over self-signed HTTPS, speech on speaker and Bluetooth, silent switch, mock latency numbers
