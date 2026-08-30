# Module catalog

A map of every surface and the service that backs it. **Access control** is enforced per API
route via `requireAuth([...roles])` — treat each route's `requireAuth` call as the source of
truth for roles. As a rule: setup/`core` modules are admin/super_admin; operational modules
are admin/manager (+ the relevant operational role).

## Admin back-office (`src/app/admin/<module>/`)

| Module (route) | Backing service(s) | Purpose |
|----------------|--------------------|---------|
| `core/properties` (+`[id]`) | `property-service` | Property setup, theme, config (super_admin) |
| `core/structures` (+`bookings`) | `structure-service` | Bookable structures + availability |
| `core/resort-map` · `reservation-map` · `map-pois` | `stay-service`, map APIs | Illustrated resort map, reservation grid, POIs |
| `core/dashboard` · `dashboard` | — | Operational dashboards (two entry points exist) |
| `stays` (+`[stayId]`, `new`) | `stay-service`, `stay-timeline-service` | Reservations / stays (the core entity). A ficha completa traz o **Histórico** — extrato que junta as dez tabelas com `stayId` (auditoria, faxina, estruturas, concierge, pesquisa, café, manutenção, guarita, restaurante e as diárias do fólio) via `/api/admin/stays/timeline` |
| `guests` | `guest-service` | Guest records (`fnrh-service` for check-in forms) |
| `contacts` | `contact-service` | CRM-style contacts |
| `cabins` | `cabin-service` | Cabins / units |
| `calendario` | `stay-service`, `structure-service` | Calendar of stays, bookings, birthdays |
| `reception` | — (`/api/admin/reception`) | Front-desk dashboard (folios, breakfast) |
| `eventos` | `event-service` | Events |
| `casamentos` | `wedding-service` | Weddings (vendors, installments, cabins) |
| `tarifario` | `rate-service` + `lib/rate-engine` | Tarifário: orçamentos (cascata do SIT), tabelas de preço, regras de calendário, config comercial + import do backup SIT |
| `governance` (+`kanban`) | `housekeeping-service` | Housekeeping tasks + rules |
| `maintenance` (+`kanban`) | `maintenance-service` | Maintenance tasks + rules |
| `houseman` | — | Houseman/porter admin view |
| `food-and-beverage` (`menu`, `orders`) | `fb-service` | Restaurant menu + orders |
| `cafe-salao` (+`kds`) | `breakfast-salon-service` | Breakfast salon, tables, kitchen display |
| `estoque` (`produtos`, `inventario`, `compras`, `fornecedores`, `movimentacoes`, `perdas`, `configuracoes`) | `stock-service`, `inventory-service`, `purchase-service`, `supplier-service`, `nfe-import-service`, `stock-integration` | Inventory / procurement (see [[stock-module]]). `compras` também lança a nota pelo **XML da NF-e** (`nfe-import-service` + `lib/nfe.ts`, rota `api/admin/estoque/purchases/import`): lê o XML ou o ZIP do contador, casa fornecedor pelo CNPJ e produto pelo de-para `supplier_product_map`, e cria a compra em rascunho |
| `patrimonio` | `asset-service` | Fixed assets: ficha, depreciation, disposal, movements, QR plaque |
| `patrimonio/[id]` | `asset-service` | Asset detail sheet (maintenance, movements, depreciation ledger, audit) |
| `patrimonio/inventario` | `asset-inventory-service` | Physical asset count by location (scan or type the plaque code) |
| `patrimonio/relatorios` | `asset-report-service` | Position, depreciation ledger, warranties, maintenance cost, disposals |
| `patrimonio/etiquetas` | `asset-service` | A4 sheet of QR labels for the physical plaques |
| `surveys` (`new`, `edit`, `curated`, `responses`, `area-reviews`) | `survey-service` | Guest surveys (Survey 2.0) + area reviews |
| `comunicacao` (`automations`, `automations/settings`) | `automation-service`, `chatwoot-service`, `message-queue-service` | Automated messaging, templates, WhatsApp |
| `staff` · `hr` | `staff-service` | Staff records, HR |
| `escalas` (+`mensal`) | `staff-service` (schedules) | Work schedules / shifts |
| `perfil` (`configuracoes`, `[staffId]`) | `staff-service` | User profile + settings |
| `changelog` | `changelog-service` | Product changelog editor |
| `logs` | `audit-service` | Audit log viewer |
| `mobile-apps` (+`[app]`) | — | Hub describing the field apps |

## Mobile field apps (own route group + `layout.tsx` with `RoleGuard`)

| Route | Role(s) allowed (besides super_admin/admin/manager) |
|-------|------------------------------------------------------|
| `governanta/` | `governance` |
| `maid/` | `maid` |
| `waiter/` | `waiter` |
| `houseman/` | `houseman` |
| `maintenance/` | `maintenance`, `technician` |
| `director/` | management/executive view |

Field apps call `/api/field/*` (e.g. `housekeeping-tasks`, `maintenance-tasks`, `cabins`) and
`/api/director/dashboard`, not the admin pattern.

## Guest portal (`src/app/check-in/[code]/`)

Mobile-first, no login (access by stay code), PT/EN/ES. Shared state/strings live in
`check-in/[code]/_portal/`. Main pages: home (`page.tsx`), `breakfast`, `structures`,
`events`, `map` (illustrated map with GPS), `concierge`, and the pre-check-in `form/[stayId]`.
Backed by `/api/guest/*` (`today`, `breakfast-menu`, `breakfast-orders`, `structures`,
`structure-slots`, `structure-bookings`, `structure-reviews`, `resort-map`, `survey`, …).

## Proposta pública (`src/app/cotacao/[id]/`)

Link anônimo que o vendedor manda ao cliente (o id do orçamento é a credencial), em
PT/EN/ES. Três telas no `ProposalClient`: escolher a cabana de cada acomodação e **aceitar**
→ **cadastro do titular** (`IntakeForm` — nome/documento/nascimento, endereço via CEP,
acompanhantes, placa, pet, condição de pagamento, consentimento LGPD) → confirmação.
`?cadastro=1` abre direto no cadastro (link que a recepção copia no drawer do lead).

O aceite é gravado no clique, antes do cadastro — abandonar o formulário não desfaz nada.
Enviado o cadastro, `rate_quotes.intakeAt` **trava** o link; correção é da recepção, pelo
`IntakePanel` do drawer (`/api/admin/tarifario/quotes/intake`).

Tudo passa por `RateQuotePublicService` (allowlist campo a campo — nunca a linha crua) via
as server actions de `src/app/actions/quote-actions.ts`. Na conversão, o cadastro
pré-preenche a ficha do hóspede (nascimento/endereço) e a estadia (placa, nomes dos
acompanhantes, pet) — ver `RateService.ensureGuestForQuote` e `linkQuoteToStay`.

## API groups (`src/app/api/`)

| Group | Purpose |
|-------|---------|
| `admin/*` | Back-office endpoints (most modules above) |
| `guest/*` | Public guest-portal endpoints |
| `field/*` | Mobile field-app endpoints |
| `director/*` | Executive dashboard |
| `cron/*` | Scheduled jobs — see [`CRON.md`](./CRON.md) |
| `push/*` | Web-push subscribe / send / notify |
| `webhook/*`, `chatwoot/*`, `chat/*`, `whatsapp/*` | Messaging integrations |
| `ai/*` | Gemini-backed features (e.g. review summaries) |
| `upload/*`, `media/*` | Vercel Blob uploads |
| `broadcast/*` | Bulk messaging |
| `auth/*`, `admin/auth/*` | Sign-in/out, session (`me` fast-path) |
