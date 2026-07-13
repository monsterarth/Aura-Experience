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
| `daily-housekeeping` | `10 20 * * *` | Generates next-day housekeeping tasks |
| `maintenance` | `20 20 * * *` | Materializes recurring maintenance rules/tasks (preventivas) |
| `evening-revalidation` | `30 20 * * *` | Re-syncs queued pre-checkout messages |
| `breakfast-attendance` | `0 8 * * *` | Builds the day's breakfast attendance list |
| `stock-expiry` | `0 9 * * *` | Flags expiring batches, auto-loss if enabled |
| `asset-depreciation` | `0 5 1 * *` | Monthly asset depreciation entries |

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

## Exists in code but NOT scheduled in `vercel.json`

These handlers exist and are auth-protected, but Vercel Cron is **not** configured for them —
they must be triggered by an **external scheduler** (or manually). If the related feature
seems "stuck", check whether an external trigger is actually hitting them.

| Name | What it does | Notes |
|------|--------------|-------|
| `process-messages` | Drains the WhatsApp send queue: recovers messages stuck in `processing` >3 min, sends `pending` messages via the Evolution API (batches of 15) | Designed for a **short interval** (≈ every minute). Needs `EVOLUTION_API_*` |
| `housekeeping-routines` | Applies fixed-interval housekeeping rules (`applyFixedIntervalRules`) per property | Complements `daily-housekeeping` |

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
