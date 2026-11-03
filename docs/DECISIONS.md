# Decisions - Second Eyes

| Date | Decision | Reason | Tradeoff | Status |
|---|---|---|---|---|
| 3 Nov 2026 | Model returns fixed-schema JSON `{ hazard, side, distance }`; the app maps it to fixed phrases in `strings.ts` | Predictable, short, testable speech; no-repeat can compare answers exactly | Less expressive than free text; anything outside the enums becomes `unsure` | Final |
| 3 Nov 2026 | Live spending cap $25, enforced by a backend token counter | Owner approved; console billing lags up to an hour | Counter is an estimate until checked against billing | Final (not built yet) |
| 3 Nov 2026 | Model `muse-spark-1.3` (Standard mode = this ID; `-contributor` is Contributor) | Docs: on Model API, image input, "Recommended for new work" | Standard costs more than Contributor ($1.25/$4.25 vs $0.10/$0.20 per 1M in/out) | Final (confirmed in docs 3 Nov; not yet called) |
| 3 Nov 2026 | Self-signed HTTPS on the LAN via `@vitejs/plugin-basic-ssl`; Vite proxies `/api` | Camera needs a secure context; no new accounts, tunnels or hosting | Cert warning once per device; dev-only routing | Final for the event |
| 3 Nov 2026 | Mock first: `VISION_MODE=mock` default, badge "MOCK - not a real model answer" | Build and time the whole flow with no spend | Mock latency excludes the model | Final (badge wording tentative) |
| 3 Nov 2026 | Phrase rule: `<Hazard> ahead[, left/right][, close]`; clear -> "Clear"; unsure -> "Not sure"; far adds nothing | Short, matches brief examples | Wording not yet approved by Owner | Tentative |
| 3 Nov 2026 | Phrase drops to 40px below 360px wide | 64px words like "Obstacle" do not fit 288px | Slightly smaller on the narrowest phones | Tentative |
| 3 Nov 2026 | `DEV_HTTPS=0` switch for plain-HTTP desktop testing on localhost | The desktop test browser rejects the self-signed cert | One more env knob; never for the phone | Final |
| 3 Nov 2026 | Live call: Chat Completions `create()` with an explicit json_schema (built from the same Literal types as `VisionAnswer`), not `beta...parse()` | One schema source; nullable `side`/`distance` written as `anyOf` with null; `strict` left off (docs: output is schema-constrained either way) | Docs do not state nullable support explicitly; Part B will show | Tentative |
| 3 Nov 2026 | `reasoning_effort="minimal"` | Lowest value Muse Spark accepts; `none` returns 400 per the reasoning docs | Possibly lower accuracy; tunable via `VISION_REASONING_EFFORT` | Tentative |
| 3 Nov 2026 | No `max_completion_tokens` set | Docs disagree (`max_tokens` vs `max_completion_tokens`); a cap that cuts reasoning would turn answers into "unsure" | Output size unbounded until Part B measures it | Tentative |
| 3 Nov 2026 | 8 s timeout, `max_retries=0` | A late or retried answer about an old frame is worse than "unsure" | No automatic recovery from transient 429/503 | Tentative |
| 3 Nov 2026 | Spend counter in `backend/.data/spend.json`; unreadable file refuses live calls | Survives restarts with no hosted data; fails closed | Not portable to a stateless host (flagged in ARCHITECTURE) | Final for the event |
| 3 Nov 2026 | Unparseable model output -> `unsure`, still billed | Never speak a guess; cost is real either way | An `unsure` can hide a schema problem; reason is logged | Final |
| 3 Nov 2026 | Model prompt `v1-tentative` (text in `backend/app/config.py`) | Advisor's draft, character for character | Owner approval pending | Tentative |
