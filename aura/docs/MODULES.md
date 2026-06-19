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
| `stays` (+`[stayId]`, `new`) | `stay-service` | Reservations / stays (the core entity) |
| `guests` | `guest-service` | Guest records (`fnrh-service` for check-in forms) |
| `contacts` | `contact-service` | CRM-style contacts |
| `cabins` | `cabin-service` | Cabins / units |
| `calendario` | `stay-service`, `structure-service` | Calendar of stays, bookings, birthdays |
| `reception` | — (`/api/admin/reception`) | Front-desk dashboard (folios, breakfast) |
| `eventos` | `event-service` | Events |
| `casamentos` | `wedding-service` | Weddings (vendors, installments, cabins) |
| `governance` (+`kanban`) | `housekeeping-service` | Housekeeping tasks + rules |
| `maintenance` (+`kanban`) | `maintenance-service` | Maintenance tasks + rules |
| `houseman` | — | Houseman/porter admin view |
| `food-and-beverage` (`menu`, `orders`) | `fb-service` | Restaurant menu + orders |
| `cafe-salao` (+`kds`) | `breakfast-salon-service` | Breakfast salon, tables, kitchen display |
| `estoque` (`produtos`, `inventario`, `compras`, `fornecedores`, `movimentacoes`, `perdas`, `configuracoes`) | `stock-service`, `inventory-service`, `purchase-service`, `supplier-service`, `stock-integration` | Inventory / procurement (see [[stock-module]]) |
| `patrimonio` | `asset-service` | Fixed assets + depreciation |
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
