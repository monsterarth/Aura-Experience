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

- **All types** live in `src/types/aura.ts` — add new interfaces there, not in local files.
- **DB columns use camelCase** — e.g. `propertyId`, `startDate`, `checkIn`. Never snake_case.
- **One service file per domain** in `src/services/` (e.g. `stay-service.ts`, `event-service.ts`). Business logic goes in services, not in pages or API routes.
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

| Context | Import |
|---|---|
| Client component / browser | `src/lib/supabase-browser.ts` (has custom lock logic — don't bypass) |
| Server component / API route | `src/lib/supabase-server.ts` |
| Admin operations (service role) | `supabaseAdmin` from `src/lib/supabase-server.ts` |
| Middleware | `src/lib/supabase-middleware.ts` |

Never call `createClient()` from `@supabase/supabase-js` directly.

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

Routes under `src/app/api/cron/` are triggered by Vercel Cron: `daily-housekeeping`, `daily-automations`, `process-messages`, `housekeeping-routines`, `maintenance`, `breakfast-attendance`, `evening-revalidation`.

### Mobile / field-staff apps

Separate Next.js route groups for operational mobile use (not under `/admin`):

| Route | Role |
|---|---|
| `src/app/governanta/` | `governance` |
| `src/app/maid/` | `maid` |
| `src/app/waiter/` | `waiter` |
| `src/app/houseman/` | `houseman` |
| `src/app/maintenance/` | `maintenance` / `technician` |

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
