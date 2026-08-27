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
  below with its date and a one-line description, and apply it with `pnpm db:sql` — **DEV
  first, production after it works**:

  ```bash
  pnpm db:sql migrations/nova_coisa.sql                # DEV (padrão)
  pnpm db:sql migrations/nova_coisa.sql --target prod  # produção, com confirmação
  ```

  O script roda tudo em uma transação (um erro no meio desfaz tudo), ao contrário do SQL
  Editor. Detalhes em [`../docs/DEV-DATABASE.md`](../docs/DEV-DATABASE.md).

## Index (chronological)

| Date | File | What it does |
|------|------|--------------|
| 2026-03-04 | `enable-realtime.sql` | Enable Supabase Realtime on core tables |
| 2026-03-06 | `add_maintenance_columns.sql` | Extra columns on maintenance tables |
| 2026-03-06 | `setup_surveys.sql` | Surveys schema |
| 2026-03-06 | `setup_surveys_rls.sql` | RLS policies for surveys |
| 2026-03-11 | `add_concierge_tables.sql` | Concierge requests + catalog tables |
| 2026-03-11 | `add_dnd_maintenance_and_system_bugs.sql` | DND, maintenance flags, system bug log |
| 2026-03-11 | `add_raca_column.sql` | `guests.raca` — raça/etnia do hóspede para o FNRH (não tem relação com pets) |
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
| 2026-06-19 | `stock_phase4.sql` | Stock module — phase 4 |
| 2026-08-01 | `stock_movement_targets.sql` | Movimentações: destino "colaborador" (`fromStaffId`/`toStaffId`) |
| 2026-08-01 | `stock_phase6_responsible.sql` | Movimentações: responsável pela ação + `batchRef` (lote) |
| 2026-08-01 | `stock_phase6_cabin_locations.sql` | Índices para cabanas como locais derivados (só índices, sem UPDATE) |
| 2026-08-01 | `add_housekeeping_skip_columns.sql` | `skippedAt` + `guestName` em `housekeeping_tasks` (faxina não realizada) |
| 2026-08-02 | `patrimonio_phase1.sql` | Patrimônio: `publicCode` (plaqueta QR, imutável), baixa/alienação, `asset_movements`, nº sequencial e `maintenance_tasks."assetId"` |
| 2026-08-02 | `patrimonio_phase3_inventario.sql` | Patrimônio: conferência física (`asset_inventory_counts` / `asset_inventory_items`) |
| 2026-08-03 | `add_cabin_conference_author.sql` | `cabinCheckedBy` + `cabinCheckedAt` em `housekeeping_tasks` (autor da conferência de saída) |
| 2026-08-04 | `tarifario_phase1.sql` | Tarifário: tabelas de preço (`rate_tables`), regras de calendário (`rate_periods`) e config comercial (`rate_settings`) — port do SIT |
| 2026-08-04 | `tarifario_phase2_orcamentos.sql` | Tarifário fase 2: orçamentos salvos + funil de vendas (`rate_quotes`) com cliente/lead vinculável a hóspede e estadia |
| 2026-08-04 | `cabin_categories.sql` | Categoria de cabana vira entidade (`cabin_categories`): `cabins."categoryId"`, `rate_tables.prices` reindexado por id, consolidação das grafias divergentes e migração dos links do site |
| 2026-08-04 | `financeiro_phase1_diarias.sql` | Financeiro fase 1: fólio vira extrato (`folio_items.type` debit/credit + `refDate` p/ diárias idempotentes) e estadia ganha `nightlyRate`/`lodgingTotal`/`rateQuoteId` |
| 2026-08-04 | `financeiro_phase2_diaria_editavel.sql` | Financeiro fase 2: `stays."lodgingPaused"` (pausa o cron) e `stays."nightlyOverrides"` (valor por noite; 0 = noite não cobrada) |
| 2026-08-04 | `weddings_status_lost.sql` | Casamentos: status `lost` (negociação perdida ≠ cancelado) — recria a CHECK constraint de `status` e adiciona `"lostReason"`/`"lostAt"` |
| 2026-08-05 | `weddings_lead_validity.sql` | Casamentos: validade do lead — `"followUpAt"`/`"expiresAt"` + índices parciais; padrões por propriedade em `properties.settings.weddingLead` |
| 2026-08-08 | `crm_phase1_foundation.sql` | CRM fase 1: origem (`source`) + prazos (`followUpAt`/`expiresAt`/`sentAt`/`lostAt`) em `rate_quotes`, contato do casal em `weddings`, e histórico compartilhado `crm_interactions` |
| 2026-08-08 | `crm_phase1_backfill.sql` | CRM fase 1 (backfill): snapshot antigo ganha `categoryId`, `selectedCategory` nome→id, prazos retroativos e `categoryLinks`→`siteUrl` — com sondas antes de cada UPDATE |
| 2026-08-08 | `crm_phase2_negotiated_value.sql` | CRM fase B.5 (1/4): `rate_quotes."negotiatedValue"` (valor fechado na conversa, vence a tabela) e CHECK de `crm_interactions.kind` recriado com `value_change`/`guest_linked`/`alarm_done` |
| 2026-08-08 | `crm_phase2_alarms.sql` | CRM fase B.5 (2/4): `crm_alarms` (follow-up/cobrança/lembrete para leads E fechados, `entityLabel` snapshot, índice parcial de abertos, RLS + realtime p/ badge) |
| 2026-08-08 | `weddings_installments.sql` | CRM fase B.5 (3/4): `wedding_installments` (parcelas reais com vencimento; FK via `DO` dinâmico pois a PK de weddings não é versionada) + backfill das 2 legadas e 3ª derivada num único INSERT idempotente |
| 2026-08-08 | `crm_phase2_waitlist.sql` | CRM fase B.5 (4/4): `waitlist_entries` (lista de espera para períodos — nome/telefone/período, status waiting→contacted→converted/archived, `quoteId` de rastro) |
| 2026-08-09 | `crm_phase3_quote_rooms.sql` | CRM fase 3: `rate_quotes."rooms"` (acomodações pedidas na MESMA negociação, com as opções de cada uma) + `"acceptedAt"` (aceite na proposta pública) + kind `client_accepted` |
| 2026-08-10 | `tarifario_inclusions.sql` | `rate_settings."inclusionsText"` — "O que está incluso" (uma linha por item) exibido na proposta pública acima das regras; editável em Tarifário → Comercial |
| 2026-08-10 | `tarifario_phase4_flutuacoes_arquivo.sql` | Tarifário fase 4: `rate_fluctuations` (preset de flutuação atribuído a um período — cotação "Automática" aplica noite a noite), `rate_table_versions` (histórico de preços — snapshot antes de cada alteração/exclusão), `rate_tables."archivedAt"/"archivedBy"` (arquivo) e `rate_quotes."fluctuationAuto"` |
| 2026-08-17 | `stays_multi_pet.sql` | Pets: `stays."pets"` (array jsonb) com backfill de `"petDetails"` — mais de um pet por estadia; `hasPet` e `petDetails` (= pets[0]) seguem mantidos |
| 2026-08-17 | `crm_phase4_intl_orcamento.sql` | CRM fase 4: `rate_quotes."clientDocumentType"`/`"clientLanguage"` (documento internacional + idioma do hóspede) e `rate_settings.*_en`/`*_es` (templates de WhatsApp + "o que está incluso" em 3 idiomas) |
| 2026-08-18 | `weddings_guest_site.sql` | Site dos noivos: códigos de 6 dígitos (`"guestCode"`/`"coupleCode"`), tabela vinculada (`"rateTableId"`), janela de extensão (`"maxExtendNights"`), `"siteEnabled"`/`"siteConfig"` e índice parcial de pré-reservas abertas em `rate_quotes` |
| 2026-08-20 | `stock_location_policy.sql` | Estoque Etapa A: `stock_locations."policy"` (stock/consume_all/consume_categories, ponto de consumo) + `"consumeCategoryIds"` e `stock_products."neverConsume"` (bem durável isento da conversão transferência→saída) |
| 2026-08-20 | `restock_requests.sql` | Reposição Etapa B: tabela `restock_requests` (pedido camareira→mensageiro fora do Concierge, com fontes planejada/fallback/usada) + `stock_products."maidRequestable"/"deductMode"/"deductLocationId"` e `stock_categories."deductLocationId"` (cadeia de baixa produto→categoria) |
| 2026-08-24 | `crm_intake_proposta.sql` | Proposta pública: `rate_quotes."intake"`/`"intakeAt"` (cadastro do titular preenchido pelo CLIENTE depois do aceite — titular, endereço, acompanhantes, placa, pet, pagamento e consentimento; `intakeAt` é a trava do link), `rate_quotes."clientInstagram"` (lead sem telefone/e-mail), `rate_settings."paymentOptions"` (condições de pagamento em 3 idiomas) e kind `client_intake` |
| 2026-08-24 | `add_stays_view_prefs.sql` | Estadias fase 1: `staff."staysViewAtivas"`/`"staysViewFuturas"` (modo cartão/compacto/lista por aba, por usuário — o PC da recepção é compartilhado, então localStorage não serve) |
| 2026-08-24 | `add_stay_account_state.sql` | Estadias fase 2: `stays."keyStatus"/"keyStatusAt"/"keyStatusBy"`, `"loanedItemsStatus"` e `"lostItemsResolution"/"lostItemsResolvedAt"/"lostItemsResolvedBy"` — chave, empréstimo e objeto esquecido viram estado da conta (com backfill honesto do que o banco já sabia) |
| 2026-08-24 | `backfill_bill_closed_at.sql` | Estadias fase 2: fecha `billClosedAt` das `finished` sem pendência (251 na aplicação) — sem isso todo o histórico voltaria para a aba Ativas, já que a conta aberta passou a ser o que segura a estadia lá |
| 2026-08-24 | `add_cabin_active.sql` | Estadias fase 3: `cabins.active` (fora de operação) — separa "desativada" de `ignoreInOccupancy` ("não conta na ocupação"); a grade de últimas saídas só mostra cabana ativa |
| 2026-08-24 | `unarchive_stays.sql` | Estadias fase 3: devolve as `archived` ao histórico como `finished` com `billClosedAt` (8 na aplicação) — o botão "Arquivar" saiu e o que ele escondeu precisava voltar |
| 2026-08-24 | `hsystem_integration.sql` | Hsystem (HUNIT) fase 1: `stays."source"`/`"externalId"`/`"externalRoomId"` com índice único parcial (a mesma reserva do canal não entra duas vezes) + `hsystem_reservations` (espelho cru da reserva, com `contentHash` para detectar mudança) e `hsystem_sync_log` |
| 2026-08-25 | `guests_created_at.sql` | `guests."createdAt"`: a coluna entra **sem** default no ADD (legado não é carimbado com a data da migration) e só depois ganha `DEFAULT now()` para linhas novas; backfill pelo primeiro audit de `CREATE` — em produção, 200 fichas recuperaram a data real e 192 antigas ficam NULL, que é a verdade |
| 2026-08-25 | `stock_purchase_xml_import.sql` | Compras pelo XML da NF-e: identidade fiscal da nota em `purchases` (`invoiceKey` com índice único parcial por propriedade — a mesma nota não entra duas vezes —, `invoiceSeries`/`invoiceModel`/`invoiceXmlUrl`/`invoiceDeclaredTotal`/`importSource`) e `supplier_product_map`, o de-para que se lembra: fornecedor + `cProd` → produto daqui, com fator de embalagem (1 CX = 12 un) e as marcas de linha de patrimônio / linha ignorada |
| 2026-08-26 | `messages_hot_indexes.sql` | Dieta de egress: três índices PARCIAIS em `messages` (36 mil linhas, só pkey + `propertyId` — que não filtra nada porque quase toda mensagem é da mesma propriedade). `idx_messages_unread` (contador do sino), `idx_messages_queue` (fila do cron `process-messages`) e `idx_messages_api_id` (webhook casando o id da Evolution). As três varriam a tabela inteira — ~1 486 blocos por chamada; com índice o sino vira *Index Only Scan* com `Heap Fetches: 0` em **4 blocos**. Somam 72 kB. Aplicar com `--no-atomic` (CONCURRENTLY não roda em transação) |
| 2026-08-26 | `events_type_hygiene.sql` | Eventos fatia 1 (higiene): backfill de `events.type` — 8 das 13 linhas de produção tinham `type='internal'`, valor que nunca existiu no union TypeScript (`local`/`external`/`private`), o que deixava todo mapa de rótulo/tom devolvendo `undefined` e tornaria o filtro positivo das leituras públicas cego para esses eventos. Vira `local` (decisão do dono: Sunset Maram é evento nosso) e ganha CHECK para não voltar. CHECK de `category` fica de fora de propósito — a lista vai ser revista com o parceiro |
| 2026-08-26 | `rls_close_public_policies.sql` | **Fecha vazamento vivo.** A chave pública (`anon`, que viaja no JS do site) lia **e escrevia** em `messages` (36 246 linhas — telefone do hóspede em `to`, conteúdo em `body`), `communications` (409) e `breakfast_visitors` (4): três policies `FOR ALL TO PUBLIC USING (true)` que sobreviveram à remediação da chave pública (aquela rodada revogou o GRANT de 19 tabelas; nestas o grant ficou e a policy PUBLIC o encontrou). Não era só leitura — `anon` tinha INSERT/UPDATE/DELETE/TRUNCATE, ou seja, dava para enfileirar mensagem que o cron mandaria pelo WhatsApp da pousada e para apagar o histórico. Cria `property_scoped_all` em `communications` (única sem escopo), dropa as três policies públicas e REVOKE do `anon`. Verificado com a própria chave: antes 206 + contagem, depois 401 |
