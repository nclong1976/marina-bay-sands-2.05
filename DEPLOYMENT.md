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
functions. It needs a platform that runs a long-lived Node process.

This guide covers **Render**.

## ⚠️ Free plan vs paid plan — read before choosing

Render's **free** web service plan spins the instance down after ~15 minutes of
no HTTP traffic, and cold-starts (30s+) on the next request. That kills every
open Socket.io connection when it happens, and admins/users will see "connecting..."
until the instance wakes back up. It's fine for a first smoke test, but **not**
acceptable once real users are relying on live chat/odds/notifications. Use at
least the **Starter** paid plan (~$7/mo) for anything beyond testing —
`render.yaml` in this repo is already set to `plan: starter`.

## 1. Required environment variables

Only two variables are actually required (see `.env.example`):

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxxxxxxxxxxx
```

Get these from your Supabase project dashboard → Project Settings → API.

**Important**: these are Vite env vars, which get baked into the JS bundle at
**build time**. Set them in Render *before* the first build runs — adding or
changing them later requires a manual redeploy to take effect (Render does
this automatically when you save a changed env var, but it's worth knowing
why a stale value might otherwise stick around).

## 2. Deploy to Render

Two ways to do this — pick one.

### Option A — Blueprint (uses `render.yaml` in this repo, fewer manual steps)

1. Push this repo to GitHub if it isn't already (`git remote -v` to check).
2. Go to the [Render Dashboard](https://dashboard.render.com) → **New → Blueprint**.
3. Connect this GitHub repo. Render reads `render.yaml` and proposes a `sands-club` web service with the build/start commands and health check already set.
4. Render will prompt you to fill in the two env vars marked `sync: false` in the blueprint (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) — paste your Supabase values.
5. Click **Apply** to create and deploy the service.

### Option B — Manual Web Service (if the Blueprint doesn't pick up correctly)

1. Render Dashboard → **New → Web Service** → connect this GitHub repo.
2. Runtime: **Node**. Region: pick one close to your users (e.g. Singapore).
3. Build Command: `npm install && npm run build`
4. Start Command: `npm start`
5. Plan: **Starter** or higher (see the free-plan warning above).
6. Under **Environment**, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `NODE_ENV` = `production` (belt-and-suspenders — `npm start` already forces this itself)
7. Under **Health Check Path**, set `/api/health`.
8. Click **Create Web Service**.

Either way, Render sets `PORT` automatically; `server/index.js` already reads
`process.env.PORT`, so no change needed there. Watch the deploy logs until the
service shows **Live**, then open the `*.onrender.com` URL Render gives you and
confirm the app loads and you can register/log in — this proves Supabase
connectivity is correct before you touch DNS.

## 3. Point your domain at it

1. In the Render service → **Settings → Custom Domains**, click **Add Custom Domain** and enter your domain (e.g. `sandsclub.com` or a subdomain like `app.sandsclub.com`).
2. Render shows you the DNS record to add:
   - **Subdomain** (e.g. `app.sandsclub.com`): a **CNAME** record pointing at your service's `onrender.com` hostname.
   - **Root/apex domain** (`sandsclub.com`, no subdomain): Render will give you an **A record** (IP address) to use instead, since plain CNAME isn't valid on a root domain in classic DNS. If your registrar supports ALIAS/ANAME/CNAME-flattening on the apex, that also works and is usually preferable to a bare A record.
3. Go to your domain registrar's DNS management panel (wherever the domain is registered) and add exactly the record Render showed you.
4. Wait for DNS propagation (usually minutes, can take up to 24-48h depending on registrar/TTL). Render auto-provisions a free SSL certificate (Let's Encrypt) once it detects the DNS record is live — no manual certificate work needed.
5. Once the custom domain shows **Verified** in Render, visit it and confirm the app loads over HTTPS.

## 4. Post-deploy checklist

- [ ] `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` set correctly in Render's env vars
- [ ] Plan is **Starter or higher** (not Free) if this is meant for real users, not just a smoke test
- [ ] Register a test account and confirm it appears in Supabase's `users_profile` table
- [ ] Log in as `admin` / `leo1102` (seeded accounts — **change these passwords or lock these accounts down before going fully live**, see Security below) and confirm the admin panel loads
- [ ] Custom domain shows **Verified** in Render with a valid HTTPS padlock
- [ ] Socket.io connects (open browser dev tools → Network → WS, confirm a websocket connection to your domain, not `localhost`)
- [ ] `/api/health` responds at `https://yourdomain.com/api/health`

## 5. Security notes before going live

- The two seeded admin accounts (`leo1102` / `141219` and `admin` / `121212`, see `supabase/schema.sql`) use **hardcoded default passwords**. Change both passwords immediately after your first deploy (log in → Settings → change password), since anyone who reads this repo's schema file knows the defaults.
- Supabase RLS policies in `schema.sql` are currently **fully permissive** (`USING (true) WITH CHECK (true)` on every table) — any holder of the anon key can read/write any row directly via the Supabase REST API, bypassing the app entirely. This is fine for getting started, but before handling real money you should tighten RLS policies (e.g., restrict `users_profile` writes to the row's own `id`/`account`, restrict `game_bets`/`transactions` writes similarly) or move privileged writes (balance adjustments, user locks) behind a server-side endpoint using the Supabase **service role** key, which never ships to the browser.
- `SUPABASE_SECRET_KEY` in `.env` is the service-role key — never expose it to the frontend (it isn't currently used by any `VITE_`-prefixed variable, which is correct; keep it that way).

## Rollback

Render keeps deployment history — open the service → **Events**/**Deploys** tab, and use **Rollback** (or manually redeploy a previous commit) to revert instantly.

## Troubleshooting

**Build fails**: check the Render build logs. Common cause: a `VITE_SUPABASE_*` variable typo or missing value — the app will still build without them, but Supabase calls will silently no-op (`isSupabaseConfigured()` returns false), so most features will look "broken" (no admin data, no cross-device sync) without ever erroring.

**Site loads but shows a blank page / 502**: check the service logs. If you see route-registration errors, verify `server/index.js`'s catch-all is the path-less `app.use((req, res) => ...)` form (Express 5 dropped support for bare `app.get('*', ...)`).

**Realtime/chat keeps dropping and reconnecting**: almost always the free-plan idle-spindown described above. Upgrade to Starter or higher.

**Custom domain stuck on "Pending"**: DNS hasn't propagated yet, or the record type is wrong for an apex domain. Use `dig yourdomain.com` or https://dnschecker.org to verify the record is visible publicly.

**WebSocket connects to the wrong host**: `src/lib/socket.js` derives the Socket.io server URL from `window.location` by default, so it always matches whatever domain the page was loaded from — no configuration needed unless you deliberately split the Socket.io server onto a different host (`VITE_SOCKET_SERVER_URL`).
