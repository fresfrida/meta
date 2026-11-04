# Second Eyes - hackathon plan
Deadline: Thu 5 Nov 10:00 SGT (= Wed 4 Nov 9:00 PM EST). Target submit 09:30.
Source docs: admin/ (incl. the event Details PDF and submission form screenshots).

## Status (4 Nov 21:15 SGT) - sections below are from 3 Nov and partly outdated
- Live public demo: https://second-eyes.52.76.242.161.sslip.io (Coolify on AWS Lightsail, Singapore), with 3-minute
  visitor slots, 10 a day, $8 a day, $10 total. Mac version on Tailscale for filming.
- Three Meta models: SAM 3.1 warns first (~1.5 s; stairs, kerbs, doors in the walking path), Muse Spark 1.3 adds
  the detail (prompt v7: 19 named kinds + a catch-all, "There might be..." when unsure, roads never clear),
  Muse Voice Transcribe hears "Hey Eyes" in 4 languages.
- Built after outdoor walks: distance allows for walking during the delay, heartbeat tick, spoken "Connection lost",
  person-centred wording, Singapore-first voices (in progress), welcome screen for visitors.
- main has the build up to the public demo packaging (PR #1). README approved, on branch claude/readme, waiting for
  real phone screenshots and the video link.
- Next: film the 3-minute video, README PR, merge the latest branch, submission texts, repo public on the Owner's yes.
  Details: 007-meta-artifacts/reports/advisor-handoff.md and docs/HANDOFF.md, docs/KANBAN.md, docs/DECISIONS.md.

## Pitch
A phone camera watches the path ahead, Meta's vision model spots steps and
obstacles, draws a box around the hazard, and the phone speaks a short warning
in English, 中文, Bahasa Melayu or தமிழ். Controlled demo only: nobody walks
guided by it. UI label: "beta - research prototype".

## Entry
Indie Developer track (Owner, 3 Nov). Problem statement: Build for Your World.
Solo team. Judged on Impact 30%, Use of Meta AI tooling 25%, Technical depth
20%, Demo 25%. Stage 1 is pass/fail: fits the theme, uses Meta Model API.

## Event rules that shape the build
- Repo must be public at submission (Owner's explicit yes before it flips).
- 3-minute demo video is required and is a primary judging artifact. The demo
  must show only what was built during the event; README says what was built
  and when (repo started 3 Nov).
- Banned: "Simple Image Analyzers" and AI that gives medical advice. Lead the
  video and text with the live loop, no-repeat speech, hazard box, side from
  box, four languages and measured latency - not "it analyses a photo".
  Frame it as a research prototype, not a mobility aid.
- Live API calls need a credit card on the Meta account (temporary
  pre-authorisation). Credits: $150, claimed.
- Office hours: Discord #office-hours, 10-11 AM ET = 23:00-00:00 SGT.

## Submission form (what we must write)
Team name; track; problem statement; Project Description; Public GitHub
Repository; 3-Minute Demo Video link; "Describe your use of Meta products";
"Why are Meta's models important to your solution?"; optional X post link
(Most Viral bonus); a survey the Owner answers. No live URL field, so the
local phone demo is enough. All text is drafted by the Advisor and approved
by the Owner word for word.

## Demo script (what the judge sees, in order)
1. Pick a language, tap Start. Camera fills the screen. Badge shows
   "Live - Meta Model API".
2. Camera faces a step: amber box appears on it, phone says "Step down ahead".
3. Scene stays the same: silence (no nagging).
4. Scene changes to a clear path: phone says "Clear".
5. Switch language, repeat one hazard.
6. Latency readout visible: capture-to-speech in ms.

## How it works
- Phone (Safari) -> https://<mac-lan-ip>:5173 (Vite dev server, self-signed
  cert via @vitejs/plugin-basic-ssl). Vite proxies /api to FastAPI on the Mac,
  so the phone talks to one secure address only.
- FastAPI sends one downscaled frame to muse-spark-1.3 (Standard mode,
  reasoning_effort minimal) with a fixed prompt (v2, Owner approved) and a
  JSON schema:
  { hazard: step_down | step_up | curb | obstacle | clear | unsure,
    side: left | ahead | right | null, distance: near | far | null,
    box: [x_min, y_min, x_max, y_max] on a 0-1000 grid | null }
- Side comes from the box centre (left third / middle / right third) when a
  box exists, otherwise the model's side, so what is heard matches what is
  drawn.
- Loop: one frame in flight, next capture 1 s after the answer.
- No-repeat (final): "Not sure" is never spoken; the same phrase stays
  silent; at least 1.5 s between warnings; a new warning interrupts speech;
  "Clear" waits for speech to finish.
- Phrases are fixed text in one strings file, spoken with the browser's
  speech synthesis, in the language picked on the start screen.
- MODEL_API_KEY on the backend only. Mock mode behind a flag, labelled in UI.
- Budget guard: the backend counts token usage and refuses live calls past
  $25 (Owner approved, 3 Nov). Console billing lags up to an hour, so this
  counter is the real stop.
- Hosting: local only (Mac + iPhone on the same Wi-Fi).

## Privacy
Free credits: "your content may be used for product improvement" (Meta
billing page). Live frames show only staged scenes or walk clips with no
people, faces, house numbers or anything personal in view. README says so.

## Design direction
Mood: calm, high-contrast, unmistakable. Feels like Apple's Magnifier.
Colour: near-black background, off-white text, one amber for warnings,
red only for errors. Type: system font, sizes 14/16/20/28/40/64; the spoken
phrase at the largest size. Space: 4/8/12/16/24/32/48. Radius: 12/24.
Motion: phrase crossfades; an amber ring pulses while speaking; none with
reduced motion. Signature: full-screen camera with a huge phrase band and the
amber hazard box. The box must stay visible: phrase band at the top, timing
panel collapsed in loop mode. Start/Stop at least 64px tall. Phrase in a live
region for screen readers.

## Timeline (SGT)
- Tue: done ahead of plan - scaffold, HTTPS on LAN, mock loop, no-repeat,
  hazard box (Briefs 1-4). Tue night: first live calls (Part B).
- Wed 09:00-13:00 Brief 5: layout so the box shows, 4-language picker,
  distance in metres if the model estimates it well. iPhone test.
- Wed 13:00-16:00 Design polish on the demo path.
- Wed 16:00-20:00 Controlled test (walk clip on a laptop screen, or staged
  scenes). Log misses and false alarms; tune prompt and frame rate.
- Wed 20:00-22:00 Rehearse and film the 3-minute video. README draft.
- Thu 07:00 Feature freeze. Fixes, README, submission text (shown to Owner).
- Thu 09:30 Submit. Repo goes public only on the Owner's yes.

## Cut
GPS, routes, step counts, panorama, cane hardware, indoor navigation,
describing people beyond "person ahead", accounts, history, deployment.

## Stretch (only if ahead)
SAM 3.1 outline of the hazard; voice control with Muse Voice Transcribe.

## Open
- Credit card on the Meta account: needed before live calls work.
- Translations: Owner approved the draft words (3 Nov); a native check of
  Tamil and Malay is still worth doing before filming.
- iPhone voices for Chinese, Malay and Tamil are unverified.
- Android is untested unless one is borrowed.
