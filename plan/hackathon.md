# Second Eyes - hackathon plan
Deadline: Thu 5 Nov 10:00 SGT. Target submit 09:30. Source docs: admin/.

## Pitch
A phone camera watches the path ahead, Meta's vision model spots steps and
obstacles, and the phone speaks a short warning. Controlled demo only: nobody
walks guided by it. UI label: "beta - research prototype".

## Demo script (what the judge sees, in order)
1. Tap Start. Camera fills the screen. Badge shows "Live - Meta Model API".
2. Camera faces a step: phone says "Step down ahead". Big text shows it.
3. Scene stays the same: silence (no nagging).
4. Scene changes to a clear path: phone says "Clear".
5. Latency readout visible: capture-to-speech in ms.

## How it works
- Phone (Safari) -> https://<mac-lan-ip>:5173 (Vite dev server, self-signed
  cert via @vitejs/plugin-basic-ssl). Vite proxies /api to FastAPI on the Mac,
  so the phone talks to one secure address only.
- FastAPI sends one downscaled frame (~640px JPEG) to muse-spark-1.3
  (Standard mode) with a fixed question and a JSON schema:
  { hazard: step_down | step_up | curb | obstacle | clear | unsure,
    side: left | ahead | right | null, distance: near | far | null }
- The app maps the answer to fixed phrases kept in one strings file, and
  speaks them with the browser's speech synthesis.
- No-repeat: the same phrase stays silent until the answer changes, plus a
  short cooldown as a backstop.
- MODEL_API_KEY on the backend only. Mock mode behind a flag, labelled in UI.
- Budget guard: the backend counts token usage and refuses live calls past
  $25 (Owner approved, 3 Nov). Console billing lags up to an hour, so this
  counter is the real stop. Credits are free ($150, no card on file).
- Hosting: local only (Mac + iPhone on the same Wi-Fi). Later host: not decided.

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
reduced motion. Signature: full-screen camera with a huge phrase band.
Start/Stop at least 64px tall. Phrase in a live region for screen readers.

## Timeline (SGT)
- Tue 18:00-19:00 Pre-flight: repo, scaffold, HTTPS on LAN, iPhone shows
  camera, design tokens applied.
- Tue 19:00-21:00 Phase A: one frame -> mock -> speech on iPhone (speaker and
  Bluetooth). Measure delay without the model.
- Tue 21:00-22:00 Phase B spike: connectivity check, one live frame, real
  delay. DECISION: if over ~3 s, shrink frames, every 2 s, or a stills demo.
- Wed 09:00-13:00 Loop at 1 frame/s, JSON answer -> phrases, no-repeat,
  all error states. Review at 13:00: re-cut scope if behind.
- Wed 13:00-16:00 Design polish on the demo path.
- Wed 16:00-20:00 Controlled test (walk clip on a laptop screen, or staged
  scenes). Log misses and false alarms; tune prompt and frame rate.
- Wed 20:00-22:00 Rehearse and film the 3-minute video. README draft.
- Thu 07:00 Feature freeze. Fixes, README, submission text (shown to Owner).
- Thu 09:30 Submit. Repo goes public only on the Owner's yes.

## Cut
GPS, routes, step counts, panorama, cane hardware, indoor navigation,
describing people beyond "person ahead", accounts, history, languages,
deployment.

## Open
- Does the submission need a live URL, or are repo and video enough?
- Live calls may need a payment method on file even with free credits
  (billing page wording). The first live call tells us.
- Android is untested unless one is borrowed.
