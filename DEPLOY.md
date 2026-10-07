# Deploying SafePath (free tier)

Three accounts are needed. They require your own sign-up, so they are not automated:

| What | Service (free) | Why it needs you |
|---|---|---|
| Website (Next.js) and API (Django) | **Vercel** Hobby | Account (GitHub sign-in) |
| Database (PostgreSQL) | **Neon** Free | Account (GitHub sign-in) |
| CAPTCHA | **Cloudflare Turnstile** | Account; creates your site key + secret |

None of these needs a card. Live today:

| What | Where |
|---|---|
| Website | https://chintai-bd.vercel.app (Vercel project `safepath`, root `frontend`) |
| API | https://safepath-api.vercel.app (Vercel project `safepath-api`, root `backend`) |
| Database | Neon project `safepath`, AWS Singapore, Postgres 16 |

A self-hosted alternative (Oracle VM + Docker + Caddy) is in section 2b.

---

## 1. Turnstile keys (5 minutes)

1. Cloudflare dashboard → **Turnstile** → **Add widget**.
2. Hostname: your website domain (e.g. `safepath.vercel.app`). Mode: **Managed**.
3. Copy the **site key** (public, for the website) and the **secret key** (server only).

Local development keeps using Cloudflare's official test keys (`1x000…AA`), which always pass.

## 2a. API on Vercel + database on Neon (current setup)

Render was tried first, but it now asks for a card even on the free plan.

1. **Neon** (neon.tech) → new project `safepath`, region **AWS Asia Pacific (Singapore)**, Postgres 16.
   **Connect** → turn **Connection pooling off** → copy the connection string (`postgresql://…?sslmode=require&channel_binding=require`).
2. **Database setup, from your PC.** Vercel never runs migrations, so run these once and again after every new migration:

```bash
cd backend
export DATABASE_URL="<neon connection string>"
.venv/Scripts/python manage.py migrate
DJANGO_CACHE=database .venv/Scripts/python manage.py createcachetable
.venv/Scripts/python manage.py create_moderator <name>   # prompts for a password; rerun to reset it
unset DATABASE_URL
```

3. **Vercel API project.** Django runs as one Python function (`backend/api/index.py`, routed by `backend/vercel.json`, region `sin1`):

```bash
cd backend
vercel link --project safepath-api        # first time only
vercel env add <NAME> production          # once per variable below; paste the value when asked
vercel deploy --prod
```

| Variable | Value |
|---|---|
| `DJANGO_DEBUG` | `false` |
| `DJANGO_ALLOWED_HOSTS` | `safepath-api.vercel.app` |
| `DJANGO_SECRET_KEY`, `SAFEPATH_HASH_SALT` | long random strings (same values as `deploy/.env`) |
| `TURNSTILE_SECRET` | Turnstile secret key |
| `DATABASE_URL` | the Neon connection string |
| `DJANGO_CACHE` | `database` — instances share the map cache and login throttle |
| `CLIENT_IP_HEADER` | `HTTP_X_REAL_IP` — set by Vercel's edge, clients cannot spoof it |
| `CORS_ALLOWED_ORIGINS` | website URL(s), comma-separated, no trailing slash |
| `CLOUDINARY_URL` | optional — turns on CCTV/video evidence. Cloudinary console → Settings → API Keys: `cloudinary://<api_key>:<api_secret>@<cloud_name>` with the real key (digits) and revealed secret, not the placeholders |

Check: `https://safepath-api.vercel.app/healthz` → `ok`, `/api/v1/map/time-profile` → JSON.
`/` itself answers "Not Found" — the API has no home page.

To get the live `DATABASE_URL` onto your PC for step 2: `vercel env pull .env.prod --environment=production` inside `backend/`
(it writes a file — `/dev/stdout` does not work), use it, then delete `.env.prod`.
Run new migrations **before** deploying code that needs them.

**Video evidence (Cloudinary, free plan ≈ 25 GB/month storage + viewing).** Files go from the reporter's phone
straight to Cloudinary with a single-use signed ticket issued only for an accepted report; our database keeps only
the file id. Moderators approve or delete footage in the Videos tab; deleted or rejected footage is removed from
Cloudinary. The public copy has its audio removed.

Nothing sleeps on Vercel, so no uptime pinger is needed. After a quiet spell the first request takes 1–2 s while Neon wakes up.

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

1. `cd frontend`, `vercel link --project safepath` (first time only). `frontend/vercel.json` sets the framework to Next.js — without it Vercel serves a plain 404.
2. Environment variables (`vercel env add <NAME> production`):

| Name | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://safepath-api.vercel.app` (or `https://api.yourdomain.com` on the Oracle stack) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | site key from step 1 |
| `NEXT_PUBLIC_DEMO_NOTICE` | `on` until real reports exist, then `off` |

3. `vercel deploy --prod`. The address is a project domain: `vercel domains add chintai-bd.vercel.app`.
4. **Every website address** must also be added in two places:
   - the API's `CORS_ALLOWED_ORIGINS` (then redeploy the API; on the Oracle stack: `FRONTEND_ORIGIN`, then restart the api container)
   - the Turnstile widget's hostnames in Cloudflare

## Before announcing it publicly

- Map tiles/geocoding/routing use free public servers (OpenFreeMap, Photon, OSRM, Esri imagery) with fair-use limits — fine for launch, self-host when traffic grows (see the master prompt §27).
- Get the disclaimer and privacy wording reviewed (master prompt §24).
- Verify the emergency numbers on the Stay aware page.
