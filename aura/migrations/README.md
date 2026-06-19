# Database migrations

SQL changes for the Aura Supabase (Postgres) database, kept here as a **historical
record**. There is **no migration runner** — each file was applied manually via the
**Supabase SQL Editor**, in roughly the chronological order below.

> Treat this folder as the source of truth for "what shaped the schema and when". The
> human-readable schema overview lives in [`../docs/DATABASE.md`](../docs/DATABASE.md).

## Conventions

- Most columns are **camelCase** (quoted identifiers, e.g. `"propertyId"`). A few legacy
  F&B/breakfast tables (`fb_*`) use **snake_case** (`property_id`, `ala_carte`) — match the
  table you are querying.
- Tables are scoped per property for multi-tenancy; RLS policies live in
  `rls_all_properties.sql` and the `*_rls.sql` files.
- New changes: add a new `.sql` file here (don't edit applied ones), append it to the table
  below with its date and a one-line description, and apply it in the Supabase SQL Editor.

## Index (chronological)

| Date | File | What it does |
|------|------|--------------|
| 2026-03-04 | `enable-realtime.sql` | Enable Supabase Realtime on core tables |
| 2026-03-06 | `add_maintenance_columns.sql` | Extra columns on maintenance tables |
| 2026-03-06 | `setup_surveys.sql` | Surveys schema |
| 2026-03-06 | `setup_surveys_rls.sql` | RLS policies for surveys |
| 2026-03-11 | `add_concierge_tables.sql` | Concierge requests + catalog tables |
| 2026-03-11 | `add_dnd_maintenance_and_system_bugs.sql` | DND, maintenance flags, system bug log |
| 2026-03-11 | `add_raca_column.sql` | Pet breed (`raca`) column |
| 2026-03-11 | `alpha_bug_fixes.sql` | Assorted alpha-phase fixes |
| 2026-03-11 | `fb_migration.sql` | Food & Beverage base schema |
| 2026-03-11 | `fb_orders_table.sql` | F&B orders table |
| 2026-03-11 | `fb_advanced_update.sql` | F&B advanced fields |
| 2026-03-18 | `fix_structure_bookings_rls.sql` | Fix RLS for structure bookings |
| 2026-03-18 | `rls_all_properties.sql` | Per-property RLS (multi-tenant baseline) |
| 2026-03-19 | `fix_structure_bookings_rls_v2.sql` | Structure bookings RLS, revision 2 |
| 2026-03-19 | `fix_survey_rls.sql` | Fix survey RLS |
| 2026-04-23 | `normalize-names-phones.sql` | One-off data fix: normalize guest names/phones |
| 2026-06-03 | `add_cabin_ignore_occupancy.sql` | Cabin flag: ignore occupancy |
| 2026-06-03 | `add_internal_stays.sql` | Support internal (staff) stays |
| 2026-06-05 | `add_resort_map.sql` | Resort map schema |
| 2026-06-05 | `add_resort_map_cabins.sql` | Resort map cabin positions |
| 2026-06-06 | `add_daily_release.sql` | Daily release feature |
| 2026-06-06 | `add_structure_translations.sql` | i18n columns for structures |
| 2026-06-07 | `add_map_pois.sql` | Map points of interest (POIs) |
| 2026-06-11 | `stock_phase0.sql` | Stock/inventory: shared categories (consumable + asset) |
| 2026-06-11 | `stock_phase1.sql` | Stock module — phase 1 |
| 2026-06-11 | `stock_phase1_assets_media.sql` | Stock phase 1: asset media |
| 2026-06-11 | `stock_phase1_purchase_invoice.sql` | Stock phase 1: purchase invoices |
| 2026-06-15 | `stock_phase2.sql` | Stock module — phase 2 |
| 2026-06-16 | `stock_phase3.sql` | Stock module — phase 3 |
| 2026-06-16 | `stock_phase3b_drop_minibar.sql` | Stock phase 3b: drop minibar |
| 2026-06-18 | `add_area_reviews_moderation.sql` | Area reviews moderation |
| 2026-06-18 | `add_survey_curated.sql` | Curated survey (Survey 2.0) |
| 2026-06-19 | `add_breakfast_venue.sql` | Breakfast venue / salão do café |
| 2026-06-19 | `add_poi_instagram.sql` | Instagram field on POIs |
| 2026-06-19 | `stock_phase4.sql` | Stock module — phase 4 (latest, work in progress) |
