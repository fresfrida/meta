# Kanban - Second Eyes

## Backlog
- 1 fps loop with no-repeat rule and cooldown
- Design polish on the demo path
- README (privacy note: no people or personal details in frames)

## Doing
- (none)

## Done
- Live path behind `VISION_MODE=live`: OpenAI SDK, json_schema answer, reasoning `minimal`, 8 s timeout; `.env` loading; $25 budget guard with spend file; pytest x22 with fake client, zero network (3 Nov)
- Live UI states: model slow, model failed, budget reached, no key; token/cost line (3 Nov)
- Repo on `claude/second-eyes` off `origin/main`; `admin/` ignored (3 Nov)
- `docs/ARCHITECTURE.md` (3 Nov)
- FastAPI `/api/health`, `/api/analyze` mock cycling 6 answers incl. clear and unsure; pytest x6 (3 Nov)
- Vite React PWA: rear camera, single-frame capture, phrase helper + tests, speech, timing panel, designed states (3 Nov)
- Screenshots at 320 / 390 px in desktop browser with a fake camera (3 Nov)

## Blocked
- Brief 2 Part B live spike: waiting for Owner go-ahead, prompt approval, and `MODEL_API_KEY` in `backend/.env`
- iPhone test (Owner runs the test script in `007-meta-artifacts/reports/brief-01.md`): camera over self-signed HTTPS, speech on speaker and Bluetooth, silent switch, mock latency numbers
