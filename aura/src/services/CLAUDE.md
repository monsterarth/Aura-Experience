# Services (`src/services/`)

One file per domain. A service exports a named object (e.g. `StayService`) of async methods
that hold the **business logic + Supabase queries** for that domain. API routes and server
actions call services; **services don't import React**.

- Use `supabaseAdmin` (from `@/lib/supabase`) for server-side queries; never the browser
  client here.
- Types come from `@/types/aura` — don't redefine domain types locally.
- Keep logic here rather than in pages/routes (older large pages don't always follow this —
  see `../../docs/REFACTORING.md`).

## Regra do fólio

Toda escrita em `folio_items` passa por `assertFolioOpen(stayId)` (`@/lib/folio-guard`):
conta com `billClosedAt` não recebe lançamento de ninguém — balcão, garçom, frigobar da
camareira, concierge ou cron das diárias. Um caminho novo de cobrança que não chame o guard
é um furo. As portas existentes são `StayService.addFolioItemManual`,
`FinanceService.addPayment` e `FinanceService.postForStayRow` (esta pula em silêncio, é
varredura); rotas traduzem o erro `FOLIO_CLOSED` para HTTP 409.

## Domains

`stay` · `guest` · `cabin` · `structure` · `property` · `event` · `wedding` · `contact`
`housekeeping` · `maintenance` · `staff` (schedules)
`fb` (food & beverage) · `breakfast-salon`
`stock` · `inventory` · `purchase` · `supplier` · `asset` · `stock-integration`
`concierge` · `survey` · `fnrh` (check-in forms)
`automation` · `chatwoot` · `message-queue` · `changelog` · `audit`

New domain → create `<domain>-service.ts`, add the entity to `aura.ts`, expose it via an API
route under `src/app/api/admin/<module>/`. See the recipe in the root `CLAUDE.md`.
