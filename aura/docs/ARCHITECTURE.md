# Architecture

Aura is a multi-property hospitality management system: one Next.js 14 (App Router) app
serving an **admin back-office**, **role-specific mobile field apps**, and a **guest portal**,
all on a shared Supabase backend.

**Stack**: Next.js 14 (App Router) · Supabase (Postgres + Auth + Realtime) · TypeScript ·
Tailwind CSS · Zustand (client state) · Sonner (toasts) · Vercel Blob (uploads).

## Surfaces

| Surface | Routes | Audience |
|---------|--------|----------|
| Admin back-office | `src/app/admin/**` | Office staff (admin, manager, reception, …) |
| Mobile field apps | `src/app/{governanta,maid,waiter,houseman,maintenance,director}/**` | On-site staff by role |
| Guest portal | `src/app/check-in/[code]/**` | Guests (no login; access by stay code) |
| API | `src/app/api/**` | Backend for all of the above |

See [`MODULES.md`](./MODULES.md) for the full catalog.

## Request flow

The standard path (see the recipe in the root `CLAUDE.md`):

```
client component  →  /api/admin/<module>/route.ts  →  src/services/<domain>-service.ts  →  Supabase
   (useAuth,            (requireAuth + isAuthError,        (business logic +
    useProperty)         supabaseAdmin)                     Supabase queries)
```

- **Pages** are `"use client"` components; they read identity/property from React context and
  fetch through API routes.
- **API routes** validate the session server-side with `requireAuth([...roles])` +
  `isAuthError` (`src/lib/api-auth.ts`) and use the service-role client to bypass RLS.
- **Services** (`src/services/`, one per domain) hold business logic and the actual queries.
- **Server actions** (`src/app/actions/`) cover mutations that don't need a full route.

> Reality check: some older, large pages and routes embed logic that should live in services.
> That's tracked in [`REFACTORING.md`](./REFACTORING.md) — follow the pattern above for new code.

## Auth

Supabase Auth with the **SSR (cookie) model**:

- **Middleware** (`src/middleware.ts` + `src/lib/supabase-middleware.ts`) refreshes the session
  on each request and forwards the user identity to downstream handlers.
- **Server** (API routes): `requireAuth` resolves the staff record and role; the fast-path in
  `src/app/api/admin/auth/me` reads the identity injected by middleware.
- **Client**: `AuthContext` (`src/context/AuthContext.tsx`) exposes `useAuth()` →
  `userData` (a `Staff` with `.role`), `isAdmin`, `isSuperAdmin`. It distinguishes
  `authConfirmed` vs `tokenReady` — important for the mobile apps.
- **Browser client lock**: `src/lib/supabase-browser.ts` wraps `navigator.locks` with a 3s
  "steal" recovery so an F5 doesn't deadlock session reads (and a lock-free variant for
  same-origin iframes). Always use `supabase` from `@/lib/supabase`, which picks the right one.
- **UI gating**: the `<RoleGuard allowedRoles={[...]}>` component (`src/components/auth/`).
  Mobile layouts must always include `super_admin`, `admin`, `manager` so managers aren't
  locked out.

## Multi-property (multi-tenant) model

Every domain row carries a `propertyId`. The active property lives in `PropertyContext`
(`useProperty()` → `property` + dynamic `theme`). Postgres **RLS** scopes data per property
(`migrations/rls_all_properties.sql` and `*_rls.sql`). Server code that must read across
properties (e.g. crons) uses `supabaseAdmin`, which bypasses RLS — so always filter by
`propertyId` explicitly there.

## Realtime

Live updates use Supabase channels inside a `useEffect`:

```ts
const ch = supabase.channel('name').on('postgres_changes', { ... }, handler).subscribe();
return () => safeRemoveChannel(ch, subscribed); // safe teardown from @/lib/supabase
```

`safeRemoveChannel` avoids the "WebSocket closed before connection established" error when a
channel is torn down while still connecting.

## State

- **Server/shared data** → fetched per page via API routes (no global cache layer).
- **Cross-cutting client state** → React Context: `AuthContext`, `PropertyContext`,
  `NotificationContext` (`src/context/`).
- **Local/ephemeral UI state** → Zustand stores and component `useState`.

## Notifications & messaging

Several channels, kept in services:

- **WhatsApp** — outbound guest messaging. Two paths: the **Evolution API**
  (`EVOLUTION_API_*`, used by `process-messages` + chat send) and the self-hosted
  **whatsapp-service** container (`WHATSAPP_*`). Messages are queued in a `messages` table and
  drained by the `process-messages` cron. See `automation-service.ts`, `chatwoot-service.ts`,
  `message-queue-service.ts`.
- **Chatwoot** — support inbox + SSO (`/api/chatwoot/*`).
- **Web Push** — VAPID via the `web-push` lib (`src/lib/push-server.ts`) + Firebase FCM;
  subscribe/send under `/api/push/*`, client manager in `PushNotificationManager`.
- **In-app** — `NotificationContext` + notification center.

## File uploads

`src/components/admin/ImageUpload.tsx` (props `value`, `onUploadSuccess`, `path`) backed by
**Vercel Blob** (`BLOB_READ_WRITE_TOKEN`); routes under `/api/upload`.

## i18n

No i18n library. Translatable fields are stored as `name` / `name_en` / `name_es` columns and
selected by the viewer's `preferredLanguage` at render time. The guest portal must support
PT/EN/ES (it has its own inline string maps under `check-in/[code]/_portal/`).

## Related docs

- [`MODULES.md`](./MODULES.md) · [`DATABASE.md`](./DATABASE.md) · [`CRON.md`](./CRON.md) ·
  [`DEPLOYMENT.md`](./DEPLOYMENT.md) · [`REFACTORING.md`](./REFACTORING.md)
- Root [`../CLAUDE.md`](../CLAUDE.md) for conventions and the "add a module" recipe.
