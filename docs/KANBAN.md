# Kanban - Second Eyes

## Backlog
- Phase B: Meta client behind `VISION_MODE=live` (muse-spark-1.3 Standard, JSON schema answer) - needs Owner go-ahead
- Budget guard: count tokens, refuse live calls past $25
- 1 fps loop with no-repeat rule and cooldown
- Error states for live mode (model slow, model error, budget reached)
- Design polish on the demo path
- README (privacy note: no people or personal details in frames)

## Doing
- (none)

## Done
- Repo on `claude/second-eyes` off `origin/main`; `admin/` ignored (3 Nov)
- `docs/ARCHITECTURE.md` (3 Nov)
- FastAPI `/api/health`, `/api/analyze` mock cycling 6 answers incl. clear and unsure; pytest x6 (3 Nov)
- Vite React PWA: rear camera, single-frame capture, phrase helper + tests, speech, timing panel, designed states (3 Nov)
- Screenshots at 320 / 390 px in desktop browser with a fake camera (3 Nov)

## Blocked
- iPhone test (Owner runs the test script in `007-meta-artifacts/reports/brief-01.md`): camera over self-signed HTTPS, speech on speaker and Bluetooth, silent switch, mock latency numbers
