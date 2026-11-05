# Deploy - Second Eyes (one container, Coolify on AWS Lightsail Singapore)

Nothing is public until the Owner says yes. The image holds no secrets; everything below is set as env vars in Coolify.

## Server (Brief 18)
| Fact | Value |
|---|---|
| Host | AWS Lightsail instance "apps-1", Singapore |
| OS | Ubuntu 24.04.4 LTS, x86_64 |
| Size | 2 vCPU, 3.7 GB RAM, 77 GB disk (75 GB free before Coolify) |
| Address | static IP 52.76.242.161 |
| SSH | user `ubuntu`, key-only (the key stays on the Owner's Mac; never in a repo) |
| Shared | for all the Owner's projects (~30 later), not only Second Eyes |

Lightsail firewall (set by the Owner): 80 / 443 open to all; 22 key-only; **8000 and 6001-6002 only from the Owner's
home IP**, so the Coolify registration page and dashboard are reachable only from home until the
dashboard is moved behind a domain.

Coolify install (official, from coolify.io/docs; run as root or with sudo on the server):
```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo bash
```
It installs Docker Engine and Coolify under `/data/coolify` (secrets in `/data/coolify/source/.env` - back it up, never
commit it). Right after it finishes, the Owner opens `http://52.76.242.161:8000` from home and creates the admin account
(the docs warn that whoever registers first becomes admin with root on the server).

| Variable | Example / default | What it does |
|---|---|---|
| `MODEL_API_KEY` | (secret) | Meta Model API key. Set as a **secret** in Coolify. Never in the repo or image. |
| `VISION_MODE` | `live` (default `mock`) | `mock` = no Meta calls (fixed answers); `live` = real calls. Listening, Ask and SAM follow it unless `LISTEN_MODE` / `ASK_MODE` / `DETECT_MODE` are set. |
| `PUBLIC_DEMO` | `1` | Visitor limits on: notice, 3-minute slots, daily slot count and daily budget. **Keep it on whenever the app is public.** |
| `DEMO_SECRET` | (secret, any long random string) | Signs slot tokens. If unset, a random one is made at start and running slots end on every restart. |
| `DEMO_SLOTS_PER_DAY` | `10` | New slots per Singapore day. |
| `DAILY_BUDGET_USD` | `8` | Live spend allowed per Singapore day (stops new slots and live calls when reached). |
| `BUDGET_USD` | `25` | Total live spend allowed, ever (on this volume). |
| `DEMO_SLOT_S` | `180` | Slot length in seconds. |
| `VIDEO_URL` | `https://…` (optional) | Link shown when slots are full; empty hides the link. |
| `DATA_DIR` | `/data` (image default) | Where `spend.json` and `demo.json` live: mount a **persistent volume** here. |
| `PORT` | `8000` (image default) | The container's HTTP port (Coolify's proxy does HTTPS). |
| `STATIC_DIR` | `/app/static` (image default) | The built frontend inside the image. |

## Coolify steps
1. New resource -> Application -> from the GitHub repo, branch `claude/second-eyes-cloud` (or the branch the Owner
   approves), **Build pack: Dockerfile** (repo root).
2. Ports: expose `8000`. Domain: `https://second-eyes.<server-ip>.sslip.io` (HTTPS via Let's Encrypt; sslip.io needs no
   DNS setup).
3. Persistent storage: add a volume mounted at `/data`.
4. Environment: the variables above (`MODEL_API_KEY` and `DEMO_SECRET` as secrets).
5. Health check: path `/api/health` (the image also has a Docker HEALTHCHECK).
6. Deploy. Check `https://…/api/health` shows `"public_demo": true` and the expected `vision_mode`.
7. On a phone: open the link, see the notice, tap "I understand", allow the camera and microphone.

## Turning the public demo off
- **Pause the demo:** set `VISION_MODE=mock` and redeploy (no Meta calls, no cost), or stop the application in Coolify.
- **Do not set `PUBLIC_DEMO=0` on a public server**: that removes the visitor limits (it is the Mac / Tailscale mode).
- **Reset today's slots:** stop the app, delete `/data/demo.json` (flag to the Owner first - it is stored data), start.

## Local check (what was run for Brief 17)
```bash
docker build -t second-eyes:cloud-test .
```
```bash
docker run --rm -p 127.0.0.1:8090:8000 -e PUBLIC_DEMO=1 -e VISION_MODE=mock -e DEMO_SECRET=local-test-only -v "$PWD/.demo-data:/data" second-eyes:cloud-test
```
Then open `http://127.0.0.1:8090` (localhost counts as a secure origin for the camera).
