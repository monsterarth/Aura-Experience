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

## Visual identity (MANDATORY for new pages)

Every NEW admin page is born in the consolidated visual identity. Reference
implementations: `concierge/page.tsx`, `casamentos/page.tsx` (+ the `T` token
object in `casamentos/_components/lib.tsx`) and `hr/page.tsx`. Do NOT build
these screens on the generic theme classes (`bg-card`/`text-muted-foreground`)
as the primary language — they don't produce this look.

The language, in short:
- Fixed dark surfaces: cards `#1c1c1c` (`T.card`), "glass" fills
  `rgba(255,255,255,.035/.055/.08)`, hairline borders `rgba(255,255,255,.07/.13)`.
- Brand gradient purple→teal (`#9b6dff → #4ec9d4`) for primary actions and
  highlights (`T.grad`/`T.gradSoft`); semantic accents as color/bg`.08`/border`.22`
  trios (green/amber/blue/red/violet/rose/orange).
- Typography: 900-weight titles with negative letter-spacing; section labels
  9–10px, weight 800, uppercase, wide letter-spacing; pills radius 999.
- Radii 10–20px; KPI cards with icon tile + radial glow; `fade-in` entry
  animations; hover via border-color/glass shifts.
- Implemented with inline styles + a token object (the exemplar pattern).

The token object lives in `src/lib/admin-tokens.ts` (`T` — casamentos' lib
re-exports it; the claude.ai/design "aura-design-system" mirrors it). The
`/admin/comercial/*` pages are fully on this identity and are good copy
sources alongside the exemplars. Restyling remaining OLD pages is a gradual
effort — no rush, done page by page when touched; new pages start compliant.

Full module catalog: `../../../docs/MODULES.md`. Add-a-module recipe: root `CLAUDE.md`.
