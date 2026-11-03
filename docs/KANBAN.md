# Kanban - Second Eyes

## Backlog
- Draw the hazard box on screen (Brief 4)
- Design polish on the demo path
- README (privacy note: no people or personal details in frames)

## Doing
- (none)

## Done
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
- Brief 2 Part B live spike (now with prompt v2): waiting for Owner go-ahead and `MODEL_API_KEY` in `backend/.env`
- iPhone test (Owner runs the test script in `007-meta-artifacts/reports/brief-01.md`, now at `/?loop=0`): camera over self-signed HTTPS, speech on speaker and Bluetooth, silent switch, mock latency numbers
