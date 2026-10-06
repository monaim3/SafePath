# SafePath — backend (Django + DRF)

Report intake with server-side anti-abuse checks. Spec: [`../docs/SAFEPATH_MASTER_PROMPT.md`](../docs/SAFEPATH_MASTER_PROMPT.md) §12.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py createsuperuser   # moderator account
.\.venv\Scripts\python.exe manage.py seed_demo         # optional: synthetic demo reports (is_demo=True)
.\.venv\Scripts\python.exe manage.py runserver 8000
.\.venv\Scripts\python.exe -m pytest                   # 38 tests
```

`seed_demo --clear` removes the demo data. Never run `seed_demo` in production.

## Moderators

```powershell
.\.venv\Scripts\python.exe manage.py create_moderator <username>   # prompts for a password
```

They sign in at `/bn/mod` (or `/en/mod`) on the website — not linked publicly, not indexed by search engines.
Login is token-based, staff-only, limited to 5 attempts per minute; the token is kept only in that browser tab.
Decisions: **verify** (raises reporter trust), **reject** with a reason (lowers trust; 3 in 30 days → 7-day restriction),
**duplicate** (stops counting, no penalty). Every decision is in the audit log.

Uses SQLite by default; set `DATABASE_URL=postgres://…` for PostgreSQL (see `.env.example`).

## Endpoints

| Method | Path | Who |
|---|---|---|
| POST | `/api/v1/reports` | anyone (anonymous) |
| POST | `/api/v1/knowledge/<id>/confirm` | anyone — "I've seen this too" |
| GET | `/api/v1/map/cells?res=8\|9\|10&hour=0-23\|all` | anyone — aggregated cells only |
| GET | `/api/v1/map/time-profile` | anyone — city activity per hour |
| GET | `/api/v1/areas?limit=N` · `/api/v1/areas/<h3>` | anyone — area details |
| GET | `/api/v1/mod/queue` | staff |
| POST | `/api/v1/mod/reports/<id>/verify` · `/reject` | staff |
| POST | `/api/v1/mod/flags/<id>/resolve` | staff |

## How fake reports are handled (no phone/OTP — reporting stays anonymous)

| Layer | Where |
|---|---|
| Turnstile CAPTCHA | `apps/incidents/services/turnstile.py` |
| Salted hashes of device ID and IP (raw values never stored) | `services/abuse.py · hash_identifier` |
| Rate limits per device **and** per IP (2 / 10 min, 5 / day) | `services/submission.py · _check_rate_limits` |
| Impossible dates/times rejected; copy-pasted text flagged quietly. Reporter location is never collected — victims often report later, from home or a borrowed phone | `services/submission.py` |
| Low weight until reviewed (pending 0.3×) | `services/abuse.py · report_weight` |
| Corroboration only from independent device **and** network, same event shape | `services/abuse.py · corroborates` |
| Hidden trust score (0.5×–1.5×), restriction after 3 rejections in 30 days | `apps/moderation/services.py` |
| Burst detection (many reports, few devices, one area) | `services/submission.py · _detect_burst` |
| Append-only audit log (+ DB trigger on PostgreSQL) | `apps/audit` |

All thresholds live in `apps/incidents/policy.py`. Responses never reveal flags, weights or trust.
