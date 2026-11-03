# Decisions - Second Eyes

| Date | Decision | Reason | Tradeoff | Status |
|---|---|---|---|---|
| 3 Nov 2026 | Model returns fixed-schema JSON `{ hazard, side, distance }`; the app maps it to fixed phrases in `strings.ts` | Predictable, short, testable speech; no-repeat can compare answers exactly | Less expressive than free text; anything outside the enums becomes `unsure` | Final |
| 3 Nov 2026 | Live spending cap $25, enforced by a backend token counter | Owner approved; console billing lags up to an hour | Counter is an estimate until checked against billing | Final (not built yet) |
| 3 Nov 2026 | Planned model: `muse-spark-1.3`, Standard mode | The official vision recipe uses it | Name to be confirmed against dev.meta.ai/docs/models before Phase B | Tentative |
| 3 Nov 2026 | Self-signed HTTPS on the LAN via `@vitejs/plugin-basic-ssl`; Vite proxies `/api` | Camera needs a secure context; no new accounts, tunnels or hosting | Cert warning once per device; dev-only routing | Final for the event |
| 3 Nov 2026 | Mock first: `VISION_MODE=mock` default, badge "MOCK - not a real model answer" | Build and time the whole flow with no spend | Mock latency excludes the model | Final (badge wording tentative) |
| 3 Nov 2026 | Phrase rule: `<Hazard> ahead[, left/right][, close]`; clear -> "Clear"; unsure -> "Not sure"; far adds nothing | Short, matches brief examples | Wording not yet approved by Owner | Tentative |
| 3 Nov 2026 | Phrase drops to 40px below 360px wide | 64px words like "Obstacle" do not fit 288px | Slightly smaller on the narrowest phones | Tentative |
| 3 Nov 2026 | `DEV_HTTPS=0` switch for plain-HTTP desktop testing on localhost | The desktop test browser rejects the self-signed cert | One more env knob; never for the phone | Final |
