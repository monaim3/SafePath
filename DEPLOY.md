# Deploying SafePath (free tier)

Three accounts are needed. They require your own sign-up, so they are not automated:

| What | Service (free) | Why it needs you |
|---|---|---|
| Backend server (Django + PostgreSQL + HTTPS) | Oracle Cloud **Always Free** VM | Account + identity/card verification |
| Website (Next.js) | **Vercel** Hobby | Account; or authorise the Vercel connector in claude.ai so Claude can deploy it |
| CAPTCHA | **Cloudflare Turnstile** | Account; creates your site key + secret |

Everything else is ready: `deploy/docker-compose.prod.yml` (database, API, Caddy with automatic HTTPS) was smoke-tested locally.

---

## 1. Turnstile keys (5 minutes)

1. Cloudflare dashboard → **Turnstile** → **Add widget**.
2. Hostname: your website domain (e.g. `safepath.vercel.app`). Mode: **Managed**.
3. Copy the **site key** (public, for the website) and the **secret key** (server only).

Local development keeps using Cloudflare's official test keys (`1x000…AA`), which always pass.

## 2a. Backend without a card: Render + Neon (current setup)

1. **Neon** (neon.tech, sign in with GitHub) → new project `safepath`, region **Singapore**, Postgres 16. Copy the connection string (`postgresql://…?sslmode=require`).
2. **Render** (render.com, sign in with GitHub) → **New → Blueprint** → pick this repo. `render.yaml` creates `safepath-api` (free, Docker, Singapore). Enter the secrets it asks for:
   - `DATABASE_URL` — the Neon connection string
   - `DJANGO_SECRET_KEY`, `SAFEPATH_HASH_SALT`, `TURNSTILE_SECRET` — same values as `deploy/.env`
   - `CORS_ALLOWED_ORIGINS` — the Vercel URL (no trailing slash)
3. Migrations run on every start. Render's free plan has no shell, so create the moderator from your PC against Neon:

```powershell
cd backend
$env:DATABASE_URL = "<neon connection string>"
.venv\Scripts\python manage.py create_moderator <name>
Remove-Item Env:DATABASE_URL
```

Check: `https://safepath-api.onrender.com/healthz` → `ok`, `/api/v1/map/time-profile` → JSON.

The free service sleeps after 15 idle minutes (first request then takes ~1 minute). A free UptimeRobot HTTP monitor on `/healthz` every 5 minutes keeps it awake; 750 free hours cover one service for a whole month.

## 2b. Backend server (Oracle Cloud Always Free, needs a card)

1. Create an **Ampere A1** instance (Ubuntu 24.04, up to 4 OCPU / 24 GB — free).
2. In the VCN security list, allow inbound **TCP 80 and 443**.
3. Point a DNS **A record** for your API host (e.g. `api.yourdomain.com`) at the VM's public IP.
4. On the VM:

```bash
sudo apt update && sudo apt install -y docker.io docker-compose-v2 git
sudo usermod -aG docker $USER && newgrp docker
# Ubuntu images on Oracle also block ports in iptables:
sudo iptables -I INPUT -p tcp -m multiport --dports 80,443 -j ACCEPT && sudo netfilter-persistent save

git clone <your repo> safepath && cd safepath
cp deploy/.env.example deploy/.env
nano deploy/.env        # fill every value; generate secrets with the command in the file
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d --build
docker compose -f deploy/docker-compose.prod.yml exec api python manage.py create_moderator <name>
```

Check: `https://api.yourdomain.com/api/v1/map/time-profile` returns JSON.

Do **not** run `seed_demo` on the server — production starts with real reports only.

## 3. Website (Vercel)

1. Import the `frontend/` folder as a Vercel project (framework: Next.js; root directory: `frontend`).
2. Environment variables:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.yourdomain.com` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | site key from step 1 |
| `NEXT_PUBLIC_DEMO_NOTICE` | `on` until real reports exist, then `off` |

3. Deploy. Put the Vercel URL (or your domain) in `FRONTEND_ORIGIN` on the server and restart the api container.

## Before announcing it publicly

- Map tiles/geocoding/routing use free public servers (OpenFreeMap, Photon, OSRM, Esri imagery) with fair-use limits — fine for launch, self-host when traffic grows (see the master prompt §27).
- Get the disclaimer and privacy wording reviewed (master prompt §24).
- Verify the emergency numbers on the Stay aware page.
