# Deployment & setup

The app is a single Next.js 14 project deployed on **Vercel**, backed by **Supabase**
(Postgres + Auth + Realtime) and **Vercel Blob** (uploads). A separate **whatsapp-service**
container handles WhatsApp connectivity.

## Local setup

```bash
pnpm install
cp .env.example .env.local   # then fill in the values
pnpm dev                     # http://localhost:3000
```

Other commands: `pnpm build` (production build + type-check — the project's main safety net,
there is no test suite), `pnpm start`, `pnpm lint`.

## Environment variables

See [`.env.example`](../.env.example) for the full, grouped list. Key groups:

- **Supabase** — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` (server-only, bypasses RLS).
- **Web Push / Firebase** — VAPID keys + `NEXT_PUBLIC_FIREBASE_*` / `FIREBASE_*` for FCM.
- **WhatsApp** — `EVOLUTION_API_*` (used directly by the app) and `WHATSAPP_*` (the
  whatsapp-service container).
- **Chatwoot**, **Gemini** (`GEMINI_API_KEY`), **Vercel Blob** (`BLOB_READ_WRITE_TOKEN`),
  **Cron** (`CRON_SECRET`).

Vercel auto-injects `NODE_ENV`, `VERCEL_OIDC_TOKEN` and `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA`
(the build SHA shown in the app footer).

## Database / migrations

There is **no migration runner**. SQL changes live in [`migrations/`](../migrations/) and are
applied **manually in the Supabase SQL Editor**, roughly in the chronological order documented
in [`migrations/README.md`](../migrations/README.md). For a new change: add a new `.sql` file
(don't edit applied ones), apply it, and append it to the migrations index.

Schema overview and RLS notes: [`DATABASE.md`](./DATABASE.md).

## Cron jobs

Scheduled via `vercel.json` (Vercel Cron), authenticated with `CRON_SECRET`. Three additional
cron-style routes (`process-messages`, `housekeeping-routines`, `maintenance`) are **not** in
`vercel.json` and require an external trigger. Full runbook: [`CRON.md`](./CRON.md).

## whatsapp-service

`whatsapp-service/` is a standalone Node container (see its `Dockerfile`) built on
`whatsapp-web.js`. It maintains the WhatsApp session (QR auth state persists under
`.wwebjs_auth/`, git-ignored) and exposes an HTTP API the main app calls. Its own runtime env
vars: `PORT`, `SERVER_URL`, `WEBHOOK_URL`, `STATUS_WEBHOOK_URL`, `CHROME_BIN`,
`WHATSAPP_API_KEY`, `PROPERTY_ID`.

> Note: the app supports **two** WhatsApp paths — the **Evolution API** (`EVOLUTION_API_*`,
> used by `process-messages` and chat send routes) and this self-hosted service
> (`WHATSAPP_*`). Confirm which one the target deployment uses.

## Secrets hygiene

`.env.local` and `service-account.json` are git-ignored — never commit them. Only
`NEXT_PUBLIC_*` values reach the browser bundle, so keep secrets out of that prefix.
