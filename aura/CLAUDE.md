# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # Start development server
pnpm build        # Production build
pnpm start        # Start production server
pnpm lint         # Run ESLint
```

No test framework is configured. Use `pnpm build` to catch type errors.

## Architecture

**Stack**: Next.js 14 App Router · Supabase (Postgres + Auth + Realtime) · TypeScript · Tailwind CSS · Zustand · Sonner (toasts) · Vercel Blob (file uploads)

### Roles

`UserRole` (defined in `src/types/aura.ts`): `super_admin` · `admin` · `manager` · `reception` · `governance` · `maid` · `maintenance` · `technician` · `kitchen` · `waiter` · `porter` · `houseman` · `marketing`

### Key conventions

- **Shared/domain types** live in `src/types/aura.ts` — add cross-cutting interfaces (entities like `Stay`, `Guest`, `Cabin`; enums like `UserRole`) there. Types purely local to one page/component (props, form state, view models) may stay colocated in that file.
- **DB columns are mostly camelCase** (quoted identifiers, e.g. `propertyId`, `startDate`, `checkIn`). A few legacy tables — Food & Beverage (`fb_*`) and breakfast — use snake_case (`property_id`, `ala_carte`). Match the table you're querying; don't assume.
- **One service file per domain** in `src/services/` (e.g. `stay-service.ts`, `event-service.ts`). Prefer business logic in services over pages/API routes (older large pages don't always follow this — see `docs/REFACTORING.md`).
- **i18n is inline**: translation fields are stored as `name`/`name_en`/`name_es` columns in the DB and matched by `preferredLanguage` at render time. There is no i18n library.
- **CSS utilities**: `.field-label` and `.field-input` are defined in `globals.css` `@layer components` — use these for form fields throughout admin pages.
- **Path alias**: `@/*` maps to `src/*`.

### Auth & property context

Every admin page is a `"use client"` component that calls:

```typescript
const { userData, isAdmin, isSuperAdmin } = useAuth();  // src/context/AuthContext.tsx
const { property, theme } = useProperty();              // src/context/PropertyContext.tsx
```

`useAuth()` returns `userData` (a `Staff` object with `.role`), plus `isAdmin`/`isSuperAdmin` booleans. `useProperty()` provides the active property + its dynamic theme. Role-based UI gating uses the `<RoleGuard>` component in `src/components/auth/`.

### Supabase clients — use the right one

Never call `createClient()` from `@supabase/supabase-js` directly — always go through one of these:

| Need | Import |
|---|---|
| Browser / client component (queries + realtime) | `import { supabase } from '@/lib/supabase'` — shared browser singleton (iframe-aware, custom lock logic) |
| Admin / service-role, bypasses RLS (**server only**) | `import { supabaseAdmin } from '@/lib/supabase'` — `null` on the browser; use in API routes, services, server actions |
| Server component / route acting as the logged-in user (RLS-respecting) | `createClientServer()` from `@/lib/supabase-server` (cookie-based) |
| Middleware | `@/lib/supabase-middleware` |
| Safe realtime channel teardown | `safeRemoveChannel(channel, subscribed)` from `@/lib/supabase` |

> `src/lib/supabase-browser.ts` is the low-level browser factory (lock-with-steal logic), consumed via `@/lib/supabase` — don't import it directly unless you know why.

### Admin pages

- Route: `src/app/admin/<module>/page.tsx`
- Pattern: client component → calls API route (`/api/admin/<module>`) → service layer → Supabase
- Realtime updates via `supabase.channel('name').on('postgres_changes', ...)` inside `useEffect`
- Navigation entries go in `src/components/admin/Sidebar.tsx` (two sections: `operacaoItems` + `setupItems`)

### API routes

- Route: `src/app/api/admin/<module>/route.ts`
- Always validate the session server-side before returning data
- Use `supabaseAdmin` (service role) for data queries that need to bypass RLS
- Use `requireAuth` + `isAuthError` from `src/lib/api-auth.ts`:

```typescript
const auth = await requireAuth(['admin', 'manager']);
if (isAuthError(auth)) return auth;
// auth.staff.role, auth.staff.propertyId are now available
```

### Cron jobs

Scheduled in `vercel.json` (UTC):

| Route (`src/app/api/cron/…`) | Schedule | When |
|---|---|---|
| `daily-automations` | `0 11 * * *` | 11:00 daily |
| `daily-housekeeping` | `10 20 * * *` | 20:10 daily |
| `maintenance` | `20 20 * * *` | 20:20 daily (preventivas) |
| `evening-revalidation` | `30 20 * * *` | 20:30 daily |
| `breakfast-attendance` | `0 8 * * *` | 08:00 daily |
| `stock-expiry` | `0 9 * * *` | 09:00 daily |
| `asset-depreciation` | `0 5 1 * *` | 05:00 on the 1st |

Other cron-style routes exist in code but are **not** in `vercel.json` (triggered manually/externally): `process-messages`, `housekeeping-routines`. All cron routes check the `CRON_SECRET` header in production. Details in `docs/CRON.md`.

### Mobile / field-staff apps

Separate Next.js route groups for operational mobile use (not under `/admin`):

| Route | Role |
|---|---|
| `src/app/governanta/` | `governance` |
| `src/app/maid/` | `maid` |
| `src/app/waiter/` | `waiter` |
| `src/app/houseman/` | `houseman` |
| `src/app/maintenance/` | `technician` (execução em campo; coordenador também acessa) |
| `src/app/maintenance-ops/` | `maintenance` (console de gestão do coordenador) |

Field mutations go through `/api/field/*` routes (POST, service-role) via the `postFieldAction`
helper in `src/lib/field-api.ts` — never direct browser Supabase writes (they hang on the cold
lock; see `field-app-browser-write-hangs` history).

These pages use API routes (not the admin pattern) and each has its own `layout.tsx` with auth guards.

**RoleGuard convention for mobile layouts**: always include `"super_admin"`, `"admin"`, and `"manager"` alongside the role-specific role so that managers can access field-staff pages without being blocked:

```typescript
<RoleGuard allowedRoles={["governance", "super_admin", "admin", "manager"]} redirectTo="/admin/login">
```

### Guest portal

Routes under `src/app/check-in/[code]/` are the guest-facing portal. These pages are mobile-first and must support PT/EN/ES.

### Server actions

Located in `src/app/actions/` (e.g. `dnd-actions.ts`, `concierge-actions.ts`). Used for mutations that don't need a full API route.

### File uploads

Use `src/components/admin/ImageUpload.tsx` with props `value`, `onUploadSuccess`, `path`. Backed by Vercel Blob.

### Where things live (repo map)

| Path | What |
|---|---|
| `src/app/admin/<module>/` | Admin back-office pages (client components) |
| `src/app/api/<area>/.../route.ts` | API routes — `admin/`, `guest/`, `cron/`, `push/`, `webhook/`, … |
| `src/app/{governanta,maid,waiter,houseman,maintenance,director}/` | Role-specific mobile field apps |
| `src/app/check-in/[code]/` | Guest-facing portal (mobile-first, PT/EN/ES) |
| `src/app/actions/` | Server actions |
| `src/services/` | One file per domain — business logic + Supabase queries |
| `src/types/aura.ts` | Shared/domain types and enums |
| `src/lib/` | Supabase clients, `api-auth.ts`, push, utilities |
| `src/context/` | `AuthContext`, `PropertyContext`, `NotificationContext` |
| `src/components/{admin,auth,guest,ui}/` | Shared components |
| `migrations/` | SQL applied manually to Supabase (see `migrations/README.md`) |
| `whatsapp-service/` | Standalone WhatsApp (whatsapp-web.js) container |
| `docs/` | Deeper reference docs (see index below) |

### Recipe: add a new admin module

1. **Type** — add the entity interface to `src/types/aura.ts`.
2. **Service** — create `src/services/<domain>-service.ts` exporting a `XyzService` object with async methods (Supabase queries live here).
3. **API** — create `src/app/api/admin/<module>/route.ts`; guard with `requireAuth([...roles])` + `isAuthError`, use `supabaseAdmin` for RLS-bypassing reads, delegate to the service.
4. **Page** — create `src/app/admin/<module>/page.tsx` (`"use client"`); use `useAuth()`/`useProperty()`, fetch via the API route, gate UI with `<RoleGuard>`, use `.field-label`/`.field-input` for forms.
5. **Nav** — register the route in `src/components/admin/Sidebar.tsx` (`operacaoItems` or `setupItems`).
6. **Realtime** (optional) — subscribe via `supabase.channel(...)` in a `useEffect`; tear down with `safeRemoveChannel`.
7. Verify with `pnpm build`.

### Documentation index

Deeper docs live in `docs/`, read on demand:

- `docs/ROADMAP.md` — prospective product roadmap (Now/Next/Later) + the 26/06 direction-meeting evaluation. The DB changelog (`/admin/changelog`) is retrospective; this is where we're going.
- `docs/ARCHITECTURE.md` — system overview, auth flow, multi-property model, realtime, notification stack, uploads.
- `docs/MODULES.md` — catalog of every admin module, mobile app, portal page and API group (route · role · service).
- `docs/DATABASE.md` — table glossary + ERD + RLS overview.
- `docs/CRON.md` — cron runbook.
- `docs/DEPLOYMENT.md` — Vercel + Supabase setup, env vars, migration order, `whatsapp-service`.
- `docs/REFACTORING.md` — plan for splitting the largest files (not yet executed).

Area-specific `CLAUDE.md` files are auto-loaded when working in: `src/services/`, `src/app/admin/`, `src/app/api/`, `src/app/check-in/`.

**Setup**: copy `.env.example` → `.env.local` and fill in the values.
