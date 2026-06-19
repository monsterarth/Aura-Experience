# Refactoring plan (not yet executed)

The codebase grew organically; ~20 files exceed 800 lines and mix UI + state + business logic
in a single `page.tsx` / component. This document is a **plan only** — no code has been split
yet. Tackle it **incrementally, one file at a time**, and because there is **no automated test
suite**, verify each step with `pnpm build` (type-check) **and** a manual pass in the preview
before moving on.

## The big files

| Lines | File | Category |
|------:|------|----------|
| 2404 | `src/app/governanta/page.tsx` | Mobile field app |
| 1983 | `src/app/admin/concierge/page.tsx` | Admin page |
| 1913 | `src/app/director/page.tsx` | Mobile field app |
| 1831 | `src/app/check-in/form/[stayId]/page.tsx` | Guest portal |
| 1679 | `src/types/aura.ts` | Central types |
| 1656 | `src/app/maid/page.tsx` | Mobile field app |
| 1469 | `src/app/admin/core/properties/[id]/page.tsx` | Admin page |
| 1446 | `src/app/maintenance/page.tsx` | Mobile field app |
| 1431 | `src/app/check-in/[code]/breakfast/page.tsx` | Guest portal |
| 1215 | `src/app/admin/escalas/page.tsx` | Admin page |
| 1213 | `src/app/admin/reservation-map/ReservationMapClient.tsx` | Admin component |
| 1209 | `src/app/page.tsx` | Landing |
| 1207 | `src/app/admin/guests/page.tsx` | Admin page |
| 1202 | `src/components/admin/CommunicationCenter.tsx` | Mega-modal |
| 1130 | `src/app/maintenance-ops/page.tsx` | Mobile field app |
| 1120 | `src/components/admin/StayDetailsModal.tsx` | Mega-modal |
| 1075 | `src/app/admin/food-and-beverage/orders/page.tsx` | Admin page |
| 1049 | `src/app/admin/stays/[stayId]/page.tsx` | Admin page |
| 1044 | `src/app/admin/food-and-beverage/menu/page.tsx` | Admin page |
| 1027 | `src/app/admin/casamentos/page.tsx` | Admin page |

(Plus several in the 800–1000 range: `governance`, `cabins`, `calendario`, `eventos`, `hr`,
`cafe-salao`, `waiter`, `houseman`, `Sidebar.tsx`, `stay-service.ts`.)

## A good model already in the repo

`src/app/check-in/[code]/` is the example to copy: it splits a complex surface into `_portal/`
(context + strings), `map/hooks/`, `map/utils/`, and per-page components. Aim for that shape.

## Split patterns by category

**Mobile field apps & giant admin pages** (governanta, maid, director, maintenance, concierge,
escalas, guests, properties/[id]):
1. Extract each tab/section into its own component under a local `components/` folder.
2. Move data fetching + realtime subscriptions into custom hooks (`hooks/use<Thing>.ts`).
3. Push business logic and Supabase calls down into the relevant `*-service.ts` (via the API
   route), so the page only orchestrates.
4. Move each modal into its own file.

**Mega-modals** (`CommunicationCenter`, `StayDetailsModal`): break into sub-components per
section; lift data logic into a hook or service; keep the modal as a thin shell.

**`src/types/aura.ts`** (1679 lines): split into per-domain files under `src/types/` (e.g.
`stay.ts`, `stock.ts`, `fb.ts`, `survey.ts`) and turn `aura.ts` into a **barrel** that
re-exports them (`export * from './stay'`). Existing `@/types/aura` imports keep working, so
this is mechanical and low-risk — a good first move.

## Suggested order (risk × leverage)

1. **`aura.ts` → barrel** — mechanical, no behavior change, helps every file that imports it.
2. **Mega-modals** — self-contained; splitting them de-risks the pages that use them.
3. **Highest-churn pages first** — refactor a page the next time you're already changing it
   (e.g. `concierge`, `guests`, `stays/[stayId]`), rather than in a big-bang pass.
4. **Mobile field apps** last — largest and most stateful; do one tab at a time.

## Guardrails

- One file per change set; `pnpm build` + manual preview after each.
- Don't change behavior while splitting — pure extraction first, improvements later.
- When moving logic into services, prefer extending an existing `*-service.ts` over creating
  parallel helpers.
