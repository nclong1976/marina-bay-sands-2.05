# 🚀 Deployment Guide - Sands Club

## Architecture (what's actually deployed)

This app is **not** deployed through Base44 — that SDK is a legacy leftover and is
inert with no `VITE_BASE44_APP_ID` set. The real stack is:

- **Frontend**: React + Vite, built to static files (`npm run build` → `dist/`)
- **Server**: A single long-running Node process (`server/index.js`) — Express
  serves the built frontend and exposes `/api/health`; Socket.io runs on the
  same HTTP server for realtime features (chat, admin notifications, live odds)
- **Database**: Supabase (already hosted externally — nothing to deploy for it)

Because Socket.io needs a persistent connection, this **cannot** be hosted on a
static-site host (Vercel static, Netlify, GitHub Pages) or on serverless
functions. It needs a platform that runs a long-lived Node process — Railway,
Render, Fly.io, or a VPS.

This guide covers **Railway**, since that's what a persistent Node+Socket.io
service is simplest on.

## 1. Required environment variables

Only two variables are actually required (see `.env.example`):

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxxxxxxxxxxx
```

Get these from your Supabase project dashboard → Project Settings → API.

**Important**: these are Vite env vars, which get baked into the JS bundle at
**build time**. On Railway, set them as project Variables before the first
deploy (or trigger a new deploy after adding/changing them) — setting them
after a build won't retroactively apply.

## 2. Deploy to Railway

1. Push this repo to GitHub if it isn't already (`git remote -v` to check).
2. Go to [railway.app](https://railway.app), sign in, **New Project → Deploy from GitHub repo**, and select this repository.
3. Railway auto-detects Node.js via Nixpacks. This repo includes `railway.json`, which sets:
   - Build command: `npm run build`
   - Start command: `npm start` (runs `server/index.js` with `NODE_ENV=production`)
   - Health check: `/api/health`
4. In the Railway project → **Variables** tab, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
5. Trigger a deploy (Railway does this automatically after you add variables / push to the branch). Watch the build logs; wait for the health check to go green.
6. Open the `*.up.railway.app` URL Railway gives you and confirm the app loads, and that you can register/log in — this proves Supabase connectivity is correct before you touch DNS.

Railway sets `PORT` automatically; `server/index.js` already reads `process.env.PORT`, so no change needed there.

## 3. Point your domain at it

1. In the Railway project → **Settings → Networking → Custom Domain**, click **Add Domain**, and enter your domain (e.g. `sandsclub.com` or a subdomain like `app.sandsclub.com`).
2. Railway shows you a DNS target — usually a **CNAME** value (something like `xxxxx.up.railway.app`). For an apex/root domain (`sandsclub.com` with no subdomain), Railway will tell you whether it needs a CNAME or an `A`/`ALIAS`/`ANAME` record instead, since plain CNAME isn't valid on a root domain in classic DNS — if your registrar doesn't support ALIAS/ANAME/CNAME-flattening on the apex, use a subdomain like `www` or `app` and redirect the root to it.
3. Go to your domain registrar's DNS management panel (wherever the domain is registered) and add the record Railway showed you:
   - Subdomain (e.g. `app.sandsclub.com`): add a **CNAME** record, host `app`, value = the Railway target.
   - Root domain (`sandsclub.com`): add whatever record type your registrar offers for apex domains pointing at a CNAME target (ALIAS/ANAME, or Cloudflare's proxied CNAME flattening).
4. Wait for DNS propagation (usually minutes, can take up to 24-48h depending on registrar/TTL). Railway auto-provisions a free SSL certificate (Let's Encrypt) once it detects the DNS record is live — no manual certificate work needed.
5. Once the custom domain shows "Active" in Railway, visit it and confirm the app loads over HTTPS.

## 4. Post-deploy checklist

- [ ] `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` set correctly in Railway Variables
- [ ] Register a test account and confirm it appears in Supabase's `users_profile` table
- [ ] Log in as `admin` / `leo1102` (seeded accounts — **change these passwords or lock these accounts down before going fully live**, see Security below) and confirm the admin panel loads
- [ ] Custom domain shows "Active" in Railway with a valid HTTPS padlock
- [ ] Socket.io connects (open browser dev tools → Network → WS, confirm a websocket connection to your domain, not `localhost`)
- [ ] `/api/health` responds at `https://yourdomain.com/api/health`

## 5. Security notes before going live

- The two seeded admin accounts (`leo1102` / `141219` and `admin` / `121212`, see `supabase/schema.sql`) use **hardcoded default passwords**. Change both passwords immediately after your first deploy (log in → Settings → change password), since anyone who reads this repo's schema file knows the defaults.
- Supabase RLS policies in `schema.sql` are currently **fully permissive** (`USING (true) WITH CHECK (true)` on every table) — any holder of the anon key can read/write any row directly via the Supabase REST API, bypassing the app entirely. This is fine for getting started, but before handling real money you should tighten RLS policies (e.g., restrict `users_profile` writes to the row's own `id`/`account`, restrict `game_bets`/`transactions` writes similarly) or move privileged writes (balance adjustments, user locks) behind a server-side endpoint using the Supabase **service role** key, which never ships to the browser.
- `SUPABASE_SECRET_KEY` in `.env` is the service-role key — never expose it to the frontend (it isn't currently used by any `VITE_`-prefixed variable, which is correct; keep it that way).

## Rollback

Railway keeps deployment history — open the project → **Deployments** tab, and click **Redeploy** on any previous successful build to roll back instantly.

## Troubleshooting

**Build fails**: check the Railway build logs. Common cause: a `VITE_SUPABASE_*` variable typo or missing value — the app will still build without them, but Supabase calls will silently no-op (`isSupabaseConfigured()` returns false), so most features will look "broken" (no admin data, no cross-device sync) without ever erroring.

**Site loads but shows a blank page / 502**: check `npm start` logs in Railway. If you see route-registration errors, verify `server/index.js`'s catch-all is the path-less `app.use((req, res) => ...)` form (Express 5 dropped support for bare `app.get('*', ...)`).

**Custom domain stuck on "Pending"**: DNS hasn't propagated yet, or the record type is wrong for an apex domain. Use `dig yourdomain.com` or https://dnschecker.org to verify the record is visible publicly.

**WebSocket connects to the wrong host**: `src/lib/socket.js` derives the Socket.io server URL from `window.location` by default, so it always matches whatever domain the page was loaded from — no configuration needed unless you deliberately split the Socket.io server onto a different host (`VITE_SOCKET_SERVER_URL`).
