# Admin pages (`src/app/admin/`)

Back-office. Each module is `src/app/admin/<module>/page.tsx`, a `"use client"` component.

**Pattern**: page (client) → `/api/admin/<module>/route.ts` → `src/services/<domain>-service.ts`
→ Supabase. Pages fetch via the API route; they don't query Supabase for writes directly.

- Identity/property: `useAuth()` (`userData`, `isAdmin`, `isSuperAdmin`) and `useProperty()`
  (`property`, `theme`).
- Gate UI with `<RoleGuard allowedRoles={[...]}>` (`@/components/auth/RoleGuard`).
- Forms: use the `.field-label` / `.field-input` utilities (defined in `globals.css`).
- Realtime: `supabase.channel(...).on('postgres_changes', ...)` in a `useEffect`; tear down
  with `safeRemoveChannel` (both from `@/lib/supabase`).
- Register the route in the nav: `src/components/admin/Sidebar.tsx` (`operacaoItems` or
  `setupItems`).
- Component-local types (props, form state) may live in the page file; shared/domain types go
  in `@/types/aura`.

Full module catalog: `../../../docs/MODULES.md`. Add-a-module recipe: root `CLAUDE.md`.
