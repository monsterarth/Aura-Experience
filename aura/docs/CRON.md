# Cron jobs — runbook

All cron handlers live in `src/app/api/cron/<name>/route.ts`, respond to **GET**, and in
production require the header `Authorization: Bearer $CRON_SECRET` (the check is skipped in
development). Each one iterates over **all properties**, has `maxDuration = 60`, and writes a
success/failure entry to `audit_logs` (`userId='cron'`, `userName='Sistema (Cron)'`,
`entity='CRON'`) — so the audit log is the first place to look when debugging a run.

Schedules in `vercel.json` are **UTC**. The resort runs on BRT (UTC−3), so e.g. `20:10 UTC`
≈ `17:10 BRT`.

## Scheduled in `vercel.json`

| Name | Schedule (UTC) | What it does |
|------|----------------|--------------|
| `daily-automations` | `0 11 * * *` | Queues WhatsApp automation messages |
| `rh-materialize` | `0 6 * * *` | Gera a escala materializada do mes corrente e dos dois seguintes, por propriedade com o modulo `rh` ligado |
| `daily-housekeeping` | `10 20 * * *` | Generates next-day housekeeping tasks |
| `maintenance` | `20 20 * * *` | Materializes recurring maintenance rules/tasks (preventivas) |
| `evening-revalidation` | `30 20 * * *` | Re-syncs queued pre-checkout messages |
| `breakfast-attendance` | `0 8 * * *` | Builds the day's breakfast attendance list |
| `stock-expiry` | `0 9 * * *` | Flags expiring batches, auto-loss if enabled |
| `asset-depreciation` | `0 5 1 * *` | Monthly asset depreciation entries |
| `daily-lodging` | `15 8 * * *` | Posts due nightly lodging charges (diárias) to stay folios |
| `wedding-status` | `30 8 * * *` | Past **confirmed** → `completed`; past **tentative** → `lost` |
| `crm-status` | `45 8 * * *` | Archives stale reservation quotes (`rate_quotes`) as `lost` |

### `daily-automations`
For each property: loads active `automation_rules` (those with a `templateId`) and
`message_templates`, scans stays in `pending` / `pre_checkin_done` / `active`, and enqueues
messages whose trigger offset (N days before check-in / after check-out, etc.) matches today.
Uses `AutomationService` + `ChatwootService`. **Writes to** `messages`.

### `daily-housekeeping`
Generates tasks for **tomorrow** via `lib/housekeeping-rule-engine` (`applyCheckinDayRules`,
`applyCheckoutDayRules`, plus daily rules): check-in inspections, pre-checkout change-cleans,
etc. Skips properties with no active `housekeeping_rules`. Includes active stays + late
check-ins. **Writes to** `housekeeping_tasks`.

### `evening-revalidation`
Phase A: cancels orphan `pre_checkout` messages whose stay was extended/changed (checkout no
longer = tomorrow). Phase B: queues missing `pre_checkout` messages for stays created/edited
after the morning run. Uses `AutomationService`. **Writes to** `messages`.

### `breakfast-attendance`
For each property: ensures a `breakfast_sessions` row for today (created `closed` — the waiter
opens it manually), then creates `breakfast_attendance` rows for every `active` stay not
checking out today (deduped). **Writes to** `breakfast_sessions`, `breakfast_attendance`.

### `stock-expiry`
For each property: reads `stock_settings` (`expiryAlertLeadDays`, `autoLossOnExpiry`), finds
expiring/expired batches via `StockService.getExpiringBatches`. If `autoLossOnExpiry` is on,
registers automatic `loss` movements (`lossType='expiry'`) for expired batches. **Writes to**
stock movements/balances.

### `maintenance`
For each property: materializes due `maintenance_rules` into `maintenance_tasks` and clones
`isRecurring` parent tasks per their `recurrenceRule` (daily/weekly/monthly). Dedup per day by
`(recurrenceSourceId, recurrenceDate)`. **Writes to** `maintenance_tasks`, `maintenance_rules`
(`lastTriggeredAt`).

### `asset-depreciation`
Monthly. Posts linear depreciation for the current period (`YYYY-MM`) for each property via
`AssetService.runDepreciation`. **Idempotent** per `(assetId, period)`. **Writes to**
`asset_depreciation_entries`.

### `wedding-status`
Runs at 08:30 UTC and closes both ends of the funnel, using the property-local date
(America/Sao_Paulo):
- `confirmed` + date passed → `completed` (`WeddingService.completePastWeddings`)
- `tentative` + date passed → `lost`, reason "Data passou sem confirmação"
  (`WeddingService.archiveLapsedNegotiations`)
- `tentative` + `expiresAt` passed → `lost`, reason "Prazo da negociação vencido sem retorno"
  (`WeddingService.archiveExpiredLeads`) — this is what stops a 2028 wedding lead from sitting
  in the active list for two years. Defaults per property live in
  `properties.settings.weddingLead`; each negotiation carries its own dates and
  "Registrar follow-up" renews them.

The two paths are deliberately separate: promoting a lapsed negotiation to `completed` would
invent a wedding that never happened and inflate the module's revenue.
**Writes to** `weddings.status` / `lostReason` / `lostAt`, `audit_logs`.

### `crm-status`
Runs at 08:45 UTC, right after `wedding-status` (kept separate on purpose — the wedding flow
already runs in production). Archives open reservation quotes (`open`/`sent`/`negotiating`)
via `RateService.archiveExpiredQuotes`:
- `checkIn` already past → `lost`, reason "Data da estadia passou"
- `expiresAt` past → `lost`, reason "Prazo vencido sem retorno"

Each archived quote also gets a `lost` row in `crm_interactions` (actor `cron`). Quote lead
defaults live in `properties.settings.crmQuoteLead` (3/30/30); "Registrar follow-up" renews.
**Writes to** `rate_quotes.status/lostReason/lostAt`, `crm_interactions`, `audit_logs`.

### `structure-release` — **external cron, not in `vercel.json`**
Triggered by cronjob.org every 15 min between 06:00 and 14:00 BRT (same place as
`process-messages` and `hsystem-sync`), with `Authorization: Bearer $CRON_SECRET`.

**Why it is not a Vercel cron:** on the Hobby plan Vercel fires each cron **once a day, with
2–55 min of drift** — measured over 8 production days (`breakfast-attendance` scheduled 05:00,
observed up to 05:44; `daily-automations` scheduled 08:00, observed up to 08:55). One daily run
at an unpredictable hour is worse than none here: if it lands before the T-30 mark,
`releaseAlertLevel` returns `none` and the push never goes out — silently, with no error
anywhere.

Sends **one push per area, per day** to `reception` + `manager` when a `requiresDailyRelease`
structure is still locked `RELEASE_WARN_LEAD_MINUTES` (30) before its `operatingHours.openTime`.
Level comes from `releaseAlertLevel` in `src/lib/structure-release.ts` — the same rule the bell
reads, so push and panel never disagree. Areas fully out of service (`outOfService`, or every
unit in `unitStatus`) are skipped: there is nothing to release.

Why it exists (measured 06/06→05/09/2026): **43 of 92 days** had guests on site and the jacuzzi
was never released — none of them for maintenance — and all 14 guest bookings of the period
landed on released days. A forgotten release leaves no trace: the area simply does not exist in
the portal, so nobody asks. Of the 42 releases that did happen, 30 (71%) were already done
before the T-30 mark, so on a good day this cron says nothing.

Dedupe is `structures."releaseAlertSentFor"` (YYYY-MM-DD), written **after** the send so a
failed push retries on the next run. The bell and the urgent card do **not** depend on this
cron — they derive from `releasedForDate` and re-evaluate every 30 s in the browser. If the
external trigger dies, the alert still works; only the push goes quiet.
**Writes to** `structures."releaseAlertSentFor"`, `audit_logs` (`STRUCTURE_RELEASE_ALERT`).

### `daily-lodging`
Runs at 08:15 UTC (05:15 BRT). For every stay with `nightlyRate` set (linked from a Tarifário
quote or set manually on the stay) and status not cancelled/archived: posts one `lodging`
debit per elapsed night to `folio_items` via `FinanceService.postDueLodgingAll`. Nightly
values come from `splitNightly(lodgingTotal, nights)` (last night absorbs rounding).
**Idempotent** per `(stayId, refDate)` — a missed run is caught up by the next one.
**Writes to** `folio_items`, `stays.hasOpenFolio`.

## Exists in code but NOT scheduled in `vercel.json`

These handlers exist and are auth-protected, but Vercel Cron is **not** configured for them —
they must be triggered by an **external scheduler** (or manually). If the related feature
seems "stuck", check whether an external trigger is actually hitting them.

| Name | What it does | Notes |
|------|--------------|-------|
| `process-messages` | Drains the WhatsApp send queue: recovers messages stuck in `processing` >3 min, sends `pending` messages via the Evolution API (batches of 15). **Also runs the WhatsApp watchdog inline**: a cycle where every send fails with the dead-session signature triggers auto-recovery (Coolify restart + admin push); a successful cycle closes the incident with a "voltou" push | Designed for a **short interval** (≈ every minute). Needs `EVOLUTION_API_*`; auto-restart also needs `COOLIFY_*` |
| `whatsapp-watchdog` | Standalone watchdog (`WhatsAppHealthService`): probes Evolution from outside (timeout = frozen process) and checks recent real-send results; restarts the Evolution service via the Coolify API (30 min cooldown) and pushes alerts to admins/managers | Optional — the same logic already piggybacks on `process-messages`; this adds coverage when the queue is idle. Suggested every 10–15 min. Needs `EVOLUTION_API_*` + `COOLIFY_*` |
| `housekeeping-routines` | Applies fixed-interval housekeeping rules (`applyFixedIntervalRules`) per property | Complements `daily-housekeeping` |
| `hsystem-sync` | Polling do HUNIT (Hsystem) por propriedade com `settings.hasHsystem`: busca reservas (`booking/read` → cria/atualiza/cancela estadias → `confirme/post` só em modo `active`) e envia disponibilidade (idempotente por hash, só em `active` + `pushAvailability`) | Cron EXTERNO (ex.: cronjob.org) a cada 1–5 min — a Hsystem recomenda 1 min; limites 60 req/min. `Authorization: Bearer $CRON_SECRET` |
| `structure-release` | Pushes `reception` + `manager` when a `requiresDailyRelease` area is still locked 30 min before it opens. One push per area per day (`structures."releaseAlertSentFor"`). Full section above | Cron EXTERNO (cronjob.org) a cada 15 min entre 06:00 e 14:00 BRT. `Authorization: Bearer $CRON_SECRET`. **Não** ponha em `vercel.json`: no Hobby o disparo é 1x/dia com 2–55 min de deriva e o push simplesmente não sai |

### WhatsApp watchdog — how it decides (see `src/services/whatsapp-health-service.ts`)

Evolution's cheap indicators (`connectionState`, `fetchInstances`) lie **optimistically** — they
report `open` with the socket closed. The watchdog therefore only trusts three signals: real
sends failing with the dead-session signature (`isSessionDownError`), the outside probe timing
out (frozen process), or Evolution itself admitting a non-`open` state. Reaction ladder:
restart via Coolify (cooldown 30 min, dedup with the manual button) → if still down, "needs QR"
push → on the first successful send, "recovered" push. All events are recorded in `audit_logs`
(`entity = 'WHATSAPP'`, actions `WHATSAPP_WATCHDOG_*` / `WHATSAPP_RESTART_MANUAL`) — that is
also where the cooldown/dedup state lives (no extra table).

## Troubleshooting

- **401 Unauthorized** → the `Authorization: Bearer $CRON_SECRET` header is missing/wrong, or
  `CRON_SECRET` differs between the caller and the deployment.
- **"It didn't run"** → query `audit_logs` for `entity = 'CRON'` (action `CRON_*`); every run
  logs start/finish and errors there.
- **WhatsApp messages not sending** → confirm `process-messages` is actually being triggered
  (it's not in `vercel.json`) and that `EVOLUTION_API_URL/KEY/INSTANCE` are set. Messages
  stuck in `processing` are auto-recovered after 3 minutes on the next run.
- **To run locally**: hit `GET /api/cron/<name>` — in development the `CRON_SECRET` check is
  bypassed.

### `rh-materialize`

Diario, 06:00 UTC (03:00 BRT). Mantem `staff_shifts` rolando: o mes corrente e os dois
seguintes, para toda propriedade com o modulo `rh` ligado.

Existe porque a escala e **gerada, nao calculada na hora**. Sem alguem empurrando a janela,
chega o dia 1o de um mes que ninguem abriu no admin e a grade esta vazia.

Duas garantias que importam no runbook:

- **Idempotente** por `(staffId, date)`. Rodar duas vezes nao duplica nada, e rodar de novo
  depois de uma falha faz catch-up sozinho.
- **Preserva ajuste manual.** Linhas com `origin = 'manual'` nunca sao reescritas: elas sao o
  que a pessoa que monta a escala corrigiu a mao. A resposta traz `preservados` com a contagem.

Gate de modulo no loop de propriedades (regra 3 de `docs/MODULARIZATION.md`): quem nao contratou
`rh` e pulado, e a resposta diz quantas foram. Medido no DEV: 1.547 dias gerados na Fazenda,
2 propriedades puladas, ~5s.

Rodar a mao (producao precisa do header):

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/rh-materialize
```
