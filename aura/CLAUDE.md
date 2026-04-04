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
const { user, userRole } = useAuth();          // src/context/AuthContext.tsx
const { property, theme } = useProperty();     // src/context/PropertyContext.tsx
```

`useAuth()` provides session + role. `useProperty()` provides the active property + its dynamic theme. Role-based UI gating uses the `<RoleGuard>` component in `src/components/auth/`.

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
- Helper: `src/lib/api-auth.ts` for shared auth utilities

### Guest portal

Routes under `src/app/check-in/[code]/` are the guest-facing portal. These pages are mobile-first and must support PT/EN/ES.

### Server actions

Located in `src/app/actions/` (e.g. `dnd-actions.ts`, `concierge-actions.ts`). Used for mutations that don't need a full API route.

### File uploads

Use `src/components/admin/ImageUpload.tsx` with props `value`, `onUploadSuccess`, `path`. Backed by Vercel Blob.
