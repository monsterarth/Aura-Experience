# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # Start development server
pnpm build        # Production build
pnpm start        # Start production server
pnpm lint         # Run ESLint

pnpm db:check     # Verify both databases answer (run this first)
pnpm db:backup    # Manual backup of prod into backups/ (free plan has no backups)
pnpm db:mirror    # Rebuild the DEV Supabase project as a copy of prod
pnpm db:diff      # Compare prod vs DEV — proves the mirror is faithful
pnpm db:sql <f>   # Apply a .sql file — DEV by default, --target prod for production
pnpm env:dev      # Point .env.local at the DEV project (env:prod switches back)
```

Database tooling runs `pg_dump`/`psql` from a Docker image — nothing to install. See
`docs/DEV-DATABASE.md`.

No test framework is configured. Use `pnpm build` to catch type errors.

## Architecture

**Stack**: Next.js 14 App Router · Supabase (Postgres + Auth + Realtime + Storage) · TypeScript · Tailwind CSS · Sonner (toasts)

### Roles

`UserRole` (defined in `src/types/aura.ts`): `super_admin` · `admin` · `manager` · `reception` · `governance` · `maid` · `maintenance` · `technician` · `kitchen` · `waiter` · `porter` · `houseman` · `marketing` · `compras`

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
| `daily-lodging` | `15 8 * * *` | 08:15 daily (lança diárias vencidas no fólio) |
| `wedding-status` | `30 8 * * *` | 08:30 daily (casamento confirmado que passou → realizado) |
| `crm-status` | `45 8 * * *` | 08:45 daily (orçamento com prazo/data vencidos → perdido) |

Other cron-style routes exist in code but are **not** in `vercel.json` (triggered manually/externally): `process-messages`, `whatsapp-watchdog`, `housekeeping-routines`, `hsystem-sync` (polling do HUNIT — cron externo a cada 1–5 min; ver módulo Hsystem abaixo). All cron routes check the `CRON_SECRET` header in production. Details in `docs/CRON.md`.

**Hsystem (channel manager)**: módulo em `src/services/hsystem-service.ts` + `src/lib/hunit.ts` (protocolo XML do HUNIT) + página `/admin/hsystem`. Flag `settings.hasHsystem` (super_admin) e config em `settings.hsystemConfig`; credenciais no cofre `property_secrets`. Dois modos: `shadow` (espelha reservas sem confirmar nem enviar disponibilidade — produção em paralelo com o HMAX) e `active` (fluxo completo — sandbox de homologação / pós-troca de PMS). Reserva entra por categoria e o service encaixa sozinho numa cabana livre (`categoryMap`); estadia importada carrega `source`/`externalId`/`externalRoomId`.

**WhatsApp watchdog**: `process-messages` also runs `WhatsAppHealthService` inline — real sends failing with the dead-session signature trigger an automatic Evolution restart via the Coolify API (`COOLIFY_API_URL/TOKEN/EVOLUTION_SERVICE_UUID` envs) plus admin push alerts; the session card in Configurações → Integrações gains a "Reiniciar Evolution" button when those envs are set. Only real sends / probe timeouts are trusted signals — Evolution's `connectionState`/`fetchInstances` lie optimistically.

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

Use `src/components/admin/ImageUpload.tsx` with props `value`, `onUploadSuccess`, `path`. Backed by Supabase Storage (bucket `images`) via `/api/upload`.

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
- `docs/DEV-DATABASE.md` — projeto Supabase de DEV (espelho de produção), backups manuais e o
  modo seguro que transforma envios externos em log fora de produção.
- `docs/DEPLOYMENT.md` — Vercel + Supabase setup, env vars, migration order, `whatsapp-service`.
- `docs/FINANCE.md` — plano do módulo financeiro (antecipações, caixa diário, movimento, previsão
  de receita, RevPAR/ADR, a receber/a pagar, DRE). Não iniciado. **O AURA hoje NÃO é fonte da
  verdade financeira** — o dinheiro é controlado no HMAX e a virada é por data de corte, com
  período de lançamento duplo. Gap fundador: a forma de pagamento é texto livre na descrição do
  crédito do fólio.
- `docs/EVENTS-V2.md` — plano de conserto/refatoração do módulo de Eventos (7 fatias) que precede
  a escrita do parceiro na tabela `events`. Traz os débitos medidos em produção (type='internal'
  em 8/13, RLS `USING(true)`, multi-dia quebrado em 5 call sites) e o que foi deliberadamente
  CORTADO do modelo do parceiro.
- `docs/ALTAMARE.md` — integração com o sistema do restaurante Altamare (eventos/casamentos):
  AURA expõe `/api/partner/*` e o parceiro consome; AURA é fonte da verdade de data/espaço e
  **valores nunca cruzam**. Em construção; cascata de status ainda a definir.
- `docs/GUARITA.md` — plano do módulo Guarita/Estacionamento: registro de veículos com tarifa
  flutuante por dia, painel operacional (chegadas/saídas/entregas) e app do `porter`. Não iniciado.
  É a primeira entrega que TIRA um processo do HMAX em vez de duplicá-lo (o lançamento de lá só
  serve ao faturamento — não há emissão fiscal envolvida).
- `docs/FISCAL.md` — plano da emissão fiscal própria (NFS-e + NFC-e via API terceirizada), o último
  pré-requisito para largar o HMAX. Não iniciado; traz as perguntas que dependem da contabilidade.
- `docs/HOUSEKEEPING-V2.md` — estudo do motor de faxinas, com medição de produção (01/09/2026):
  56% das tarefas são criadas à mão e **metade das automáticas de `daily`/vistoria é cancelada**.
  Traz a ideia de o motor SUGERIR em vez de criar, o gatilho `fixed_interval_days` que nunca rodou
  (cron `housekeeping-routines` sem chamador) e as 3 perguntas que dependem da governanta. **Não
  religar aquele cron antes de decidir o modelo.**
- `docs/REFACTORING.md` — plan for splitting the largest files (not yet executed).
- `docs/CLEANUP.md` — escopo de faxina levantado em 29/08/2026 (61 achados verificados: código morto,
  dependências não usadas, duplicação, E/S redundante), organizado em ondas para uma sprint dedicada.
  Não iniciado. **A Onda 0 é segurança** (segredo de produção commitado em `scripts/dev/`, `/api/media`
  como proxy aberto sem auth, chave GCP órfã) — atacar antes do resto. Traz também as regras de
  "isto parece morto mas não é" (cron externo, webhook, rota montada por string).
- `docs/MODULARIZATION.md` — core × módulos / planos por propriedade. Execution deferred, but its **section 1 rules apply NOW** to all new code: new module → settings flag day one; core flows never hard-depend on module tables (soft check, default ON — `stock-integration.ts` pattern); new crons skip properties without the module.

Area-specific `CLAUDE.md` files are auto-loaded when working in: `src/services/`, `src/app/admin/`, `src/app/api/`, `src/app/check-in/`.

**Setup**: copy `.env.example` → `.env.local` and fill in the values.
