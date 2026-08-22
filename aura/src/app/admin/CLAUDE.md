# Admin pages (`src/app/admin/`)

Back-office. Each module is `src/app/admin/<module>/page.tsx`, a `"use client"` component.

**Pattern**: page (client) → `/api/admin/<module>/route.ts` → `src/services/<domain>-service.ts`
→ Supabase. Pages fetch via the API route; they don't query Supabase for writes directly.

- Identity/property: `useAuth()` (`userData`, `isAdmin`, `isSuperAdmin`) and `useProperty()`
  (`property`, `theme`).
- Gate UI with `<RoleGuard allowedRoles={[...]}>` (`@/components/auth/RoleGuard`).
- Realtime: `supabase.channel(...).on('postgres_changes', ...)` in a `useEffect`; tear down
  with `safeRemoveChannel` (both from `@/lib/supabase`).
- Register the route in the nav: `src/components/admin/Sidebar.tsx` (`NAV_GROUPS` — one entry
  per group; `PAINEL_CHILDREN` for the Painel dropdown). Mobile tab bar destinations per role
  live in `ROLE_TABS` (`src/lib/role-routes.ts`).
- Component-local types (props, form state) may live in the page file; shared/domain types go
  in `@/types/aura`.

## Visual identity + kit (MANDATORY — revamp 08/2026)

Every admin page is built with the **Aura kit** (`src/components/aura`, barrel
`import { … } from "@/components/aura"`) on the theme-aware tokens `T`
(`src/lib/admin-tokens.ts` → `var(--t-*)`, palettes in `src/styles/aura-tokens.css`).
Dark and light themes are both first-class: **never hardcode `#1c1c1c` / `rgba(255,255,255,…)`**
— use `T.card`, `T.glass`, `T.border`, `T.text`, `T.muted`, semantic trios
(`T.green/greenBg/greenBorder`…), `T.brandText` for purple text, `alpha(T.x, pct)` for tints
(never `${hex}18` string math — breaks with var()). Brand gradient `T.grad` is literal.

Reference pages: `stays` (pilot), then `hr`, `reception`, `concierge` as they migrate; legacy
exemplars `casamentos`, `comercial/*`, `tarifario` are on T (inline styles) but predate the kit.

The recipe for every page (see the approved plan, "Receita por página"):
1. Root in `<PageShell>`; no page-level padding/max-width (the shell frames with `--page-pad`).
2. `<PageHeader title icon primaryAction={{ label, icon, onClick }} actions tabs>` — primary action
   becomes a FAB on phones (list pages) or use `<BottomActionBar>` on detail/form pages.
3. KPIs → `<KpiGrid cols><KpiCard …/></KpiGrid>` (the only stagger allowed on a page).
4. Filters/search/tabs → `<Toolbar search filters chips>` + `<SearchInput>` + `<FilterChips>` +
   `<SegmentedTabs>` (`useTabParam` for URL sync).
5. Tables → `<DataList columns rows …>` (cards on phones, table on desktop — declare `mobile`
   roles on columns); comparison matrices → `<ScrollMatrix>`; kanbans → one column at a time on
   mobile (column chips).
6. Modals/drawers/sheets → `<Dialog open onClose presentation="auto" size title footer>`
   (sheet on phones for sm/md, fullscreen for lg/xl; modal or drawer (`side`) on desktop).
   With forms: `useCloseGuard(onClose, { open, escape: false })` and `panelProps={guardProps}`.
   Heavy modals → `next/dynamic` with `DialogSkeleton`.
7. Loading → `<Loadable loading skeleton={<SkeletonList/>}>` / `Skeleton*` (never a full-area
   spinner); buttons use `loading`; writes use `toast.promise`.
8. Empty/error → `<EmptyState>` / `<ErrorState onRetry>`.
9. Native `confirm/alert/prompt` are forbidden → `useConfirm()` / `usePrompt()` / `useAlert()`.
10. Hover via CSS (`.ak-press`, `(hover:hover)`), not `onMouseEnter` style mutation.
11. `dvh` not `vh`; no bare `grid-cols-N` without a responsive sibling; inputs ≥16px on phones
    (kit `Field`/`Input` or `.field-input`); every tappable ≥44px; one overlay at a time.
12. Verify at 390 / 768 / 1440, dark + light (cookie `aura-ui-theme`), `prefers-reduced-motion`,
    keyboard (Tab / Esc), realtime in a second tab, `pnpm build`.

Motion rules (Emil primary · Jakub secondary): ≤300ms, content enters once (`.ak-page`),
exits subtler than enters, nothing animates on keyboard/high-frequency actions (tabs, filters,
typing), no infinite pulses, no stagger outside KpiGrid, `prefers-reduced-motion` respected by
the tokens. Kit motion uses `m.*` from `motion/react` under `AuraMotionProvider` (strict LazyMotion).

Full module catalog: `../../../docs/MODULES.md`. Add-a-module recipe: root `CLAUDE.md`.
