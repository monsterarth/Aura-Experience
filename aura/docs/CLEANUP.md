# Faxina do código — escopo e execução

> **Status: ONDAS 0, 1, 2 e 3-A EXECUTADAS** (30–31/08/2026, `pnpm build` limpo em todas).
> Falta a **3-B** (fatiar arquivos grandes). Levantamento de 29-30/08/2026.
>
> | Onda | Commit | Efeito |
> |---|---|---|
> | 0 — segurança | `d6c9dec` | proxy SSRF, segredos rastreados, 404 do portal |
> | 1 — deleção | `c3f85b9` | −7.113 linhas em 72 arquivos |
> | 2 — consolidação | `539c9c8` | 5 conceitos com dono único, 43 arquivos |
> | 3-A — E/S e egress | `362f075` | menos coluna baixada, menos ida ao banco |

## O que a Onda 3-A fez (31/08) — feita com o egress em 110% da cota

Nenhuma destas mudanças gasta egress; todas cortam.

- **Funil comercial** — `select("*")` em 500 orçamentos + 500 casamentos a cada carga, e a tela
  recarrega após cada ação. Agora 24 colunas de ~45 (fora: `intake` com acompanhantes e endereço, e
  `notes`) e 13 de 41 no casamento. **A lista está amarrada aos mappers por comentário porque coluna
  esquecida não quebra o build — some do cartão em silêncio.**
- **Cron de automações** — varria toda estadia aberta com `select("*")` todo dia para decidir com
  sete campos. Virou varredura estreita; a linha inteira (que a expansão de variáveis do template
  precisa) vem só para quem dispara, em paralelo com o hóspede.
- **Histórico de cabana da governanta** — trazia o JSON do checklist de 40 tarefas para exibir nove
  campos (a mesma coluna que fez a rota antiga pesar 779 kB).
- **Painel do diretor** — ~25 queries por evento de realtime em cinco tabelas, sem debounce nem
  guarda. Uma baixa de estoque gera evento em `stock_movements` **e** `stock_balances`, então o rush
  do café multiplicava. Agora junta em 2 s e não empilha carga sobre carga.
- **GET de orçamentos sem filtro** — devolvia 400 linhas gordas e nenhuma tela chama assim. Passa a
  exigir o filtro (400 com a mensagem) em vez de ser deletado, porque pode haver script manual.
- **Latência (não é egress):** `saveQuote` esperava três leituras independentes em fila — e todo
  Salvar e todo Copiar passam ali; `/api/guest/today` fazia seis idas ao banco antes da primeira
  pintura do portal, agora três ondas (a checagem de posse continua antes de tudo).
- **Reordenação de cardápio** — um UPDATE por linha, sequencial, com o erro de cada um ignorado.
  Agora paralelo com erro agregado. Paralelo e **não** upsert de propósito: upsert com linha parcial
  manda NULL nas colunas ausentes.

### Onda 3-B — não feita, e por quê

Fatiar `governanta/page.tsx` (2.627), `NewQuoteWizard.tsx` (2.328), `rate-service.ts` (2.260),
`check-in/form` (1.997) e `types/aura.ts` (3.474) é **refactor mecânico de alto volume com ganho zero
em runtime** — o oposto do perfil da 3-A. Vale fazer com o app rodando à frente para conferir tela por
tela, não numa sessão de limpeza. O `maid-checklist-browser-io` também ficou: é escrita pelo client do
browser num app de campo (viola a regra do `CLAUDE.md` e é a classe do incidente do lock frio), mas
exige rota `/api/field/*` nova e teste com camareira — é entrega, não faxina.

## O que a Onda 2 fez (31/08)

Cinco libs novas ou reforçadas, cada uma absorvendo cópias espalhadas:

- **`@/lib/money`** — eram 5 convenções em ~25 arquivos. Duas estavam **erradas** para pt-BR:
  `R$ 1234.56` (ponto decimal, sem milhar) em sete telas e `1234,56` sem milhar em outras cinco.
  15 sítios migrados; ficaram de fora os `R$ ${...}` de log de auditoria e toast, por indicação do
  próprio relatório.
- **`@/lib/evolution`** — o envio pela Evolution estava inteiro em 3 rotas e a resolução de config em
  mais 2, **já divergentes** (só o cron tinha o gate de `whatsappEnabled` e a checagem de número). A
  lib fica com config + modo seguro + POST; cada rota manteve o que grava em `messages`, que diverge
  de propósito. O gate virou **opção** em vez de padrão — ligá-lo para o envio manual é decisão de
  produto, não faxina.
- **`@/lib/dates`** — o kit morava dentro do `rate-engine`, o que obrigava `wedding-service` e
  `crm-service` a importar o motor de tarifas para somar um dia (e cada um reescreveu o `addDays`).
  Os dois "hoje" agora se distinguem pelo nome: `todayPropertyIso` (fuso da pousada, servidor) e o
  `todayIso` de `event-dates` (fuso de quem olha, tela de hóspede). 13 cópias da mesma linha viraram
  uma chamada. O `nightsBetween` do hsystem **não** entrou: tem `Math.max(1,…)`, semântica do sítio.
- **`@/lib/multilang`** — ganhou `pickColumn`/`pickColumnList` para o formato de COLUNA
  (`campo`/`campo_en`/`campo_es`), que estava reescrito em 6 telas do portal.
- **push** — as 3 rotas de webhook mantinham cópias privadas de `fanOut`/`fanOutByRole`; 250 linhas
  viraram 146. E a lista de países do check-in era cópia da de `@/lib/countries` (conferido:
  subconjunto exato antes de trocar).

**Não feito na Onda 2, e por quê:** `field-app-kit-duplicado` (o mini design-system copiado em 7 apps
de campo) e os dois sistemas paralelos de botão/toggle são **projeto de UI**, não faxina — mexem em
tela de camareira e de recepção e pedem verificação visual, não `pnpm build`. O
`realtime-subscribe-teardown-boilerplate` (~20 sítios) e o `roles-convergence-stalled` continuam
abertos. O `aura-kit-unconsumed-primitives` foi rebaixado na verificação (são blocos prescritos pela
receita de página admin — agendados, não mortos) e fica como está.

## Rotação de segredos — 2 feitas e verificadas, 1 pendente (01/09/2026)

Apagar o arquivo não invalida a chave: o valor segue no histórico do git. Duas foram rotacionadas e
confirmadas em produção; falta uma revogação e uma limpeza.

| Segredo | Onde estava | Situação |
|---|---|---|
| `EVOLUTION_API_KEY` | `.claude/settings.local.json` (rastreado) | ✅ **rotacionada 01/09** — envio real confirmado |
| `CRON_SECRET` | `scripts/dev/test-cron.js` (rastreado) | ✅ **rotacionada 01/09** — os 2 jobs voltaram a 200 nos logs |
| chave GCP `96bfe85d…` | `service-account.json` | ⛔ falta: revogar no console (projeto `aura-exp`) |
| `WHATSAPP_API_KEY` | `whatsapp-service/server.js` (fallback no código) | ⚪ dispensada — o container não existe mais no Coolify (verificado 01/09); só apagar a env da Vercel |

**Os crons externos são DOIS, não quatro** — descoberto pelos logs da Vercel: `process-messages`
(`aura-experience-rho.vercel.app`, 2 min) e `hsystem-sync` (`aura.fazendadorosa.com.br`, 1 min),
em **domínios diferentes**. `whatsapp-watchdog` e `housekeeping-routines` não são chamados por
ninguém. Ficam no cron-job.org → job → aba **AVANÇADO** → **Cabeçalhos** → `Authorization`.
**Trocar a env na Vercel não basta:** sem Redeploy o deployment no ar segue com a chave velha, e os
jobs tomam 401 durante o build (~4 min) — some sozinho.

**Rotacionar a chave da Evolution** tem uma armadilha que custa tempo: ela **não fica no Manager**
(lá só há config por instância). É env do container no Coolify, e existem duas variáveis parecidas —
o compose faz `AUTHENTICATION_API_KEY=${SERVICE_PASSWORD_AUTHENTICATIONAPIKEY}`, então a primeira é
derivada e volta ao valor antigo no próximo deploy. Edite a **`SERVICE_PASSWORD_AUTHENTICATIONAPIKEY`**.
Depois: env na Vercel + Redeploy (é ela que valida o webhook de entrada), e o cofre em
`/admin/configuracoes/integracoes` — campo em branco **mantém** o atual. O cofre tem prioridade sobre a
env, mas é cacheado 60 s por lambda quente: sem um deploy novo, a instância antiga segue servindo a
chave velha.

## O que foi executado nesta sprint

**Onda 0 (parcial — falta a rotação acima):** removidos `/api/media` (proxy SSRF aberto, sem auth),
os 6 scripts de teste em `scripts/dev/` (2 com segredos reais), o `service-account.json` do disco, e
o `.claude/settings.local.json` saiu do índice do git (agora no `.gitignore`).

**Bug de hóspede corrigido junto:** `{{portal_link}}` montava `/check-in`, que **dá 404 em produção**
(conferido: 404 vs 200 em `/check-in/login`). Os dois pontos vivos — `automation-service.ts` (WhatsApp
automático) e `GuestContactModal` (contato manual da recepção) — agora geram
`/check-in/login?code=<accessCode>`, o mesmo formato do botão "copiar link" de `/admin/stays`. Virou
link de um toque em vez de erro.

**Onda 1 inteira:** 7 dependências (as 4 previstas + `react-hook-form`, `@hookform/resolvers` e `zod`,
que ficaram órfãs em cascata quando o `CheckInForm` antigo saiu), 4 rotas de API, 7 exports de `lib`,
**47 métodos mortos em 14 serviços**, 7 componentes, 5 páginas órfãs, o container `whatsapp-service/`
(VPS `:3001` não responde — confirmado desligado), 18 env vars mortas e 3,1 MB de assets sem
referência (o `Logo.png` só saiu depois de conferir no banco que nenhuma propriedade aponta pra ele).

**Decisões tomadas com o Arthur** (as três que o verificador marcou como "pergunte ao operador"):
- **Concierge**: em vez de apagar as rotas mortas, o `useConcierge` passou a usá-las — elas ganharam
  log de auditoria e o filtro `active=true` que faltava, e o CRUD de grupo saiu do `ConciergeService`.
  Não sobrou caminho duplo de escrita.
- **`/api/push/unsubscribe`**: mantida — é o endpoint do futuro botão de desativar notificações.
- **`/termos`**: mantida e **linkada** no rodapé do `/aura` (o problema era ninguém alcançar).

**Deixados de propósito:** `EventService.getPublishedEvents` (reservado ao contrato do Altamare —
apagar mudaria as "3 leituras públicas" documentadas) e `weddingHeader` em `rate-engine.ts`, que
existe pronta mas nunca foi ligada: a linha 581 substitui `{CASAMENTO_HEADER}` por um texto genérico
em vez de usar os nomes do casal. Ligar muda a mensagem que chega ao cliente — é decisão de produto.

**Verificação:** além do `pnpm build`, um script comparou cada serviço com `git HEAD` e confirmou que
todos perderam **exatamente** os métodos da lista e nenhum a mais.

Complementa [REFACTORING.md](REFACTORING.md) (que trata de *quebrar arquivos grandes*): aqui o
assunto é **remover o que não serve** e **unificar o que foi escrito duas vezes**.

## Como este escopo foi levantado

Revisão multi-agente em duas rodadas: 9 varreduras paralelas (dependências, `src/lib`, serviços,
componentes, páginas, rotas de API, duplicação, complexidade/E-S, higiene de repositório), cada uma
seguida de um **verificador adversarial** cuja tarefa era *refutar* os achados — procurar o import
dinâmico, a rota montada por template, o consumidor externo. Um achado só é "confirmado" porque
alguém tentou derrubá-lo e não conseguiu. Um crítico de completude fechou a revisão apontando o que
as varreduras não cobriram.

**84 achados**: 65 confirmados, 5 rebaixados na verificação (a observação vale, a
recomendação foi corrigida), 0 refutados, 14 sem verificação adversarial (marcados com ⚠️).

## Regras de execução

Vieram dos guardrails dados aos agentes; valem para quem executar:

- **Convenções do Next não são código morto**: `page.tsx`, `route.ts`, `layout.tsx`, `error.tsx`,
  `loading.tsx`, `not-found.tsx`, `middleware.ts`, ícones.
- **Cron fora do `vercel.json` continua vivo**: `process-messages`, `whatsapp-watchdog`,
  `housekeeping-routines`, `hsystem-sync` são disparados por cron externo.
- **Webhooks e `/api/partner/*` não têm chamador interno por definição** — quem chama é o Chatwoot, a
  Evolution, o Altamare.
- Rotas são chamadas por **string montada em tempo de execução** (`field-api.ts`, `guest-api.ts`,
  `stock-client.ts`) — procure fragmento de caminho, não o caminho inteiro.
- `migrations/*.sql` é registro histórico. `scripts/db/*.mjs` está ligado ao `package.json`.
- Uma onda por commit, `pnpm build` ao fim de cada uma, **DEV primeiro; main só com OK explícito**.

---

## ⚡ Conferir antes da sprint — possível bug ativo

Achado da varredura de páginas que não é faxina: pode estar afetando hóspede AGORA.

- [**{{portal_link}} is substituted as BASE/check-in, but /check-in has no page — two live substitution sites may be sending guests to a 404**](#portal-link-var-points-at-no-page) — `src/services/automation-service.ts` · `src/components/admin/GuestContactModal.tsx` · `src/components/admin/BroadcastPanel.tsx`  
  One 8-line redirect stub (src/app/check-in/page.tsx → /check-in/login, same pattern as admin/core/structures/page.tsx) fixes every past and future message that used the variable; or normalize all three sites to /check-in/login

---

## Onda 0 — Segurança (isolada, antes de tudo)

Três itens que não são higiene: são exposição. Não misture com deleção de código no mesmo commit.

- [**Real production secrets hardcoded in git-tracked scripts/dev test files**](#secrets-in-tracked-dev-scripts) — `scripts/dev/test-cron.js` · `scripts/dev/test-docker.js` · `whatsapp-service/server.js`  
  Removes two committed credentials from the working tree; closes the loop on a production CRON_SECRET that is recoverable from git history by anyone with repo access.

- [**/api/media — legacy WhatsApp media proxy, zero callers, and an unauthenticated open proxy**](#media-proxy-dead) — `src/app/api/media/route.ts`  
  Deletes 30 LoC and closes a real hole: the route has NO auth and fetches attacker-supplied URLs server-side on Vercel — an open SSRF/egress proxy anyone can hit in production (also burns Vercel bandwidth via the 24h cache header).

- [**Orphaned Google service-account private key at repo root (abandoned Firebase/FCM path)**](#service-account-json-orphan) — `service-account.json`  
  Removes a private key sitting unprotected on disk that grants access to a GCP project; kills the last artifact of the abandoned FCM integration.

**Ações que não são `git rm`** e que só o Arthur pode fazer:
- **Rotacionar o `CRON_SECRET`** na Vercel e no cron externo (cronjob.org) — o valor atual está no
  histórico do git, apagar o arquivo não o tira de lá.
- **Rotacionar a `WHATSAPP_API_KEY`** (`Fazenda@2025`) se o container ainda existir em algum lugar.
- **Revogar a chave do `service-account.json`** no console GCP (projeto `aura-exp`, key id `96bfe85d…`).
- **Rotacionar a `EVOLUTION_API_KEY`** e tirar `.claude/settings.local.json` do índice do git
  (`git rm --cached` + entrada no `.gitignore`): o arquivo está rastreado e carrega a chave **atual**
  de produção — conferido manualmente em 30/08 (chave do arquivo == chave do `.env.prod.local`).
  Achado [`evolution-api-key-tracked-claude-settings`](#evolution-api-key-tracked-claude-settings).

---

## Onda 1 — Deleções confirmadas

Tudo aqui passou pelo verificador adversarial. Risco baixo; o `pnpm build` pega qualquer engano.

### 1a. Dependências

- [**cookies-next is installed but never imported anywhere**](#dep-cookies-next-unused) — `package.json`  
  Removes 1 dependency, ~0.1 MB installed (measured in node_modules/.pnpm/cookies-next@6.1.1_...). Mostly manifest clarity — one less package to audit/update.

- [**zustand is in dependencies and documented as part of the stack, but has zero imports**](#dep-zustand-unused) — `package.json` · `CLAUDE.md` · `README.md` · `docs/ARCHITECTURE.md`  
  Removes 1 dependency (~0.1 MB installed) and, more importantly, fixes misleading docs: CLAUDE.md's Stack line tells every future session that Zustand is in use.

- [**@vercel/blob is installed but uploads run entirely on Supabase Storage**](#dep-vercel-blob-unused) — `package.json` · `src/app/api/upload/route.ts` · `src/app/api/upload/signed-url/route.ts` · `.env.example` · `CLAUDE.md`  
  Removes 1 dependency (~0.6 MB installed), one dead env var in .env.example, and a stale stack claim in CLAUDE.md that misleads future work.

- [**Direct tesseract.js-core@^6.1.2 dep is a 29 MB duplicate nothing imports**](#dep-tesseract-js-core-duplicate) — `package.json` · `src/app/porter/_components/PlateScanner.tsx` · `public/tesseract`  
  Deleting the direct dep drops 29.2 MB from every install (the 6.1.2 copy disappears; the 7.0.0 copy stays as tesseract.js's own dep). Also removes a version-drift trap: the pinned 6.x will silently diverge from what tesseract.js 7 actually bundles.

### 1b. Rotas de API

- [**/api/chatwoot/sso — SSO magic-link endpoint that no UI ever calls**](#chatwoot-sso-dead) — `src/app/api/chatwoot/sso/route.ts` · `.env.example`  
  Deletes 36 LoC, plus 3 dead env entries in .env.example (CHATWOOT_URL, NEXT_PUBLIC_CHATWOOT_URL, CHATWOOT_SSO_SECRET) and their Vercel counterparts; removes a stale server-wide secret from the config surface.

- [**/api/admin/auth/signout — superseded duplicate of /api/auth/signout, zero callers**](#admin-auth-signout-superseded) — `src/app/api/admin/auth/signout/route.ts` · `src/app/api/auth/signout/route.ts`  
  Deletes 36 LoC and removes a confusing near-duplicate that invites future edits to the wrong file (the two have already drifted: one has the hang-protection fix, the other doesn't). Update the comment in login/route.ts:9 to point at /api/auth/signout.

- [**/api/admin/concierge/groups and /groups/[id] — full CRUD API with zero HTTP callers (UI uses ConciergeService directly)**](#concierge-groups-routes-uncalled) — `src/app/api/admin/concierge/groups/route.ts` · `src/app/api/admin/concierge/groups/[id]/route.ts` · `src/services/concierge-service.ts`  
  Deletes 2 files / ~103 LoC and removes a second, audit-less write path to concierge_groups that has drifted from the real one (service logs to AuditService on every mutation; routes don't).  
  ⚠️ **Rebaixado na verificação:** The 4 handlers in src/app/api/admin/concierge/groups/route.ts and groups/[id]/route.ts are unreachable as shipped (zero callers) and have drifted from ConciergeService (no audit log, GET missing active=true filter). Resolve the duplication one way or the other: either delete both route files, or — per the admin pattern in src/app/admin/CLAUDE.md — point useConcierge.ts group CRUD at these routes and add AuditService logging + the active filter to them. Ask the operator which direction before acting; do not leave both write paths.

- [**/api/push/unsubscribe — DELETE endpoint with no caller in app code or service worker**](#push-unsubscribe-uncalled) — `src/app/api/push/unsubscribe/route.ts` · `src/components/PushNotificationManager.tsx` · `public/sw.js`  
  33 LoC; one less endpoint in a security-sensitive surface (push) to maintain and reason about.

> Nota: `/api/broadcast` e `/api/broadcast/preview` também morrem — o único chamador era o
> `BroadcastPanel` (item 1e). Deletar painel e rotas no mesmo commit.

### 1c. Exports mortos em `src/lib`

- [**countries.ts: getCountryByDDI is never called**](#dead-getcountrybyddi) — `src/lib/countries.ts`  
  ~8 LoC; removes a misleading DDI heuristic that conflicts with lib/phone.ts conventions.

- [**task-ui.ts: getTaskBgClass is never called**](#dead-gettaskbgclass) — `src/lib/task-ui.ts`  
  ~10 LoC; also lets Tailwind drop 6 bg-*/10 utility combos it currently sees referenced.

- [**Five single-function dead exports across lib (isMultiLangEmpty, roleRank, accountIsClear, isInternalStay, byCabinNumber)**](#dead-single-exports-batch) — `src/lib/multilang.ts` · `src/lib/roles.ts` · `src/lib/stay-account.ts` · `src/lib/stay-display.ts` · `src/lib/stock-locations.ts`  
  ~25 LoC across 5 files; shrinks the 'convergence target' APIs to what is actually consumed.

- [**rate-engine.ts: weddingHeader dead — the couple-name header was never wired into {CASAMENTO_HEADER}**](#weddingheader-never-wired) — `src/lib/rate-engine.ts` · `src/app/admin/comercial/_components/NewQuoteWizard.tsx`  
  Either ~10 LoC + the dead weddingCouple field deleted, or a one-line fix that makes the quote WhatsApp header finally show the couple's names as designed.

- [**ConciergeService.getConciergeItemsForMaid is @deprecated with zero callers**](#concierge-deprecated-no-callers) — `src/services/concierge-service.ts`  
  Deletes ~15 LoC and removes a trap: the method queries concierge_items for the maid flow that was deliberately moved to the stock module in jun/2026 — a future caller would resurrect retired behavior.

### 1d. Métodos mortos em `src/services` (varredura de 30/08 — 44 arquivos, todos os estilos de export)

Nenhum arquivo de serviço morre inteiro (todos têm ≥1 importador); o que morre são **métodos** — a
maioria é a metade da dupla "service × rota de API" que perdeu a disputa e ficou para trás.

- [**Dead 3-file chain: TestWhatsAppButton -> whatsapp-actions -> message-queue-service (plus orphaned message_queue table)**](#dead-whatsapp-test-chain) — `src/components/TestWhatsAppButton.tsx` · `src/actions/whatsapp-actions.ts` · `src/services/message-queue-service.ts`  
  ~180 LoC across 3 files; removes the stray src/actions/ directory entirely; surfaces that the 'message_queue' Postgres table is orphaned and can be dropped separately.

- [**WeddingService: 8 dead CRUD methods duplicating what /api/admin/weddings routes do inline**](#wedding-service-dead-crud) — `src/services/wedding-service.ts`  
  ~75 LoC out of 589; removes a misleading second write-path for the weddings table (relevant given the EVENTS-V2/partner work touching this domain).

- [**SurveyService: 5 dead methods — the guest submit path moved to /api/guest/survey; plus a stale comment claiming otherwise**](#survey-service-dead-guest-path) — `src/services/survey-service.ts` · `src/lib/survey-metrics.ts`  
  ~81 LoC out of 286; removes a second survey write-path that skips whatever the guest route enforces; fixes a comment that actively misleads (it claims metrics run in a path that no longer exists).

- [**AuditService: the entire read half (3 of 4 methods, lines 41-88) is dead — reads go through /api/admin/audit-logs**](#audit-service-dead-read-half) — `src/services/audit-service.ts`  
  ~48 LoC out of 89 — file shrinks to just the log() writer, matching its actual role.

- [**fbService: dead order write path (createOrder/updateOrder/getOrderForStayDate) — guest breakfast orders are written by /api/guest/breakfast-orders**](#fb-service-dead-order-writes) — `src/services/fb-service.ts`  
  ~75 LoC out of 389; removes a write path that bypasses whatever validation the guest route applies (CafeBuilder flow).

- [**ContactService.resolveContactContext (~90 lines, end of file) is dead, along with the ContactContext types in aura.ts**](#contact-service-resolve-context) — `src/services/contact-service.ts` · `src/types/aura.ts`  
  ~90 LoC in the service + ~12 lines of orphaned types in aura.ts (27% of contact-service.ts).

- [**StayService: 5 dead methods (~75 lines), incl. two superseded duplicates of live methods**](#stay-service-dead-methods) — `src/services/stay-service.ts`  
  ~75 LoC out of 1033 in one of the four biggest services; kills an N+1 query pattern and two same-purpose duplicate readers.

- [**StructureService: 4 dead reader methods (getStructure, getBreakfastVenue, getBookingsByDate, getAllBookingsByDate)**](#structure-service-dead-readers) — `src/services/structure-service.ts`  
  ~48 LoC out of 556.

- [**BreakfastSalonService: moveGuest (~40 lines) and getAttendanceByStay are dead**](#breakfast-salon-dead-methods) — `src/services/breakfast-salon-service.ts`  
  ~54 LoC out of 381.

- [**ConciergeService: 4 dead methods, one already annotated '@deprecated ... Sem chamadores vivos'**](#concierge-service-dead-readers) — `src/services/concierge-service.ts`  
  ~43 LoC out of 790; executes the deletion its own deprecation comment already promises.

- [**Five one-off dead methods: EventService.getPublishedEvents/getEventById, StockService.getBalances, CrmService.saveQuoteLeadSettings, MaintenanceService.updateRuleLastTriggered, AssetService.getDepreciationEntries**](#small-dead-methods-rollup) — `src/services/event-service.ts` · `src/services/stock-service.ts` · `src/services/crm-service.ts` · `src/services/maintenance-service.ts` · `src/services/asset-service.ts`  
  ~55 LoC across 5 files; in event-service it clears noise ahead of the planned EVENTS-V2 rework (docs/EVENTS-V2.md).  
  ⚠️ **Rebaixado na verificação:** Delete four outright: StockService.getBalances, CrmService.saveQuoteLeadSettings, MaintenanceService.updateRuleLastTriggered, AssetService.getDepreciationEntries — plus EventService.getEventById. For EventService.getPublishedEvents, do not delete silently: either delete it together with correcting docs/ALTAMARE.md:137 (the '3 leituras públicas' become 2, and the future visibility filter lands only in api/guest/events + api/guest/today), or park that one method for the EVENTS-V2/Altamare slice that owns event-service — deleting it while the active integration plan names it would create plan drift.

### 1e. Componentes e páginas órfãos (verificados adversarialmente em 30/08)

- [**StaffMobileHub.tsx (386 LoC) unreferenced since June, still being maintained while dead**](#staff-mobile-hub-dead) — `src/components/admin/StaffMobileHub.tsx`  
  386 LoC deleted; stops wasted maintenance (it was updated in a repo-wide sweep 4 days ago despite being unreachable).

- [**BroadcastPanel.tsx (369 LoC) dead since April Chatwoot migration; sole caller of /api/broadcast and /api/broadcast/preview**](#broadcast-panel-dead) — `src/components/admin/BroadcastPanel.tsx` · `src/app/api/broadcast/route.ts` · `src/app/api/broadcast/preview/route.ts`  
  369 LoC of UI plus the two orphaned API routes under src/app/api/broadcast/ (mass-WhatsApp send endpoints that no UI can reach); removes a live POST surface that only exists for a dead panel.

- [**ContactsPanel.tsx (253 LoC) unreferenced since the same April comunicação rework**](#contacts-panel-dead) — `src/components/admin/ContactsPanel.tsx`  
  253 LoC deleted; removes a second, stale contacts UI that shadows the live /admin/contacts page.

- [**/admin/contacts page and ContactsPanel.tsx both dead since 18/04/2026 — two copies of a contacts UI nothing can open**](#admin-contacts-orphan) — `src/app/admin/contacts/page.tsx` · `src/components/admin/ContactsPanel.tsx`  
  544 LoC deleted (291 page + 253 panel) plus the AdminTopbar map entry; follow-on: ContactService.listContacts/updateContact/deleteContact and the GET/PATCH/DELETE surface of /api/admin/contacts lose their last callers (coordinate with the API-dimension cleanup)

- [**guest/CheckInForm.tsx (203 LoC) is the pre-portal check-in form, unreferenced since February snapshots**](#guest-checkin-form-dead) — `src/components/guest/CheckInForm.tsx`  
  203 LoC deleted; removes a stale guest-facing form that bypasses the current portal conventions (it talks to Supabase directly from the browser, against the /api/guest/* pattern adopted after the anon-key lockdown).

- [**MessengerMaskModal.tsx (136 LoC) dead since the Evolution/Chatwoot migration, restyled while dead**](#messenger-mask-modal-dead) — `src/components/admin/MessengerMaskModal.tsx`  
  136 LoC deleted; stops repeat wasted work in kit sweeps (this file has now been dead through two UI migrations).

- [**TestWhatsAppButton.tsx — dev test helper never imported anywhere**](#test-whatsapp-button-dead) — `src/components/TestWhatsAppButton.tsx`  
  56 LoC deleted.

- [**VersionFooter.tsx — version badge feature lives elsewhere; this copy renders nowhere**](#version-footer-dead) — `src/components/VersionFooter.tsx`  
  15 LoC deleted; ends the pattern of updating a footer nobody renders.

- [**HousekeepingRoutinesModal.tsx transition stub — the 'residual imports' it protects no longer exist**](#housekeeping-routines-stub-obsolete) — `src/components/admin/HousekeepingRoutinesModal.tsx`  
  1 file removed; eliminates a misleading tombstone in src/components/admin/.

- [**Guest portal /breakfast + /breakfast/status pages orphaned since Portal 2.0 (Jun/2026) — ~2,100 LoC still receiving maintenance**](#portal-breakfast-pages-orphan) — `src/app/check-in/[code]/breakfast/page.tsx` · `src/app/check-in/[code]/breakfast/status/page.tsx`  
  ~2,100 LoC deleted (1,427 + 673), one route segment removed; retires ROADMAP bug item and REFACTORING split item that target dead code; stops API-migration/bug-fix work being spent on unreachable screens

- [**Guest portal /check-in/[code]/events page orphaned — Explore tab replaced it, yet it got a bug fix 3 days before this audit**](#portal-events-page-orphan) — `src/app/check-in/[code]/events/page.tsx`  
  571 LoC deleted plus its i18n leftovers in check-in/[code]/page.tsx (events/eventsSub strings, lines 76-77, 134-135, 192-193); ends the pattern of fixing multi-day-event bugs twice (here and in ExploreScreen)

- [**Guest portal /check-in/[code]/map/page.tsx orphaned — map was migrated into ExploreScreen; the map/ components must stay**](#portal-map-page-orphan) — `src/app/check-in/[code]/map/page.tsx`  
  458 LoC deleted (page.tsx ONLY); one fewer page to drag along in every portal API/session refactor

- [**/director/equipe orphaned since 02/06/2026 — superseded by the inline EquipeSection of /director, still restyled after death**](#director-equipe-orphan) — `src/app/director/equipe/page.tsx`  
  404 LoC and one route segment deleted; removes a browser-direct Supabase read path from a field app and a second copy of the Equipe UI that already drifted from the inline one

- [**/termos (SaaS terms of use, 308 lines) has zero inbound links — not even from the /aura marketing footer that links /changelog**](#termos-never-linked) — `src/app/termos/page.tsx` · `src/app/aura/page.tsx`  
  Either one footer link on /aura (plus ideally /admin/login) makes a 308-line legal page functional, or 308 LoC deleted if the terms are premature; clause 2.2 of the page itself claims use implies acceptance — an unreachable terms page undermines that legal claim

### 1f. Higiene de repositório

- [**Root-level scratch files b.json, body.json, root.json are saved API error responses**](#root-scratch-json) — `b.json` · `body.json` · `root.json`  
  Removes git-status noise at repo root; optionally extend the .gitignore scratch block so future curl dumps don't reappear.

- [**Six one-off debug scripts in scripts/dev, one of them byte-corrupted, none wired anywhere**](#scripts-dev-oneoff-probes) — `scripts/dev/test-cron.js` · `scripts/dev/test-cron.ts` · `scripts/dev/test-db.ts` · `scripts/dev/test-docker.js` · `scripts/dev/test-users.ts` · `scripts/dev/test_insert.cjs`  
  Deletes 6 files (~200 LoC) of stale probes, two of which leak secrets; leaves scripts/dev/ containing only the legitimately documented promote-guest-ids.mjs.

- [**.env.example documents 15 env vars no code reads (whole Firebase block + WhatsApp-service + 4 Chatwoot vars), and omits one that is read**](#env-example-dead-vars) — `.env.example`  
  Prunes ~20 lines of misleading onboarding documentation; anyone provisioning a new environment today would waste time hunting Firebase credentials the app never uses.

- [**public/Logo.png (3.1 MB) plus Next.js boilerplate SVGs are tracked but referenced nowhere**](#public-dead-assets) — `public/Logo.png` · `public/next.svg` · `public/vercel.svg`  
  ~3.1 MB off the repo and every Vercel deployment; removes ambiguity about which logo file is canonical.  
  ⚠️ **Rebaixado na verificação:** Delete public/next.svg and public/vercel.svg now (zero references, create-next-app leftovers). For public/Logo.png, the in-repo evidence holds (zero content references even case-insensitively — every live logo use is /logo_flat.png or /logo_transp.PNG), BUT the reviewer missed a dynamic reference path: properties.logoUrl and settings.logoFullUrl are free-text DB fields editable at src/app/admin/configuracoes/marca/page.tsx:85-86 and :107, consumed by rate-quote-public-service.ts:515, wedding-site-service.ts:155, asset-public-service.ts:59 and PhonePreview — a production row could literally hold '/Logo.png' or 'https://aaura.app.br/Logo.png'. Run one SQL check (select id, "logoUrl", settings->>'logoFullUrl' from properties) before deleting Logo.png; if clean, delete.

- [**Two tariff-work spreadsheets parked in the repo root, uncovered by .gitignore**](#root-xlsx-working-files) — `Ajustes Tarifários 2027 - WORK IN PROGRESS.xlsx` · `Tarifario 2027-2028 - proposta Claude.xlsx`  
  Cleaner git status; removes the accidental-commit risk for pricing spreadsheets. These are active work files (WIP per filename) — move them next to the pitch files in C:\Aura-Experience\ (the git root already holds untracked .pptx there anyway) or add *.xlsx to the scratch block of .gitignore.

- [**whatsapp-service/ container is legacy — app has zero references and its webhook endpoints were removed**](#whatsapp-service-superseded) — `whatsapp-service/server.js` · `whatsapp-service/Dockerfile` · `whatsapp-service/package.json` · `.wwebjs_auth` · `docs/DEPLOYMENT.md` · `docs/ARCHITECTURE.md`  
  Deletes a 3-file container dir + empty .wwebjs_auth, removes ~10 stale env-var lines from .env.example, and fixes docs (DEPLOYMENT.md, ARCHITECTURE.md, CLAUDE.md) that misdescribe the current WhatsApp architecture — the docs staleness actively misleads (they say the app calls this service; it cannot).

---

## Onda 2 — Consolidação

Aqui não se ganha em bytes, ganha-se em não corrigir o mesmo bug em 25 lugares.

- [**BRL money formatter reimplemented ~25 times with 5 conflicting output formats**](#brl-money-formatter-25-copies) — `src/lib/rate-engine.ts` · `src/app/admin/concierge/_components/concierge-utils.ts` · `src/app/admin/food-and-beverage/orders/_components/orders-utils.ts` · `src/app/admin/casamentos/_components/lib.tsx` · `src/app/admin/comercial/_components/shared.ts` · `src/app/admin/estoque/page.tsx` · `src/app/admin/estoque/relatorios/page.tsx` · `src/app/admin/estoque/perdas/page.tsx` · `src/app/admin/estoque/compras/_components/ImportXmlDialog.tsx` · `src/app/admin/patrimonio/page.tsx` · `src/app/admin/patrimonio/[id]/page.tsx` · `src/app/admin/patrimonio/relatorios/page.tsx` · `src/app/admin/guarita/page.tsx` · `src/app/admin/hsystem/page.tsx` · `src/app/admin/food-and-beverage/menu/page.tsx` · `src/app/admin/food-and-beverage/menu/_components/MenuDialogs.tsx` · `src/app/porter/_components/guarita-ui.ts` · `src/lib/stay-account.ts` · `src/components/admin/folio/AccountEntry.tsx` · `src/components/admin/LodgingPanel.tsx` · `src/components/admin/AssetFormModal.tsx` · `src/components/admin/AssetDisposalModal.tsx` · `src/app/cotacao/[id]/ProposalClient.tsx` · `src/app/cotacao/[id]/IntakeForm.tsx` · `src/app/check-in/[code]/_portal/OrdersScreen.tsx`  
  ~25 deleted local definitions (~30 LoC), plus fixes at least 7 files currently rendering US-style decimals; one place to change if currency display rules ever change.

- [**Evolution WhatsApp send path duplicated in 3 routes, config resolution in 5 places**](#evolution-sendtext-triplicated) — `src/app/api/chat/send/route.ts` · `src/app/api/admin/messages/send-now/route.ts` · `src/app/api/cron/process-messages/route.ts` · `src/app/api/whatsapp/check-number/route.ts` · `src/app/api/admin/whatsapp/session/route.ts` · `src/lib/evolution-error.ts`  
  ~130 LoC deduped across 5 files. Bigger payoff: a single choke point for sends — the volume-cap/circuit-breaker hardening that currently lives uncommitted in a git stash (per project memory whatsapp-send-hardening) would have exactly one place to land, and the DDI pre-check (whatsappNumberProblem) would automatically cover manual resends, which it currently does not.

- [**/api/push/send/* still carry private copies of fanOut/fanOutByRole/cleanExpired that push-notify.ts was created to replace**](#dup-push-fanout-routes) — `src/app/api/push/send/housekeeping/route.ts` · `src/app/api/push/send/maintenance/route.ts` · `src/app/api/push/send/concierge/route.ts` · `src/lib/push-notify.ts`  
  ~60-80 LoC across three route files; future push fixes land once instead of four times.

- [**push fan-out helpers duplicated in /api/push/send/* despite push-notify.ts existing to consolidate them**](#push-fanout-still-duplicated-in-webhook-routes) — `src/lib/push-notify.ts` · `src/app/api/push/send/housekeeping/route.ts` · `src/app/api/push/send/concierge/route.ts` · `src/app/api/push/send/maintenance/route.ts`  
  ~100 LoC deleted across 3 routes; expired-subscription cleanup and error-logging behavior becomes uniform across the webhook path and the in-code trigger path.

- [**addDays / nightsBetween / todayIso(SP) / formatDateBR each reimplemented 3-13 times**](#date-helpers-reimplemented) — `src/lib/rate-engine.ts` · `src/lib/event-dates.ts` · `src/services/wedding-service.ts` · `src/services/crm-service.ts` · `src/services/hsystem-service.ts` · `src/services/finance-service.ts` · `src/services/rate-service.ts` · `src/services/rate-quote-public-service.ts` · `src/services/wedding-site-service.ts` · `src/app/admin/casamentos/_components/lib.tsx` · `src/app/admin/comercial/_components/shared.ts` · `src/app/admin/comercial/_components/NewQuoteWizard.tsx` · `src/app/cotacao/[id]/ProposalClient.tsx` · `src/context/NotificationContext.tsx`  
  ~10 duplicate function bodies (~45 LoC) plus 13 inline tz one-liners collapse; eliminates the standing risk of one copy drifting (hsystem already computes 'today' by a different mechanism than everyone else).  
  ⚠️ **Rebaixado na verificação:** Consolidate addDays and the 13 todayIso/localToday America/Sao_Paulo one-liners freely (semantics verified identical), keeping the documented device-tz vs property-tz split. Do NOT mechanically replace the nightsBetween and date-formatting copies: hsystem's Math.max(1,…), NewQuoteWizard's Math.max(0,…), and the "—"/null guards in casamentos lib.tsx and comercial/shared.ts are call-site semantics that must be preserved or explicitly parameterized, and pnpm build will not catch mistakes there — those need eyeballed per-call-site migration, not a swap.

- [**name/name_en/name_es picker reimplemented in 6 files outside map/utils/localize.ts**](#inline-translation-pick-6-copies) — `src/app/check-in/[code]/map/utils/localize.ts` · `src/lib/multilang.ts` · `src/app/check-in/[code]/_portal/CafeBuilder.tsx` · `src/app/check-in/[code]/_portal/OrdersScreen.tsx` · `src/app/check-in/[code]/breakfast/page.tsx` · `src/app/check-in/[code]/concierge/page.tsx` · `src/app/feedback/[stayId]/page.tsx` · `src/app/feedback/[stayId]/CuratedSurvey.tsx`  
  ~30 LoC of duplicate pickers across 6 files; a generic pickLang(obj, field, lang) in src/lib/multilang.ts (re-exported from map/utils/localize.ts) gives one definition of the fallback rule (empty translation falls back to PT) for every current and future translated column.

- [**Identical realtime subscribe/teardown block hand-rolled in ~20 client call sites**](#realtime-subscribe-teardown-boilerplate) — `src/app/admin/stays/_components/useStaysLive.ts` · `src/app/admin/eventos/_components/useEventos.ts` · `src/app/admin/estruturas/bookings/_components/useBookings.ts` · `src/app/admin/reception/_components/useReceptionLive.ts` · `src/app/admin/cafe-salao/_components/useCafeSalao.ts` · `src/app/admin/reservation-map/ReservationMapClient.tsx` · `src/components/admin/folio/useFolio.ts` · `src/app/waiter/page.tsx` · `src/context/NotificationContext.tsx` · `src/lib/supabase.ts`  
  ~8 lines × ~20 client call sites (~160 LoC) plus removal of the subscribed-flag foot-gun; multi-table pages (waiter x4, director x5, useCafeSalao x4, NotificationContext x5) collapse to one hook call with a table list.

- [**COUNTRIES list hand-copied into the check-in form**](#dup-countries-list-checkin) — `src/app/check-in/form/[stayId]/page.tsx` · `src/lib/countries.ts`  
  ~20 LoC removed from a guest-facing page; single source of truth for the country/DDI list used by both the quote intake and pre-check-in.

- [**manager-override.ts reimplements login-attempts.ts (IP extraction, rate limit, attempt logging)**](#dup-manager-override-ratelimit) — `src/lib/manager-override.ts` · `src/lib/login-attempts.ts`  
  ~30 LoC; removes a behavioral drift (unknown-IP handling) between two security-sensitive rate limiters.

- [**roles.ts is the declared single source of role labels but only 1 file imports it; ~10 local copies remain**](#roles-convergence-stalled) — `src/lib/roles.ts` · `src/app/admin/staff/page.tsx` · `src/app/admin/escalas/page.tsx` · `src/app/admin/escalas/mensal/page.tsx` · `src/app/admin/hr/_components/hr-utils.ts` · `src/app/director/page.tsx` · `src/app/director/equipe/page.tsx` · `src/app/maid/page.tsx` · `src/components/admin/ImpersonateBanner.tsx` · `src/components/admin/StaffEditModal.tsx` · `src/components/auth/RoleSwitcher.tsx`  
  ~150+ LoC of copies removed; ends the label divergence users can actually see (maintenance/technician swapped between screens).

- [**Mini design-system copiado e colado em 7 apps de campo (T, STYLE, I, Pulse, Toast, Sheet, ReplenishSheet)**](#field-app-kit-duplicado) — `src/app/maid/page.tsx` · `src/app/governanta/page.tsx` · `src/app/houseman/page.tsx` · `src/app/maintenance/page.tsx` · `src/app/maintenance-ops/page.tsx` · `src/app/director/page.tsx` · `src/app/waiter/page.tsx`  
  ~1.500-2.000 linhas duplicadas consolidáveis; correções de acessibilidade/anti-toque-fantasma passam a valer para todos os apps de uma vez.

- [**Aura kit primitives exported by the barrel but consumed nowhere: Toolbar.tsx (whole file) + 6 dead exports**](#aura-kit-unconsumed-primitives) — `src/components/aura/Toolbar.tsx` · `src/components/aura/Progress.tsx` · `src/components/aura/DataList.tsx` · `src/components/aura/Skeleton.tsx` · `src/components/aura/ConfirmDialog.tsx` · `src/components/aura/hooks.ts` · `src/components/aura/index.ts`  
  ~200 LoC (Toolbar.tsx 70 + ~130 across the six exports) and a smaller barrel surface; per the ui-revamp convention the admin bundle imports the barrel, so unconsumed primitives ship in every admin page chunk that imports @/components/aura.  
  ⚠️ **Rebaixado na verificação:** The zero-consumer observation is accurate for all seven symbols, but three of them are prescribed building blocks of the MANDATORY admin-page recipe and must be treated as scheduled, not speculative: src/app/admin/CLAUDE.md step 4 prescribes '<Toolbar search filters chips>' for every page's filter row, step 5 prescribes '<ScrollMatrix>' for comparison matrices ('escalas, tarifário' per its docstring at DataList.tsx:258), and step 6 prescribes 'Heavy modals → next/dynamic with DialogSkeleton' (step 7's 'Skeleton*' also plausibly covers SkeletonChart). With revamp waves A1-C and the /admin/comercial restyle still pending, deleting Toolbar/ScrollMatrix/DialogSkeleton would break the documented convention new pages are required to follow — keep them (or change the recipe doc first; note Toolbar also owns a dedicated CSS section at src/styles/aura-kit.css:376 that would go with it). The genuinely unreferenced-anywhere candidates reduce to ProgressRing (Progress.tsx:16), useHasConfirmProvider (ConfirmDialog.tsx:208), and useIsCoarsePointer (hooks.ts:49) — no code, doc, or recipe mentions them; those three are safe to prune with owner sign-off. The bundle-size impact claim is also overstated: these are pure first-party ESM modules behind an 'export *' barrel, which webpack/Next production builds generally tree-shake.

- [**Two parallel button/textarea systems: shadcn ui/button (cva) in 16 legacy pages vs aura Button in 83 files**](#two-button-systems-shadcn-vs-aura) — `src/components/ui/button.tsx` · `src/components/ui/textarea.tsx` · `src/components/aura/Button.tsx` · `src/components/aura/Field.tsx`  
  Deleting ui/button.tsx + ui/textarea.tsx after migration removes the cva dependency entirely and one of two competing visual languages; ui/calendar.tsx + popover.tsx (react-day-picker date picker, sole consumer src/app/admin/stays/new/page.tsx) should stay until the kit has a date-picker primitive  
  ⚠️ **Sem verificação adversarial** — re-checar antes de mexer.

- [**ui/Toggle.tsx duplicates aura kit Switch**](#two-toggle-implementations) — `src/components/ui/Toggle.tsx` · `src/components/aura/Field.tsx`  
  19 LoC + one fewer half-identity component; makes the configuracoes pages internally consistent (they also hold the only SectionCard/SettingRow uses — that trio is the configuracoes design system, worth migrating as a unit)  
  ⚠️ **Sem verificação adversarial** — re-checar antes de mexer.

---

## Onda 3 — Complexidade e E/S redundante

Os dois primeiros valem dinheiro: o egress do Supabase é plano gratuito e já estourou uma vez.

- [**Funil comercial baixa até 500 orçamentos + 500 casamentos com select('*') (snapshot por noite, rooms, intake) para renderizar cartões com ~20 campos escalares**](#crm-pipeline-select-star-egress) — `src/services/crm-service.ts`  
  Reduz o payload da tela mais recarregada do comercial de 'todas as colunas × até 1.000 linhas' para os ~20 campos usados — corte direto de egress PostgREST (45,5% do estouro de 25/08) e de latência do funil.

- [**Director: cada evento realtime em 5 tabelas quentes redispara o dashboard inteiro (~25 queries) sem debounce**](#director-realtime-refetch-storm) — `src/app/director/page.tsx` · `src/app/api/director/dashboard/route.ts`  
  Corta o grosso das execuções do endpoint mais pesado por chamada do sistema (~25 queries/execução) e o egress correspondente — egress é custo real aqui (free plan estourou em 25/08).

- [**fb-service: reordenação faz N updates sequenciais pelo client do browser com erro ignorado**](#fb-reorder-n-updates-silenciosos) — `src/services/fb-service.ts`  
  N round-trips → 1; elimina uma classe de escrita silenciosamente perdida numa tela usada pela operação de F&B.

- [**RateService.listQuotes (400 × select('*')) não tem nenhum chamador vivo — só o branch 'lista tudo' da rota, que ninguém usa**](#listquotes-sem-caller) — `src/services/rate-service.ts` · `src/app/api/admin/tarifario/quotes/route.ts`  
  -13 linhas de service + fecha um caminho de egress de até 400 linhas completas de rate_quotes por chamada; menos um branch para racionalizar na rota.

- [**governanta/page.tsx (2.627 linhas): 1.250 linhas de sheets/componentes acima do componente principal são extração mecânica**](#governanta-page-seams) — `src/app/governanta/page.tsx`  
  ~1.250 linhas saem do page.tsx sem mudança de comportamento (sobra ~1.350); docs/REFACTORING.md já pede exatamente esse padrão (o exemplo concierge foi de 2088 → ~230 linhas).

- [**NewQuoteWizard.tsx (2.328 linhas): split natural por etapa do wizard + módulo DraftRoom + hook de contexto**](#newquotewizard-seams) — `src/app/admin/comercial/_components/NewQuoteWizard.tsx`  
  Arquivo cai de 2.328 para ~600-700 no shell do wizard; as etapas viram arquivos de ~200-450 linhas; ~170 linhas viram módulo puro testável.

- [**rate-service.ts (2.260 linhas): o ciclo de vida de orçamento (linhas 747-2104) é um domínio separado do CRUD de tarifário**](#rate-service-quote-split) — `src/services/rate-service.ts`  
  Dois arquivos de ~900-1.100 linhas com fronteira de domínio real; -2 round-trips por salvamento de orçamento; o import SIT (155 linhas) sai do caminho de leitura de todo mundo.

- [**check-in/form/[stayId]/page.tsx (1.997 linhas): dicionário de traduções, telas de status e 4 passos do wizard são extraíveis no padrão que o próprio portal já usa**](#checkin-form-seams) — `src/app/check-in/form/[stayId]/page.tsx`  
  Page cai para ~500-600 linhas; ~310 linhas de strings saem do bundle de parse do componente; passos viram arquivos de 150-330 linhas. É a superfície pública mais sensível (hóspede, 3 idiomas) — hoje qualquer ajuste de texto mexe no arquivo inteiro.

- [**types/aura.ts dobrou desde o plano de refactoring (1.679 → 3.474 linhas) e o barrel continua não feito**](#aura-ts-dobrou) — `src/types/aura.ts` · `docs/REFACTORING.md`  
  Arquivo tocado por quase todo o repo fica navegável; conflitos de merge no arquivo mais compartilhado do projeto caem; nenhum import muda.

---

## Extras da re-varredura de 30/08 — ⚠️ sem verificação adversarial

A segunda passada das varreduras de api/duplicação/complexidade/higiene achou itens que a primeira
não viu. **Nenhum passou por verificador** — re-checar antes de agir. O primeiro é de segurança:
avaliar junto com a Onda 0.

- [**/api/webhook/evolution/status — inbound webhook that writes messages.statusApi, which nothing reads**](#evolution-status-webhook-writeonly) — `src/app/api/webhook/evolution/status/route.ts` · `src/types/aura.ts`  
  Removing the route + disabling the MESSAGES_UPDATE webhook on the Evolution instance cuts a steady stream of pointless invocations and DB writes (2 reads + 1 write per receipt, several hundred/day) plus the statusApi dead column/type field.  
  ⚠️ **Sem verificação adversarial** — re-checar antes de mexer.

- [**governanta and maid apps bypass postFieldAction with hand-rolled POSTs (governanta's lack keepalive/timeout)**](#field-post-wrappers) — `src/lib/field-api.ts` · `src/app/governanta/page.tsx` · `src/app/maid/page.tsx`  
  5 write blocks consolidated; governanta's conference/assign/reject/create gain phone-lock survival and stuck-spinner protection for free — this is operational hardening, not just LoC (the incident history in memory is precisely about field writes dying on lock).  
  ⚠️ **Sem verificação adversarial** — re-checar antes de mexer.

- [**CRON_SECRET auth guard pasted into 15 cron routes in two divergent dialects**](#cron-secret-guard-15-copies) — `src/app/api/cron/daily-automations/route.ts` · `src/app/api/cron/breakfast-attendance/route.ts` · `src/app/api/cron/daily-lodging/route.ts` · `src/app/api/cron/evening-revalidation/route.ts` · `src/app/api/cron/asset-depreciation/route.ts` · `src/app/api/cron/daily-housekeeping/route.ts` · `src/app/api/cron/housekeeping-routines/route.ts` · `src/app/api/cron/process-messages/route.ts` · `src/app/api/cron/wedding-status/route.ts` · `src/app/api/cron/crm-status/route.ts` · `src/app/api/cron/hsystem-sync/route.ts` · `src/app/api/cron/stock-expiry/route.ts` · `src/app/api/cron/maintenance/route.ts` · `src/app/api/cron/whatsapp-watchdog/route.ts` · `src/lib/api-auth.ts`  
  A 6-line `requireCronSecret(req)` in src/lib/api-auth.ts (returning the 401 response or null, matching the existing requireAuth/isAuthError style) replaces 15 copies (~60 LoC) and forces one deliberate answer to the current A/B divergence.  
  ⚠️ **Sem verificação adversarial** — re-checar antes de mexer.

- [**RateService.getBundle re-inlines everything getRateData does (5 queries + settings-defaults merge)**](#rate-service-bundle-vs-ratedata) — `src/services/rate-service.ts`  
  getBundle becomes `const data = await this.getRateData(propertyId)` plus the channels/weddings queries — ~25 duplicated lines deleted and, more importantly, the rate-settings default merge becomes single-source for every consumer of the tarifário.  
  ⚠️ **Sem verificação adversarial** — re-checar antes de mexer.

- [**/api/guest/today runs 6 sequential DB round trips where 3 waves suffice (guest portal home, hit on every portal open)**](#guest-today-sequential-roundtrips) — `src/app/api/guest/today/route.ts`  
  Roughly halves the route's DB-bound latency (6 RTs → 3) on the most-opened guest screen ('Sua jornada hoje'); no schema or payload change.  
  ⚠️ **Sem verificação adversarial** — re-checar antes de mexer.

- [**RateService.saveQuote awaits getRateData, getChannels and getQuoteById sequentially — three independent reads on every quote save/copy/send**](#save-quote-sequential-awaits) — `src/services/rate-service.ts`  
  2 fewer serial DB round trips per quote save; also applies to the copy/send path in NewQuoteWizard which calls save before markSent.  
  ⚠️ **Sem verificação adversarial** — re-checar antes de mexer.

- [**archiveExpiredQuotes inserts crm_interactions one row at a time in a loop instead of one batch insert**](#archive-quotes-per-row-inserts) — `src/services/rate-service.ts` · `src/services/crm-service.ts`  
  N sequential inserts → 1 per archive reason (2 total); bounds the cron's runtime on mass-expiry days.  
  ⚠️ **Sem verificação adversarial** — re-checar antes de mexer.

- [**Maid checklist path still does 3 sequential reads + 2 direct browser Supabase writes — the exact cold-lock hazard the rest of the app was migrated off**](#maid-checklist-browser-io) — `src/app/maid/page.tsx`  
  3 serial reads+1 write → 1 POST /api/field/housekeeping-tasks per first-open of a task; eliminates the last direct-write hang candidates in the maid app (the memory's 'radar de pendentes' can drop maid entirely); staff select('*') → select('id, fullName, role, active, profilePictureUrl') trims a needless wide read.  
  ⚠️ **Sem verificação adversarial** — re-checar antes de mexer.

- [**Governanta cabin-history taps fetch 40 full housekeeping_tasks rows (checklist JSON included) via browser client to render 9 columns**](#governanta-cabin-history-select-star) — `src/app/governanta/page.tsx`  
  Per tap on any cabin card: 40 wide rows with checklist arrays → 40 narrow rows (~an order of magnitude less egress on a repeated daily gesture), plus removes a silent-empty failure mode on cold sessions.  
  ⚠️ **Sem verificação adversarial** — re-checar antes de mexer.

- [**daily-automations cron scans ALL active/pending stays of every property with select('*') and then does per-stay guest/cabin/messages queries**](#daily-automations-wide-scan) — `src/app/api/cron/daily-automations/route.ts`  
  Daily cron egress on the stays table drops to a fraction (narrow columns × all stays + full rows × ~handful); rules/templates select('*') are small tables, leave them.  
  ⚠️ **Sem verificação adversarial** — re-checar antes de mexer.

- [**StayService.getStaysByStatus has zero callers — dead code carrying a textbook N+1 (2 queries per stay)**](#dead-getstaysbystatus-n1) — `src/services/stay-service.ts`  
  ~30 lines deleted; removes the only N+1-patterned read in StayService from the copy-paste surface.  
  ⚠️ **Sem verificação adversarial** — re-checar antes de mexer.

- [**Git-tracked .claude/settings.local.json leaks the CURRENT production Evolution API key**](#evolution-api-key-tracked-claude-settings) — `.claude/settings.local.json`  
  Closes an active credential exposure: anyone with repo access can send WhatsApp messages as the hotel and manage the Evolution instance at https://api.aaura.app.br. Also stops per-machine permission churn from landing in git.  
  ⚠️ **Sem verificação adversarial** — re-checar antes de mexer.

---

## Decisão de produto (não é faxina — não mexer sem decidir o recurso)

- [**tesseract.js + 11.6 MB of public/tesseract assets serve a deliberately disabled feature**](#dep-tesseract-js-parked-feature) — `src/app/porter/_components/PlateScanner.tsx` · `src/app/porter/_components/RegistroTab.tsx` · `public/tesseract`  
  None to reclaim right now without reversing a product decision. If the retry is ever abandoned for good, dropping tesseract.js + the direct core dep + public/tesseract would shed ~13 MB of repo/deploy weight and 2 npm deps.




---

# Anexo — todos os achados, com evidência

Cada achado traz o que a varredura mediu e o que o verificador tentou fazer para derrubá-lo. Os
vereditos de api/duplicação/higiene/complexidade vêm da rodada 1 (29/08); os de serviços,
componentes e páginas, da rodada 2 (30/08). Use os `id` como referência ao abrir tarefa.


## Dependências

<a id="dep-cookies-next-unused"></a>
### cookies-next is installed but never imported anywhere

`dep-cookies-next-unused` · unused-dependency · confiança high · recomendação **delete** · verificação: confirmado

**Arquivos:** `package.json`

**Por que sobra:** No file in src/, scripts/, or any config imports or requires cookies-next. Cookie handling goes through @supabase/ssr (src/lib/supabase-server.ts, src/lib/supabase-middleware.ts) and Next's own cookie APIs.

**Evidência:** Grep 'cookies-next' across C:\Aura-Experience\aura (ripgrep, gitignore-respecting, so node_modules excluded): only 2 hits — package.json line 30 and pnpm-lock.yaml. Zero hits in src/, scripts/, next.config.mjs, tailwind.config.ts. whatsapp-service/package.json (separate container) does not list it either.

**Impacto de remover:** Removes 1 dependency, ~0.1 MB installed (measured in node_modules/.pnpm/cookies-next@6.1.1_...). Mostly manifest clarity — one less package to audit/update.

**Risco:** None found. Nothing to check beyond a `pnpm build` after removal; there are no string-based or dynamic references (grep covered all text files).

**Verificação (CONFIRMED):** Tried to refute and failed. Reran repo-wide grep for 'cookies-next': only package.json:30, pnpm-lock.yaml, and docs/CLEANUP.md (the reviewer's own report, not usage). Ran an unignored sweep (rg -uu excluding node_modules/.next/.git) to catch gitignored local scripts: nothing new. Grep of whatsapp-service/ (separate container): zero matches, and its package.json does not list it. public/sw.js read in full — push-only, no cookie logic. package.json has no postinstall/copy scripts that could shell out to it. Cookie handling is demonstrably @supabase/ssr: createServerClient/createBrowserClient imported in src/lib/supabase-server.ts:1, src/lib/supabase-middleware.ts:1, src/lib/api-auth.ts:4, src/lib/supabase-browser.ts:1, plus 3 auth routes. pnpm-lock importers section shows only the root project references it. Safe to delete; pnpm build is sufficient verification.


<a id="dep-zustand-unused"></a>
### zustand is in dependencies and documented as part of the stack, but has zero imports

`dep-zustand-unused` · unused-dependency · confiança high · recomendação **delete** · verificação: confirmado

**Arquivos:** `package.json` · `CLAUDE.md` · `README.md` · `docs/ARCHITECTURE.md`

**Por que sobra:** No store is ever created: no file imports zustand. All client state lives in React context (src/context/AuthContext.tsx, PropertyContext.tsx, NotificationContext.tsx) and local component state. The three docs listing 'Zustand' in the stack are stale.

**Evidência:** Grep `from ['"]zustand` across the repo: 0 files. Case-insensitive Grep 'zustand' across C:\Aura-Experience\aura: only package.json, pnpm-lock.yaml, CLAUDE.md, README.md, docs/ARCHITECTURE.md — all prose/manifest, no code.

**Impacto de remover:** Removes 1 dependency (~0.1 MB installed) and, more importantly, fixes misleading docs: CLAUDE.md's Stack line tells every future session that Zustand is in use.

**Risco:** None found in code. When removing, also delete 'Zustand' from the stack lines in CLAUDE.md, README.md and docs/ARCHITECTURE.md so docs and manifest stay in sync. Verify with `pnpm build`.

**Verificação (CONFIRMED):** Tried to refute and failed. Case-insensitive repo-wide grep for 'zustand' (plus rg -uu unignored sweep): hits only in package.json:55, pnpm-lock.yaml, and prose — CLAUDE.md:28, README.md:10, docs/ARCHITECTURE.md:8, and docs/CLEANUP.md (the report). Zero import/require in src/, scripts/, whatsapp-service/. Any import must contain the module string, so dynamic/aliased usage is excluded too. One addition to the fix list the finding missed: docs/ARCHITECTURE.md has a SECOND stale line at :84 ('Local/ephemeral UI state → Zustand stores and component useState') — update both lines 8 and 84 when removing, alongside CLAUDE.md:28 and README.md:10.


<a id="dep-vercel-blob-unused"></a>
### @vercel/blob is installed but uploads run entirely on Supabase Storage

`dep-vercel-blob-unused` · unused-dependency · confiança high · recomendação **delete** · verificação: confirmado

**Arquivos:** `package.json` · `src/app/api/upload/route.ts` · `src/app/api/upload/signed-url/route.ts` · `.env.example` · `CLAUDE.md`

**Por que sobra:** The upload stack no longer touches Vercel Blob. src/app/api/upload/route.ts uploads via supabaseAdmin.storage.from('images').upload(...) and returns a Supabase public URL; src/app/api/upload/signed-url/route.ts imports only next/server + supabase; src/components/admin/ImageUpload.tsx calls /api/upload and supabase .uploadToSignedUrl. CLAUDE.md ('Vercel Blob (file uploads)') and .env.example line 65 (BLOB_READ_WRITE_TOKEN=) are leftovers from the old backend.

**Evidência:** Grep '@vercel/blob' across C:\Aura-Experience\aura: only package.json + pnpm-lock.yaml. Grep 'blob.vercel-storage|vercel-storage|BLOB_READ_WRITE' in src/: 0 matches. Read src/app/api/upload/route.ts in full (Supabase Storage, lines 123-137) and the import block of signed-url/route.ts. Grep 'upload' in src/components/admin/ImageUpload.tsx shows it fetches /api/upload and /api/upload/signed-url.

**Impacto de remover:** Removes 1 dependency (~0.6 MB installed), one dead env var in .env.example, and a stale stack claim in CLAUDE.md that misleads future work.

**Risco:** Low. Old images uploaded to Vercel Blob (if any URLs are still stored in the DB) keep working — they are plain HTTPS URLs, not dependent on the SDK. Check the Vercel project's Blob store before deleting the store itself; removing the npm package is safe regardless. Verify with `pnpm build` and update CLAUDE.md/.env.example in the same commit.

**Verificação (CONFIRMED):** Tried to refute and failed. Read src/app/api/upload/route.ts in full: upload is supabaseAdmin.storage.from('images').upload(...) at lines 123-128 with getPublicUrl at 135-137 — no Blob. Read src/app/api/upload/signed-url/route.ts in full: createSignedUploadUrl on Supabase Storage (lines 43-45). Glob confirms those are the only two routes under src/app/api/upload/. src/components/admin/ImageUpload.tsx fetches /api/upload/signed-url (line 74), calls .uploadToSignedUrl (line 93) and /api/upload (line 108). Repo-wide grep '@vercel/blob|vercel-storage|BLOB_READ_WRITE': zero hits in src/, scripts/, whatsapp-service/, vercel.json, next.config.mjs. BLOB_READ_WRITE_TOKEN appears only in .env.example:65, local .env files (values, not code — the SDK is never invoked) and docs. Two extra stale-doc lines to update beyond the finding's list: docs/ARCHITECTURE.md:103 ('Vercel Blob (BLOB_READ_WRITE_TOKEN); routes under /api/upload') and docs/DEPLOYMENT.md:27.


<a id="dep-tesseract-js-core-duplicate"></a>
### Direct tesseract.js-core@^6.1.2 dep is a 29 MB duplicate nothing imports

`dep-tesseract-js-core-duplicate` · unused-dependency · confiança high · recomendação **delete** · verificação: confirmado

**Arquivos:** `package.json` · `src/app/porter/_components/PlateScanner.tsx` · `public/tesseract`

**Por que sobra:** Nothing imports 'tesseract.js-core' directly, and the runtime never loads core from node_modules anyway: PlateScanner.tsx (the only tesseract consumer) creates the worker with workerPath '/tesseract/worker.min.js', corePath '/tesseract', langPath '/tesseract' — all served from vendored files committed in public/tesseract (worker.min.js, tesseract-core-lstm.wasm.js, tesseract-core-simd-lstm.wasm.js, eng.traineddata; ~11.6 MB). Meanwhile tesseract.js@7.0.0 already declares its own tesseract.js-core@7.0.0 as a transitive dep, so the direct ^6.1.2 pin just installs a second, older, orphaned copy.

**Evidência:** Grep 'tesseract.js-core' across the repo: hits only in package.json line 51, pnpm-lock.yaml (which shows tesseract.js@7.0.0 -> tesseract.js-core@7.0.0 at line 5231, plus a separate top-level tesseract.js-core@6.1.2 entry), and an internal string inside public/tesseract/worker.min.js. Grep 'tesseract' (case-insensitive): only PlateScanner.tsx in src. Read PlateScanner.tsx lines 95-114 (worker config with /tesseract paths). Measured node_modules/.pnpm: tesseract.js-core@6.1.2 = 29.2 MB, tesseract.js-core@7.0.0 = 43.2 MB, tesseract.js@7.0.0 = 1.3 MB.

**Impacto de remover:** Deleting the direct dep drops 29.2 MB from every install (the 6.1.2 copy disappears; the 7.0.0 copy stays as tesseract.js's own dep). Also removes a version-drift trap: the pinned 6.x will silently diverge from what tesseract.js 7 actually bundles.

**Risco:** None at runtime: core is fetched from /tesseract (public assets), not node_modules, and tesseract.js keeps its own transitive core for any fallback. Confirm `pnpm build` passes and, if the plate scanner is ever re-enabled (SCANNER_READY in src/app/porter/_components/RegistroTab.tsx, currently false), re-test one OCR read.

**Verificação (CONFIRMED):** Tried to break the deletion via every vendoring/resolution path and failed: no import of 'tesseract.js-core' anywhere (repo grep: only package.json:51, pnpm-lock, worker.min.js internals, the CLEANUP.md report); package.json scripts are only next/lint/db:* — no postinstall or copy step; next.config.mjs has no webpack/copy config; public/sw.js does no precaching; all 5 public/tesseract files are git-tracked (git ls-files verified), so nothing is regenerated from node_modules at build time; pnpm isolation gives tesseract.js@7.0.0 its own nested tesseract.js-core@7.0.0 (lockfile line 5231), so the root 6.1.2 can never shadow it; PlateScanner passes explicit workerPath/corePath/langPath '/tesseract' (PlateScanner.tsx:101-103) so the browser never resolves node_modules core. Size claim verified: 29,921 KiB ≈ 29.2 MiB installed. One provenance correction that does NOT change the action: the vendored public core files byte-match core@6.1.2 exactly (tesseract-core-lstm.wasm.js 3,954,181 B; -simd- 3,954,569 B) and NOT core@7.0.0 (3,896,484 / 3,899,472), while public worker.min.js byte-matches tesseract.js@7.0.0/dist (111,307 B) — i.e., the direct dep was the deliberate vendoring source of the committed files, not a random orphan, and the mix already diverges from what tesseract.js 7 bundles. Since the files are committed and the feature is disabled, deleting the dep is safe; when removing, optionally note 'core vendored from tesseract.js-core@6.1.2' in public/tesseract/.gitattributes so provenance survives the manifest.


<a id="dep-tesseract-js-parked-feature"></a>
### tesseract.js + 11.6 MB of public/tesseract assets serve a deliberately disabled feature

`dep-tesseract-js-parked-feature` · unused-ui · confiança high · recomendação **keep** · verificação: confirmado

**Arquivos:** `src/app/porter/_components/PlateScanner.tsx` · `src/app/porter/_components/RegistroTab.tsx` · `public/tesseract`

**Por que sobra:** Context, not a removal call: the plate scanner failed its field test (27/08/2026) and is gated off by `const SCANNER_READY: boolean = false` in RegistroTab.tsx line 23, so tesseract.js (the dep) and the 11.6 MB of committed wasm/traineddata in public/tesseract currently serve no live user path. The header comment in PlateScanner.tsx explicitly says the component is being kept whole for a future retry, with a list of what to try before re-enabling.

**Evidência:** Grep 'SCANNER_READY' in src: RegistroTab.tsx line 23 sets it false and lines 107-148 gate the button/overlay. Grep 'tesseract' case-insensitive: PlateScanner.tsx is the only source consumer, via dynamic `await import("tesseract.js")` (line 98) — so it costs nothing in any bundle users load while disabled. Listed public/tesseract: eng.traineddata 3.92 MB, 2 core wasm.js files 3.77 MB each, worker.min.js 0.11 MB.

**Impacto de remover:** None to reclaim right now without reversing a product decision. If the retry is ever abandoned for good, dropping tesseract.js + the direct core dep + public/tesseract would shed ~13 MB of repo/deploy weight and 2 npm deps.

**Risco:** Removing any of it now would contradict the documented intent to retry with a plate-trained model. The dynamic import means the parked code has zero runtime cost to guests/staff.

**Verificação (CONFIRMED):** All facts check out for the 'keep' call. src/app/porter/_components/RegistroTab.tsx:23 is `const SCANNER_READY: boolean = false;` with the 27/08/2026 field-test failure documented at lines 12-22; the overlay render is gated at line 156 (`{SCANNER_READY && scanning && (<PlateScanner .../>)}`) and the button is disabled/'Em breve' at lines 181-198 (the finding's cited range 107-148 is slightly off — substance identical). PlateScanner.tsx is imported only by RegistroTab (grep across src) and loads tesseract.js via dynamic `await import("tesseract.js")` at line 98, so disabled state costs nothing in shipped bundles; public/sw.js (read in full) does NO precaching, so the 11.6 MB of assets (measured: eng.traineddata 4,113,088 + two cores 3,954,181/3,954,569 + worker 111,307 ≈ 11.58 MiB) are never fetched while off. Extra corroboration the reviewer missed, reinforcing 'deliberately parked, do not delete': next.config.mjs:19-25 sets Permissions-Policy `camera=()` with a comment explicitly instructing to restore `camera=(self)` in the same commit that flips SCANNER_READY — re-enabling is a documented two-file operation, and any future removal or re-enable must account for that header too.


**Cobertura desta varredura:** Scanned every entry in C:\Aura-Experience\aura\package.json (30 dependencies + 11 devDependencies) with individual ripgrep passes over the repo (ripgrep respects .gitignore, so node_modules was excluded; whatsapp-service/ was checked separately and shares none of the suspects — its own package.json lists cors/express/qrcode/qrcode-terminal/whatsapp-web.js only). Confirmed USED with file evidence: @google/generative-ai (src/app/api/ai/ask-reviews/route.ts), @hookform/resolvers + react-hook-form + zod (src/components/guest/CheckInForm.tsx — the only zod/RHF consumer, but a real one), @radix-ui/react-popover (src/components/ui/popover.tsx, src/components/aura/DataList.tsx), @radix-ui/react-slot + class-variance-authority (src/components/ui/button.tsx), @supabase/ssr (9 files incl. supabase-server.ts, middleware.ts), @supabase/supabase-js, @vercel/blob NO (finding), clsx + tailwind-merge (src/lib/utils.ts), date-fns (10+ files), emoji-picker-react (concierge GroupFormModal/CatalogFormModal — 32.7 MB installed, heavyweight but used), fast-xml-parser (src/lib/nfe.ts, src/lib/hunit.ts), fflate (src/app/api/admin/estoque/purchases/import/route.ts), leaflet + react-leaflet + react-leaflet-cluster (check-in/[code]/map/IllustratedMap.tsx, SatelliteMap.tsx), lucide-react (240 files), motion (src/components/aura/*, 6 files), qrcode.react (src/components/admin/AssetQr.tsx, check-in portal sheets.tsx), react-day-picker (src/components/ui/calendar.tsx, admin/stays/new/_components/useNewStay.ts), recharts (core dashboard charts.tsx, estoque page), sonner (5+ files), tailwindcss-animate (tailwind.config.ts plugin — only there, as expected), tesseract.js (PlateScanner.tsx, dynamic import; feature parked — see keep finding), uuid (11 files), web-push (src/lib/push-server.ts). DevDeps all justified: @types/leaflet/web-push/node/react/react-dom pair their packages, dotenv used by scripts/dev/test-*.ts|.cjs, eslint + eslint-config-next by lint, postcss/tailwindcss/typescript by the build. Not covered: I did not run a build or depcheck-style tool — evidence is grep-based, which is sufficient for the four unused-dep findings since none has any textual reference in code.

## src/lib

<a id="dead-getcountrybyddi"></a>
### countries.ts: getCountryByDDI is never called

`dead-getcountrybyddi` · dead-code · confiança high · recomendação **delete** · verificação: confirmado

**Arquivos:** `src/lib/countries.ts`

**Por que sobra:** Exported arrow function getCountryByDDI (lines 28-35) has zero call sites anywhere. It also hard-codes a 5-country subset with a 'Brasil' fallback that contradicts the no-auto-55 policy documented in src/lib/phone.ts, so reviving it would be a bug.

**Evidência:** grep -rnw 'getCountryByDDI' src whatsapp-service scripts --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' → only hit is the definition line src/lib/countries.ts:28. grep -c inside the file → 1 (definition only, no internal use).

**Impacto de remover:** ~8 LoC; removes a misleading DDI heuristic that conflicts with lib/phone.ts conventions.

**Risco:** None visible — no static or dynamic reference. Nothing else imports countries.ts except src/app/cotacao/[id]/IntakeForm.tsx, which imports only COUNTRIES.

**Verificação (CONFIRMED):** Tried to refute and failed. Repo-wide grep of C:\Aura-Experience (plus explicit sweeps of whatsapp-service/, scripts/, public/, and the parent git root outside aura/) finds getCountryByDDI only at its definition src/lib/countries.ts:28 and in the reviewer's own docs/CLEANUP.md. The sole importer of lib/countries is src/app/cotacao/[id]/IntakeForm.tsx:15 with a named `import { COUNTRIES }`; no src/lib barrel exists (glob src/lib/index.* empty); no `import * as` or string-key access anywhere. Read the file in full — no internal use. Minor rationale nuance (the function returns a country NAME, it doesn't inject 55, so 'contradicts no-auto-55' is loose — but phone.ts:5-7 does document the no-hidden-heuristic policy and the unconditional 'Brasil' fallback at countries.ts:34 is exactly such a heuristic). Delete is safe.


<a id="dup-countries-list-checkin"></a>
### COUNTRIES list hand-copied into the check-in form

`dup-countries-list-checkin` · duplicate-logic · confiança high · recomendação **consolidate** · verificação: confirmado

**Arquivos:** `src/app/check-in/form/[stayId]/page.tsx` · `src/lib/countries.ts`

**Por que sobra:** src/app/check-in/form/[stayId]/page.tsx lines 20-39 declare a private `const countries = [...]` that is entry-for-entry identical to COUNTRIES in src/lib/countries.ts (19 entries, same order, same flags/DDIs, same 'Outro'/XX sentinel). The lib file's own header says 'Mesma lista que o pré-check-in usa' — but the sharing is by copy-paste, so adding a country requires editing two files or they silently drift.

**Evidência:** grep -rn 'flag: "🇧🇷"' src → exactly two hits: src/app/check-in/form/[stayId]/page.tsx:21 and src/lib/countries.ts:7. Read both lists and compared all 19 entries. grep -rln 'lib/countries' src → only src/app/cotacao/[id]/IntakeForm.tsx imports the lib.

**Impacto de remover:** ~20 LoC removed from a guest-facing page; single source of truth for the country/DDI list used by both the quote intake and pre-check-in.

**Risco:** The check-in page is guest-facing PT/EN/ES; verify the local copy has no divergent entry before swapping (visual diff of the 19 lines showed none). Pure client-side constant, no build concerns.

**Verificação (CONFIRMED):** Read both lists line by line: src/lib/countries.ts:7-25 and src/app/check-in/form/[stayId]/page.tsx:21-39 are entry-for-entry identical — 19 entries, same order, names, iso, flags, DDIs, same 'Outro'/XX sentinel. Grep for 🇧🇷 across src returns only these two lists (the third hit, page.tsx:1180, is a language chip, not a country list). Hunted for a competing canonical list: read src/lib/phone.ts in full — it has DDI split/join helpers but no country list, so lib/countries (whose own header says 'Mesma lista que o pré-check-in usa') is the right single source. Only other consumer is IntakeForm.tsx importing COUNTRIES. Swapping the page's private const for the lib import is behavior-preserving.


<a id="dead-gettaskbgclass"></a>
### task-ui.ts: getTaskBgClass is never called

`dead-gettaskbgclass` · dead-code · confiança high · recomendação **delete** · verificação: confirmado

**Arquivos:** `src/lib/task-ui.ts`

**Por que sobra:** getTaskBgClass (lines 30-39) has zero call sites; its siblings getTaskLabel (16 uses), getTaskColorClass (5), showsMinibar (3), showsKeyLocation (1), canUpgradeToLinenChange (3) are all live, so the file stays — only this one function is dead.

**Evidência:** grep -rnw 'getTaskBgClass' src whatsapp-service scripts → only the definition at src/lib/task-ui.ts:30. Per-export usage counts run for every export of the file (grep -rn '\b<name>\b' src excluding src/lib/).

**Impacto de remover:** ~10 LoC; also lets Tailwind drop 6 bg-*/10 utility combos it currently sees referenced.

**Risco:** None visible; class strings are static so no dynamic-name lookup can reach it.

**Verificação (CONFIRMED):** Repo-wide grep (aura + parent root + whatsapp-service/scripts/public explicitly) → only the definition src/lib/task-ui.ts:30 and docs/CLEANUP.md. Verified all three importers of lib/task-ui use named imports that exclude it: src/app/maid/page.tsx:16 (getTaskLabel), src/app/admin/governance/kanban/page.tsx:27 (getTaskLabel, getTaskColorClass, showsMinibar, showsKeyLocation, canUpgradeToLinenChange), src/components/admin/HousekeepingChecklistModal.tsx:9 (getTaskLabel). No `import * as`, no dynamic name construction possible (read the file — static switch of class strings). File stays for its live siblings; only getTaskBgClass (lines 30-39) deletes.


<a id="dead-single-exports-batch"></a>
### Five single-function dead exports across lib (isMultiLangEmpty, roleRank, accountIsClear, isInternalStay, byCabinNumber)

`dead-single-exports-batch` · dead-code · confiança high · recomendação **delete** · verificação: confirmado

**Arquivos:** `src/lib/multilang.ts` · `src/lib/roles.ts` · `src/lib/stay-account.ts` · `src/lib/stay-display.ts` · `src/lib/stock-locations.ts`

**Por que sobra:** Each file is otherwise live, but one exported helper in each has zero references anywhere (not even same-file): multilang.ts::isMultiLangEmpty (line 25), roles.ts::roleRank (line 73), stay-account.ts::accountIsClear (line 144 — openChips, which it wraps, IS used externally), stay-display.ts::isInternalStay (line 22 — screens read stay.internalUse directly or via stayDisplayName), stock-locations.ts::byCabinNumber (line 29).

**Evidência:** Batch pass: extracted every `export (function|const|type|interface)` name from all 53 lib files, ran one grep -rEow alternation over src (3980 hits into /tmp/hits.txt), awk-joined against the symbol->file map to find symbols with zero hits outside the defining file; then grep -c '\b<name>\b' inside each defining file → count 1 (definition line only) for these five. Cross-checked against whatsapp-service/ and scripts/ with grep -rnw → no hits.

**Impacto de remover:** ~25 LoC across 5 files; shrinks the 'convergence target' APIs to what is actually consumed.

**Risco:** roleRank/isInternalStay are aspirational API for the documented convergence of role labels and internal-use display — deleting them is safe today but they may be re-added when old pages migrate; trivial to restore from git. Others have no story attached.

**Verificação (CONFIRMED):** Alternation grep for all five symbols across C:\Aura-Experience returned exactly one src hit per symbol (the definition line) plus docs/CLEANUP.md; explicit greps of whatsapp-service/, scripts/, public/, and the parent root found nothing. Read all five files to rule out internal use: stay-display.ts:17 stayDisplayName reads stay?.internalUse directly (not via isInternalStay:22); multilang.ts parseMultiLang never calls isMultiLangEmpty:25; stay-account.ts:144 accountIsClear is a thin wrapper over openChips — openChips IS imported by StayListView/StayCard/useStayAccount but the wrapper by no one; roles.ts:73 roleRank unused (StaffSelect.tsx imports only ROLE_ORDER + roleShortLabel); stock-locations.ts:29 byCabinNumber unused (consumers import CABIN_SENTINEL/splitLocations). No barrels, no relative-path importers (grep pattern covered both). All five are safe deletes; the reviewer's note that roleRank/isInternalStay are trivially restorable from git if the convergence migrations later want them is fair.


<a id="weddingheader-never-wired"></a>
### rate-engine.ts: weddingHeader dead — the couple-name header was never wired into {CASAMENTO_HEADER}

`weddingheader-never-wired` · dead-code · confiança high · recomendação **investigate** · verificação: confirmado

**Arquivos:** `src/lib/rate-engine.ts` · `src/app/admin/comercial/_components/NewQuoteWizard.tsx`

**Por que sobra:** weddingHeader (rate-engine.ts:550-558) renders '💍 Convidados do casamento de <casal>' but has zero call sites. processTemplate (line 581) replaces {CASAMENTO_HEADER} with the hard-coded generic '💍 *Convidados de Casamento*' and ignores ctx.weddingCouple — even though NewQuoteWizard.tsx:1041 dutifully fills weddingCouple, and the QuoteMessageContext comment (line 537) says the field exists precisely so 'o cabeçalho' doesn't 'volta[r] ao texto genérico'. So either the function is leftover, or the intended feature (couple names in the quote message) was never finished.

**Evidência:** grep -rnw 'weddingHeader' src whatsapp-service scripts → only src/lib/rate-engine.ts:550. grep -rn 'weddingCouple' src → set at NewQuoteWizard.tsx:1041, declared at rate-engine.ts:540, read nowhere. grep -rn 'CASAMENTO_HEADER' src → template docs + the generic inline replacement at rate-engine.ts:581.

**Impacto de remover:** Either ~10 LoC + the dead weddingCouple field deleted, or a one-line fix that makes the quote WhatsApp header finally show the couple's names as designed.

**Risco:** Do not just delete: the surrounding comments and the wizard filling weddingCouple suggest the intended fix is processTemplate calling weddingHeader(ctx.weddingCouple, ctx.isWedding). Confirm with the owner which way to resolve.

**Verificação (CONFIRMED):** weddingHeader: zero call sites repo-wide (only rate-engine.ts:550 + CLEANUP.md). weddingCouple: written at NewQuoteWizard.tsx:1041 into msgCtx, which flows to processTemplate at line 1044 — verified processTemplate is the ONLY caller in the repo and it ignores ctx.weddingCouple, hardcoding the generic '💍 *Convidados de Casamento*' at rate-engine.ts:581. Hunted for a second template processor or another 💍-header builder that might consume weddingHeader: grep of CASAMENTO_HEADER and 💍 across src finds none — notably the PUBLIC proposal page DOES render couple names (ProposalClient.tsx:321-323, t.weddingGuest(quote.wedding.couple)), which strengthens the finding: the couple-name feature was built everywhere except the WhatsApp header, exactly the 'never finished wiring' the QuoteMessageContext comment (rate-engine.ts:536-539) implies. 'Investigate' (one-line wire-up vs delete function + field + wizard line) is the correct recommendation.


<a id="dup-push-fanout-routes"></a>
### /api/push/send/* still carry private copies of fanOut/fanOutByRole/cleanExpired that push-notify.ts was created to replace

`dup-push-fanout-routes` · duplicate-logic · confiança high · recomendação **consolidate** · verificação: confirmado

**Arquivos:** `src/app/api/push/send/housekeeping/route.ts` · `src/app/api/push/send/maintenance/route.ts` · `src/app/api/push/send/concierge/route.ts` · `src/lib/push-notify.ts`

**Por que sobra:** src/lib/push-notify.ts's header says it 'Reúne o fan-out (antes duplicado em /api/push/send/*)', yet all three send routes still define their own cleanExpired/fanOut/fanOutByRole with the identical query and 410-cleanup loop. The cost is concrete: the CURRENT uncommitted working-tree diff applies the same 'check the error or the push dies silently' fix four separate times — once in the lib and once per route copy.

**Evidência:** Read src/app/api/push/send/housekeeping/route.ts (private cleanExpired/fanOut/fanOutByRole, lines 7-40+) and src/lib/push-notify.ts (exported fanOut/fanOutByRole with same select endpoint,p256dh,auth / .in staffId / .eq propertyId shape). git diff --stat shows the identical error-logging patch touching all 4 files right now.

**Impacto de remover:** ~60-80 LoC across three route files; future push fixes land once instead of four times.

**Risco:** These routes are triggered by Supabase DB webhooks (external callers) — do NOT delete the routes themselves, only swap their private helpers for imports from @/lib/push-notify. Payload shapes are identical (PushPayload). Coordinate with the in-flight uncommitted changes on these exact files.

**Verificação (CONFIRMED):** Read all four files. One precision: only housekeeping/route.ts defines the named cleanExpired/fanOut/fanOutByRole trio (lines 7-54); maintenance/route.ts (lines 28-66) and concierge/route.ts (lines 26-50) INLINE the identical logic without named helpers — same select('endpoint, p256dh, auth'), same .in('staffId')/.eq('propertyId') and .eq('propertyId')/.in('role') filters, same gone→delete-by-endpoint cleanup as push-notify.ts fanOut/fanOutByRole. Error-path semantics converge (lib returns after logging; routes fall through to the !subs?.length return — same outcome). push-notify.ts:5 header states it gathered the fan-out 'antes duplicado em /api/push/send/*'. The working-tree evidence has since landed as commit 1b18fbc ('fix(push): a tabela que 13 pontos do codigo esperavam nunca existiu') — confirming the cost claim: the same error-check fix WAS applied in all 4 places. Routes themselves are external (x-webhook-secret vs PUSH_WEBHOOK_SECRET; Supabase DB webhooks) and must stay — the finding already says swap internals only. Consolidation is behavior-preserving; role lists/payloads stay per-route.


<a id="dup-manager-override-ratelimit"></a>
### manager-override.ts reimplements login-attempts.ts (IP extraction, rate limit, attempt logging)

`dup-manager-override-ratelimit` · duplicate-logic · confiança high · recomendação **consolidate** · verificação: confirmado

**Arquivos:** `src/lib/manager-override.ts` · `src/lib/login-attempts.ts`

**Por que sobra:** manager-override.ts privately defines tooManyAttempts (lines 40-50), logAttempt (52-58) and exports requestIp (153-157); login-attempts.ts exports isRateLimited, logAttempt and clientIp doing the same thing against the same login_attempts table with the same 15-min window and the same x-forwarded-for/x-real-ip/'unknown' chain. login-attempts.ts even documents that the count is deliberately SHARED across auth points — which is exactly what the duplicate achieves by accident. The copies already drifted: login-attempts skips ip==='unknown' (never blocks, never logs) while manager-override counts and inserts 'unknown' rows, so proxied users without forwarded headers can be collectively rate-limited on the manager modal.

**Evidência:** Read both files in full. grep -rn '\brequestIp\b' src excluding lib → 2 call sites; grep of login_attempts table usage shows both files querying identical columns (ip/success/attempted_at, 15*60*1000 window, max 5).

**Impacto de remover:** ~30 LoC; removes a behavioral drift (unknown-IP handling) between two security-sensitive rate limiters.

**Risco:** Semantics change slightly for ip==='unknown' (would stop counting toward the block). MANAGER_ROLES const and the ephemeral-client credential check stay — only the three helpers consolidate. Both are server-only, same table, no migration needed.

**Verificação (CONFIRMED):** Read both files in full. Same login_attempts table and columns (ip/success/attempted_at), same 15*60*1000 window (manager-override.ts:24, login-attempts.ts:11), same threshold semantics (RATE_LIMIT_MAX=5 hardcoded vs parameterized max — staff login and others pass their own), same IP chain x-forwarded-for→x-real-ip→'unknown' (requestIp:153-157 takes Request; clientIp:14-18 takes Headers — trivial adapter). The claimed drift is real and verified: login-attempts.ts:22 and :35 both skip ip==='unknown' (documented policy 'IP desconhecido nunca trava'); manager-override.ts tooManyAttempts:40-50 and logAttempt:52-58 have no such skip. I looked for a reason manager-override must count 'unknown' (deliberate hardening): no comment claims it, and behind Vercel's proxy x-forwarded-for is always set, so the branch is practically unreachable in prod — the finding names the delta honestly and the consolidation adopts the canonical documented policy. requestIp has exactly ONE consumer (src/app/api/admin/finance/lodging/route.ts:11,70), so the surface is tiny; MANAGER_ROLES and the ephemeral-credential check are untouched. Corroborating pattern: checkin-actions.ts:21/36/49 hand-rolls the same login_attempts queries and quote-actions.ts:14 carries a third private clientIp — the duplication the finding targets is real and spreading.


<a id="roles-convergence-stalled"></a>
### roles.ts is the declared single source of role labels but only 1 file imports it; ~10 local copies remain

`roles-convergence-stalled` · duplicate-logic · confiança medium · recomendação **consolidate** · verificação: confirmado

**Arquivos:** `src/lib/roles.ts` · `src/app/admin/staff/page.tsx` · `src/app/admin/escalas/page.tsx` · `src/app/admin/escalas/mensal/page.tsx` · `src/app/admin/hr/_components/hr-utils.ts` · `src/app/director/page.tsx` · `src/app/director/equipe/page.tsx` · `src/app/maid/page.tsx` · `src/components/admin/ImpersonateBanner.tsx` · `src/components/admin/StaffEditModal.tsx` · `src/components/auth/RoleSwitcher.tsx`

**Por que sobra:** src/lib/roles.ts's own header states there are ~9 divergent copies of the role-label map ('algumas com um cargo hr que nem existe em UserRole, e com os rótulos de maintenance/technician invertidos entre si') and that it is the convergence target. The migration stalled at one consumer: only src/components/admin/StaffSelect.tsx imports it, while 10 files still declare local roleLabels/ROLE_LABELS maps.

**Evidência:** grep -rn 'lib/roles' src → single importer StaffSelect.tsx:6. grep -rln 'roleLabels\s*[:=]|ROLE_LABELS\s*[:=]|roleNames\s*[:=]|roleLabelMap' src/app src/components → the 10 files listed. Spot-checked src/app/admin/staff/page.tsx:19 and src/app/maid/page.tsx:1368 carrying inline 'Super Admin' maps.

**Impacto de remover:** ~150+ LoC of copies removed; ends the label divergence users can actually see (maintenance/technician swapped between screens).

**Risco:** Some copies are deliberately abridged (maid/page.tsx shortens labels for a tiny screen) — migrate to roleShortLabel/roleLabel per case rather than mechanically. This is a planned-but-unexecuted migration per the file's own comment, so it's a mid-size chore, not a one-liner.

**Verificação (CONFIRMED):** Verified both halves. (1) Sole importer: grep 'lib/roles' (covers alias and relative paths) → only src/components/admin/StaffSelect.tsx:6. (2) Local copies: grep for ROLE_LABELS/roleLabels map declarations finds exactly the 10 claimed files — director/page.tsx:75, director/equipe/page.tsx:65, RoleSwitcher.tsx:11, maid/page.tsx:1365, ImpersonateBanner.tsx:9, StaffEditModal.tsx:24, hr/_components/hr-utils.ts:32, escalas/page.tsx:25, escalas/mensal/page.tsx:193, staff/page.tsx:18. roles.ts:4-9 self-declares as the convergence target and names the divergences; I verified them concretely: hr-utils.ts:43 carries the phantom 'hr: Gestão' role that doesn't exist in UserRole, and RoleSwitcher's technician='Técnico'/maintenance='Manutenção' diverges from the lib's labels. One caveat that REINFORCES the reviewer's 'not mechanical' warning rather than weakening it: RoleSwitcher.tsx:29 uses map MEMBERSHIP as a behavior gate (`.filter(r => r in ROLE_LABELS && ROLE_HOME[r])`) to decide which roles are switchable field areas — a blind swap to the full lib map would make every role an 'area'; that file needs a deliberate role subset kept separate from the label source. Mid-size per-case chore, correctly scoped at medium confidence.


**Cobertura desta varredura:** Scanned all 53 files in src/lib/. Module-level liveness: counted importers of every file via grep for '@/lib/<name>' and relative variants across src/ — no lib file has zero importers (minimum 1: countries, event-payload, hunit, image-compress, manager-override, roles, supabase-middleware, supabase-server, wedding-rate-engine — each verified to be a real code import). Export-level: extracted every `export function/const/type/interface` from all files and cross-referenced with a whole-tree word-boundary grep (one alternation pass, 3980 hits), then separated truly-dead symbols (definition-only, checked inside the defining file too, plus whatsapp-service/ and scripts/) from needlessly-exported-but-internally-used ones (reported nothing for the latter — export-keyword removal is a nit). Suspects that came back clean: instagram.ts (normalizeInstagram 11 uses), clipboard.ts (copyText 8), csv.ts (toCsv/downloadCsv/stampedName 4 each), pets.ts (all 6 exports used), settings-deeplink.ts (useConfigDeepLink 8, useTabParam 18), stay-times.ts (all used), survey-view.ts (all value exports used), schedule-calculator, stock-locations (except byCabinNumber). Pair/trio duplicates: read property-settings.ts vs property-settings-client.ts (intentional server merge/allowlist vs client fetch wrapper — not redundant) and push-notify/push-server/push-trigger (intentional layering: web-push transport / server fan-out / client fire-and-forget — not redundant); the real push duplication is the route-level copies reported above. Not covered: dynamic dispatch via computed property names could theoretically reach an export without a grep hit, but none of the dead symbols are object members, so the risk is negligible; DB-side callers (Supabase webhooks) were treated as live for all /api/push/send routes per the guardrails.

## Serviços (src/services)

<a id="dead-whatsapp-test-chain"></a>
### Dead 3-file chain: TestWhatsAppButton -> whatsapp-actions -> message-queue-service (plus orphaned message_queue table)

`dead-whatsapp-test-chain` · dead-code · confiança high · recomendação **delete** · verificação: confirmado

**Arquivos:** `src/components/TestWhatsAppButton.tsx` · `src/actions/whatsapp-actions.ts` · `src/services/message-queue-service.ts`

**Por que sobra:** TestWhatsAppButton.tsx (a dev test panel with a hardcoded phone number 553191096590) is imported by nothing. It is the ONLY importer of src/actions/whatsapp-actions.ts (itself the only file in the stray src/actions/ directory — the project convention is src/app/actions/). whatsapp-actions.ts is the ONLY importer of message-queue-service.ts. MessageQueueService reads/writes a 'message_queue' table that no other code references — the real WhatsApp pipeline (cron process-messages) uses the 'messages' table exclusively.

**Evidência:** grep -rn "TestWhatsAppButton" src/ → only its own file. grep -rn "actions/whatsapp-actions" src/ → only TestWhatsAppButton.tsx:5. grep -rn "MessageQueueService" src/ whatsapp-service/ → only whatsapp-actions.ts + the service itself. grep -rln "message_queue" src/ whatsapp-service/ → only message-queue-service.ts. grep -n "from(" src/app/api/cron/process-messages/route.ts → all queries hit "messages"/"properties"/"audit_logs", never message_queue. git log: files last meaningfully touched in the firebase→supabase migration / 'Snapshot 8' era.

**Impacto de remover:** ~180 LoC across 3 files; removes the stray src/actions/ directory entirely; surfaces that the 'message_queue' Postgres table is orphaned and can be dropped separately.

**Risco:** Near zero. Confirm nothing external (e.g. a manual SQL job) reads the message_queue table before dropping the TABLE — but the three FILES have no callers at all. Table drop is a separate, user-approved production step.

**Verificação (CONFIRMED):** Tried to refute with whole-git-root greps (C:\Aura-Experience, covering whatsapp-service/, scripts/, public/sw.js, migrations/, docs/, and the parent-level supabase-*.sql files) for TestWhatsAppButton, whatsapp-actions, MessageQueueService, message_queue, scheduleWhatsAppMessage, enqueueMessage, processQueue, plus bracket-access patterns. Results: TestWhatsAppButton referenced only by its own file; whatsapp-actions imported only by TestWhatsAppButton.tsx:5; MessageQueueService used only by whatsapp-actions.ts:5/26; message_queue string exists only at message-queue-service.ts:17 (not in any migration or root SQL file). Verified whatsapp-service/ is NOT gitignored (git check-ignore exit 1), so ripgrep really searched it — its server.js has no queue references. Decisive: docs/ALTAMARE.md:187 itself states 'message-queue-service.ts é código morto — o molde é o cron'. Caveat for the fixer (not a refutation): three stale doc mentions need updating on delete — docs/MODULES.md:37, docs/ARCHITECTURE.md:94, and the domain list in src/services/CLAUDE.md.


<a id="wedding-service-dead-crud"></a>
### WeddingService: 8 dead CRUD methods duplicating what /api/admin/weddings routes do inline

`wedding-service-dead-crud` · dead-code · confiança high · recomendação **delete** · verificação: confirmado

**Arquivos:** `src/services/wedding-service.ts`

**Por que sobra:** createWedding (L46), getWeddings (L23), updateWedding (L60), deleteWedding (L72), upsertVendor (L564), deleteVendor (L571), upsertCabinAssignment (L578), deleteCabinAssignment (L585) have zero callers. Real wedding CRUD is done with direct supabase queries inside src/app/api/admin/weddings/route.ts and src/app/api/admin/weddings/[id]/* — the service methods are a stale parallel implementation. The rest of the file (installments, lead settings, site codes, follow-ups) is heavily used and stays; getWeddingById and generateUniqueSiteCode also stay (internal callers).

**Evidência:** Per-method census: grep "WeddingService.<m>(" over a full-repo corpus (src/ + whatsapp-service/) → 0 external hits for the 8 methods vs 1-4 hits for the 17 live ones (listInstallments=4, setInstallmentPaid=2, etc.). Bare-word grep -w for each of the 8 names outside wedding-service.ts → 0 mentions. grep -rln "from(['\"]weddings" src/ → CRUD lives in src/app/api/admin/weddings/*.ts. git log -S "async createWedding" → last touched 2026-04-25.

**Impacto de remover:** ~75 LoC out of 589; removes a misleading second write-path for the weddings table (relevant given the EVENTS-V2/partner work touching this domain).

**Risco:** getWeddingById and generateUniqueSiteCode look similar but ARE used internally — delete only the 8 listed methods. Weddings module is under active evolution (site, installments); a future refactor could have re-adopted these, but they have been dead since April.

**Verificação (CONFIRMED):** Word-boundary grep for all 8 names (createWedding, getWeddings, updateWedding, deleteWedding, upsertVendor, deleteVendor, upsertCabinAssignment, deleteCabinAssignment) across the entire git root returned only the definition lines in wedding-service.ts; this grep style also catches aliased imports, destructuring, and this.* internal calls — zero. No WeddingService[ bracket access anywhere. Counter-census verified the keep-scope: getWeddingById is live internally (wedding-service.ts:338, 378, 404) and generateUniqueSiteCode at :355-356, 408-410; real CRUD confirmed in src/app/api/admin/weddings/route.ts and [id]/* routes, which query from('weddings') directly (13 files hit that table).


<a id="survey-service-dead-guest-path"></a>
### SurveyService: 5 dead methods — the guest submit path moved to /api/guest/survey; plus a stale comment claiming otherwise

`survey-service-dead-guest-path` · dead-code · confiança high · recomendação **delete** · verificação: confirmado

**Arquivos:** `src/services/survey-service.ts` · `src/lib/survey-metrics.ts`

**Por que sobra:** submitSurvey (L191), getResponses (L222), getActiveTemplate (L56), getLatestInsight (L275), getStayContextForFeedback (L23) have zero callers. Guest submissions go through src/app/api/guest/survey/route.ts, which does its own supabaseAdmin insert and calls computeSurveyMetrics directly; admin reads use the live getResponsesWithStay (L229). The comment at src/lib/survey-metrics.ts:35 ('Roda nos DOIS caminhos de gravação (rota /api/guest/survey e SurveyService.submitSurvey)') is stale — the second path is dead.

**Evidência:** Census: grep "SurveyService.<m>(" over full corpus → external usage only for getTemplates/getCategories/addCategory/updateTemplate/getTemplateById/createTemplate/updateCategory/setDefaultTemplate/hasSurveyForStay/getResponsesWithStay/deleteTemplate/deleteCategory. Bare-word grep for the 5 dead names → only 1 hit: the comment in survey-metrics.ts:35. head -20 src/app/api/guest/survey/route.ts → imports supabaseAdmin + computeSurveyMetrics, not SurveyService. git log -S "async submitSurvey" → 2026-02-22.

**Impacto de remover:** ~81 LoC out of 286; removes a second survey write-path that skips whatever the guest route enforces; fixes a comment that actively misleads (it claims metrics run in a path that no longer exists).

**Risco:** Admin surveys pages import this class from client components — deleting only the 5 methods leaves those imports intact. Double-check nothing in an unmerged branch (guest-2.0 was retired) resurrects submitSurvey.

**Verificação (CONFIRMED):** Word-boundary grep for submitSurvey, getResponses, getActiveTemplate, getLatestInsight, getStayContextForFeedback across the git root → only the 5 definitions plus exactly one non-code hit: the stale comment at src/lib/survey-metrics.ts:35, precisely as the finding claims. Read src/app/api/guest/survey/route.ts:1-30 — it imports supabaseAdmin and computeSurveyMetrics/normalizeSurveyAnswers, not SurveyService, and inserts on its own. Full external census of SurveyService.* call sites matches the reviewer's live list exactly (getTemplates, getTemplateById, createTemplate, updateTemplate, getCategories, addCategory, updateCategory, deleteCategory, setDefaultTemplate, deleteTemplate, getResponsesWithStay at api/admin/survey-responses/route.ts:24, hasSurveyForStay at api/guest/session/route.ts:79); none of the 5 appear.


<a id="audit-service-dead-read-half"></a>
### AuditService: the entire read half (3 of 4 methods, lines 41-88) is dead — reads go through /api/admin/audit-logs

`audit-service-dead-read-half` · dead-code · confiança high · recomendação **delete** · verificação: confirmado

**Arquivos:** `src/services/audit-service.ts`

**Por que sobra:** getEntityHistory (L41), getPropertyRecentActivity (L58), getGlobalActivity (L75) have zero callers. The only live method is AuditService.log — 180 call sites. Audit-log reading is implemented directly in src/app/api/admin/audit-logs/route.ts and audit-logs/my-count/route.ts with their own queries.

**Evidência:** grep "AuditService." over full corpus excluding the service file → 180x AuditService.log and nothing else. Bare-word grep for the three method names outside audit-service.ts → 0 mentions. grep -rln "from(['\"]audit_logs" src/ → the admin audit-logs routes (plus crons that only insert). git log -S "getGlobalActivity" → 2026-02-14.

**Impacto de remover:** ~48 LoC out of 89 — file shrinks to just the log() writer, matching its actual role.

**Risco:** None found; the methods take no part in the write path used by 180 call sites.

**Verificação (CONFIRMED):** Word-boundary grep for getEntityHistory, getPropertyRecentActivity, getGlobalActivity across the git root → definitions only (audit-service.ts:41/58/75). External AuditService.* census: 180 call sites, all AuditService.log; the only other mention is a comment in stock-service.ts:7. Verified src/app/api/admin/audit-logs/route.ts:36 queries from('audit_logs') directly. No bracket access on AuditService anywhere.


<a id="fb-service-dead-order-writes"></a>
### fbService: dead order write path (createOrder/updateOrder/getOrderForStayDate) — guest breakfast orders are written by /api/guest/breakfast-orders

`fb-service-dead-order-writes` · dead-code · confiança high · recomendação **delete** · verificação: confirmado

**Arquivos:** `src/services/fb-service.ts`

**Por que sobra:** createOrder (L273-318), updateOrder (L257-272) and getOrderForStayDate (L244-256, whose only caller is the dead createOrder at L294) have no external callers. The real fb_orders writes happen inline in src/app/api/guest/breakfast-orders/route.ts (insert at L161-162) and in breakfast-salon-service.ts (L306-307). Note _deductStockForOrder is NOT dead — it is called by the live updateOrderStatus (L356).

**Evidência:** Census at the file's 4-space indent: grep "fbService.<m>(" over full corpus → createOrder 0 ext/0 int, updateOrder 0/0, getOrderForStayDate 0 ext/1 int (the internal hit is createOrder L294); all other 15 methods have ≥1 external caller. grep -rn insert after from('fb_orders') → guest route + breakfast-salon-service. git log -S "async createOrder" -- fb-service.ts → 2026-03-10.

**Impacto de remover:** ~75 LoC out of 389; removes a write path that bypasses whatever validation the guest route applies (CafeBuilder flow).

**Risco:** Keep _deductStockForOrder and updateOrderStatus. Verify the waiter app's café flow (listed in memory as a pending /api/field migration) does not plan to reuse createOrder — as of today nothing imports it.

**Verificação (CONFIRMED):** Despite the generic names, word-boundary grep for createOrder/updateOrder/getOrderForStayDate across the entire git root returned ONLY fb-service.ts (definitions at 273/257/244 plus the single internal this.getOrderForStayDate call at :294, inside the dead createOrder) — no other file in the repo even defines methods with these names, so the census is unambiguous. Keep-scope verified: fbService.updateOrderStatus is live (src/app/admin/food-and-beverage/orders/page.tsx:87) and calls this._deductStockForOrder at fb-service.ts:356, so both stay. Real fb_orders writes confirmed in src/app/api/guest/breakfast-orders/route.ts and breakfast-salon-service.ts (6 files touch the table, none via the dead methods).


<a id="contact-service-resolve-context"></a>
### ContactService.resolveContactContext (~90 lines, end of file) is dead, along with the ContactContext types in aura.ts

`contact-service-resolve-context` · dead-code · confiança high · recomendação **delete** · verificação: confirmado

**Arquivos:** `src/services/contact-service.ts` · `src/types/aura.ts`

**Por que sobra:** resolveContactContext (L243 to EOF at L333) has zero callers. The types it returns — ContactContext and ContactContextStatus (src/types/aura.ts L1015-1026) — are referenced nowhere else, so they become orphans once the method goes. All 7 other ContactService methods have 2-4 external callers each.

**Evidência:** grep "ContactService." over full corpus → deleteContact/findByPhone/formatPhoneId/listContacts/migrateContactPhone/updateContact/upsertContact all used; resolveContactContext absent. Bare-word grep resolveContactContext outside the file → 0. grep -rn "ContactContext" src/ excluding contact-service.ts → only the type definitions in aura.ts. git log -S "resolveContactContext" → 2026-02-22.

**Impacto de remover:** ~90 LoC in the service + ~12 lines of orphaned types in aura.ts (27% of contact-service.ts).

**Risco:** It looks like it was built for the comms center to show 'who is this phone number' context; if that feature is still wanted, keep — but it has had no caller for 6+ months.

**Verificação (CONFIRMED):** Grep for resolveContactContext|ContactContext|ContactContextStatus across the git root → only the type definitions at src/types/aura.ts:1015-1026 and uses inside the dead method's own body (contact-service.ts:243-320). File is exactly 333 lines, matching the 'L243 to EOF' claim. External ContactService.* census: exactly the 7 other methods (deleteContact, findByPhone, formatPhoneId, listContacts, migrateContactPhone, updateContact, upsertContact — 2 callers each); resolveContactContext absent. No bracket access.


<a id="stay-service-dead-methods"></a>
### StayService: 5 dead methods (~75 lines), incl. two superseded duplicates of live methods

`stay-service-dead-methods` · dead-code · confiança high · recomendação **delete** · verificação: confirmado

**Arquivos:** `src/services/stay-service.ts`

**Por que sobra:** getStayWithGuest (L230-237) — superseded by the live getStayWithGuestAndCabin; getGuestPreferredLanguage (L407-415) — strict subset of getGuestNameAndLang; getGuestNameAndLang (L418-429) — itself also dead; getStaysByStatus (L480-511, does N+1 per-stay guest/cabin enrichment nobody consumes); toggleFolioItemStatus (L865-876) — the other three folio methods (getStayFolio/addFolioItemManual/deleteFolioItem) are live, but nothing toggles pending/paid through the service.

**Evidência:** Census: grep "StayService.<m>(" over full corpus → 0 external hits for the 5; bare-word grep for each name outside stay-service.ts → 0 mentions. Folio check: StayService.getStayFolio=1, addFolioItemManual=4, deleteFolioItem=1, toggleFolioItemStatus=0 external callers. No dynamic access: grep 'StayService[' → none. git log -S "toggleFolioItemStatus" → 2026-02-21.

**Impacto de remover:** ~75 LoC out of 1033 in one of the four biggest services; kills an N+1 query pattern and two same-purpose duplicate readers.

**Risco:** Stays module was reworked recently (3-phase reform in production); these survived that reform unused. Re-run the grep after any open stays branch merges.

**Verificação (CONFIRMED):** Word-boundary grep for the 5 names across the git root → definitions only (stay-service.ts:230/407/418/480/865); \bgetStayWithGuest\b cannot match the live getStayWithGuestAndCabin, and the grep also covers aliased/destructured/this.* calls — zero. No StayService[ bracket access. Folio keep-scope verified live: StayService.getStayFolio (useFolio.ts:32), addFolioItemManual (useFolio.ts:59, concierge-service.ts:492/605, api/field/cabin-conference/route.ts:74, plus 2 internal), deleteFolioItem (useFolio.ts:91); toggleFolioItemStatus appears in no caller.


<a id="structure-service-dead-readers"></a>
### StructureService: 4 dead reader methods (getStructure, getBreakfastVenue, getBookingsByDate, getAllBookingsByDate)

`structure-service-dead-readers` · dead-code · confiança high · recomendação **delete** · verificação: confirmado

**Arquivos:** `src/services/structure-service.ts`

**Por que sobra:** getStructure (L41-52), getBreakfastVenue (L102-114), getBookingsByDate (L267-278), getAllBookingsByDate (L279-289) have zero callers anywhere. The live surface is getStructures/getBookableStructures/createStructure/updateStructure/setBreakfastVenue/createBooking/updateBookingStatus/etc. (setBreakfastVenue is live even though its getter is dead — readers fetch the venue by other means).

**Evidência:** Census at 4-space indent: grep "StructureService.<m>(" over full corpus → 0 for the four; bare-word grep -w for each name over the whole corpus → 0 mentions outside the file. updateBooking is internal-only but live (called by updateBookingStatus at L495) — kept. git log -S "async getStructure" → 2026-03-01.

**Impacto de remover:** ~48 LoC out of 556.

**Risco:** None found. 14 files import this service; all use other methods.

**Verificação (CONFIRMED):** Word-boundary greps: \bgetStructure\b (safe against the live plural getStructures), getBreakfastVenue, getBookingsByDate, getAllBookingsByDate across the git root → definitions only (structure-service.ts:41/102/267/279 plus the method's own console.error at :286). External StructureService.* census shows 12 live methods (getStructures x5, getBookableStructures x3, setBreakfastVenue, createBooking, updateBookingStatus, checkOverlap, expireStaleBookings, generateTimeSlots, setDailyRelease, create/update/deleteStructure) and none of the 4 dead ones. Reviewer's kept-method note verified: updateBooking is called internally at structure-service.ts:495 by updateBookingStatus.


<a id="breakfast-salon-dead-methods"></a>
### BreakfastSalonService: moveGuest (~40 lines) and getAttendanceByStay are dead

`breakfast-salon-dead-methods` · dead-code · confiança high · recomendação **delete** · verificação: confirmado

**Arquivos:** `src/services/breakfast-salon-service.ts`

**Por que sobra:** moveGuest (L147-186, guest-to-another-table transfer) and getAttendanceByStay (L188-200, commented 'para o portal do hóspede') have zero callers — the guest portal reads attendance via its own API routes (/api/guest/today, /api/guest/breakfast-orders query fb/breakfast tables directly).

**Evidência:** Census: 0 ext/0 int for both; bare-word grep -w moveGuest / getAttendanceByStay across src/ + whatsapp-service/ excluding the file → 0 mentions. grep -rln fb_orders/attendance readers → guest routes query directly.

**Impacto de remover:** ~54 LoC out of 381.

**Risco:** moveGuest may have been intended for a salon-floor drag-drop UI; nothing references it today. If that UI is still on a roadmap, mark keep — otherwise delete.

**Verificação (CONFIRMED):** Word-boundary grep for moveGuest and getAttendanceByStay across the entire git root (incl. whatsapp-service/, guest portal routes, docs) → only the definitions at breakfast-salon-service.ts:147 and :188. Guest-portal attendance reads confirmed to go through routes that query tables directly (api/guest/today/route.ts hits from('events')/fb tables inline; api/guest/breakfast-orders exists as its own route). No bracket access on BreakfastSalonService.


<a id="concierge-service-dead-readers"></a>
### ConciergeService: 4 dead methods, one already annotated '@deprecated ... Sem chamadores vivos'

`concierge-service-dead-readers` · dead-code · confiança high · recomendação **delete** · verificação: confirmado

**Arquivos:** `src/services/concierge-service.ts`

**Por que sobra:** getConciergeItemsForMaid (L139-150) carries an explicit @deprecated comment stating the maid restock catalog moved to RestockService.getCatalog — and indeed has zero callers. getGroups (L17-25), getConciergeItems (L114-122) and getTodayRequests (L310-322) also have zero callers; the admin page loads via useConcierge/_components and the live getPendingRequests/getConciergeItemsForGuest paths.

**Evidência:** grep -rn getConciergeItemsForMaid src/ excluding the service → 0 (the availableForMaid FLAG itself is still used in 8 other files — only the method dies). Census: ConciergeService.getGroups/getConciergeItems/getTodayRequests → 0 external mentions via both '.m(' and bare-word greps; 22 other ConciergeService methods each have ≥1 caller.

**Impacto de remover:** ~43 LoC out of 790; executes the deletion its own deprecation comment already promises.

**Risco:** Do not touch the availableForMaid column/flag or _annotateAvailability (shared with live methods).

**Verificação (CONFIRMED):** Word-boundary greps: getConciergeItemsForMaid and getTodayRequests → definitions only (concierge-service.ts:140/310); \bgetConciergeItems\b (safe against the live ...ForGuest/...ForMaid variants) → definition only at :114; \bgetGroups\b → definition only at :17 (no other service in the repo defines a getGroups). Read concierge-service.ts:139 — the @deprecated comment ending 'Sem chamadores vivos' is verbatim as claimed. External census: 22 live ConciergeService methods, none of the 4 dead ones. Keep-scope verified: _annotateAvailability has live callers (:121 getConciergeItemsForGuest, :714 getFrigobarItems) and availableForMaid appears in 9 files — both must survive the deletion, as the finding already warns.


<a id="small-dead-methods-rollup"></a>
### Five one-off dead methods: EventService.getPublishedEvents/getEventById, StockService.getBalances, CrmService.saveQuoteLeadSettings, MaintenanceService.updateRuleLastTriggered, AssetService.getDepreciationEntries

`small-dead-methods-rollup` · dead-code · confiança high · recomendação **delete** · verificação: **rebaixado**

**Arquivos:** `src/services/event-service.ts` · `src/services/stock-service.ts` · `src/services/crm-service.ts` · `src/services/maintenance-service.ts` · `src/services/asset-service.ts`

**Por que sobra:** EventService.getPublishedEvents (L49-69) and getEventById (L87-99): zero callers — the eventos route uses getEvents/getEventsForCalendar/create/update/delete only. StockService.getBalances (L996-1002): zero callers (balances are read via other live queries). CrmService.saveQuoteLeadSettings (L196-198): zero callers — crmQuoteLead is saved through the generic mergePropertySettings allowlist (src/lib/property-settings.ts:58), only getQuoteLeadSettings is used. MaintenanceService.updateRuleLastTriggered (L289-295, EOF): zero callers — the maintenance cron updates lastTriggeredAt inline. AssetService.getDepreciationEntries (L401-405): zero callers.

**Evidência:** For each: census grep "<Service>.<method>(" over the full corpus → 0 external; bare-word grep -w "<method>" across src/ + whatsapp-service/ excluding the defining file → 0 mentions. EventService live-usage table: createEvent/deleteEvent/getEvents/getEventsForCalendar/updateEvent = 1 each, the two dead = 0.

**Impacto de remover:** ~55 LoC across 5 files; in event-service it clears noise ahead of the planned EVENTS-V2 rework (docs/EVENTS-V2.md).

**Risco:** EVENTS-V2 refactor may reshape event-service anyway — deleting dead readers first makes that diff smaller, not larger. No other risks found.

**Verificação (DOWNGRADED):** The zero-callers observation is real for all 5: word-boundary greps across the git root found single definitions for getPublishedEvents (event-service.ts:49), getEventById (:87 — no other service defines that name), getBalances (stock-service.ts:996, plus its own error log), saveQuoteLeadSettings (crm-service.ts:196), updateRuleLastTriggered (maintenance-service.ts:289), getDepreciationEntries (asset-service.ts:401). Supporting claims verified: crmQuoteLead is in the mergePropertySettings allowlist at src/lib/property-settings.ts:58, and the maintenance cron updates lastTriggeredAt inline at src/app/api/cron/maintenance/route.ts:72. BUT the reviewer's stated evidence ('bare-word grep → 0 mentions') is wrong for one method: docs/ALTAMARE.md:137 — the plan for the ACTIVE Altamare partner integration — explicitly lists getPublishedEvents as one of the '3 leituras públicas' (with api/guest/events and api/guest/today) that must gain the .neq('visibility','internal') filter when the visibility field is activated; the in-flight plan treats it as part of the surface being modified. (Both guest routes query from('events') inline today — verified api/guest/events/route.ts:35 and api/guest/today/route.ts:95 — so the doc already miscounts the live paths.) Minor: the claim 'only getQuoteLeadSettings is used' is also off — that getter has zero external callers too.

**Claim corrigido:** Delete four outright: StockService.getBalances, CrmService.saveQuoteLeadSettings, MaintenanceService.updateRuleLastTriggered, AssetService.getDepreciationEntries — plus EventService.getEventById. For EventService.getPublishedEvents, do not delete silently: either delete it together with correcting docs/ALTAMARE.md:137 (the '3 leituras públicas' become 2, and the future visibility filter lands only in api/guest/events + api/guest/today), or park that one method for the EVENTS-V2/Altamare slice that owns event-service — deleting it while the active integration plan names it would create plan drift.


**Cobertura desta varredura:** Scope: all 44 .ts files in src/services/ (45th is CLAUDE.md). Method: (1) import census per service across src/ AND whatsapp-service/ (alias + relative forms) — every service file has ≥1 importer, so no whole-file deletions except via the dead chain in finding 1; (2) per-method usage census for every service, handling all four export styles found (2-space object methods, 4-space object methods in fb/fnrh/maintenance/structure, class statics in survey/contact/audit/message-queue, standalone function exports in changelog/platform-health/platform-stats — all function exports are live); (3) every dead candidate re-verified with a bare-identifier grep over a full-repo corpus (catches destructuring, references, comments) plus a bracket-access grep ('Service[') to rule out dynamic dispatch — none found; (4) git log -S aging: all reported blocks last touched Feb-Apr 2026 in a repo with daily commits. Honored the guardrails: cron/webhook/partner routes, Next entry files and whatsapp-service were never used as evidence of deadness — only intra-repo call absence for service methods. Cross-service duplication sweep (WhatsApp send wrappers, occupancy calc, folio math, notification fan-out) found no live duplicates — the duplication in this codebase takes the form of dead parallel service implementations of logic that API routes do inline (findings 2-5), which is also the pattern to watch for in new code. Not covered: whether the orphaned message_queue TABLE can be dropped in prod (needs a user-approved check for external SQL consumers); rate-service/stock-service/hsystem-service/guarita-service internals beyond method-level (all their methods have live callers — rate-service's 26 importers and every method ≥1 ext, incl. importSitBackup via /api/admin/tarifario/import); UI components/lib outside the services dimension except where needed to trace call paths.

## Componentes

<a id="staff-mobile-hub-dead"></a>
### StaffMobileHub.tsx (386 LoC) unreferenced since June, still being maintained while dead

`staff-mobile-hub-dead` · unused-ui · confiança high · recomendação **delete** · verificação: confirmado

**Arquivos:** `src/components/admin/StaffMobileHub.tsx`

**Por que sobra:** The mobile hub view it provided was removed from the admin kanban pages in commit 2fe6100 (2026-06-02, 'Técnicos redirecionados para /maintenance — remove view mobile duplicada'); field staff now use the dedicated /maid and /maintenance apps. Nothing imports it anymore, yet commit 14b0084 (2026-08-26) still edited this dead file during the eventos write-route sweep — it is silently absorbing maintenance work.

**Evidência:** grep -rn 'StaffMobileHub' across all *.ts/*.tsx in src returned only the definition file (src/components/admin/StaffMobileHub.tsx:38); grep for dynamic import("...StaffMobileHub") across src and whatsapp-service: no hits; git log -S 'StaffMobileHub' -- aura/src shows the last reference-changing commit is 2fe6100 (2026-06-02); git log -1 on the file shows 14b0084 (2026-08-26) touched it after it was already dead.

**Impacto de remover:** 386 LoC deleted; stops wasted maintenance (it was updated in a repo-wide sweep 4 days ago despite being unreachable).

**Risco:** None found: zero static or dynamic imports. Before deleting, re-grep 'StaffMobileHub' repo-wide (including src/app/admin/governance and src/app/admin/maintenance) to confirm no conditional render was added since this scan.

**Verificação (CONFIRMED):** Tried to refute and failed. Ran Grep 'StaffMobileHub' over all of C:/Aura-Experience/aura (covers src, whatsapp-service, scripts, migrations, public, docs): only the definition (src/components/admin/StaffMobileHub.tsx:1,30,38) plus docs/CLEANUP.md and docs/EVENTS-V2.md prose (EVENTS-V2.md:69 itself records 'continua sem importadores'). Swept every next/dynamic and import() call in src — none reference it. No barrel exists in src/components/admin (Glob 'src/components/**/index.ts*' returns only the aura kit barrel). Not a Next.js convention filename. Git verified from the parent repo root: git log -S 'StaffMobileHub' -- aura/src/app shows the last reference-changing commit is 2fe6100 (2026-06-02), and git log on the file shows 14b0084 (2026-08-26) touched it while dead — both exactly as claimed. Grep of scripts/migrations/public/whatsapp-service: no hits.


<a id="broadcast-panel-dead"></a>
### BroadcastPanel.tsx (369 LoC) dead since April Chatwoot migration; sole caller of /api/broadcast and /api/broadcast/preview

`broadcast-panel-dead` · unused-ui · confiança high · recomendação **delete** · verificação: confirmado

**Arquivos:** `src/components/admin/BroadcastPanel.tsx` · `src/app/api/broadcast/route.ts` · `src/app/api/broadcast/preview/route.ts`

**Por que sobra:** Its import was dropped in commit 58ffb99 (2026-04-18, 'chatwoot fullscreen com botão flutuante de automações') when the comunicação page went Chatwoot-fullscreen. It was even restyled to the new Dialog kit while dead (commit 01fb311, 2026-08-22 'varredura final — modais compartilhados ... broadcast ... no Dialog'). It is also the ONLY caller of /api/broadcast (POST) and /api/broadcast/preview — deleting it orphans both routes (the only other mention of /api/broadcast in src/app/admin/comunicacao/automations/page.tsx:36 is a comment).

**Evidência:** grep -rn 'BroadcastPanel' across src: only the definition (line 59) — no importers; grep -rn 'api/broadcast' across src + whatsapp-service: callers exist only inside BroadcastPanel.tsx (lines 81, 148), plus one code comment in automations/page.tsx; git log -S 'BroadcastPanel' shows imports added 136bad5 (2026-03-27) and removed 58ffb99 (2026-04-18); git log -1 on the file shows the 2026-08-22 restyle of the dead component.

**Impacto de remover:** 369 LoC of UI plus the two orphaned API routes under src/app/api/broadcast/ (mass-WhatsApp send endpoints that no UI can reach); removes a live POST surface that only exists for a dead panel.

**Risco:** This was the mass-WhatsApp-broadcast feature — confirm with the owner it is abandoned (no UI has reached it for 4+ months). If the API routes are kept 'for later', note they are currently invocable only by hand-crafted requests.

**Verificação (CONFIRMED):** Tried to refute and failed on both halves. Component: Grep 'BroadcastPanel' repo-wide → only the definition (BroadcastPanel.tsx:53,59) + docs/CLEANUP.md; no dynamic imports; git log -S 'BroadcastPanel' -- aura/src/app shows exactly 136bad5 (2026-03-27, add) and 58ffb99 (2026-04-18, remove). Routes: Grep 'api/broadcast' repo-wide → only BroadcastPanel.tsx:81 (preview) and :148 (POST) plus a comment at src/app/admin/comunicacao/automations/page.tsx:36 ('// A fila não é só do robô: o disparo em massa (/api/broadcast) grava com' — verified it is a comment, not a call). External-trigger hunt: not in vercel.json crons (read it — 10 entries, all /api/cron/*), zero mentions in docs/CRON.md, whatsapp-service grep for 'broadcast' matches only 'status@broadcast' at whatsapp-service/server.js:93 (WhatsApp protocol constant, unrelated), nothing in public/ (no service worker reference), scripts/, or migrations/. The finding's own risk note (owner confirms the mass-broadcast feature is abandoned) is the right caveat and I found nothing beyond it.


<a id="contacts-panel-dead"></a>
### ContactsPanel.tsx (253 LoC) unreferenced since the same April comunicação rework

`contacts-panel-dead` · unused-ui · confiança high · recomendação **delete** · verificação: confirmado

**Arquivos:** `src/components/admin/ContactsPanel.tsx`

**Por que sobra:** Added as the contacts tab of comunicação in d8b1976 (2026-03-21) and dropped in 58ffb99 (2026-04-18) with the Chatwoot-fullscreen redesign. A separate live page src/app/admin/contacts/page.tsx exists and does not import it.

**Evidência:** grep -rn 'ContactsPanel' across src: only the definition (src/components/admin/ContactsPanel.tsx:18); dynamic-import grep across src and whatsapp-service: no hits; git log -S 'ContactsPanel' shows only d8b1976 (add) and 58ffb99 (remove); grep of src/app/admin/contacts/page.tsx imports shows it uses @/components/ui/button, not ContactsPanel.

**Impacto de remover:** 253 LoC deleted; removes a second, stale contacts UI that shadows the live /admin/contacts page.

**Risco:** Low — dead for 4 months with a live replacement page. Re-grep before deleting.

**Verificação (CONFIRMED):** Tried to refute and failed. Grep 'ContactsPanel' over the whole aura dir: only the definition (src/components/admin/ContactsPanel.tsx:14,18) + docs/CLEANUP.md. No dynamic imports anywhere in src reference it; no component barrel exists outside the aura kit; no hits in scripts/migrations/public/whatsapp-service. Git verified: git log -S 'ContactsPanel' -- aura/src/app returns exactly d8b1976 (2026-03-21, add) and 58ffb99 (2026-04-18, remove). The live replacement src/app/admin/contacts/page.tsx exists (Glob confirmed) and the repo-wide grep proves it does not import ContactsPanel.


<a id="guest-checkin-form-dead"></a>
### guest/CheckInForm.tsx (203 LoC) is the pre-portal check-in form, unreferenced since February snapshots

`guest-checkin-form-dead` · legacy · confiança high · recomendação **delete** · verificação: confirmado

**Arquivos:** `src/components/guest/CheckInForm.tsx`

**Por que sobra:** The guest check-in flow lives in src/app/check-in/[code]/ (the mobile-first PT/EN/ES portal, fully redesigned in the 'camaleão' project). This standalone form component has had no importer in any commit after the Feb-2026 'Aura snapshot' commits; its last content touch (2423a6b, 2026-06-22) was a repo-wide default-checkin-time change, not adoption.

**Evidência:** grep -rn 'CheckInForm' across src: only the definition (src/components/guest/CheckInForm.tsx:33); dynamic-import grep: no hits; git log -S 'CheckInForm' -- aura/src returns only 825095b (2026-02-14) and 688ea11 (2026-02-17) snapshot commits.

**Impacto de remover:** 203 LoC deleted; removes a stale guest-facing form that bypasses the current portal conventions (it talks to Supabase directly from the browser, against the /api/guest/* pattern adopted after the anon-key lockdown).

**Risco:** None found. Its direct-browser-Supabase reads would return empty under current RLS anyway, so it could not work if resurrected as-is.

**Verificação (CONFIRMED):** Tried to refute and failed. Grep 'CheckInForm' over the whole aura dir: only the definition file (src/components/guest/CheckInForm.tsx:1,28,33,44,69) + docs/CLEANUP.md; no dynamic imports; no hits in scripts/migrations/public/whatsapp-service. git log -S 'CheckInForm' -- aura/src returns only 825095b (2026-02-14) and 688ea11 (2026-02-17) snapshot commits — no importer ever existed after Feb 2026. Read the file header: '"use client"' with direct 'import { supabase } from "@/lib/supabase"' + StayService/FnrhService calls, confirming it predates the /api/guest/* pattern. Extra nail the reviewer missed: line 34 destructures 'currentProperty' and 'loading' from useProperty(), while the current PropertyContext contract (root CLAUDE.md) exposes 'property' — it likely would not even type-check if resurrected.


<a id="messenger-mask-modal-dead"></a>
### MessengerMaskModal.tsx (136 LoC) dead since the Evolution/Chatwoot migration, restyled while dead

`messenger-mask-modal-dead` · unused-ui · confiança high · recomendação **delete** · verificação: confirmado

**Arquivos:** `src/components/admin/MessengerMaskModal.tsx`

**Por que sobra:** Added with the old messenger in 136bad5 (2026-03-27); its import was removed in fe74fb9 (2026-04-16, 'migrate WhatsApp to Evolution API + Chatwoot iframe'). Like BroadcastPanel, it was migrated to the new Dialog kit on 2026-08-22 (01fb311) despite having no consumer.

**Evidência:** grep -rn 'MessengerMaskModal' across src: only the definition (line 29); dynamic-import grep: no hits; git log -S 'MessengerMaskModal' shows 136bad5 (add) and fe74fb9 (remove); git log -1 shows the 2026-08-22 dead restyle.

**Impacto de remover:** 136 LoC deleted; stops repeat wasted work in kit sweeps (this file has now been dead through two UI migrations).

**Risco:** Low. Re-grep before deleting.

**Verificação (CONFIRMED):** Tried to refute and failed. Grep 'MessengerMaskModal' over the whole aura dir: only the definition (src/components/admin/MessengerMaskModal.tsx:24,29) + docs/CLEANUP.md; no dynamic imports in src; no hits in scripts/migrations/public/whatsapp-service. Git verified: git log -S 'MessengerMaskModal' -- aura/src/app returns exactly 136bad5 (2026-03-27, add) and fe74fb9 (2026-04-16, remove — the Evolution/Chatwoot migration), matching the finding.


<a id="test-whatsapp-button-dead"></a>
### TestWhatsAppButton.tsx — dev test helper never imported anywhere

`test-whatsapp-button-dead` · dead-code · confiança high · recomendação **delete** · verificação: confirmado

**Arquivos:** `src/components/TestWhatsAppButton.tsx`

**Por que sobra:** A 56-line dev helper for firing a test WhatsApp send; it has never had an importer and was last touched 166f37d (2026-03-01). WhatsApp session testing now lives in the Configurações → Integrações session card (WhatsAppSessionCard).

**Evidência:** grep -rn 'TestWhatsAppButton' across the whole aura dir: only the definition line (src/components/TestWhatsAppButton.tsx:10) and mentions in docs/CLEANUP.md; git log -1 on the file: 166f37d 2026-03-01.

**Impacto de remover:** 56 LoC deleted.

**Risco:** None — never wired to any page.

**Verificação (CONFIRMED):** Tried to refute and failed. Grep 'TestWhatsAppButton' over the whole aura dir: only src/components/TestWhatsAppButton.tsx:10 + docs/CLEANUP.md mentions; nothing in scripts/migrations/public/whatsapp-service. Strongest evidence: git log -S 'TestWhatsAppButton' -- aura/src returns a SINGLE commit ever (04c685c, 2026-02-21) — the string count never changed again, so no import was ever added anywhere in history. Never wired to any page.


<a id="version-footer-dead"></a>
### VersionFooter.tsx — version badge feature lives elsewhere; this copy renders nowhere

`version-footer-dead` · dead-code · confiança high · recomendação **delete** · verificação: confirmado

**Arquivos:** `src/components/VersionFooter.tsx`

**Por que sobra:** 15-line server component with no importer. The 'show latest published version' behavior it implements is served by src/app/aura/page.tsx (calls getLatestPublishedVersion directly) and by /api/changelog/latest-version (src/app/api/changelog/latest-version/route.ts) which feeds the badges users actually see. Notably the feature was re-implemented INSIDE this dead file in 0c7a8f9 (2026-06-01) — more maintenance sunk into an unreachable component.

**Evidência:** grep -rn 'VersionFooter' across the aura dir: only the definition (line 3) plus docs/CLEANUP.md mentions; grep -rn 'getLatestPublishedVersion' shows the live consumers are src/app/aura/page.tsx:52,253 and src/app/api/changelog/latest-version/route.ts:7; git log -1: 0c7a8f9 2026-06-01.

**Impacto de remover:** 15 LoC deleted; ends the pattern of updating a footer nobody renders.

**Risco:** None found.

**Verificação (CONFIRMED):** Tried to refute and failed. Grep 'VersionFooter' over the whole aura dir: only src/components/VersionFooter.tsx:3 + docs/CLEANUP.md; git log -S 'VersionFooter' -- aura/src returns a single commit (71dc1b8, 2026-02-26) — never imported anywhere in history. Read the file: 15-line async server component calling getLatestPublishedVersion; it is not a framework convention filename, so only an import could wire it, and none exists. Verified the live consumers of getLatestPublishedVersion exactly as the finding cites: src/app/aura/page.tsx:52,253 and src/app/api/changelog/latest-version/route.ts:2,7 (plus the definition at src/services/changelog-service.ts:27) — the feature genuinely lives elsewhere.


<a id="housekeeping-routines-stub-obsolete"></a>
### HousekeepingRoutinesModal.tsx transition stub — the 'residual imports' it protects no longer exist

`housekeeping-routines-stub-obsolete` · dead-code · confiança high · recomendação **delete** · verificação: confirmado

**Arquivos:** `src/components/admin/HousekeepingRoutinesModal.tsx`

**Por que sobra:** The file is already a 3-line deprecation stub ('Mantido vazio para não quebrar imports residuais durante a transição' — replaced by HousekeepingRulesModal in 3797c7e, 2026-05-07). The transition ended: zero imports remain anywhere, so the safety stub itself is now dead.

**Evidência:** Read the file: it contains only a deprecation comment and 'export {}'; grep -rn 'HousekeepingRoutinesModal' across src: no references outside the file; HousekeepingRulesModal (the replacement) is imported by src/app/admin/governance/kanban/page.tsx.

**Impacto de remover:** 1 file removed; eliminates a misleading tombstone in src/components/admin/.

**Risco:** None — importing it would already be a bug since it exports nothing.

**Verificação (CONFIRMED):** Tried to refute and failed. Read the file: exactly 3 lines — a deprecation comment and 'export {}'. Notably, the string 'HousekeepingRoutinesModal' appears NOWHERE in the repo's code — repo-wide grep matches only docs/CLEANUP.md (the file's own comment names the replacement, not itself), so zero residual imports remain; an import would also be useless since it exports nothing. The replacement is live: HousekeepingRulesModal defined at src/components/admin/HousekeepingRulesModal.tsx:139 and imported/rendered by src/app/admin/governance/kanban/page.tsx:16,687. git log -S confirms the swap in 3797c7e (2026-05-07) — the 'transition' the stub guards ended 3+ months ago. Safe delete.


<a id="aura-kit-unconsumed-primitives"></a>
### Aura kit primitives exported by the barrel but consumed nowhere: Toolbar.tsx (whole file) + 6 dead exports

`aura-kit-unconsumed-primitives` · unused-ui · confiança high · recomendação **investigate** · verificação: **rebaixado**

**Arquivos:** `src/components/aura/Toolbar.tsx` · `src/components/aura/Progress.tsx` · `src/components/aura/DataList.tsx` · `src/components/aura/Skeleton.tsx` · `src/components/aura/ConfirmDialog.tsx` · `src/components/aura/hooks.ts` · `src/components/aura/index.ts`

**Por que sobra:** Per-symbol audit of every export re-exported by src/components/aura/index.ts found these referenced ONLY by the barrel, never by any consumer nor internally by the kit: Toolbar (the entire 70-line Toolbar.tsx), ProgressRing (Progress.tsx:16; ProgressBar in the same file has exactly 1 consumer), ScrollMatrix (DataList.tsx:259), SkeletonChart (Skeleton.tsx:115), DialogSkeleton (Skeleton.tsx:143), useHasConfirmProvider (ConfirmDialog.tsx:208), useIsCoarsePointer (hooks.ts:49). Everything else in the kit is consumed (Dialog 79 files, PageShell 64, Pill 54, useConfirm 46, etc.).

**Evidência:** For each exported symbol in src/components/aura/* (list extracted via grep '^export (function|const|type|...)'), ran grep -rl '\b<Symbol>\b' over src excluding src/components/aura: Toolbar 0, ProgressRing 0, ScrollMatrix 0, SkeletonChart 0, DialogSkeleton 0, useHasConfirmProvider 0, useIsCoarsePointer 0; then grep inside src/components/aura (excluding index.ts) confirmed no internal use of any of the seven (unlike e.g. useKeyboardOpen, which BottomTabBar/FAB use, or RowActions/ActionMenu, which DataList uses internally). Kit created 2e83803 (2026-08-22).

**Impacto de remover:** ~200 LoC (Toolbar.tsx 70 + ~130 across the six exports) and a smaller barrel surface; per the ui-revamp convention the admin bundle imports the barrel, so unconsumed primitives ship in every admin page chunk that imports @/components/aura.

**Risco:** The kit is 8 days old and the admin revamp is explicitly gradual (waves A→C pending, /admin/comercial restyle pending); these may be built-ahead-of-need. ScrollMatrix's own docstring targets 'escalas, tarifário' — a planned consumer. Decide per symbol with the revamp plan in hand: delete what no wave will use (useHasConfirmProvider and useIsCoarsePointer have no plausible pending consumer), keep what is scheduled.

**Verificação (DOWNGRADED):** Re-ran the per-symbol audit myself and the raw counts all check out: Grep '\bToolbar\b' in src → only Toolbar.tsx:29 (def), index.ts:26 (barrel), aura-kit.css:376 (CSS section), admin CLAUDE.md:37 (doc); Grep 'ProgressRing|ScrollMatrix|SkeletonChart|useHasConfirmProvider|useIsCoarsePointer' in src → only their definitions plus admin CLAUDE.md:40 for ScrollMatrix; ProgressBar has exactly 1 consumer (src/app/admin/hr/_components/DeptDistributionCard.tsx:6,28) and useKeyboardOpen is used internally by FAB.tsx and BottomTabBar.tsx, both as the finding claimed. What the reviewer missed is that src/app/admin/CLAUDE.md (auto-loaded convention doc, marked MANDATORY) explicitly names Toolbar, ScrollMatrix, and DialogSkeleton in its per-page recipe — that is a concrete scheduled consumer for 3 of the 7 symbols, resolving the 'investigate' in the keep direction for them rather than leaving it open.

**Claim corrigido:** The zero-consumer observation is accurate for all seven symbols, but three of them are prescribed building blocks of the MANDATORY admin-page recipe and must be treated as scheduled, not speculative: src/app/admin/CLAUDE.md step 4 prescribes '<Toolbar search filters chips>' for every page's filter row, step 5 prescribes '<ScrollMatrix>' for comparison matrices ('escalas, tarifário' per its docstring at DataList.tsx:258), and step 6 prescribes 'Heavy modals → next/dynamic with DialogSkeleton' (step 7's 'Skeleton*' also plausibly covers SkeletonChart). With revamp waves A1-C and the /admin/comercial restyle still pending, deleting Toolbar/ScrollMatrix/DialogSkeleton would break the documented convention new pages are required to follow — keep them (or change the recipe doc first; note Toolbar also owns a dedicated CSS section at src/styles/aura-kit.css:376 that would go with it). The genuinely unreferenced-anywhere candidates reduce to ProgressRing (Progress.tsx:16), useHasConfirmProvider (ConfirmDialog.tsx:208), and useIsCoarsePointer (hooks.ts:49) — no code, doc, or recipe mentions them; those three are safe to prune with owner sign-off. The bundle-size impact claim is also overstated: these are pure first-party ESM modules behind an 'export *' barrel, which webpack/Next production builds generally tree-shake.


<a id="two-button-systems-shadcn-vs-aura"></a>
### Two parallel button/textarea systems: shadcn ui/button (cva) in 16 legacy pages vs aura Button in 83 files

`two-button-systems-shadcn-vs-aura` · duplicate-logic · confiança high · recomendação **consolidate** · verificação: ⚠️ sem verificação (rodada 1)

**Arquivos:** `src/components/ui/button.tsx` · `src/components/ui/textarea.tsx` · `src/components/aura/Button.tsx` · `src/components/aura/Field.tsx`

**Por que sobra:** src/components/ui/button.tsx is the ONLY file in src importing class-variance-authority (components.json shows shadcn was configured, but adoption stopped at 4 files: button, calendar, popover, textarea). 16 files still import '@/components/ui/button' — concentrated in the pre-revamp modules: surveys/*, comunicacao/automations, contacts, feedback. ui/textarea.tsx has exactly ONE consumer (src/app/feedback/[stayId]/page.tsx) while aura's Textarea (Field.tsx) has 10. The aura kit Button (83 consumer files) is the declared identity going forward (admin-visual-identity rule).

**Evidência:** grep -rln 'class-variance-authority' src → only ui/button.tsx; grep -rln '@/components/ui/button' src → 16 files (listed: surveys pages, comunicacao/automations, contacts, feedback); grep -rln '@/components/ui/textarea' → 1 file; grep -rlw 'Button' excluding aura → 83 files; cat components.json confirms shadcn scaffold config.

**Impacto de remover:** Deleting ui/button.tsx + ui/textarea.tsx after migration removes the cva dependency entirely and one of two competing visual languages; ui/calendar.tsx + popover.tsx (react-day-picker date picker, sole consumer src/app/admin/stays/new/page.tsx) should stay until the kit has a date-picker primitive

**Risco:** Not deletable today — 16 pages must be migrated first. This aligns exactly with the already-planned revamp waves (surveys/comunicacao are wave-B/C candidates); the actionable step now is: no NEW page imports from ui/button, and swap the single ui/textarea use in feedback whenever that page is touched.


<a id="two-toggle-implementations"></a>
### ui/Toggle.tsx duplicates aura kit Switch

`two-toggle-implementations` · duplicate-logic · confiança high · recomendação **consolidate** · verificação: ⚠️ sem verificação (rodada 1)

**Arquivos:** `src/components/ui/Toggle.tsx` · `src/components/aura/Field.tsx`

**Por que sobra:** Two switch/toggle implementations coexist: ui/Toggle.tsx (19 LoC, used by 5 files — the 4 configuracoes/{gastronomia,integracoes,modulos,operacao} pages plus admin/profile/SettingsView.tsx) and the kit's Switch in aura/Field.tsx (with loading state, sizes, hint — 9 consumer files, including configuracoes/comercial which already uses the kit one). The configuracoes family is itself split between the two.

**Evidência:** grep -rln 'ui/Toggle' src → 5 consumers + the file; grep -rlw 'Switch' outside aura → 9 files; grep -rln 'Switch' src/app/admin/configuracoes → comercial/page.tsx uses the aura Switch while its 4 sibling pages use Toggle.

**Impacto de remover:** 19 LoC + one fewer half-identity component; makes the configuracoes pages internally consistent (they also hold the only SectionCard/SettingRow uses — that trio is the configuracoes design system, worth migrating as a unit)

**Risco:** 5 call sites to swap; Toggle's prop shape differs from Switch's (checked/onChange overlap, but verify disabled/label handling per page). Cheap, mechanical.


**Cobertura desta varredura:** Coverage: audited all 95 .tsx + 4 .ts files under src/components (root, admin/, admin/folio, admin/maintenance, admin/profile, admin/settings, aura/, auth/, field/, guest/, maid/, ui/) and all 68 page-local _components files under src/app. Method: per-file import grep (from '.../<basename>'), then per-symbol grep repo-wide (catches next/dynamic — this is how StayAccountModal was proven ALIVE via dynamic() in src/app/admin/stays/page.tsx:50), then dead-chain tracing (every single-importer file's importer was mapped; all terminate in live pages/layouts). whatsapp-service/ was included in string greps. Not dead, verified: AppShell/PullToRefresh (root layout), RouteError (9 error.tsx files), all ui/ shadcn files — button.tsx has 16 importers (cva IS adopted), Toggle/SectionCard/SettingRow are the configuracoes-page kit, calendar.tsx+popover.tsx are single-use but live in /admin/stays/new (calendar is the sole real user of the react-day-picker dep — a consolidation candidate only if that page's date-range picker is ever rebuilt on the kit), textarea.tsx single-use in /feedback. StockLocationPicker vs StockLocationSelect is composition (Picker imports Select), not duplication. The ui/button-vs-aura/Button two-kit situation is the known in-flight revamp (legacy surveys/comunicacao/contacts pages), so consolidation there is planned work, not a dead-code finding. docs/CLEANUP.md already documents 2 of my 9 findings (TestWhatsAppButton, VersionFooter) — I re-verified both independently rather than trusting it. Total high-confidence deletable: 1,421 LoC across 8 files; plus ~200 LoC of aura-kit primitives pending a keep/delete decision against the revamp roadmap. Not covered: whether the orphaned /api/broadcast routes should also be deleted is an API-dimension call (flagged inside the BroadcastPanel finding).

## Páginas e rotas

<a id="portal-breakfast-pages-orphan"></a>
### Guest portal /breakfast + /breakfast/status pages orphaned since Portal 2.0 (Jun/2026) — ~2,100 LoC still receiving maintenance

`portal-breakfast-pages-orphan` · unused-ui · confiança high · recomendação **delete** · verificação: confirmado

**Arquivos:** `src/app/check-in/[code]/breakfast/page.tsx` · `src/app/check-in/[code]/breakfast/status/page.tsx`

**Por que sobra:** The chameleon Portal 2.0 redesign (commit 6341b9b, 2026-06-17) replaced the breakfast wizard with CafeBuilder/OrdersScreen rendered inside PortalShell tabs. The ONLY navigation to /check-in/[code]/breakfast is 3 router.push calls inside /breakfast/status (lines 475, 501, 534), and nothing anywhere navigates to /breakfast/status — the pair is unreachable as a unit. CafeBuilder.tsx:13's comment 'Buffet continua na rota /breakfast (tratado no OrdersScreen)' is stale: OrdersScreen handles buffet via an in-tab details sheet, with zero pushes to the route (verified by grep of OrdersScreen).

**Evidência:** Grep '(push|href|replace)\([^)]*/(breakfast|...)' in src/app/check-in → only status→breakfast self-links; grep '${code}/(map|events|breakfast)' across all of src → same 3 lines only. Grep 'check-in/' in whatsapp-service/ → zero. WhatsApp link variables audited: automation-service.ts:105-110 and GuestContactModal.tsx:48-49 only distribute {{portal_link}} (portal root) and {{survey_link}} (/feedback/...) — no subpage links ever leave the system. git log: both files last touched 2026-08-08 (fa5107d — migrated to /api/guest/session AFTER already being orphaned). docs/ROADMAP.md:80 still tracks 'Bug do café para grupo' against the dead breakfast page; docs/REFACTORING.md:21 lists it as split candidate #2.

**Impacto de remover:** ~2,100 LoC deleted (1,427 + 673), one route segment removed; retires ROADMAP bug item and REFACTORING split item that target dead code; stops API-migration/bug-fix work being spent on unreachable screens

**Risco:** Guests with a bookmarked deep link would 404, but stays are transient and no code or WhatsApp template distributes these URLs. Before deleting, spot-check the DB message_templates table for any hand-written template embedding '/breakfast' (code-side substitution variables cannot produce it). Keep /api/guest/breakfast-* routes — CafeBuilder/OrdersScreen use them.

**Verificação (CONFIRMED):** Tried to refute via every inbound channel and failed. Re-ran the navigation greps: only pushes to /check-in/${code}/breakfast are the 3 self-links in breakfast/status/page.tsx (475, 501, 534); grep for 'breakfast/status' and '/status`|/status"' across src → zero inbound. Attacked dynamic paths: grep 'check-in/${' across src → only portal root, /structures, /concierge, /form; grep for relative pushes push("breakfast → zero; all _portal push() calls enumerated (structures, concierge, feedback only); concierge/page.tsx has zero push/href at all. HomeScreen.tsx:226 café QuickAction is go("orders") in-tab; OrdersScreen.tsx:292-305 renders the buffet card in-tab with zero route pushes, so CafeBuilder.tsx:13's comment is stale as claimed. Attacked external surfaces: whatsapp-service/ (Dockerfile, package.json, server.js) grep for check-in/breakfast → zero; public/ (sw.js, manifest) → zero; migrations/*.sql → zero; QR builders (sheets.tsx = wifi payload, AssetQr = /p/ codes, FunnelPage = proposta base) never build portal subpage URLs; push-notify.ts deep links are staff apps only (/maid, /governanta...); automation-service.ts:95-110 substitutes only {{portal_link}}=BASE/check-in and {{survey_link}}=BASE/feedback/<id> — no subpage variable exists. Verified LoC exactly (1427+673), git dates (fa5107d 2026-08-08 last touch; 6341b9b 2026-06-17 Portal 2.0), docs/ROADMAP.md:80 'Bug do café para grupo' cites the dead page path, docs/REFACTORING.md:21 lists it (1431 lines) as split candidate. The finding's own residual risk (DB message_templates hand-embedding '/breakfast') remains the one un-greppable check and is correctly flagged.


<a id="portal-events-page-orphan"></a>
### Guest portal /check-in/[code]/events page orphaned — Explore tab replaced it, yet it got a bug fix 3 days before this audit

`portal-events-page-orphan` · unused-ui · confiança high · recomendação **delete** · verificação: confirmado

**Arquivos:** `src/app/check-in/[code]/events/page.tsx`

**Por que sobra:** Portal 2.0's HomeScreen 'Eventos' QuickAction goes to the in-portal Explore tab (HomeScreen.tsx:228: onClick={() => go("explore")}), and ExploreScreen fetches events itself via GuestApi.events (ExploreScreen.tsx:90). No router.push/href/Link to the /events route exists anywhere in src, whatsapp-service, or link-variable substitution code. docs/EVENTS-V2.md:71 explicitly states the page 'está órfã na navegação'.

**Evidência:** Grep '${code}/events' and '/events' path patterns across src → zero navigations (only i18n strings and CSS pointer-events noise). Grep whatsapp-service → zero. git log on the file: last touched 2026-08-26 by 9f2f368 'fix(eventos): evento de varios dias sumia do portal' — a production bug fix applied to a page no guest can reach, proving the ongoing maintenance tax.

**Impacto de remover:** 571 LoC deleted plus its i18n leftovers in check-in/[code]/page.tsx (events/eventsSub strings, lines 76-77, 134-135, 192-193); ends the pattern of fixing multi-day-event bugs twice (here and in ExploreScreen)

**Risco:** None identified in code. Same residual check as the breakfast pair: confirm no DB-stored WhatsApp template hand-embeds the URL. EVENTS-V2 work should confirm the page holds no logic ExploreScreen still lacks before deletion.

**Verificação (CONFIRMED):** Failed to refute orphanhood: grep '}/events|/events`|/events"|/events'' across src → zero; no relative pushes; HomeScreen.tsx:228 goes to go("explore") in-tab; ExploreScreen.tsx:90 fetches via GuestApi.events and line 27 comment says 'Sub-aba Eventos (lista real + sheet de detalhe)'; whatsapp-service/migrations/public → zero; automation-service has no event link variable. i18n leftovers verified at exactly check-in/[code]/page.tsx:76-77/134-135/192-193 with no other uses of events/eventsSub keys. git log verified: last touch 9f2f368 2026-08-26. One material nuance the reviewer's framing missed (does not refute the finding — the doc CONFIRMS orphanhood verbatim): docs/EVENTS-V2.md:71-76 documents this as a KNOWN, deliberately deferred deletion — 'está órfã na navegação... Mas a rota continua respondendo por URL direta, então quem tem link antigo ainda chega nela. Foi corrigida junto do multi-dia em vez de apagada; apagar é decisão à parte.' So the 26/08 bug fix was a conscious owner choice to fix-not-delete for old-direct-link holders, not blind maintenance waste; and 'no guest can reach it' is precisely 'no navigation reaches it — direct URLs still resolve'. The delete recommendation stands as the open decision that doc explicitly leaves to the owner; present it with that context.


<a id="portal-map-page-orphan"></a>
### Guest portal /check-in/[code]/map/page.tsx orphaned — map was migrated into ExploreScreen; the map/ components must stay

`portal-map-page-orphan` · unused-ui · confiança high · recomendação **delete** · verificação: confirmado

**Arquivos:** `src/app/check-in/[code]/map/page.tsx`

**Por que sobra:** The interactive map was migrated into the Explore tab (ExploreScreen.tsx:25 comment 'Mapa interativo real (migrado de /map)'; useResortMap.ts:13 'Migrado de check-in/[code]/map/page.tsx para o Portal 2.0'). No navigation to the /map route exists anywhere. Only page.tsx is dead: the sibling files in map/ (SatelliteMap, IllustratedMap, AreaCard, PoiCard, hooks/useGPS, utils/theme, utils/geoTransform, types) are imported by ExploreScreen.tsx:14-35, useResortMap.ts:5-6, and even src/app/admin/resort-map/page.tsx:19 (gcpResidualsPercent).

**Evidência:** Grep '${code}/map' and quoted '/map' navigations across src → zero (the only /map hits are the admin resort-map/reservation-map routes and imports OF map/ components). Grep whatsapp-service → zero. src/app/check-in/CLAUDE.md:11-15 still documents 'map' as a page — doc line needs the same trim. git log: page last touched 2026-08-08 (dddccd6, /api/guest/session migration — work done post-orphaning).

**Impacto de remover:** 458 LoC deleted (page.tsx ONLY); one fewer page to drag along in every portal API/session refactor

**Risco:** Do NOT delete the rest of check-in/[code]/map/ — ExploreScreen, useResortMap and admin/resort-map import from it. Update src/app/check-in/CLAUDE.md page list afterwards.

**Verificação (CONFIRMED):** Failed to refute. grep '}/map|/map`|/map"|/map'' across src → zero navigations; HomeScreen.tsx:232 map QuickAction is go("explore") in-tab; whatsapp-service/public/migrations → zero. Verified the critical scoping claim by reading imports: ExploreScreen.tsx:14-21 imports theme/types/AreaCard/PoiCard/CategoryFilter/AreaListSection/StayHeroCard/GpsPermissionHelp from ../map/, and lines 31-38 dynamically import SatelliteMap and IllustratedMap (rendered at 162/185 — the real map lives in the tab, matching the line-25 comment 'Mapa interativo real (migrado de /map)'); useResortMap.ts:5-6 imports ../map/types and ../map/hooks/useGPS; admin/resort-map/page.tsx:19 imports gcpResidualsPercent from the map/utils/geoTransform. BookingPanel/ReviewPanel stay alive through AreaCard.tsx:10-11 (AreaCard is imported by ExploreScreen), so deleting page.tsx orphans nothing else. LoC 458 exact; git dddccd6 2026-08-08 exact; src/app/check-in/CLAUDE.md indeed still lists 'map' in its Pages line (doc trim needed as noted).


<a id="director-equipe-orphan"></a>
### /director/equipe orphaned since 02/06/2026 — superseded by the inline EquipeSection of /director, still restyled after death

`director-equipe-orphan` · unused-ui · confiança high · recomendação **delete** · verificação: confirmado

**Arquivos:** `src/app/director/equipe/page.tsx`

**Por que sobra:** Commit 438dc27 (2026-06-02, 'fix(director): equipe inline com bottom nav') removed the only inbound link — the bottom-nav push 'if (s === "equipe") { router.push("/director/equipe"); return; }' — and added the duplicate EquipeSection inline in director/page.tsx (defined line 1187, rendered line 1890). The standalone page's only route reference today is its own back button to /director (equipe/page.tsx:229). /director itself is NOT orphaned: it is ROLE_HOME for the 'director' role (role-routes.ts:18, UserRole includes 'director' at aura.ts:8) and is previewable via /admin/mobile-apps ('diretoria' → path /director).

**Evidência:** Grep 'director/equipe' across src → zero matches outside the page itself. git show 438dc27 confirms the deleted push line (`-    if (s === "equipe") { router.push("/director/equipe"); return; }`). git log on the file: last touched 2026-08-22 by c45d169 (tokens T v2 restyle) — post-death maintenance. Page imports StaffService directly for browser-side reads, the exact pattern project memory field-app-browser-write-hangs says must be routed via /api/field/*.

**Impacto de remover:** 404 LoC and one route segment deleted; removes a browser-direct Supabase read path from a field app and a second copy of the Equipe UI that already drifted from the inline one

**Risco:** None found — the inline EquipeSection has feature parity plus photos/profile drawer per the superseding commit message. Verify no director-role user has the URL bookmarked (it would 404 after deletion; the inline section covers the need).

**Verificação (CONFIRMED):** Failed to refute. grep 'director/equipe' across the whole repo → only docs/CLEANUP.md (the reviewer's own report file); zero code references, zero Link/push. git show 438dc27 (2026-06-02) verified the exact claims: removed line '-    if (s === "equipe") { router.push("/director/equipe"); return; }' and added '+            {section === "equipe" && property?.id && <EquipeSection propertyId={property.id} />}'; commit message 'fix(director): equipe inline com bottom nav, fotos e drawer de perfil' confirms feature parity plus photos/drawer. Current director/page.tsx: EquipeSection defined at line 1187 and rendered at line 1890, with no remaining router.push to equipe. /director itself confirmed alive: role-routes.ts:18 maps director → '/director' and admin/mobile-apps/[app]/page.tsx:12 previews 'diretoria' at path /director (the parent, never /equipe). git log on the file: c45d169 2026-08-22 restyle (post-death) verified; created f5d3e1c 2026-06-02, superseded the same day by 438dc27.


<a id="admin-contacts-orphan"></a>
### /admin/contacts page and ContactsPanel.tsx both dead since 18/04/2026 — two copies of a contacts UI nothing can open

`admin-contacts-orphan` · unused-ui · confiança high · recomendação **delete** · verificação: confirmado

**Arquivos:** `src/app/admin/contacts/page.tsx` · `src/components/admin/ContactsPanel.tsx`

**Por que sobra:** Two-step death verified in git: d8b1976 (2026-03-21) removed the standalone 'Contatos' sidebar item and embedded the UI as ContactsPanel tab inside /admin/comunicacao; 58ffb99 (2026-04-18, 'chatwoot fullscreen') then dropped that tab. Today: grep 'admin/contacts' in src → only the API route and contact-service's fetch to the API; grep 'Contact' in src/app/admin/comunicacao → zero; grep 'ContactsPanel' → only its own definition (zero importers). The page's sole remaining reference is AdminTopbar.tsx:52 — a breadcrumb-title map entry ('contacts': 'Contatos'), which labels the page when you are on it but links nothing.

**Evidência:** git log -S 'admin/contacts' on Sidebar.tsx → d8b1976; git log -S 'ContactsPanel' on comunicacao/ → added d8b1976, removed 58ffb99. git log on page: restyled 2026-08-22 (ce7db90 'contatos ... no kit/tokens') — a full visual revamp of an unreachable page. Grep 'fetchContacts|updateContact|deleteContact|ContactService.' → listContacts/updateContact/deleteContact are called ONLY by these two dead files; live consumers (GuestContactModal, StayDetailsModal, GuestDetailPanel) use upsertContact/migrateContactPhone/findByPhone.

**Impacto de remover:** 544 LoC deleted (291 page + 253 panel) plus the AdminTopbar map entry; follow-on: ContactService.listContacts/updateContact/deleteContact and the GET/PATCH/DELETE surface of /api/admin/contacts lose their last callers (coordinate with the API-dimension cleanup)

**Risco:** Deleting removes the only UI for renaming/deleting WhatsApp contacts — confirm with the user that Chatwoot now owns that job (the 58ffb99 direction implies it does). Alternative is restoring one link, not keeping two dead copies. Delete ContactsPanel and the page together, then prune the now-caller-less service methods/API handlers in a second step.

**Verificação (CONFIRMED):** Failed to refute. grep 'admin/contacts' in src → only src/app/api/admin/contacts/route.ts (the API) and contact-service.ts:235 (the fetch inside listContacts) — no href/push to the page anywhere. grep 'ContactsPanel' → only its own definition (zero importers). grep 'Contact' in src/app/admin/comunicacao → zero. Sidebar.tsx → zero contacts references; AdminTopbar.tsx:52 '"contacts": "Contatos"' is a breadcrumb-title map entry only. Both death commits verified by diff: d8b1976 (2026-03-21) added ContactsPanel.tsx (253 lines) + the comunicacao tab + Sidebar change; 58ffb99 (2026-04-18) removed both the import and the '<ContactsPanel propertyId={property.id} />' render from comunicacao/page.tsx. Method-split claim verified by full grep: listContacts/updateContact/deleteContact are called ONLY by the dead page (page.tsx:40/84/104) and dead panel (33/70/84), while live consumers (GuestContactModal:115, StayDetailsModal:275, GuestDetailPanel:97/101, stays/new/useNewStay:209/227) use upsertContact/migrateContactPhone/findByPhone. whatsapp-service/ has zero contacts references, so the API GET/PATCH/DELETE surface has no external caller either. The risk note (confirm Chatwoot owns contact rename/delete before deleting the only UI for it) is the right gate and correctly flagged for the owner.


<a id="termos-never-linked"></a>
### /termos (SaaS terms of use, 308 lines) has zero inbound links — not even from the /aura marketing footer that links /changelog

`termos-never-linked` · unused-ui · confiança high · recomendação **investigate** · verificação: confirmado

**Arquivos:** `src/app/termos/page.tsx` · `src/app/aura/page.tsx`

**Por que sobra:** It is a full legal terms page ('Termos e Condições Gerais de Uso') reachable only by typing the URL. Case-insensitive grep 'termos' across the whole repo (src, whatsapp-service, docs, migrations) finds no '/termos' href anywhere: the /aura footer links /changelog (aura/page.tsx:545, 1030) but not /termos; the login page, configuracoes 'Políticas e termos' hub (which points at /admin/configuracoes/politicas) and portal terms flow (guest policy acceptance, unrelated) never reference it. No evidence of out-of-band distribution (no QR, no template, no doc).

**Evidência:** Grep '/termos' in src → zero. Grep -i 'termos' repo-wide → only the page itself, unrelated guest-policy strings, a migration comment, and docs/CLEANUP.md (a prior unverified report). git log: created/last touched 2026-04-05 (0298e07) — untouched for ~5 months. Contrast: /changelog IS linked twice from /aura, proving the footer pattern exists and skipped this page.

**Impacto de remover:** Either one footer link on /aura (plus ideally /admin/login) makes a 308-line legal page functional, or 308 LoC deleted if the terms are premature; clause 2.2 of the page itself claims use implies acceptance — an unreachable terms page undermines that legal claim

**Risco:** Do not silently delete: it may be referenced from off-repo contracts or onboarding e-mails. Ask the owner; the cheap fix is adding the link, which also strengthens the legal posture.

**Verificação (CONFIRMED):** Failed to refute. grep '/termos' across src → zero matches (nothing links it; the page file itself doesn't contain its own path). Case-insensitive repo-wide checks found no distribution surface: whatsapp-service → zero; migrations → zero; public/ → zero. The footer-pattern contrast verified: src/app/aura/page.tsx links /changelog at exactly lines 545 and 1030 and never /termos; admin login page → zero termos references. git history verified: created in d681181 'feat: atualizar pagina 404 e adicionar termos de uso' and last touched 0298e07, both 2026-04-05 — untouched ~5 months. The 'investigate' recommendation (add the footer link or ask the owner before deleting a legal page possibly referenced off-repo in contracts/emails) is the correct, conservative action; nothing I found argues for either silent deletion or for the page being secretly reachable.


<a id="portal-link-var-points-at-no-page"></a>
### {{portal_link}} is substituted as BASE/check-in, but /check-in has no page — two live substitution sites may be sending guests to a 404

`portal-link-var-points-at-no-page` · tech-debt · confiança medium · recomendação **investigate** · verificação: confirmado

**Arquivos:** `src/services/automation-service.ts` · `src/components/admin/GuestContactModal.tsx` · `src/components/admin/BroadcastPanel.tsx`

**Por que sobra:** Inverse of an orphan page found during the same route audit: a distributed URL with no page behind it. automation-service.ts:105 (WhatsApp automations) and GuestContactModal.tsx:48 (manual sends) both replace {{portal_link}} with `${baseUrl}/check-in`, yet src/app/check-in/ has no page.tsx (Glob verified), supabase-middleware.ts:45-46 passes /check-in through without redirecting, and next.config.mjs/vercel.json define no redirects — so the bare path renders Next's 404. BroadcastPanel.tsx:34 previews the same variable as 'https://aaura.app.br/check-in/login', disagreeing with both real substitutions.

**Evidência:** Glob src/app/check-in/page.tsx → no files. Grep 'redirect|check-in' in next.config.mjs → nothing; vercel.json has no redirects. Read supabase-middleware.ts:40-48 — public-guest branch only injects x-property-id, never rewrites. Grep '{{portal_link}}' → 3 substitution/preview sites with 2 different values.

**Impacto de remover:** One 8-line redirect stub (src/app/check-in/page.tsx → /check-in/login, same pattern as admin/core/structures/page.tsx) fixes every past and future message that used the variable; or normalize all three sites to /check-in/login

**Risco:** Severity depends on DB-stored message_templates text, which I could not read: if every template writes '{{portal_link}}/login?code={{access_code}}' the composed URL works and only the bare variable is a trap. Check one production template before deciding; the redirect stub is safe either way.

**Verificação (CONFIRMED):** Failed to refute; found additional supporting evidence. Verified src/app/check-in/ contains only CLAUDE.md, [code]/, error.tsx, form/, login/ — no page.tsx, so bare /check-in 404s ([code] is a dynamic child segment and cannot match the bare path; error.tsx is a boundary, not a page). Read supabase-middleware.ts:45-65 — the public-guest branch returns NextResponse.next and only injects x-property-id on custom domains; no rewrite/redirect. vercel.json contains only crons; next.config.mjs has no redirects. Substitution sites verified: automation-service.ts:104-106 builds portalLink = `${baseUrl}/check-in`; GuestContactModal.tsx:46-48 hardcodes baseUrl https://aaura.app.br then substitutes /check-in; BroadcastPanel.tsx:25-34 is explicitly '// Fake data for variable preview' showing /check-in/login. EXTRA evidence strengthening the finding: /api/broadcast/route.ts:70 runs real broadcasts through AutomationService.parseVariables — so broadcasts actually send BASE/check-in while the panel previews BASE/check-in/login (a working page); the preview actively disagrees with what is sent. The proposed fix pattern verified to exist: src/app/admin/core/structures/page.tsx is exactly the 8-line legacy-redirect stub ('Este stub existe para links antigos e favoritos não caírem em 404'). The medium-confidence caveat is right: whether guests actually receive the bare URL depends on DB-stored template text (e.g. a template writing {{portal_link}}/{{access_code}} composes a working /check-in/CODE), which cannot be read from the repo — hence 'investigate' plus the safe redirect stub is the correct recommendation.


**Cobertura desta varredura:** Scanned all 113 page.tsx under src/app (admin ~85, check-in 9, standalone 18, root 1) plus every layout.tsx. Inbound-reference sources checked per route: Sidebar.tsx NAV_GROUPS/PAINEL_CHILDREN, role-routes.ts (ROLE_HOME/ROLE_TABS), AdminTopbar search+title maps, configuracoes/_lib/catalog.ts, PatrimonioTabs, in-page Link/router.push/window.open greps, next.config.mjs/vercel.json redirects, supabase-middleware.ts, whatsapp-service/ (only STATUS_WEBHOOK_URL — no page links), and WhatsApp link-variable substitution code (only portal root + /feedback ever distributed). VERIFIED LIVE (no finding): /aura + its _mocks (all 4 imported by aura/page.tsx), /changelog (linked twice from /aura), /casamento{,/[code]} (couple/guest links from casamentos DetailDrawer), /p/[code] (printed asset-QR plaques via asset-service publicUrl), /cotacao/[id] (quote links in comercial), /equipe/[staffId] (maid app colleagues list), /feedback/[stayId] (survey_link automations), /director (ROLE_HOME for role 'director' + /admin/mobile-apps diretoria preview), all 7 field apps (ROLE_HOME), /check-in/login, form/[stayId], [code]/structures + concierge (HomeScreen QuickActions), and every admin page not in the Sidebar (surveys/new|edit|curated|area-reviews, escalas/mensal, patrimonio tabs, stays/new|[stayId], comunicacao/automations, configuracoes children via catalog, core/properties/[id], estoque/locais/[id], perfil/[staffId], mobile-apps/[app]). Intentional legacy redirect stubs (keep): admin/core/structures{,/bookings}, admin/core/resort-map, admin/comercial, plus root /admin and / — all ≤17-line redirect(). docs/CLEANUP.md already listed most orphan candidates flagged 'Sem verificação adversarial'; this pass independently confirmed each with fresh greps and commit archaeology (orphaning commits: 6341b9b portal 2.0 17/06, 438dc27 director inline 02/06, d8b1976→58ffb99 contacts 03-04/2026) and added the {{portal_link}}/check-in-404 finding. NOT covered: DB-stored message_templates content (no prod DB access from this session) — the residual risk named in findings 1, 2 and 7; and whether any staff row actually has role='director' (data question, not code reachability).

## Rotas de API

> Vereditos desta seção são da rodada 1 (29/08) — os achados não mudaram entre as rodadas.

<a id="media-proxy-dead"></a>
### /api/media — legacy WhatsApp media proxy, zero callers, and an unauthenticated open proxy

`media-proxy-dead` · dead-code · confiança high · recomendação **delete** · verificação: confirmado

**Arquivos:** `src/app/api/media/route.ts`

**Por que sobra:** Generic proxy (`GET /api/media?url=...` fetches any URL and streams it back) built for the old in-app WhatsApp chat UI to serve media hosted on the Hostinger VM over HTTPS. The comunicacao module was migrated to a Chatwoot iframe (commit fe74fb9 'migrate WhatsApp to Evolution API + Chatwoot iframe'), so nothing in the app renders WhatsApp media anymore — `mediaUrl` survives only as an unused type field.

**Evidência:** rg 'api/media|media\?url' across src, whatsapp-service, scripts, docs, public → only hit is whatsapp-service/server.js:28 `app.use('/media', express.static(...))`, which is the container's own static server, not this route. rg 'mediaUrl' across src → only src/types/aura.ts:926 (type field, never read). git log for the file → single commit 'Snapshot 10 (Incompleto 7)' (pre-Chatwoot-era). src/app/admin/comunicacao/page.tsx is now a bare Chatwoot iframe (line 75).

**Impacto de remover:** Deletes 30 LoC and closes a real hole: the route has NO auth and fetches attacker-supplied URLs server-side on Vercel — an open SSRF/egress proxy anyone can hit in production (also burns Vercel bandwidth via the 24h cache header).

**Risco:** Old messages in the DB could theoretically embed absolute '/api/media?url=' links, but no component renders message media anymore (Chatwoot iframe owns that UI), so nothing can dereference them. Check Vercel request logs for /api/media hits before deleting if extra caution is wanted.

**Verificação (CONFIRMED):** Tried to refute and failed. Ran rg 'api/media|media\?url' across the whole git root (C:\Aura-Experience, including whatsapp-service/, scripts/, docs/, public/, migrations/) — zero matches anywhere, not even the reviewer's cited whatsapp-service hit. whatsapp-service/server.js builds media links as `${SERVER_URL}/media/${fileName}` (line 135) served by its own express.static (line 28) — those DB-stored mediaUrl values point at the VM directly, never at /api/media?url=, so old messages cannot dereference the proxy either. rg 'mediaUrl|/media' → written by src/app/api/webhook/evolution/route.ts:81,158 and typed at src/types/aura.ts:926, rendered nowhere; src/app/admin/comunicacao/page.tsx (read in full) is a bare Chatwoot iframe (line 75). next.config.mjs has no rewrites. Verified the unauthenticated claim by reading the route (no requireAuth) and src/lib/supabase-middleware.ts:127 — the middleware only gates /api/admin/*, so GET /api/media is reachable with no session and fetches an arbitrary url param: real open SSRF proxy. git log --follow → single commit 4ef6b98 'Snapshot 10'. Only housekeeping note: src/app/api/CLAUDE.md line 4 lists `media/` in its route-group prose — update that line when deleting.


<a id="chatwoot-sso-dead"></a>
### /api/chatwoot/sso — SSO magic-link endpoint that no UI ever calls

`chatwoot-sso-dead` · dead-code · confiança high · recomendação **delete** · verificação: confirmado

**Arquivos:** `src/app/api/chatwoot/sso/route.ts` · `.env.example`

**Por que sobra:** Generates an HMAC `custom_sso_login` link for Chatwoot. It was added with the Chatwoot iframe migration (fe74fb9), but the shipped UI never wired it: src/app/admin/comunicacao/page.tsx:75 embeds the iframe with the plain `chatwootUrl` (staff logs into Chatwoot with its own session), and src/components/admin/GuestContactModal.tsx:88-90 builds deep links directly. It is POST-only, so it cannot even be a bookmarked link.

**Evidência:** rg -i 'chatwoot' across src/whatsapp-service/scripts/docs/public → no occurrence of 'chatwoot/sso' or 'custom_sso_login' outside the route itself. rg 'CHATWOOT_SSO|CHATWOOT_URL' → only .env.example:53-59 and the route. NEXT_PUBLIC_CHATWOOT_URL (.env.example:55) is referenced by zero source files.

**Impacto de remover:** Deletes 36 LoC, plus 3 dead env entries in .env.example (CHATWOOT_URL, NEXT_PUBLIC_CHATWOOT_URL, CHATWOOT_SSO_SECRET) and their Vercel counterparts; removes a stale server-wide secret from the config surface.

**Risco:** If auto-login into the Chatwoot iframe is still a desired UX, this is the half-built piece of it — confirm with the operator that manual Chatwoot login is the accepted flow before deleting. Nothing breaks at runtime either way (route returns 500 today when the envs are unset).

**Verificação (CONFIRMED):** Tried to refute and failed. Ran rg -i 'chatwoot' and 'api/chatwoot|custom_sso_login|NEXT_PUBLIC_CHATWOOT' across the git root: the only references to the SSO route are the route file itself and a prose line in docs/ARCHITECTURE.md:95 ('Chatwoot — support inbox + SSO (/api/chatwoot/*)') — documentation, not a caller; update it on delete. Read src/app/admin/comunicacao/page.tsx in full: iframe src is property.settings.whatsappConfig.chatwootUrl from the DB (line 50/75), no SSO fetch. src/components/admin/GuestContactModal.tsx:88-91 builds `${wc.chatwootUrl}/app/accounts/...` deep links directly. Env greps: CHATWOOT_URL and CHATWOOT_SSO_SECRET appear only in .env.example:54,59 and the route; NEXT_PUBLIC_CHATWOOT_URL only in .env.example:55. chatwoot-service.ts reads its config from property.settings + property_secrets, not these envs, so the 3 env entries are dead with the route. Route is POST + requireAuth() so no external system (including Chatwoot itself) can be a hidden caller. The reviewer's own caveat stands: this is the half-built auto-login piece — confirm manual Chatwoot login is the accepted UX, then delete.


<a id="admin-auth-signout-superseded"></a>
### /api/admin/auth/signout — superseded duplicate of /api/auth/signout, zero callers

`admin-auth-signout-superseded` · duplicate-logic · confiança high · recomendação **delete** · verificação: confirmado

**Arquivos:** `src/app/api/admin/auth/signout/route.ts` · `src/app/api/auth/signout/route.ts`

**Por que sobra:** Commit 98697ec 'fix(auth): move signout para /api/auth/signout (fora do prefixo protegido)' relocated signout outside the middleware-guarded /api/admin prefix; the old route was left behind. The replacement is a strictly better version of the same handler (clears sb- cookies BEFORE awaiting, 2s timeout on supabase.auth.signOut so a hung Supabase call can't trap the user). Every signout in the app — AuthContext.tsx:166,283, Sidebar.tsx:566, and all 7 field apps (maid, governanta, waiter, houseman, maintenance, maintenance-ops, governanta/error.tsx) — calls /api/auth/signout.

**Evidência:** rg 'auth/signout' across src → 16 fetch('/api/auth/signout') call sites; the ONLY reference to /api/admin/auth/signout is a prose comment at src/app/api/admin/auth/login/route.ts:9 ('mesmo esquema de /api/admin/auth/signout'). Read both route files: near-identical @supabase/ssr signout logic, the admin one being the older variant without the timeout guard. git log confirms the move commit.

**Impacto de remover:** Deletes 36 LoC and removes a confusing near-duplicate that invites future edits to the wrong file (the two have already drifted: one has the hang-protection fix, the other doesn't). Update the comment in login/route.ts:9 to point at /api/auth/signout.

**Risco:** Minimal — POST-only, session-scoped, no external callers possible. Only the stale comment in login/route.ts references it.

**Verificação (CONFIRMED):** Tried to refute and failed. rg 'auth/signout' across the git root → 16 call sites, all fetch('/api/auth/signout') (AuthContext.tsx:166,283, Sidebar.tsx:566, all field apps + governanta/error.tsx); the only textual reference to the old path is the prose comment at src/app/api/admin/auth/login/route.ts:9. rg 'admin/auth' found no dynamic path construction that could reach it. git show 98697ec confirms the move commit created src/app/api/auth/signout/route.ts and rewired AuthContext + governanta WITHOUT deleting the old route. Read both handlers: same @supabase/ssr signOut({scope:'local'}) + sb- cookie wipe; only the new one clears cookies BEFORE the await and races signOut against a 2s timeout — the drift claim is accurate. Two additions for the fix: (1) commit 91b804c later exempted /api/admin/auth/* from the middleware gate (supabase-middleware.ts:127), so the old route is technically reachable again — deadness comes from zero callers, not from being blocked; (2) besides login/route.ts:9, the comment at supabase-middleware.ts:122 also lists 'login/me/signout' as the /api/admin/auth/* flow — update both prose mentions when deleting.


<a id="concierge-groups-routes-uncalled"></a>
### /api/admin/concierge/groups and /groups/[id] — full CRUD API with zero HTTP callers (UI uses ConciergeService directly)

`concierge-groups-routes-uncalled` · duplicate-logic · confiança high · recomendação **delete** · verificação: **rebaixado**

**Arquivos:** `src/app/api/admin/concierge/groups/route.ts` · `src/app/api/admin/concierge/groups/[id]/route.ts` · `src/services/concierge-service.ts`

**Por que sobra:** GET/POST on groups plus PATCH/DELETE on groups/[id] duplicate ConciergeService.getGroups/createGroup/updateGroup/deleteGroup (concierge-service.ts:17-99), which is what the admin UI actually uses via browser Supabase writes (useConcierge.ts:194-206). The routes were added in 9ff8109 'feat(concierge): grupos, estoque e seed' and have never gained a caller; groups data reaches read paths through embedded selects ('group:concierge_groups(*)') in the catalog route and field bootstrap, not through these endpoints. The route copies also lack the audit logging the service performs, so anything that DID adopt them would silently lose audit trail.

**Evidência:** rg 'concierge/groups' across src, whatsapp-service, scripts, docs, public → only the routes' own serverError() tags. Segment-matched all 613 extracted api-path references against the route list → 0 matches including ${...} dynamic forms. Read src/app/admin/concierge/_components/useConcierge.ts:194-206 → calls ConciergeService.updateGroup/createGroup/deleteGroup directly.

**Impacto de remover:** Deletes 2 files / ~103 LoC and removes a second, audit-less write path to concierge_groups that has drifted from the real one (service logs to AuditService on every mutation; routes don't).

**Risco:** House direction (field-app-browser-write-hangs, api-route-first pattern) may eventually want admin concierge writes to go through API routes — if so, the correct move is the opposite: point useConcierge at these routes and add the audit log there. Confirm which way before deleting; as shipped they are unreachable either way.

**Verificação (DOWNGRADED):** The deadness is fully confirmed: rg 'concierge/groups' across the git root → only the routes' own serverError() tags; rg 'api/admin/concierge' → the only concierge endpoints ever fetched are new-request-data, history, catalog, by-stay (useConcierge.ts:115,133, NewRequestModal.tsx:49, folio/useStayAccount.ts:68,112,208), all with the literal segment in the template literal — no dynamic form can produce 'groups'. Read useConcierge.ts:189-206: group writes go through ConciergeService.createGroup/updateGroup/deleteGroup (browser Supabase + AuditService); read both route files and concierge-service.ts:17-101: the routes lack audit logging and have drifted further than claimed (route GET omits the .eq('active', true) filter the service applies, so wiring reads to it would resurrect soft-deleted groups). What I downgrade is the unconditional 'delete' recommendation: the repo's own convention doc (src/app/admin/CLAUDE.md — 'Pages fetch via the API route; they don't query Supabase for writes directly') and the field-app-browser-write-hangs history both point toward API routes as the intended direction, meaning these files are the convention-compliant half and useConcierge is the legacy half. Deleting is fine only if the operator confirms direct browser writes stay; otherwise the fix is the inverse (wire useConcierge to the routes, add audit + active filter there).

**Claim corrigido:** The 4 handlers in src/app/api/admin/concierge/groups/route.ts and groups/[id]/route.ts are unreachable as shipped (zero callers) and have drifted from ConciergeService (no audit log, GET missing active=true filter). Resolve the duplication one way or the other: either delete both route files, or — per the admin pattern in src/app/admin/CLAUDE.md — point useConcierge.ts group CRUD at these routes and add AuditService logging + the active filter to them. Ask the operator which direction before acting; do not leave both write paths.


<a id="push-unsubscribe-uncalled"></a>
### /api/push/unsubscribe — DELETE endpoint with no caller in app code or service worker

`push-unsubscribe-uncalled` · dead-code · confiança medium · recomendação **investigate** · verificação: confirmado

**Arquivos:** `src/app/api/push/unsubscribe/route.ts` · `src/components/PushNotificationManager.tsx` · `public/sw.js`

**Por que sobra:** Deletes a push_subscriptions row by endpoint+staffId, but nothing ever invokes it: PushNotificationManager.tsx only calls /api/push/subscribe (line 59) and never unsubscribes (only reads pushManager.getSubscription() at line 44); public/sw.js contains no fetch to any /api path and no pushsubscriptionchange handler. Stale subscriptions are instead pruned server-side by the 404/410 cleanup in the push fan-out.

**Evidência:** rg 'push/(un)?subscribe' across src, public, whatsapp-service, scripts, docs, migrations → callers: only /api/push/subscribe from PushNotificationManager.tsx:59; the sole /api/push/unsubscribe mention is a comment in the untracked migrations/push_subscriptions.sql:4. grep 'api/' public/sw.js → no hits. grep 'unsub|pushsubscriptionchange' in PushNotificationManager.tsx and sw.js → no hits.

**Impacto de remover:** 33 LoC; one less endpoint in a security-sensitive surface (push) to maintain and reason about.

**Risco:** The push module is in-flight RIGHT NOW (push_subscriptions.sql is untracked, push/send routes and push-notify.ts are modified in the working tree, and 'push_subscriptions nao existe' is an open production issue) — the author may be about to wire unsubscribe into a toggle-off flow. Ask before deleting; if push opt-out UX is planned, this is the endpoint for it.

**Verificação (CONFIRMED):** Confirmed at the finding's own 'investigate, do not delete yet' level. Tried to refute and failed: rg -i 'unsubscribe' and 'push/' across the git root → zero invocations of /api/push/unsubscribe; read public/sw.js in full (no fetch to any /api path, no pushsubscriptionchange handler — grep 'api/' in public/ returned nothing) and PushNotificationManager.tsx in full (only /api/push/subscribe at line 59; getSubscription at line 44 is a read, and there is no unsubscribe UI/toggle anywhere — rg 'push/' across src confirms). Server-side pruning exists as claimed: src/lib/push-notify.ts:11 deletes push_subscriptions by endpoint. The in-flight risk is also verified and is exactly why 'investigate' is the right call: git status shows push/send/* routes and push-notify.ts modified and migrations/push_subscriptions.sql untracked, and that migration's own header (lines 3-4) explicitly names '/api/push/unsubscribe' among the thirteen code points the new table serves — the author counts this endpoint as part of the intended surface. Do not delete without asking; if no opt-out UX is planned after the push module lands, it can go then.


**Cobertura desta varredura:** Scanned all 172 route.ts files under src/app/api. Method: extracted every 'api/...' string occurrence (613) across src/, public/, whatsapp-service/, scripts/, docs/, migrations/, vercel.json with rg, then segment-matched against the route inventory with dynamic-segment normalization ([id] and ${...} both wildcard); every route with ≤2 external references was then manually re-greped raw (including refs inside other API routes, which the matcher excluded) and its file read. Classes cleared as live and NOT reported: 17 estoque/patrimonio routes (called via src/lib/stock-client.ts BASE='/api/admin' + fragment paths — verified fragment-by-fragment); guest routes via src/lib/guest-api.ts; eventos via src/lib/eventos-api.ts; properties/whatsapp via property-settings-client.ts; webhook/evolution* (inbound Evolution webhooks); cron/process-messages, whatsapp-watchdog, housekeeping-routines, hsystem-sync (external triggers per CLAUDE.md/docs/CRON.md); /api/push/send/* (Supabase Database Webhooks — verified x-webhook-secret + {type:'INSERT', record} payload shape and the confirming comment at concierge-actions.ts:97); both /api/upload and /api/upload/signed-url (distinct flows, both called). No src/app/api/partner routes exist yet (Altamare is still planning-stage per docs/ALTAMARE.md). Not covered: callers living outside the repo other than the documented ones (e.g. anything hand-configured in the Supabase dashboard or cronjob.org can only be inferred, which is why push/send and external crons were treated as live per guardrails); DB-stored URLs (addressed case-by-case in the media finding). Git Bash caveat: initial rg passes silently failed on patterns starting with '/' due to MSYS path conversion — all counts above are from re-runs with conversion disabled or slash-free patterns.

## Duplicação

> Vereditos desta seção são da rodada 1 (29/08) — os achados não mudaram entre as rodadas.

<a id="brl-money-formatter-25-copies"></a>
### BRL money formatter reimplemented ~25 times with 5 conflicting output formats

`brl-money-formatter-25-copies` · duplicate-logic · confiança high · recomendação **consolidate** · verificação: confirmado

**Arquivos:** `src/lib/rate-engine.ts` · `src/app/admin/concierge/_components/concierge-utils.ts` · `src/app/admin/food-and-beverage/orders/_components/orders-utils.ts` · `src/app/admin/casamentos/_components/lib.tsx` · `src/app/admin/comercial/_components/shared.ts` · `src/app/admin/estoque/page.tsx` · `src/app/admin/estoque/relatorios/page.tsx` · `src/app/admin/estoque/perdas/page.tsx` · `src/app/admin/estoque/compras/_components/ImportXmlDialog.tsx` · `src/app/admin/patrimonio/page.tsx` · `src/app/admin/patrimonio/[id]/page.tsx` · `src/app/admin/patrimonio/relatorios/page.tsx` · `src/app/admin/guarita/page.tsx` · `src/app/admin/hsystem/page.tsx` · `src/app/admin/food-and-beverage/menu/page.tsx` · `src/app/admin/food-and-beverage/menu/_components/MenuDialogs.tsx` · `src/app/porter/_components/guarita-ui.ts` · `src/lib/stay-account.ts` · `src/components/admin/folio/AccountEntry.tsx` · `src/components/admin/LodgingPanel.tsx` · `src/components/admin/AssetFormModal.tsx` · `src/components/admin/AssetDisposalModal.tsx` · `src/app/cotacao/[id]/ProposalClient.tsx` · `src/app/cotacao/[id]/IntakeForm.tsx` · `src/app/check-in/[code]/_portal/OrdersScreen.tsx`

**Por que sobra:** The same concept — format a number as Brazilian reais — is defined locally in at least 25 files under the names money/fmtMoney/fmtBRL/brl/formatBRL, in five mutually inconsistent conventions: (a) `R$ ${v.toFixed(2)}` producing US-style decimals "R$ 1234.56" (concierge-utils.ts:108, patrimonio/page.tsx:19, patrimonio/[id]/page.tsx:25, AssetFormModal.tsx:83, AssetDisposalModal.tsx:44, estoque/perdas/page.tsx:56, ImportXmlDialog.tsx:28); (b) `toFixed(2).replace('.', ',')` with no thousands separator (guarita-ui.ts:54, stay-account.ts:33, OrdersScreen.tsx:98, guarita/page.tsx:36, AccountEntry.tsx:19); (c) toLocaleString('pt-BR', {minimumFractionDigits:2}) (casamentos lib.tsx:46, estoque/page.tsx:24, estoque/relatorios/page.tsx:26, patrimonio/relatorios/page.tsx:35, LodgingPanel.tsx:27, ProposalClient.tsx:23, IntakeForm.tsx); (d) Intl.NumberFormat currency style (orders-utils.ts:9, menu/page.tsx:11, MenuDialogs.tsx:13); (e) rate-engine.ts:61 formatBRL (locale, max 2 digits, no forced decimals) — the only lib-level one, imported by exactly one file (NewQuoteWizard.tsx). Variant (a) shows guests/staff US-formatted prices in a pt-BR product — the duplication is actively producing inconsistent UI, not just extra LoC.

**Evidência:** Ran: Grep `const (formatCurrency|formatMoney|formatBRL|fmtMoney|fmtBRL|moneyFmt|formatPrice|brl)\b` (4 hits); Grep `const money =|fmtMoney|const brl|const fmtBRL` content mode (25+ local definitions listed with line numbers above); Grep backtick-R$-interpolation → 84 occurrences across 50 files; Grep `Intl.NumberFormat` → 7 occurrences in 5 files; Read src/lib/rate-engine.ts:61-63 (formatBRL) and src/lib/parse-money.ts (parse side already centralized, format side is not); Grep `formatBRL` usages → imported only by NewQuoteWizard.tsx.

**Impacto de remover:** ~25 deleted local definitions (~30 LoC), plus fixes at least 7 files currently rendering US-style decimals; one place to change if currency display rules ever change.

**Risco:** Formats intentionally differ in places: comercial/shared.ts:79 uses 0 decimals for lead totals, director/page.tsx:204 abbreviates millions — give the canonical helper a decimals option and leave truly bespoke ones (director) alone. Migrating variant (a)/(b) call sites changes rendered output (to correct pt-BR format) — eyeball the screens after. Do the named-formatter swap first; leave inline `R$ ${...}` template strings in log/WhatsApp messages for a later pass.

**Verificação (CONFIRMED):** Re-ran the definition greps and reproduced 24+ local money/fmtBRL/brl definitions at the exact cited file:line positions, in the five conflicting formats claimed: US-style `R$ ${v.toFixed(2)}` (concierge-utils.ts:108, patrimonio/page.tsx:19, patrimonio/[id]/page.tsx:25, AssetFormModal.tsx:83, AssetDisposalModal.tsx:44, estoque/perdas/page.tsx:56, ImportXmlDialog.tsx:28), comma-no-thousands (guarita-ui.ts:54, stay-account.ts:33, OrdersScreen.tsx:98, guarita/page.tsx:36, AccountEntry.tsx:19), toLocaleString pt-BR, Intl.NumberFormat, and rate-engine.ts:61 formatBRL. Grep for formatBRL confirmed it is imported by exactly one file (NewQuoteWizard.tsx:29). Verified the risk section's carve-outs are real (comercial/shared.ts:79-80 deliberately 0-decimals; director/page.tsx:204 abbreviates). Tried to refute by hunting for an existing canonical formatter — none exists (rate-engine's is prefix-less and unforced-decimals, so a new helper with a decimals option is needed, as the finding proposes). Also found one copy the finding missed (src/app/casamento/_site/i18n.ts:434), which strengthens it. The US-decimal variant genuinely renders wrong-locale prices in production screens.


<a id="date-helpers-reimplemented"></a>
### addDays / nightsBetween / todayIso(SP) / formatDateBR each reimplemented 3-13 times

`date-helpers-reimplemented` · duplicate-logic · confiança high · recomendação **consolidate** · verificação: **rebaixado**

**Arquivos:** `src/lib/rate-engine.ts` · `src/lib/event-dates.ts` · `src/services/wedding-service.ts` · `src/services/crm-service.ts` · `src/services/hsystem-service.ts` · `src/services/finance-service.ts` · `src/services/rate-service.ts` · `src/services/rate-quote-public-service.ts` · `src/services/wedding-site-service.ts` · `src/app/admin/casamentos/_components/lib.tsx` · `src/app/admin/comercial/_components/shared.ts` · `src/app/admin/comercial/_components/NewQuoteWizard.tsx` · `src/app/cotacao/[id]/ProposalClient.tsx` · `src/context/NotificationContext.tsx`

**Por que sobra:** src/lib/rate-engine.ts:27-79 already exports the canonical date-only kit (isoToDate, dateToIso, addDays, nightsBetween, formatDateBR), yet: (1) addDays(iso, days) is re-declared byte-for-byte in wedding-service.ts:15, crm-service.ts:93, and as a UTC-variant in hsystem-service.ts:80; (2) nightsBetween is re-declared in hsystem-service.ts:86, casamentos/_components/lib.tsx:40, and NewQuoteWizard.tsx:132 — the last one in a file that ALREADY imports addDays/dateToIso/formatBRL from rate-engine on line 29; (3) "today in the pousada's timezone" — `new Date().toLocaleDateString('en-CA', {timeZone:'America/Sao_Paulo'})` — is written out inline 13 times (wedding-service.ts:12/86/126, crm-service.ts:90, finance-service.ts:22, rate-service.ts:2055, rate-quote-public-service.ts:464/620/729, wedding-site-service.ts:479, NotificationContext.tsx:43, comercial/shared.ts:74, casamentos/lib.tsx:31), plus hsystem-service.ts:76 doing the same thing a different way (Date.now() - 3h); (4) iso→dd/mm/yyyy is formatDateBR (rate-engine.ts:77), `fmt` (casamentos/lib.tsx:23), `fmtBR` (comercial/shared.ts:76 and ProposalClient.tsx:25).

**Evidência:** Ran: Grep `(export )?(const|function) (addDays|isoToDate|dateToIso|toIso|toISODate|formatDate|formatDateBR|fmtDate|parseISO|isoDate|todayIso|toLocalDate)\b` (38 hits); Grep `America/Sao_Paulo` (20 hits, 13 of them the exact same one-liner); Read and compared the bodies: rate-engine.ts:27-46, wedding-service.ts:11-19, crm-service.ts:89-97 (identical to rate-engine's addDays), hsystem-service.ts:75-87, casamentos/lib.tsx:23-44, comercial/shared.ts:73-77, NewQuoteWizard.tsx:130-133, event-dates.ts (localIso/todayIso — device-tz semantics, documented).

**Impacto de remover:** ~10 duplicate function bodies (~45 LoC) plus 13 inline tz one-liners collapse; eliminates the standing risk of one copy drifting (hsystem already computes 'today' by a different mechanism than everyone else).

**Risco:** Two distinct 'today' semantics exist on purpose: device-timezone (event-dates.ts localIso/todayIso, for guest-facing screens) vs America/Sao_Paulo (server code). Consolidate into two clearly named exports (e.g. todayDeviceIso vs todayPropertyIso) — do NOT merge them into one. Extract the date section of rate-engine into src/lib/dates.ts (re-export from rate-engine for compatibility) so services like wedding/crm don't have to import the rate engine for a date helper. Pure functions, trivially verified with pnpm build.

**Verificação (DOWNGRADED):** The duplication is real and I verified most of it: addDays in wedding-service.ts:15-19 and crm-service.ts:93-97 is body-identical to rate-engine.ts:38-42; the `toLocaleDateString('en-CA', {timeZone:'America/Sao_Paulo'})` one-liner appears exactly 13 times at the cited lines; event-dates.ts todayIso is device-tz by design as claimed. BUT reading the bodies exposed behavioral differences the finding glosses over: hsystem-service.ts:86-90 nightsBetween clamps `Math.max(1, Math.round(...))`, NewQuoteWizard.tsx:132-133 clamps `Math.max(0, ...)`, while rate-engine.ts:44-46 and casamentos/lib.tsx:40-44 do not clamp at all — swapping them changes same-day/inverted-range results. Likewise the dd/mm/yyyy formatters differ: casamentos/lib.tsx:23-27 `fmt` returns "—" for empty, comercial/shared.ts:76-77 `fmtBR` handles null and slices datetimes, rate-engine.ts:77-79 formatDateBR does neither. The risk claim 'Pure functions, trivially verified with pnpm build' is wrong for these — the type checker cannot catch a clamp or null-guard regression.

**Claim corrigido:** Consolidate addDays and the 13 todayIso/localToday America/Sao_Paulo one-liners freely (semantics verified identical), keeping the documented device-tz vs property-tz split. Do NOT mechanically replace the nightsBetween and date-formatting copies: hsystem's Math.max(1,…), NewQuoteWizard's Math.max(0,…), and the "—"/null guards in casamentos lib.tsx and comercial/shared.ts are call-site semantics that must be preserved or explicitly parameterized, and pnpm build will not catch mistakes there — those need eyeballed per-call-site migration, not a swap.


<a id="evolution-sendtext-triplicated"></a>
### Evolution WhatsApp send path duplicated in 3 routes, config resolution in 5 places

`evolution-sendtext-triplicated` · duplicate-logic · confiança high · recomendação **consolidate** · verificação: confirmado

**Arquivos:** `src/app/api/chat/send/route.ts` · `src/app/api/admin/messages/send-now/route.ts` · `src/app/api/cron/process-messages/route.ts` · `src/app/api/whatsapp/check-number/route.ts` · `src/app/api/admin/whatsapp/session/route.ts` · `src/lib/evolution-error.ts`

**Por que sobra:** Three routes each carry a full independent copy of the same pipeline — resolve whatsappConfig from properties.settings + evolutionApiKey from PropertySecretsService + env fallbacks + instanceName pick (`cfg.instanceName || cfg.instances?.[0]?.instanceName || process.env.EVOLUTION_INSTANCE`), safe-mode gate, POST `${baseUrl}/message/sendText/${encodeURIComponent(instanceName)}`, parseEvolutionError on failure, and the messages-row status update: chat/send/route.ts:28-88, admin/messages/send-now/route.ts:31-101, cron/process-messages/route.ts:109-222. Two more routes duplicate just the config-resolution block: whatsapp/check-number/route.ts:25-54 and admin/whatsapp/session/route.ts:57-69 — the latter already factored it into a local resolveConfig() that is the right shape to promote. The copies have already drifted: process-messages gained the whatsappNumberProblem pre-check and whatsappEnabled gate that send-now and chat/send lack, and chat/send does not increment attempts/lastAttemptAt.

**Evidência:** Ran: Grep `sendText|/message/sendText|EVOLUTION_API` across src (17 hits: exactly 3 sendText fetch call sites + 2 extra config resolutions); Read all of chat/send/route.ts and admin/messages/send-now/route.ts, cron/process-messages/route.ts:100-229, whatsapp/check-number/route.ts:15-59, admin/whatsapp/session/route.ts:40-84. Confirmed whatsapp-health-service.ts uses env only for the Coolify restart (Grep `instanceName|apiUrl` there → no matches).

**Impacto de remover:** ~130 LoC deduped across 5 files. Bigger payoff: a single choke point for sends — the volume-cap/circuit-breaker hardening that currently lives uncommitted in a git stash (per project memory whatsapp-send-hardening) would have exactly one place to land, and the DDI pre-check (whatsappNumberProblem) would automatically cover manual resends, which it currently does not.

**Risco:** This path is production-critical (real guest messages). Extract src/lib/evolution.ts with resolveEvolutionConfig(propertyId) + sendEvolutionText({propertyId, number, text}) returning {ok, apiMessageId, errorMessage}; keep each route's own messages-row bookkeeping semantics in the route on the first pass (they differ deliberately: cron retries with attempts, chat/send does not). Verify against safe-mode in DEV before touching prod; per deploy-permissions memory, main only with explicit OK.

**Verificação (CONFIRMED):** Grep for `sendText|EVOLUTION_INSTANCE|EVOLUTION_API` reproduced exactly 3 sendText fetch call sites (chat/send/route.ts:60, admin/messages/send-now/route.ts:78, cron/process-messages/route.ts:176) and 5 config-resolution copies (those three plus whatsapp/check-number/route.ts:25-47 and admin/whatsapp/session/route.ts:57-69). Read all five files end to end: the pipeline (settings.whatsappConfig + PropertySecretsService + env fallbacks + same instanceName precedence + safe-mode gate + parseEvolutionError) is copied as claimed, and the drift is exactly as described — process-messages has the whatsappEnabled gate (line 118) and whatsappNumberProblem pre-check (line 160) that send-now and chat/send lack, and chat/send's status updates never touch attempts/lastAttemptAt while the other two do. session/route.ts's local resolveConfig() (lines 57-69) is indeed the promotable shape. Verified whatsapp-health-service.ts:117-119 uses env-only config for the Coolify restart path, so it is correctly out of scope. Tried to refute by checking whether the proposed extraction would change behavior: check-number's env-first-then-override resolution is semantically the same precedence, and the finding already keeps per-route messages-row bookkeeping in the routes, so the differing retry semantics are preserved. One implementation note: safe-mode ordering differs slightly (process-messages validates config before the safe-mode gate, chat/send after), which the extraction must respect — but that does not defeat the consolidation.


<a id="push-fanout-still-duplicated-in-webhook-routes"></a>
### push fan-out helpers duplicated in /api/push/send/* despite push-notify.ts existing to consolidate them

`push-fanout-still-duplicated-in-webhook-routes` · duplicate-logic · confiança high · recomendação **consolidate** · verificação: confirmado

**Arquivos:** `src/lib/push-notify.ts` · `src/app/api/push/send/housekeeping/route.ts` · `src/app/api/push/send/concierge/route.ts` · `src/app/api/push/send/maintenance/route.ts`

**Por que sobra:** src/lib/push-notify.ts exports fanOut, fanOutByRole and cleanExpired, and its header comment states it "reúne o fan-out (antes duplicado em /api/push/send/*)" — but the migration was never finished: push/send/housekeeping/route.ts:7-54 re-declares private fanOut/fanOutByRole/cleanExpired nearly line-for-line, and push/send/concierge/route.ts:26-50 and push/send/maintenance/route.ts:28-66 inline the same subs-query → sendPushNotification → delete-expired loop by hand. The copies have already drifted subtly: on query error the lib versions return early, the route versions log and fall through. These webhook routes must stay (Supabase DB webhooks call them with x-webhook-secret — NOT dead code), but their bodies should import from @/lib/push-notify.

**Evidência:** Read src/lib/push-notify.ts (all 143 lines), src/app/api/push/send/housekeeping/route.ts (all 119), src/app/api/push/send/concierge/route.ts (all 53), src/app/api/push/send/maintenance/route.ts (all 69), and src/app/api/push/notify/route.ts (which already delegates to the lib correctly). Glob src/app/api/push/**/route.ts confirmed the full route set.

**Impacto de remover:** ~100 LoC deleted across 3 routes; expired-subscription cleanup and error-logging behavior becomes uniform across the webhook path and the in-code trigger path.

**Risco:** Very low — same table, same payload shapes, sendPushNotification already shared. Note these three files are currently modified in the working tree (git status), so coordinate with whatever change is in flight before editing. Separately worth checking (outside this finding's scope): the housekeeping/maintenance webhooks and the in-code triggerTaskPush notifications can double-deliver the same event if both the Supabase webhook and the in-code trigger are active.

**Verificação (CONFIRMED):** Read src/lib/push-notify.ts (header comment at lines 4-6 confirms it exists to de-duplicate /api/push/send/*, exports fanOut/fanOutByRole/cleanExpired) and all three routes in their current working-tree state: housekeeping/route.ts:7-54 re-declares all three helpers nearly line-for-line, concierge/route.ts:26-50 and maintenance/route.ts:28-66 inline the same subs-query → sendPushNotification → delete-expired loop. The routes are correctly identified as live external-webhook consumers (x-webhook-secret check at the top of each POST), so only the bodies consolidate. Tried to refute on semantics: (a) the claimed error-handling drift is actually cosmetic — the route versions log then hit `if (!subs?.length) return`, so net behavior matches the lib's early return, which makes the swap SAFER than the finding implies, not riskier; (b) maintenance route's role list includes admin/manager/super_admin unlike the lib's notifyMaintenanceAssigned, but roles are a parameter of fanOutByRole, so each route passes its own list and behavior is preserved; (c) the lib's fanOut has an extra `if (!staffIds.length) return` guard the routes lack — callers already guard, harmless. The git-status coordination caveat is real (all three routes plus push-notify.ts are modified in the working tree).


<a id="inline-translation-pick-6-copies"></a>
### name/name_en/name_es picker reimplemented in 6 files outside map/utils/localize.ts

`inline-translation-pick-6-copies` · duplicate-logic · confiança high · recomendação **consolidate** · verificação: confirmado

**Arquivos:** `src/app/check-in/[code]/map/utils/localize.ts` · `src/lib/multilang.ts` · `src/app/check-in/[code]/_portal/CafeBuilder.tsx` · `src/app/check-in/[code]/_portal/OrdersScreen.tsx` · `src/app/check-in/[code]/breakfast/page.tsx` · `src/app/check-in/[code]/concierge/page.tsx` · `src/app/feedback/[stayId]/page.tsx` · `src/app/feedback/[stayId]/CuratedSurvey.tsx`

**Por que sobra:** The exact pick pattern `(lang === 'en' && x.field_en) || (lang === 'es' && x.field_es) || x.field` for the DB's inline-i18n column convention exists as localizedName/localizedDescription in check-in/[code]/map/utils/localize.ts (used by 6 map files), and is re-implemented locally in: CafeBuilder.tsx:29-32 (loc/locD closures — also threaded through 2 component prop signatures at lines 267-268 and 317-318), OrdersScreen.tsx:88-97 (itemName/itemDesc) plus an inline groupName at line 269, breakfast/page.tsx:185-196 (name, description, welcomeMessage, instructions variants), concierge/page.tsx:152-155 (getItemName), feedback/[stayId]/page.tsx:83-87 (text/description/options pickers), CuratedSurvey.tsx:152 (label picker). src/lib/multilang.ts handles only the jsonb {pt,en,es} format and explicitly documents that the column convention 'convive' with it — but no lib-level helper exists for the column side.

**Evidência:** Ran: Grep `lang === ['\"]en['\"]` content mode (60+ hits — separated the field-pick pattern from inline UI copy strings, which are the documented i18n convention and NOT reported); Grep `name_en` count (61 occurrences/20 files); Grep `localizedName|localizedDescription` (7 files, all inside map/). Read localize.ts (all 19 lines), CafeBuilder.tsx:27-32, OrdersScreen.tsx:85-98, concierge/page.tsx:151-155, breakfast/page.tsx:185-196.

**Impacto de remover:** ~30 LoC of duplicate pickers across 6 files; a generic pickLang(obj, field, lang) in src/lib/multilang.ts (re-exported from map/utils/localize.ts) gives one definition of the fallback rule (empty translation falls back to PT) for every current and future translated column.

**Risco:** Low — pure functions with identical fallback semantics in every copy (verified by reading each). The lang unions differ in name only (MapLang vs 'pt'|'en'|'es'). feedback/page.tsx's options_en picker adds a `.length` check for arrays — keep that one variant or support arrays in the helper. Guest portal is production; visual no-op, verify with pnpm build.

**Verificação (CONFIRMED):** Read map/utils/localize.ts (the canonical picker, lines 9-19) and verified every cited copy by grep `lang === ['"]en['"] && ` plus targeted reads: CafeBuilder.tsx:29-32, OrdersScreen.tsx:88-97 + groupName at 269, breakfast/page.tsx:185-196 (ternary form — semantically identical to the || chain), concierge/page.tsx:153-159, feedback/[stayId]/page.tsx:83-87 (with the options_en array-length variant the finding already flags), CuratedSurvey.tsx:152. All copies implement the same empty-falls-back-to-PT rule. Tried to refute by hunting for behavioral divergence between copies — found none. Instead found the finding UNDERCOUNTS: map/components/PoiCard.tsx:29-35 re-implements the picker locally despite localize.ts living in the same map/ subtree, and eventHelpers.ts:42-48, check-in/[code]/events/page.tsx:131-137, HomeScreen.tsx:152 do the same pick for camelCase fields (titleEn/titleEs) — the helper should either take the suffix convention into account or those camelCase sites stay out of scope, but either way the consolidation case is stronger than stated.


<a id="realtime-subscribe-teardown-boilerplate"></a>
### Identical realtime subscribe/teardown block hand-rolled in ~20 client call sites

`realtime-subscribe-teardown-boilerplate` · duplicate-logic · confiança medium · recomendação **consolidate** · verificação: confirmado

**Arquivos:** `src/app/admin/stays/_components/useStaysLive.ts` · `src/app/admin/eventos/_components/useEventos.ts` · `src/app/admin/estruturas/bookings/_components/useBookings.ts` · `src/app/admin/reception/_components/useReceptionLive.ts` · `src/app/admin/cafe-salao/_components/useCafeSalao.ts` · `src/app/admin/reservation-map/ReservationMapClient.tsx` · `src/components/admin/folio/useFolio.ts` · `src/app/waiter/page.tsx` · `src/context/NotificationContext.tsx` · `src/lib/supabase.ts`

**Por que sobra:** The pattern `useEffect → let subscribed = false → supabase.channel(name).on('postgres_changes', {event:'*', schema:'public', table, filter: propertyId=eq.X}, refetch).subscribe(s => { if (s === 'SUBSCRIBED') subscribed = true }) → return () => safeRemoveChannel(channel, subscribed)` is copied structurally verbatim across the admin hooks (verified identical in useStaysLive.ts:87-94, useEventos.ts:49-57, useBookings.ts:77-84; grep shows the same shape in the rest). 48 postgres_changes subscriptions exist across 24 files, but only 12 of those files use safeRemoveChannel — meaning half the subscription sites hand-roll teardown differently or track the `subscribed` flag their own way, which is exactly the drift a `useRealtimeRefetch(channelName, tables[], onChange)` hook would prevent.

**Evidência:** Ran: Grep `postgres_changes` count (48 occurrences/24 files); Grep `safeRemoveChannel` count (25 occurrences/12 files — 3 of them the definition in src/lib/supabase.ts); Read the subscribe blocks in useStaysLive.ts:86-94, useEventos.ts:48-57, useBookings.ts:77-84 and confirmed they are line-for-line the same shape differing only in channel name/table. No existing hook found (Grep `useRealtime|useChannel|useSupabaseChannel` → no files).

**Impacto de remover:** ~8 lines × ~20 client call sites (~160 LoC) plus removal of the subscribed-flag foot-gun; multi-table pages (waiter x4, director x5, useCafeSalao x4, NotificationContext x5) collapse to one hook call with a table list.

**Risco:** Larger, more mechanical refactor than the others and touches production realtime UX: some sites debounce, filter by event type, or refetch different things per table — the hook must take per-table handlers, and sites with bespoke logic (NotificationContext) can adopt it last or not at all. Services that open channels server-side patterns (restock/housekeeping/maintenance/concierge services, platform-health) are a different context — exclude them. Migrate one page per PR, verify realtime in a second tab per the admin checklist.

**Verificação (CONFIRMED):** Reproduced both counts exactly: postgres_changes 48 occurrences / 24 files, safeRemoveChannel 25 / 12 (including the definition in src/lib/supabase.ts and one doc mention in src/app/admin/CLAUDE.md). Read the three cited blocks — useStaysLive.ts:87-94, useEventos.ts:49-57, useBookings.ts:77-84 — and they are structurally line-for-line identical (channel name + table + filter + subscribed flag + safeRemoveChannel teardown), differing only in channel/table names. Verified the drift claim concretely: director/page.tsx:1782 and NotificationContext.tsx:143-147 tear down with raw supabase.removeChannel and no subscribed flag — exactly the foot-gun safeRemoveChannel exists to prevent. Grep for useRealtime|useChannel|useSupabaseChannel confirmed no such hook exists yet. Tried to refute the '~20 client call sites' figure: 24 files minus 1 doc minus 5 server-side services (concierge/housekeeping/maintenance/restock/platform-health) = 18 client files, consistent with the estimate, and the finding already excludes the services and mandates per-table handlers + bespoke-site opt-out. The medium confidence and one-page-per-PR migration plan are appropriately hedged; nothing found that breaks the observation.


**Cobertura desta varredura:** Scanned all 10 assigned hunting grounds in C:\Aura-Experience\aura\src via targeted greps + file reads (evidence per finding). Dimensions checked and deliberately NOT reported: (6) occupancy/rate math — clean: rate-service.ts and rate-quote-public-service.ts import computeQuote et al. from src/lib/rate-engine.ts, and src/lib/wedding-rate-engine.ts explicitly composes over computeQuote rather than duplicating it; (7) status label/color maps — the STATUS_CFG-style maps found (casamentos/lib.tsx, comercial/shared.ts, eventos-utils, concierge-utils) each cover a different domain enum with no same-domain duplicate across files; (3) phone digit-stripping — replace(/\\D/g,'') appears ~90 times but is a one-liner below the consolidation bar (src/lib/phone.ts already owns the real DDI logic); the ~10 `https://wa.me/${phone.replace(...)}` builders are likewise one-liners; (8) fetch wrappers — postFieldAction/guest-api adoption is good; the only legacy local wrapper is postAction in src/app/maid/page.tsx:1685 (thin, throw-semantics, low value to migrate). Also noted but not reported as findings: ~6 near-identical local fmtDate one-liners in the estoque page family (below bar individually; would ride along with the date-helpers consolidation). Not covered: whatsapp-service/ container internals (separate build, out of consolidation scope) and migrations/*.sql (historical record).

## Complexidade e E/S

> Vereditos desta seção são da rodada 1 (29/08) — os achados não mudaram entre as rodadas.

<a id="governanta-page-seams"></a>
### governanta/page.tsx (2.627 linhas): 1.250 linhas de sheets/componentes acima do componente principal são extração mecânica

`governanta-page-seams` · complexity · confiança high · recomendação **simplify** · verificação: confirmado

**Arquivos:** `src/app/governanta/page.tsx`

**Por que sobra:** O arquivo é o maior do repo e o page component em si só começa na linha 1489 (export default GovernantaPage). Tudo antes é componente autocontido que recebe props e não toca o estado da página: ConferSheet (236-462, ~227 linhas, com fetch lazy próprio do catálogo de reposição), GovReplenishSheet (463-575), GovMaintenanceSheet (576-751), AssignSheet (752-859), LocPicker (877-927), NewTaskSheet (928-1231, ~304 linhas), TaskCard (1242-1377), ProfileScreen (1378-1488), Section/BatchReleaseButton (2569-2627), mais os átomos STYLE/T/I/Pulse/GovToast/Sheet/StatusBadge/TypeBadge (24-235). Seams concretos: (1) `governanta/_components/sheets/` — os 5 sheets + TaskCard, cada um já é função pura de props; (2) `governanta/_components/atoms.tsx` para os átomos (ou o kit compartilhado do achado field-app-kit-duplicado); (3) um hook `useGovernantaBoot` para o init de 1598-1686 (bootstrap + retry + listenToActiveTasks). O data-flow já está saneado (bootstrap único via /api/field/governanta-bootstrap) — o custo aqui é só navegação/merge conflitos, não I/O.

**Evidência:** wc -l = 2627. grep -n de definições de função: ConferSheet:236, GovReplenishSheet:463, GovMaintenanceSheet:576, AssignSheet:752, ListaVazia:860, LocPicker:877, NewTaskSheet:928, Label:1232, TaskCard:1242, ProfileScreen:1378, export default:1489, Section:2569, BatchReleaseButton:2584. Leitura das linhas 1598-1837 confirma que o init é um bloco único candidato a hook e que os sheets recebem tudo por props.

**Impacto de remover:** ~1.250 linhas saem do page.tsx sem mudança de comportamento (sobra ~1.350); docs/REFACTORING.md já pede exatamente esse padrão (o exemplo concierge foi de 2088 → ~230 linhas).

**Risco:** Nenhum comportamental se for extração pura; o STYLE injetado via <style> precisa ir junto com quem o usa. Sem testes — validar com pnpm build + passada manual no app (regra do REFACTORING.md).

**Verificação (CONFIRMED):** Reproduced every anchor: wc -l = 2627; grep of function definitions returned exactly the claimed lines (ConferSheet:236, GovReplenishSheet:463, GovMaintenanceSheet:576, AssignSheet:752, ListaVazia:860, LocPicker:877, NewTaskSheet:928, TaskCard:1242, ProfileScreen:1378, export default GovernantaPage:1489, Section:2569, BatchReleaseButton:2584). Read ConferSheet 236-295: fully prop-driven (task/locationName/propertyId/actor*/onClose/onApprove/onReject/busy) with its own lazy catalog fetch at 260-270 — no page-state coupling. Read the init block 1598-1686: single bootstrap via /api/field/governanta-bootstrap with retry + listenToActiveTasks, a clean hook candidate. Tried to refute via docs/REFACTORING.md and found it supports the finding (concierge precedent 2088 → ~230 lines at line 82); its only counterpoint is ordering advice ('Mobile field apps last... one tab at a time', line 66), which tempers sequencing, not the seams themselves. Pure extraction, no behavior change claimed or required.


<a id="newquotewizard-seams"></a>
### NewQuoteWizard.tsx (2.328 linhas): split natural por etapa do wizard + módulo DraftRoom + hook de contexto

`newquotewizard-seams` · complexity · confiança high · recomendação **simplify** · verificação: confirmado

**Arquivos:** `src/app/admin/comercial/_components/NewQuoteWizard.tsx`

**Por que sobra:** REFACTORING.md linha 87-88 já o marca como 'próximo candidato a split por etapa do wizard' (tinha 1.748 linhas; hoje 2.328). Os seams são nítidos porque o render já é chaveado por `step`: (1) `draft-room.ts` — helpers puros sem React das linhas 40-208 (newDraftRoom, paxOf/paxText/paxSig/paxFromSig, sumPax, nightsBetween, quoteComposition, seedRooms); (2) `useDraftRooms` — a máquina de estados da lista de acomodações, linhas 274-430 (patchRoom, addRoom, duplicateRoom, removeRoom, reorderRooms, moveRoom, roomDropProps, dragHandle); (3) `useTarifarioContext` — os efeitos de I/O das linhas 605-656 (fetch do bundle + fetch de contexto por período com debounce); (4) `StepClient.tsx` — JSX do passo 1 (1443-1606) + busca de cliente (474) + adoptQuote/applyQuoteToDraft/confirmGuest (500-561); (5) `StepCompare.tsx` — compareRow/compareBlock (1169-1272) + JSX do passo 2 (1607-1681); (6) `StepRooms.tsx` — optionRow (1273+) + JSX do passo 3 (1682-2145) + montagem da mensagem (978-1075). A matemática de preço já vive fora (src/lib/rate-engine — import na linha 27-30), então o split não arrasta lógica de negócio.

**Evidência:** grep -n de `step === ` mostra os blocos: step1 1443, step2 1607, step3 1682, footer 2146-2199. grep de helpers top-level lista as 14 funções puras (40-137) e seedRooms (181). Imports confirmam computeQuote/processTemplate vindos de @/lib/rate-engine. Fetches: bundle em 607 (com cache via prop initialBundle — FunnelPage.tsx:58/660 já evita refetch), contexto por período em 634 com debounce de 350ms.

**Impacto de remover:** Arquivo cai de 2.328 para ~600-700 no shell do wizard; as etapas viram arquivos de ~200-450 linhas; ~170 linhas viram módulo puro testável.

**Risco:** O passo 3 compartilha muito estado (rooms, overrides, contexto por período) — extrair como componente com props explícitas, não context, para não criar re-render em cascata. Validar o fluxo salvar/copiar (trava otimista de 409 — memória cotacao-edicao-write-back-stale).

**Verificação (CONFIRMED):** Verified in the file: wc -l = 2328; step-gated render blocks at exactly step===1:1443, step===2:1607, step===3:1682, footer 2146-2199; pure helpers newDraftRoom:82 and seedRooms:181; room state machine patchRoom:274 / addRoom:287 / duplicateRoom:293 / removeRoom:316 / reorderRooms:362 / moveRoom:375 / roomDropProps:389 / dragHandle:409; bundle fetch at 607 with initialBundle cache prop (FunnelPage.tsx:660 passes bundleCache.current, comment at 219 'evita refetch a cada abertura'); period-context fetch at 634 inside a 350ms setTimeout debounce (read lines 625-656); compareRow:1169 / compareBlock:1189 / optionRow:1273; pricing math imported from @/lib/rate-engine (line 30). docs/REFACTORING.md:87-88 explicitly names this file 'próximo candidato a split por etapa do wizard' at 1748 lines — it has since grown to 2328. Found nothing that contradicts the proposed seams.


<a id="rate-service-quote-split"></a>
### rate-service.ts (2.260 linhas): o ciclo de vida de orçamento (linhas 747-2104) é um domínio separado do CRUD de tarifário

`rate-service-quote-split` · complexity · confiança high · recomendação **simplify** · verificação: confirmado

**Arquivos:** `src/services/rate-service.ts`

**Por que sobra:** O arquivo contém dois domínios com clientes diferentes: (a) CRUD do tarifário — tabelas/períodos/flutuações/settings, linhas 253-746 (saveTable, deletePeriod, saveFluctuation, saveSettings...), consumido pela página /admin/tarifario; (b) ciclo de vida de orçamento/lead, linhas 747-2104 (~1.360 linhas: getQuoteContext, saveQuote de ~300 linhas, updateQuote, patchQuoteRoom, reorderQuoteRooms, removeQuoteRoom, updateQuoteIntake, ensureGuestForQuote, convertQuote, linkQuoteToStay, listLinkableStays, archiveExpiredQuotes), consumido pelo hub comercial e já entrelaçado com crm-service. Seams: (1) `quote-service.ts` levando também os helpers de módulo que só servem a orçamento (guestExtrasFromIntake:55, overCapacitySignature:166, overCapacityDetail:178, QuoteConflictError:153, QUOTE_PATCH_FIELDS:38); (2) `importSitBackup` (2105-2260) é ferramenta one-shot de migração com um único caller (api/admin/tarifario/import/route.ts:36) — pode virar `rate-import-service.ts` ou módulo próprio; (3) micro-fix imediato: em saveQuote as três leituras independentes são sequenciais — `getRateData` (linha 919), `CrmService.getChannels` (1054) e `getQuoteById` (1058) podem ser um Promise.all, cortando 2 round-trips do caminho quente salvar/copiar do wizard.

**Evidência:** grep -n dos métodos do objeto RateService (253-2105) e dos helpers de módulo (35-242). Leitura de saveQuote 894-1201 confirma os três awaits sequenciais e que são mutuamente independentes (channels só valida slug; existing só alimenta a trava otimista). grep de importSitBackup fora do service devolve apenas api/admin/tarifario/import/route.ts:36. getBundle (258-272) e getQuoteContext (758-786) já usam Promise.all — o resto do arquivo está bem paralelizado.

**Impacto de remover:** Dois arquivos de ~900-1.100 linhas com fronteira de domínio real; -2 round-trips por salvamento de orçamento; o import SIT (155 linhas) sai do caminho de leitura de todo mundo.

**Risco:** saveQuote/updateQuote são o coração do comercial em produção — split puro (mover métodos, manter re-export em rate-service para não quebrar ~15 imports de RateService). Verificar import circular com crm-service (crm-service já importa rate-engine, não rate-service).

**Verificação (CONFIRMED):** Method boundary verified by grep: tarifário CRUD saveTable:332 / deletePeriod:558 / saveFluctuation:577 / saveSettings:701 vs quote lifecycle getQuoteContext:747 through archiveExpiredQuotes:2053, importSitBackup:2105. Read saveQuote 894-1093: the three awaits are exactly at 919 (getRateData), 1054 (CrmService.getChannels — result used only to validate the source slug at 1055-1056) and 1058 (getQuoteById — used only for the optimistic lock at 1063 and weddingId preservation at 1088); all three depend only on propertyId/payload.id, so Promise.all changes nothing on the success path (a validation throw in between would merely waste two reads, no writes). Hunted for other importSitBackup callers across src/, whatsapp-service/, scripts/ — only api/admin/tarifario/import/route.ts:36. Circular-import risk checked: crm-service.ts imports @/lib/rate-engine and guest-service, NOT rate-service (lines 1-24), so a quote-service depending on CrmService creates no cycle. Helper line numbers all match (QUOTE_PATCH_FIELDS:38, guestExtrasFromIntake:55, QuoteConflictError:153, overCapacitySignature:166, overCapacityDetail:178). One correction that strengthens the finding: 26 files import from @/services/rate-service (not ~15), making the keep-a-re-export advice more important, not less.


<a id="checkin-form-seams"></a>
### check-in/form/[stayId]/page.tsx (1.997 linhas): dicionário de traduções, telas de status e 4 passos do wizard são extraíveis no padrão que o próprio portal já usa

`checkin-form-seams` · complexity · confiança high · recomendação **simplify** · verificação: confirmado

**Arquivos:** `src/app/check-in/form/[stayId]/page.tsx`

**Por que sobra:** UnifiedPreCheckin (linha 471) carrega 1.530 linhas num componente só, mas as fronteiras já existem no código: (1) `translations` PT/EN/ES ocupa as linhas 43-353 (~310 linhas) — o resto do portal guarda strings em `check-in/[code]/_portal/` (padrão documentado em check-in/CLAUDE.md); mover para `form/[stayId]/strings.ts` é mecânico; (2) PetWeightField (388-470) é componente puro; (3) as telas de status são blocos if independentes: error (984), success (994-1049), already_done (1050-1077), group_manager (1078-1158); (4) o wizard é chaveado por `wizardStep`: passo 1 titular (1159-1346), passo 2 acompanhantes+camas (1347-1573), passo 3 (1574-1674), passo 4 revisão/envio (1675-fim); (5) a lógica de dados — loadData (550-635), validateForm/validateStep (666-758), getDraftPayload/handleNextStep/executeSave (764-890) — vira um hook `usePreCheckinForm`. O I/O já está certo: um único GuestApi.precheckin + listas FNRH estáticas (564-570), nada a consertar aí.

**Evidência:** grep -n: const translations:43 fechando em 353; PetWeightField:388; export default:471; wizardStep === 1/2/3/4 em 1159/1347/1574/1675; step === 'success'/'already_done'/'group_manager' em 994/1050/1078. Leitura de 543-635 confirma boot único via GuestApi.precheckin e FnrhService com listas estáticas.

**Impacto de remover:** Page cai para ~500-600 linhas; ~310 linhas de strings saem do bundle de parse do componente; passos viram arquivos de 150-330 linhas. É a superfície pública mais sensível (hóspede, 3 idiomas) — hoje qualquer ajuste de texto mexe no arquivo inteiro.

**Risco:** Formulário público em produção com estado compartilhado entre passos (guest/stay setState por espalhamento) — extrair passos como componentes controlados por props. Testar PT/EN/ES + fluxo de grupo (groupId) + rascunho por passo.

**Verificação (CONFIRMED):** All anchors reproduced by grep/read: const translations at 43 closing at 353 (~310 lines, PT/EN/ES); PetWeightField:388 (pure props component); export default UnifiedPreCheckin:471; status screens step==='error':984, 'success':994, 'already_done':1050, 'group_manager':1078; wizardStep blocks at 1159/1347/1574/1675; data logic loadData:551 (single boot via GuestApi.precheckin:560 + static FnrhService lists 565-569), validateForm:666, validateStep:717, getDraftPayload:764, handleNextStep:791, executeSave:810. The claimed precedent pattern exists: src/app/check-in/[code]/_portal/ contains i18n.ts and context.tsx, and check-in/CLAUDE.md line 8 documents '_portal/' as the shared state/strings home. Tried to refute the 'mecânico' claim for the strings move and failed — translations is a plain const object with no closures over component state.


<a id="field-app-kit-duplicado"></a>
### Mini design-system copiado e colado em 7 apps de campo (T, STYLE, I, Pulse, Toast, Sheet, ReplenishSheet)

`field-app-kit-duplicado` · duplicate-logic · confiança high · recomendação **consolidate** · verificação: confirmado

**Arquivos:** `src/app/maid/page.tsx` · `src/app/governanta/page.tsx` · `src/app/houseman/page.tsx` · `src/app/maintenance/page.tsx` · `src/app/maintenance-ops/page.tsx` · `src/app/director/page.tsx` · `src/app/waiter/page.tsx`

**Por que sobra:** Cada app de campo redeclara o mesmo kit visual inline: tema `const T = {` em 8 arquivos (maid:47, governanta:41, houseman:17, maintenance:17, maintenance-ops:34, director:35, director/equipe:24, breakfast/status:61); `const STYLE = \`` em 7; o componente de ícones `function I({ n, s = 20, c = "currentColor", w = 1.8 })` idêntico em 5 (governanta:101, houseman:104, maid:345, maintenance:131, maintenance-ops:93), cada um com seu dicionário de paths SVG (11-17 ícones por app); Pulse ×5, Toast ×4, Sheet ×3. Pior: ReplenishSheet (maid:392-594) e GovReplenishSheet (governanta:463-575) são o mesmo componente — mesmas props (catalog/repItems, loading, onClose, onSend com a mesma assinatura), mesmo estado de carrinho, mesmo `adj`, mesmo useCloseGuard — divergindo só em busca/agrupamento. Toda correção de UX de campo (ex.: o anti-clique-fantasma do incidente de 26/08) precisa ser replicada N vezes ou fica inconsistente. Extrair `src/components/field/` (tokens + átomos + Sheet + ReplenishSheet parametrizado) é pré-requisito barato antes de qualquer split dos apps.

**Evidência:** grep -rn 'function I({ n, s = 20' → 5 hits idênticos; grep -rln '^const STYLE = `' → 7 arquivos; grep -rn '^const T = {' → 8; grep -rn 'function HoldConfirm|function TapShield|function Toast(|function Pulse(|function Sheet(' → Pulse ×5, Toast ×4, Sheet ×3; leitura lado a lado de maid:392-420 e governanta:463-490 confirma o ReplenishSheet duplicado; grep -c 'path d=' conta 11/17/6/8 paths SVG inline por app.

**Impacto de remover:** ~1.500-2.000 linhas duplicadas consolidáveis; correções de acessibilidade/anti-toque-fantasma passam a valer para todos os apps de uma vez.

**Risco:** Os temas T divergem de propósito por app (paleta por papel) — o kit compartilhado precisa aceitar a paleta como parâmetro, não unificar cores. Extrair átomo por átomo, validando cada app no aparelho (público semi-alfabetizado depende de forma/cor).

**Verificação (CONFIRMED):** Reran every grep and got the same counts: 'function I({ n, s = 20' → exactly 5 identical signatures (governanta:101, houseman:104, maid:345, maintenance:131, maintenance-ops:93); '^const STYLE = `' → 7 files; '^const T = {' → 8 (incl. director/equipe:24 and breakfast/status:61); Pulse ×5, Toast ×4 in field apps, Sheet ×3 (the portal's sheets.tsx Sheet is a separate subsystem, correctly not counted). Read ReplenishSheet (maid:392-447) and GovReplenishSheet (governanta:463-517) side by side: identical props contract (items/loading/onClose/onSend with the same (productId,quantity)[] signature), identical cart state, identical adj/count reducers, same useCloseGuard dirty-check. One divergence beyond the claimed busca/agrupamento: governanta's submit wraps onSend in try/catch with inline error display (setErr, lines 485-497) while maid's does not (415-420) — a parameterization/uplift detail the shared component must handle deliberately, not a refutation, and the finding's risk section already prescribes a parameterized component validated app by app. Consolidation target is real.


<a id="director-realtime-refetch-storm"></a>
### Director: cada evento realtime em 5 tabelas quentes redispara o dashboard inteiro (~25 queries) sem debounce

`director-realtime-refetch-storm` · redundant-io · confiança high · recomendação **simplify** · verificação: confirmado

**Arquivos:** `src/app/director/page.tsx` · `src/app/api/director/dashboard/route.ts`

**Por que sobra:** director/page.tsx:1772-1783 assina postgres_changes com event '*' em stays, housekeeping_tasks, concierge_requests, stock_movements e stock_balances, e o handler de cada evento é `() => loadDashboard(true)` direto — sem debounce, sem coalescing e sem guard de requisição em voo (loadDashboard:1758-1767 é um fetch nu). O endpoint /api/director/dashboard roda ~25 queries por chamada (Promise.all na linha 98 com ~24 selects em stays/surveys/weddings/events/tasks, mais 3 rodadas de enriquecimento em 368-370, 400 e 448-450). Uma única baixa de estoque gera 2+ eventos (stock_movements + stock_balances por linha afetada) → 2+ execuções completas do dashboard; no rush de checkout/café da manhã isso vira dezenas de refetches por minuto por aparelho aberto. Comparar com o padrão já usado no próprio repo: maid/governanta usam listenToActiveTasks com polling de segurança reduzido a 60s justamente porque 'a tela fica ligada no bolso por horas' (housekeeping-service.ts:203-205). Fix: debounce de 2-5s coalescendo eventos + descartar disparo se já há fetch em voo. Bônus: subscribedRef (linha 1756) é escrito no subscribe (1781) e nunca lido — o teardown usa supabase.removeChannel cru (1782) em vez do safeRemoveChannel(channel, subscribed) que é a convenção do CLAUDE.md; ou usa-se o ref, ou remove-se o ref morto.

**Evidência:** Leitura de director/page.tsx:1750-1783 (handlers diretos, sem debounce; grep 'subscribedRef' → só as linhas 1756 e 1781, nunca lido). grep de selects em api/director/dashboard/route.ts → 1 await sequencial (linha 68) + Promise.all de ~24 queries (98-206) + enriquecimentos em 368-370, 400, 448-450.

**Impacto de remover:** Corta o grosso das execuções do endpoint mais pesado por chamada do sistema (~25 queries/execução) e o egress correspondente — egress é custo real aqui (free plan estourou em 25/08).

**Risco:** Debounce atrasa o dashboard em alguns segundos — irrelevante para um painel gerencial. Mudança pequena e local ao useEffect.

**Verificação (CONFIRMED):** Read director/page.tsx 1745-1795: exactly as claimed — channel at 1775 subscribes event '*' on stays/housekeeping_tasks/concierge_requests/stock_movements/stock_balances (1776-1780), each handler is a bare '() => loadDashboard(true)'; loadDashboard (1758-1767) is a naked fetch with no debounce, coalescing, or in-flight guard. grep subscribedRef → only lines 1756 (declaration) and 1781 (write), never read; teardown at 1782 is supabase.removeChannel(channel), not the safeRemoveChannel convention (minor nuance: this page uses createClientBrowserAuto(), not the shared singleton, but the dead ref stands either way). Endpoint weight verified: api/director/dashboard/route.ts has 31 select( calls — a Promise.all of ~24 queries at line 98 plus enrichment rounds at 368, 400, 441-448 — so '~25 queries' is if anything an undercount. The cited precedent is real: housekeeping-service.ts:203-206 documents cutting the field-app safety poll to 60s for exactly this cost reason. Could not find any existing debounce/guard that would refute the claim.


<a id="crm-pipeline-select-star-egress"></a>
### Funil comercial baixa até 500 orçamentos + 500 casamentos com select('*') (snapshot por noite, rooms, intake) para renderizar cartões com ~20 campos escalares

`crm-pipeline-select-star-egress` · redundant-io · confiança high · recomendação **simplify** · verificação: confirmado

**Arquivos:** `src/services/crm-service.ts`

**Por que sobra:** CrmService.getPipeline (crm-service.ts:216-230) faz `from('rate_quotes').select('*')... limit(500)` e `from('weddings').select('*')... limit(500)` a cada carga do hub comercial — e o FunnelPage refaz a carga após cada ação (fetch de /api/admin/comercial em FunnelPage.tsx:153, 172, 184). O mapper quoteToLead (crm-service.ts:38-65) usa só campos escalares + resolveQuoteValue, que precisa de snapshot/rooms/selectedCategory/finalValue/negotiatedValue (rate-engine.ts:365-393) — mas NÃO precisa de `intake` (QuoteIntake com acompanhantes/endereço, aura.ts:~3243) nem de notes, e cada elemento de snapshot carrega breakdown noite a noite (RateQuoteCategory.breakdown, aura.ts:2828) multiplicado por acomodação (rooms[i].snapshot). weddingToLead (67-87) usa ~15 escalares mas o select('*') traz siteConfig, ceremonyDetails, receptionDetails etc. Fix em duas camadas: (1) imediato — trocar os dois select('*') por listas de colunas (excluindo intake/notes em rate_quotes e os JSONs do site/detalhes em weddings); (2) estrutural — persistir o valor resolvido numa coluna (calculado no write, que já recalcula tudo server-side em saveQuote) e aí o pipeline dispensa snapshot/rooms por completo.

**Evidência:** Leitura de crm-service.ts:200-258 (getPipeline e getLeadById com select('*')); quoteToLead/weddingToLead em 38-87 enumeram os campos realmente usados; rate-engine.ts:365-393 mostra a dependência exata de resolveQuoteValue; aura.ts:3183-3260 lista as colunas pesadas de RateQuoteRecord (rooms:3230, snapshot:3232, intake:~3243); FunnelPage.tsx:153/172/184 mostram a frequência de recarga.

**Impacto de remover:** Reduz o payload da tela mais recarregada do comercial de 'todas as colunas × até 1.000 linhas' para os ~20 campos usados — corte direto de egress PostgREST (45,5% do estouro de 25/08) e de latência do funil.

**Risco:** Coluna esquecida na lista quebra o cartão silenciosamente — conferir CrmLead campo a campo; getLeadById (deep-link/drawer) pode continuar com select('*') pois é 1 linha. A camada (2) exige backfill do valor derivado.

**Verificação (CONFIRMED):** Read crm-service.ts 209-236: getPipeline does from('rate_quotes').select('*')...limit(500) and from('weddings').select('*')...limit(500) (lines 216-228). Mappers verified: quoteToLead (38-65) uses only scalars + resolveQuoteValue; weddingToLead (67-87) uses ~15 scalars. The key dependency claim is exact — resolveQuoteValue's signature at rate-engine.ts:365-368 is Pick<RateQuoteRecord,'snapshot'|'selectedCategory'|'finalValue'|'negotiatedValue'> & {rooms?} — no intake, no notes. Heavy columns exist as claimed: RateQuoteRecord.snapshot:3232 / rooms / intake (QuoteIntake:3137) in aura.ts; weddings carry siteConfig (aura.ts:1600). Reload frequency verified in FunnelPage.tsx: load:153, reload:172, fetchLeadById:185 (finding said 184 — off by one, immaterial). The finding correctly scopes layer 1 (exclude intake/notes and wedding site JSONs; snapshot/rooms must stay until layer 2's persisted value) and correctly exempts getLeadById (single row). No hidden consumer of the dropped columns found in the pipeline path — /api/admin/comercial returns only the mapped CrmLead.


<a id="listquotes-sem-caller"></a>
### RateService.listQuotes (400 × select('*')) não tem nenhum chamador vivo — só o branch 'lista tudo' da rota, que ninguém usa

`listquotes-sem-caller` · redundant-io · confiança medium · recomendação **investigate** · verificação: confirmado

**Arquivos:** `src/services/rate-service.ts` · `src/app/api/admin/tarifario/quotes/route.ts`

**Por que sobra:** rate-service.ts:836-848 define listQuotes — select('*') com limit(400) em rate_quotes (as mesmas colunas pesadas do achado do pipeline). Seu único uso é o fallback do GET /api/admin/tarifario/quotes sem parâmetros (route.ts:40). Todos os fetches em código para essa rota passam `id=` (FunnelPage:81, 257; LeadDrawer:90, 850) ou `guestId/phone` (GuestDetailPanel:72-74 — monta o qs sempre com guestId); o funil em si carrega por /api/admin/comercial (CrmService.getPipeline). Ou seja: o branch mais caro da rota é inalcançável pela UI atual. Remover o branch (ou fazê-lo responder 400 pedindo filtro) elimina um endpoint de 400 linhas gordas exposto à toa; se preferir manter por precaução, ao menos estreitar as colunas.

**Evidência:** grep -rn 'listQuotes' em src/app → apenas api/admin/tarifario/quotes/route.ts:40. grep -rn 'tarifario/quotes' em src (tsx/ts) → todos os GETs levam id/guestId/phone (FunnelPage.tsx:81,257; LeadDrawer.tsx:90,850; GuestDetailPanel.tsx:74 com qs contendo guestId sempre); os hits sem query string (FunnelPage:325, NewQuoteWizard:886,968) são POSTs de gravação. Leitura de GuestDetailPanel.tsx:68-74 confirma que guestId está sempre presente no qs.

**Impacto de remover:** -13 linhas de service + fecha um caminho de egress de até 400 linhas completas de rate_quotes por chamada; menos um branch para racionalizar na rota.

**Risco:** Algum consumidor fora do repo (script manual, aba antiga aberta) chamando o GET sem filtro — é rota admin autenticada, improvável; conferir logs da Vercel antes de remover, ou degradar para 400 em vez de deletar.

**Verificação (CONFIRMED):** Confirmed at the finding's own hedged 'investigate' level. grep listQuotes across src/, whatsapp-service/, scripts/ → defined at rate-service.ts:836 (select('*') limit(400)), sole caller api/admin/tarifario/quotes/route.ts:40 — the no-param fallback of the GET (read the route: id branch at 27, guestId/phone branch at 36, fallback at 40). Hunted for a caller that reaches the fallback: every in-repo GET carries a filter — FunnelPage.tsx:81 and 257 pass &id=, LeadDrawer.tsx:90 and 850 pass &id=, GuestDetailPanel.tsx:72 builds new URLSearchParams({ propertyId, guestId: guest.id }) so guestId is always present; FunnelPage:325 is PATCH, NewQuoteWizard:886 is POST, :968 is PATCH (read each call site). Searched public/, docs/, whatsapp-service/, scripts/ for 'tarifario/quotes' and for dynamic path construction ('tarifario/${') — nothing. Route requires requireAuth([super_admin,admin,manager,reception]), so no external/webhook consumer by design. The residual risk the finding itself names (out-of-repo script, old open tab) is why 'degrade to 400 / check Vercel logs first' is the right bar rather than blind deletion — verdict stands as written.


<a id="fb-reorder-n-updates-silenciosos"></a>
### fb-service: reordenação faz N updates sequenciais pelo client do browser com erro ignorado

`fb-reorder-n-updates-silenciosos` · redundant-io · confiança high · recomendação **simplify** · verificação: confirmado

**Arquivos:** `src/services/fb-service.ts`

**Por que sobra:** updateCategoryOrder (fb-service.ts:155-161) e updateMenuItemOrder (237-241) iteram `for (const update of updates)` fazendo um UPDATE por linha, aguardando cada um antes do próximo, sem checar `error` de nenhum (o comentário na 156-157 admite 'individual updates for simplicity'). Reordenar um cardápio de 30 itens = 30 round-trips sequenciais pelo client do BROWSER (o arquivo usa `supabase`, não supabaseAdmin — é um service legado pré-padrão chamado direto da página), e uma falha no meio deixa a ordenação meio-aplicada em silêncio — exatamente o padrão 'clico e volta' da memória supabase-silent-write-errors. Fix mínimo: um único `upsert` com o array {id, order} (onConflict id) + checagem de erro; fix alinhado à convenção: mover a operação para rota /api/admin com supabaseAdmin.

**Evidência:** Leitura de fb-service.ts:140-241: os dois loops com await por linha e sem destructuring de error; getMenuItems/deleteMenuItem no mesmo arquivo confirmam o uso do client `supabase` de browser (import no topo do arquivo, padrão do service legado F&B citado no CLAUDE.md como tabelas snake_case legadas).

**Impacto de remover:** N round-trips → 1; elimina uma classe de escrita silenciosamente perdida numa tela usada pela operação de F&B.

**Risco:** Upsert em lote com formatos mistos manda NULL nas chaves ausentes (memória postgrest-batch-insert-mixed-shapes) — enviar sempre exatamente {id, order} e nada mais... e como update parcial via upsert exige as colunas NOT NULL presentes, validar no DEV; alternativa segura é Promise.all dos updates + verificação de erro agregada.

**Verificação (CONFIRMED):** Read fb-service.ts: line 1 imports the browser client ({ supabase } from '@/lib/supabase'); updateCategoryOrder at 155-161 and updateMenuItemOrder at 237-241 both do 'for (const update of updates) { await supabase.from(...).update({ order }).eq('id', ...) }' — sequential, one round-trip per row, and neither destructures nor checks error (the 156-157 comment 'individual updates for simplicity' is verbatim). Callers verified as browser-side: src/app/admin/food-and-beverage/menu/_components/useMenu.ts:151 and :280 — a client hook, so these really are N sequential browser round-trips with silent partial failure, matching the supabase-silent-write-errors pattern. Tried to refute the fix: the upsert-with-NOT-NULL caveat is real (and matches the postgrest-batch-insert-mixed-shapes memory), but the finding itself already flags it and offers Promise.all + aggregated error check as the safe minimum, so the recommendation survives.


<a id="aura-ts-dobrou"></a>
### types/aura.ts dobrou desde o plano de refactoring (1.679 → 3.474 linhas) e o barrel continua não feito

`aura-ts-dobrou` · tech-debt · confiança high · recomendação **simplify** · verificação: confirmado

**Arquivos:** `src/types/aura.ts` · `docs/REFACTORING.md`

**Por que sobra:** Não é proposta nova — é o passo 1 do próprio docs/REFACTORING.md ('mechanical and low-risk — a good first move', linha 55-58 e 62), ainda pendente segundo o próprio doc (linha 89: 'continua um arquivo só'). O dado novo desta revisão: o arquivo cresceu 107% desde que o plano foi escrito (1.679 → 3.474 linhas medidas hoje), absorvendo os domínios tarifário/quotes (RateQuoteRecord:3183, RateQuoteCategory:2820), hsystem (~3280+) e estoque — cada módulo novo o engorda. O split em src/types/{rate,stock,fb,hsystem,...}.ts com aura.ts virando barrel (`export * from`) mantém todos os imports `@/types/aura` intactos.

**Evidência:** wc -l src/types/aura.ts = 3474 hoje vs 1679 registrado em docs/REFACTORING.md:17; REFACTORING.md:55-58 descreve o barrel, :89 confirma pendente. grep -n dos domínios recentes dentro do arquivo (RateQuoteRecord:3183, HsystemConfig ~3280, RateQuoteCategory:2820).

**Impacto de remover:** Arquivo tocado por quase todo o repo fica navegável; conflitos de merge no arquivo mais compartilhado do projeto caem; nenhum import muda.

**Risco:** Praticamente nenhum (re-export mecânico); só garantir que não há import circular criado por tipos que referenciam uns aos outros entre os novos arquivos — resolve-se agrupando por domínio como o doc já sugere.

**Verificação (CONFIRMED):** Measured wc -l src/types/aura.ts = 3474 today. docs/REFACTORING.md:17 records it at 1679 lines (table row '| 1679 | src/types/aura.ts | Central types |'), :55-58 describes the per-domain split + barrel ('Existing @/types/aura imports keep working... mechanical and low-risk — a good first move'), :62 makes it step 1 of the suggested order, and :89 confirms it is still pending ('src/types/aura.ts continua um arquivo só (barrel ainda não feito)'). Growth attribution verified by grep: RateQuoteCategory:2820, QuoteIntake:3137, RateQuoteRecord:3183 (snapshot field :3232), HsystemConfig:3273 — the tarifário/quotes and hsystem domains do live in the recent tail of the file. 3474/1679 = 2.07, so the '107% growth / dobrou' claim is arithmetically right. Nothing to refute: the recommendation is the repo's own documented, still-unexecuted step 1.


**Cobertura desta varredura:** Escopo coberto: docs/REFACTORING.md lido primeiro (findings evitam re-propor o plano; citam o que mudou desde ele). Seams detalhados para 4 alvos (governanta 2627, NewQuoteWizard 2328, rate-service 2260, check-in/form 1997); maid (2258) e director (1912) ficam cobertos pelo achado do kit duplicado de apps de campo e pelo achado do realtime do director — o data-flow do maid já está saneado (bootstrap por rotas /api/field, polling reduzido a 60s, catálogo lazy com cache), então seu split é o mesmo receituário do governanta (ReplenishSheet 392-594, TaskSheet 595-918, FaxinasScreen 1011-1357, ProfileScreen 1403+, main 1634+). Caça a I/O redundante: verifiquei getBundle/getQuoteContext (já Promise.all), listenToActiveTasks (já tunado), bundle do wizard (cacheado via FunnelPage.bundleCache), rotas /api/guest (majoritariamente colunas estreitas), loops for-of em 9 services (a maioria é sequencial por necessidade: FIFO de lotes, crons por estadia); os que sobraram como achado estão listados. Teardown de realtime: grep de .channel( × safeRemoveChannel achou 2 páginas fora da convenção (director e estoque/compras) — ambas têm cleanup funcional via removeChannel cru, então reportei só o director (onde o subscribedRef vestigial prova a intenção não concluída). Não cobri: whatsapp-service/ (container separado), páginas admin fora dos alvos, e não medi tamanhos reais de linhas de rate_quotes em produção (a análise de egress do pipeline é estrutural, por shape das colunas — não rodei queries no banco).

## Higiene do repositório

> Vereditos desta seção são da rodada 1 (29/08) — os achados não mudaram entre as rodadas.

<a id="secrets-in-tracked-dev-scripts"></a>
### Real production secrets hardcoded in git-tracked scripts/dev test files

`secrets-in-tracked-dev-scripts` · legacy · confiança high · recomendação **delete** · verificação: confirmado

**Arquivos:** `scripts/dev/test-cron.js` · `scripts/dev/test-docker.js` · `whatsapp-service/server.js`

**Por que sobra:** test-cron.js hardcodes CRON_SECRET as 'minha_senha_super_secreta_do_cron_123' and test-docker.js hardcodes the WhatsApp API key 'Fazenda@2025' (plus a personal phone number). Both files are tracked in git and not wired to any package.json script. whatsapp-service/server.js line 12 also ships 'Fazenda@2025' as the code fallback: const API_KEY = process.env.WHATSAPP_API_KEY || 'Fazenda@2025'.

**Evidência:** git -C C:\Aura-Experience ls-files aura/scripts shows both files tracked. head of scripts/dev/test-cron.js shows the literal secret; grep -q for both literals against .env.local/.env.prod.local returned MATCHES-REAL-SECRET and FAZENDA-MATCHES-ENV — i.e. the hardcoded values equal the real secrets currently in the env files. grep of whatsapp-service/server.js found the same key as fallback on line 12. package.json scripts reference only scripts/db/*.

**Impacto de remover:** Removes two committed credentials from the working tree; closes the loop on a production CRON_SECRET that is recoverable from git history by anyone with repo access.

**Risco:** Deleting the files breaks nothing (zero references anywhere). The real work is rotating CRON_SECRET in Vercel + external cron (cronjob.org) since it lives in git history, and rotating WHATSAPP_API_KEY / removing the server.js fallback IF the container is still deployed anywhere.

**Verificação (CONFIRMED):** Read all three files myself: scripts/dev/test-cron.js:2 hardcodes CRON_SECRET 'minha_senha_super_secreta_do_cron_123', scripts/dev/test-docker.js:11 hardcodes x-api-key 'Fazenda@2025' (plus phone 5551996678810 at line 14), whatsapp-service/server.js:12 has the 'Fazenda@2025' fallback. Ran quiet grep -q of both literals against local env files: MATCHES in BOTH .env.local and .env.prod.local — the committed literals equal the current production secrets. git ls-files confirms both scripts/dev files are tracked. package.json scripts wire only scripts/db/*.mjs; repo-wide grep for the filenames found zero callers (only self-references and a doc comment in promote-guest-ids.mjs). Tried to refute via package.json wiring, docs mentions, and cross-imports from scripts/db — all came back empty.


<a id="whatsapp-service-superseded"></a>
### whatsapp-service/ container is legacy — app has zero references and its webhook endpoints were removed

`whatsapp-service-superseded` · legacy · confiança high · recomendação **investigate** · verificação: confirmado

**Arquivos:** `whatsapp-service/server.js` · `whatsapp-service/Dockerfile` · `whatsapp-service/package.json` · `.wwebjs_auth` · `docs/DEPLOYMENT.md` · `docs/ARCHITECTURE.md`

**Por que sobra:** WhatsApp moved to Evolution API (EVOLUTION_API_URL read in 6 files incl. src/services/whatsapp-health-service.ts, src/app/api/cron/process-messages/route.ts). The old whatsapp-web.js container is now orphaned in both directions: (a) the app never calls it — WHATSAPP_API_URL and WHATSAPP_SERVICE_URL are read nowhere in src/; (b) the container posts to /api/webhook/whatsapp and /api/webhook/whatsapp/status (server.js lines 13, 309), routes that no longer exist — the only webhook route is src/app/api/webhook/evolution/, whose route.ts literally says 'Substitui o antigo /api/webhook/whatsapp/route.ts'. Last real commit to the dir is 2026-03-20. Yet docs/DEPLOYMENT.md section 'whatsapp-service' still claims it 'exposes an HTTP API the main app calls', and CLAUDE.md/.env.example present it as current. Root-level .wwebjs_auth/ is its empty (0 bytes) leftover session dir.

**Evidência:** grep -rn 'whatsapp-service|:3001|/api/send' src → zero hits. grep of process.env across src/scripts/server.js: WHATSAPP_API_URL and WHATSAPP_SERVICE_URL never read. ls -R src/app/api/webhook → only evolution/. grep 'webhook/whatsapp' src → single hit, the 'Substitui o antigo' comment in webhook/evolution/route.ts. git log -- aura/whatsapp-service → last commit cda759b 2026-03-20. du -sh .wwebjs_auth → 0.

**Impacto de remover:** Deletes a 3-file container dir + empty .wwebjs_auth, removes ~10 stale env-var lines from .env.example, and fixes docs (DEPLOYMENT.md, ARCHITECTURE.md, CLAUDE.md) that misdescribe the current WhatsApp architecture — the docs staleness actively misleads (they say the app calls this service; it cannot).

**Risco:** The container may still be running somewhere (old VPS/Docker host) and would keep posting to 404 endpoints; confirm it is decommissioned before deleting, and rotate its API key (see secrets finding). Deleting from the repo cannot break the Next build (separate package.json, not part of the build).

**Verificação (CONFIRMED):** Tried to refute every direction and failed. (a) App→container: grep of src for WHATSAPP_API_URL|WHATSAPP_SERVICE_URL|whatsapp-service|:3001 → zero hits; the process.env read-set across src/scripts confirms neither var is read anywhere, and WHATSAPP_API_KEY is read only inside whatsapp-service/server.js:12 itself; even /api/admin/whatsapp/session is Evolution-based (reads EVOLUTION_API_URL). (b) Container→app: server.js:13 and :309 post to /api/webhook/whatsapp[/status], but ls -R src/app/api/webhook shows only evolution/, and src/app/api/webhook/evolution/route.ts:3 says 'Substitui o antigo /api/webhook/whatsapp/route.ts'. (c) git log -1 cda759b → 2026-03-20, last commit to the dir. (d) .wwebjs_auth is an empty dir (du 0), gitignored. (e) Docs staleness verified: docs/DEPLOYMENT.md:52 still claims it 'exposes an HTTP API the main app calls' — false today. The 'investigate' recommendation (confirm the VPS container is decommissioned before deleting, rotate the key) is the right level of caution: server.js:15 defaults SERVER_URL to http://187.77.57.154:3001, the same VPS that now runs Evolution, so it may still be running there.


<a id="service-account-json-orphan"></a>
### Orphaned Google service-account private key at repo root (abandoned Firebase/FCM path)

`service-account-json-orphan` · abandoned-file · confiança high · recomendação **delete** · verificação: confirmado

**Arquivos:** `service-account.json`

**Por que sobra:** Contains a live-looking RSA private key for GCP project 'aura-exp' (dated Feb 2026). Nothing loads it: no firebase/googleapis/google-auth dependency in package.json, no code reference to service-account/service_account/GOOGLE_APPLICATION_CREDENTIALS anywhere. Push notifications are web-push/VAPID (src/lib/push-notify.ts). It pairs with the equally dead FIREBASE_* block in .env.example — leftovers of an FCM approach that was never wired up.

**Evidência:** Grep 'service-account|service_account|googleapis|google-auth' across src/ → no files. Same grep across scripts/, whatsapp-service/, docs/ → only docs/DEPLOYMENT.md, and that hit is just the secrets-hygiene line saying the file is git-ignored. grep -il firebase src → nothing. package.json has no firebase dep. git ls-files confirms it is not tracked (listed in .gitignore).

**Impacto de remover:** Removes a private key sitting unprotected on disk that grants access to a GCP project; kills the last artifact of the abandoned FCM integration.

**Risco:** None for the app (zero references). Prudent extra step: revoke this key id (96bfe85d…) in the GCP console for project aura-exp in case the file was ever copied or the project still matters.

**Verificação (CONFIRMED):** File exists at repo root (2364 bytes, Feb 14 2026), header shows project_id 'aura-exp' and private_key_id 96bfe85d179ead4f18c27a7dc772916fb2c3e14e. Refutation attempts all failed: grep -i firebase|googleapis|google-auth in package.json → no dependency; case-insensitive repo-wide grep for service-account|service_account|GOOGLE_APPLICATION_CREDENTIALS|firebase → hits only in .gitignore:32, .env.example (the dead FIREBASE block), and docs (DEPLOYMENT.md/ARCHITECTURE.md prose); grep FIREBASE across src → zero; grep firebase|messaging|gcm across public/ (incl. sw.js — FCM's usual hiding place) → only irrelevant tesseract wasm internals. git ls-files confirms untracked; git check-ignore confirms .gitignore:32 covers it. Nothing can load it; deleting the local file plus revoking the key in GCP is safe.


<a id="scripts-dev-oneoff-probes"></a>
### Six one-off debug scripts in scripts/dev, one of them byte-corrupted, none wired anywhere

`scripts-dev-oneoff-probes` · abandoned-file · confiança high · recomendação **delete** · verificação: confirmado

**Arquivos:** `scripts/dev/test-cron.js` · `scripts/dev/test-cron.ts` · `scripts/dev/test-db.ts` · `scripts/dev/test-docker.js` · `scripts/dev/test-users.ts` · `scripts/dev/test_insert.cjs`

**Por que sobra:** All are throwaway console probes (dump messages table, dump users/staff, one test insert into survey_templates, poke the old Docker container on :3001). None is referenced by package.json scripts (only scripts/db/* are) or by docs. test-db.ts is UTF-16/mojibake-encoded and cannot even be executed as-is. test-docker.js targets the superseded whatsapp-service container. Two of them embed real secrets (separate finding). scripts/dev/promote-guest-ids.mjs is the exception — a documented, dry-run-capable one-off migration with its backup trail in .backups/ — keep that one.

**Evidência:** cat package.json → scripts only map to scripts/db/*.mjs. git ls-files → all six are tracked. head -15 of each file read: test-db.ts prints as UTF-16 garbage; test-docker.js posts to http://localhost:3001/api/send (old container); test-users.ts dumps entire users/staff tables to console. grep across docs/ found no mention of any of them.

**Impacto de remover:** Deletes 6 files (~200 LoC) of stale probes, two of which leak secrets; leaves scripts/dev/ containing only the legitimately documented promote-guest-ids.mjs.

**Risco:** Effectively zero — nothing imports or documents them; they were manual `node <file>` probes against long-since-debugged issues.

**Verificação (CONFIRMED):** Read all six files in full: test-cron.js/test-cron.ts poke /api/cron/process-messages or dump pending messages; test-db.ts is genuinely UTF-16-encoded (renders as spaced mojibake, unrunnable via plain node); test-docker.js posts to the superseded container on localhost:3001; test-users.ts dumps entire users/staff tables; test_insert.cjs is a single survey_templates insert probe. Refutation attempts: package.json scripts block wires only scripts/db/*.mjs and env-switch; grep for the six filenames across the whole repo → only self-references, .gitignore comment about scripts/dev/*.mjs, and promote-guest-ids.mjs's own usage doc; grep across docs/ → zero mentions; grep scripts/db for imports from dev/ → zero. The carve-out for promote-guest-ids.mjs is correct (documented dry-run migration).


<a id="env-example-dead-vars"></a>
### .env.example documents 15 env vars no code reads (whole Firebase block + WhatsApp-service + 4 Chatwoot vars), and omits one that is read

`env-example-dead-vars` · tech-debt · confiança high · recomendação **simplify** · verificação: confirmado

**Arquivos:** `.env.example`

**Por que sobra:** Dead entries: the entire Firebase block (NEXT_PUBLIC_FIREBASE_API_KEY, _AUTH_DOMAIN, _PROJECT_ID, _STORAGE_BUCKET, _MESSAGING_SENDER_ID, _APP_ID, FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY — 9 vars, no firebase dependency exists); WHATSAPP_API_URL and WHATSAPP_SERVICE_URL (app never calls the old container); CHATWOOT_ACCOUNT_ID, CHATWOOT_INBOX_ID, CHATWOOT_API_TOKEN, NEXT_PUBLIC_CHATWOOT_URL (only CHATWOOT_URL and CHATWOOT_SSO_SECRET are read, for the SSO link). Missing entry: AURA_SAFE_MODE is read by src/lib/safe-mode.ts but documented only in docs/DEV-DATABASE.md.

**Evidência:** grep -rhoE 'process\.env\.[A-Z_0-9]+' src scripts whatsapp-service/server.js | sort -u produced the full read-set; diffed by hand against .env.example. Direct per-var greps (grep -rn FIREBASE / WHATSAPP_API_URL / WHATSAPP_SERVICE_URL / CHATWOOT_ACCOUNT_ID / CHATWOOT_INBOX_ID / CHATWOOT_API_TOKEN / NEXT_PUBLIC_CHATWOOT_URL across src, scripts, whatsapp-service/server.js) → zero hits each. BLOB_READ_WRITE_TOKEN deliberately NOT flagged — @vercel/blob reads it implicitly.

**Impacto de remover:** Prunes ~20 lines of misleading onboarding documentation; anyone provisioning a new environment today would waste time hunting Firebase credentials the app never uses.

**Risco:** None — this is documentation. Double-check Vercel project env for the same dead vars while at it (they may be set there too, cluttering the dashboard).

**Verificação (CONFIRMED):** Rebuilt the read-set myself: grep -rhoE 'process\.env\.[A-Z_0-9]+' across src, scripts, whatsapp-service, middleware, next.config → the 15 flagged vars (9 FIREBASE*, WHATSAPP_API_URL, WHATSAPP_SERVICE_URL, CHATWOOT_ACCOUNT_ID, CHATWOOT_INBOX_ID, CHATWOOT_API_TOKEN, NEXT_PUBLIC_CHATWOOT_URL) appear in NONE of them, while CHATWOOT_URL and CHATWOOT_SSO_SECRET do appear. Ruled out bracket-access/destructuring: grep for the bare var names repo-wide (excluding .env.example and docs) → zero matches. AURA_SAFE_MODE claim verified: read at src/lib/safe-mode.ts:33, mentioned in scripts/db/env-switch.mjs:56 and docs/DEV-DATABASE.md:173, absent from .env.example (read the file in full). The finding correctly does NOT flag WHATSAPP_API_KEY (read by the container at server.js:12) or BLOB_READ_WRITE_TOKEN (implicit @vercel/blob). Pure documentation change, zero runtime risk.


<a id="public-dead-assets"></a>
### public/Logo.png (3.1 MB) plus Next.js boilerplate SVGs are tracked but referenced nowhere

`public-dead-assets` · dead-code · confiança high · recomendação **delete** · verificação: **rebaixado**

**Arquivos:** `public/Logo.png` · `public/next.svg` · `public/vercel.svg`

**Por que sobra:** Logo.png is a 3,132,320-byte image with zero references — every logo usage in the app resolves to /logo_flat.png or /logo_transp.PNG. next.svg and vercel.svg are create-next-app leftovers. All three are git-tracked and shipped with every deploy.

**Evidência:** grep -rn 'Logo.png|next\.svg|vercel\.svg' across src/, whatsapp-service/, docs/, public/ (manifest.json, sw.js), README.md → zero hits for all three (grep for asset names showed only camaleao.png in not-found.tsx, logo_transp.PNG in login/changelog/aura pages, logo_flat.png in Sidebar/AssetQr/NotificationCenter, mapa-ilustrado-demo.jpg in _mocks, notification.mp3 in 4 files, /tesseract in PlateScanner — all alive). manifest.json references only /icons/icon-192.png and /icons/icon-512.png. git ls-files aura/public confirms all three tracked.

**Impacto de remover:** ~3.1 MB off the repo and every Vercel deployment; removes ambiguity about which logo file is canonical.

**Risco:** Logo.png could in theory be hot-linked externally (e-mail signature, WhatsApp template) — grep found nothing in-repo, but a quick check of any external template using aaura.app.br/Logo.png before deleting is cheap insurance. The two SVGs are risk-free.

**Verificação (DOWNGRADED):** Verified the greps myself: repo-wide 'Logo\.png|next\.svg|vercel\.svg' → zero hits; case-insensitive 'logo\.png|logo_flat|logo_transp' → only logo_flat.png (Sidebar.tsx:672, NotificationCenter.tsx:87, AssetQr.tsx:25) and logo_transp.PNG (login, changelog, /aura pages); manifest/sw covered by the repo-wide grep. All three files are git-tracked. The refutation attempt that partially landed: grep for logoUrl revealed the DB-stored, free-text-editable property logo fields — a reference store no grep can clear, so the unconditional 'delete' for the 3.1 MB Logo.png is one cheap DB query short of safe.

**Claim corrigido:** Delete public/next.svg and public/vercel.svg now (zero references, create-next-app leftovers). For public/Logo.png, the in-repo evidence holds (zero content references even case-insensitively — every live logo use is /logo_flat.png or /logo_transp.PNG), BUT the reviewer missed a dynamic reference path: properties.logoUrl and settings.logoFullUrl are free-text DB fields editable at src/app/admin/configuracoes/marca/page.tsx:85-86 and :107, consumed by rate-quote-public-service.ts:515, wedding-site-service.ts:155, asset-public-service.ts:59 and PhonePreview — a production row could literally hold '/Logo.png' or 'https://aaura.app.br/Logo.png'. Run one SQL check (select id, "logoUrl", settings->>'logoFullUrl' from properties) before deleting Logo.png; if clean, delete.


<a id="root-scratch-json"></a>
### Root-level scratch files b.json, body.json, root.json are saved API error responses

`root-scratch-json` · abandoned-file · confiança high · recomendação **delete** · verificação: confirmado

**Arquivos:** `b.json` · `body.json` · `root.json`

**Por que sobra:** All three (dated 25/08) contain single Supabase/PostgREST error payloads from a debugging session: an RLS violation on 'leads', a PGRST205 'table insumos not found', and a 'Secret API key required' message. No secrets inside — only error bodies. Untracked, referenced by nothing.

**Evidência:** Read all three files in full (118, 163, 98 bytes). git status shows them untracked; the .gitignore scratch patterns (tmp_*, *_errors.txt, …) do not cover *.json at root, which is why they linger visibly.

**Impacto de remover:** Removes git-status noise at repo root; optionally extend the .gitignore scratch block so future curl dumps don't reappear.

**Risco:** None — pure debug residue with no sensitive content.

**Verificação (CONFIRMED):** Read all three files in full: b.json (118 B, RLS 42501 violation on 'leads'), body.json (163 B, PGRST205 'public.insumos' not found), root.json (98 B, 'Secret API key required') — pure API error payloads, no secrets. ls -la confirms all dated Aug 25; git status snapshot lists them as untracked (??). Refutation attempts: grep repo-wide for body.json|root.json|@b.json (curl -d @file style usage) → zero matches; git check-ignore on all three → not covered; .gitignore scratch patterns are only *_errors.txt and tmp_*.txt (lines 43-44), which is why they linger. Zero-risk deletion.


<a id="concierge-deprecated-no-callers"></a>
### ConciergeService.getConciergeItemsForMaid is @deprecated with zero callers

`concierge-deprecated-no-callers` · dead-code · confiança high · recomendação **delete** · verificação: confirmado

**Arquivos:** `src/services/concierge-service.ts`

**Por que sobra:** Line 139 marks it '@deprecated … o catálogo agora é RestockService.getCatalog … Sem chamadores vivos' and the grep confirms the self-diagnosis: the only occurrence of the identifier in the entire src/ tree is its own definition at line 140.

**Evidência:** Grep 'getConciergeItemsForMaid' across src/ → exactly one hit: src\services\concierge-service.ts:140 (the definition). The deprecation comment itself documents the replacement (RestockService.getCatalog with maidRequestable).

**Impacto de remover:** Deletes ~15 LoC and removes a trap: the method queries concierge_items for the maid flow that was deliberately moved to the stock module in jun/2026 — a future caller would resurrect retired behavior.

**Risco:** None found in-repo. Mobile apps go through /api/field/* routes, and none of those reference it either (the src-wide grep covers them).

**Verificação (CONFIRMED):** Repo-wide grep (not just src/) for getConciergeItemsForMaid → exactly one hit: the definition at src/services/concierge-service.ts:140. String-keyed/bracket access would still contain the identifier string, so the grep covers dynamic dispatch too. Read lines 125-160: the @deprecated comment at :139 names the replacement (RestockService.getCatalog with maidRequestable) and self-declares 'Sem chamadores vivos', consistent with the jun/2026 move of maid restock out of Concierge. Field apps route through /api/field/* which live under src/ and are covered by the grep. ~11 LoC, safe delete.


<a id="root-xlsx-working-files"></a>
### Two tariff-work spreadsheets parked in the repo root, uncovered by .gitignore

`root-xlsx-working-files` · abandoned-file · confiança high · recomendação **consolidate** · verificação: confirmado

**Arquivos:** `Ajustes Tarifários 2027 - WORK IN PROGRESS.xlsx` · `Tarifario 2027-2028 - proposta Claude.xlsx`

**Por que sobra:** Business working documents (2027 tariff adjustments), not code — untracked, but the .gitignore scratch section has no *.xlsx pattern so they pollute git status permanently and risk an accidental `git add -A` commit of business-sensitive pricing data.

**Evidência:** ls -la of repo root shows both (42 KB and 14 KB, dated 24/08); git status lists both as untracked; grep of .gitignore shows no xlsx/office pattern.

**Impacto de remover:** Cleaner git status; removes the accidental-commit risk for pricing spreadsheets. These are active work files (WIP per filename) — move them next to the pitch files in C:\Aura-Experience\ (the git root already holds untracked .pptx there anyway) or add *.xlsx to the scratch block of .gitignore.

**Risco:** Do NOT delete — they are the user's live tariff work. Only relocate or gitignore.

**Verificação (CONFIRMED):** ls -la at repo root confirms both files ('Ajustes Tarifários 2027 - WORK IN PROGRESS.xlsx' 42,377 B and 'Tarifario 2027-2028 - proposta Claude.xlsx' 13,707 B, dated Aug 24); the git status snapshot lists both as untracked. grep of .gitignore for xlsx|office patterns → none exist, so they will pollute git status indefinitely and are exposed to a careless 'git add -A'. The recommendation is correctly non-destructive (relocate to C:\Aura-Experience\ beside the untracked .pptx pitch files, or add *.xlsx to the .gitignore scratch block — do NOT delete; per the tarifario-2027-pendencias context this is the user's live tariff work).


**Cobertura desta varredura:** Scanned: repo root inventory (incl. dotfiles), public/ with asset-name greps across src+manifest+sw.js+docs+whatsapp-service, scripts/ vs package.json wiring, src/app/aura/_mocks (all 4 mock files ARE imported by src/app/aura/page.tsx — alive), whatsapp-service/ (3 files, read server.js key parts), .env.example vs the full process.env read-set, TODO/FIXME sweep, deprecated/legacy markers. Verified-alive things deliberately not reported: public/tesseract (12 MB, used offline by porter PlateScanner), mapa-ilustrado-demo.jpg, notification.mp3, camaleao.png, icons/, .well-known/assetlinks.json, scripts/db/* (all wired), env:qual (means 'which profile', not an environment), .env.local.bak / .env.*.local (produced by env-switch, gitignored by design), backups/ and .backups/ (gitignored, by design — one oddly named dir 'backups/2026-08-24_2010-prod-espelho;B' looks like a shell-quoting accident, trivial), tsconfig.tsbuildinfo (gitignored build artifact), migrations/*.sql (historical record; the untracked migrations/push_subscriptions.sql is PENDING work for the open push_subscriptions production issue — should be committed, not deleted). TODO/FIXME health is good: only 16 files with hits, nearly all single-line — no clusters worth reporting. Not covered: exhaustive scan for commented-out code blocks >10 lines (the per-file awk pass timed out on Windows after 2 min; the grep-based spot checks found nothing notable), deep docs/ audit beyond the whatsapp-service staleness, and I did not read .env.local contents — secret checks were done with boolean grep -q only. Cross-finding thread worth stating: the whatsapp-service legacy finding, the Firebase env block, service-account.json, and two of the scripts/dev files are all debris from the same two abandoned integrations (whatsapp-web.js container → Evolution API; FCM → web-push/VAPID) — one cleanup PR can retire both stories coherently, plus rotate CRON_SECRET and WHATSAPP_API_KEY which are both recoverable from git history.

## Extras da re-varredura de 30/08 (sem verificação)

<a id="evolution-status-webhook-writeonly"></a>
### /api/webhook/evolution/status — inbound webhook that writes messages.statusApi, which nothing reads

`evolution-status-webhook-writeonly` · redundant-io · confiança medium · recomendação **investigate** · verificação: ⚠️ sem verificação (rodada 1)

**Arquivos:** `src/app/api/webhook/evolution/status/route.ts` · `src/types/aura.ts`

**Por que sobra:** Not "uncalled" — it is an inbound webhook (Evolution MESSAGES_UPDATE, apikey-gated), so per the webhook guardrail its caller is external. But its entire effect is writing messages.statusApi (delivery/read ticks), and statusApi is read NOWHERE: the only references in the repo are the route's own writes and the optional type field at src/types/aura.ts:928. The chat UI that would render ticks was replaced by the Chatwoot iframe in the very commit that added this route (fe74fb9) — Chatwoot tracks message status itself. Each receipt for ~370 msgs/day costs a function invocation, up to 2 lookups and 1 update for a column no code consumes.

**Evidência:** Ran: grep -rF "/api/webhook/evolution/status" src whatsapp-service scripts docs public vercel.json → 0 (not even docs); grep -rn "statusApi" src whatsapp-service scripts → only the route (writes) + aura.ts:928 (type). Read the route in full: handles only messages.update/MESSAGES_UPDATE; read src/app/api/webhook/evolution/route.ts: main webhook handles only messages.upsert/send.message, so this is not a duplicate — it is a separate event feed. git log --follow → single commit fe74fb9 "migrate WhatsApp to Evolution API + Chatwoot iframe"; src/app/admin/comunicacao/page.tsx:75 is a bare Chatwoot iframe.

**Impacto de remover:** Removing the route + disabling the MESSAGES_UPDATE webhook on the Evolution instance cuts a steady stream of pointless invocations and DB writes (2 reads + 1 write per receipt, several hundred/day) plus the statusApi dead column/type field.

**Risco:** Evolution instance config is outside the repo: confirm on the VPS (Coolify) whether MESSAGES_UPDATE is enabled and pointed here before deleting — if the event stays enabled after the route is gone, Evolution will get 404s (harmless but noisy). Also confirm no planned feature needs delivery ticks in AURA (Chatwoot currently owns that UI).


<a id="field-post-wrappers"></a>
### governanta and maid apps bypass postFieldAction with hand-rolled POSTs (governanta's lack keepalive/timeout)

`field-post-wrappers` · duplicate-logic · confiança high · recomendação **consolidate** · verificação: ⚠️ sem verificação (rodada 1)

**Arquivos:** `src/lib/field-api.ts` · `src/app/governanta/page.tsx` · `src/app/maid/page.tsx`

**Por que sobra:** postFieldAction (field-api.ts) is the hardened canonical write path for field apps — keepalive (survives phone lock), AbortController timeout (no stuck spinner), structured {ok,error}. Both files already import it (maid/page.tsx:14 uses it at :705; governanta/page.tsx:8), yet: governanta/page.tsx has 4 raw `fetch('/api/field/housekeeping-tasks', {method:'POST',…})` blocks at lines 987 (create), 1705 (confirm), 1724 (reject), 1745 (assign) with NO keepalive and NO timeout — the exact failure modes field-api.ts's header says it exists to prevent; and maid/page.tsx:1685-1696 keeps its own older `postAction` wrapper (keepalive but no timeout, throw-based errors) alongside the import.

**Evidência:** Read field-api.ts in full; grep `fetch\(["'`]/api/field/` → POST sites only in governanta (987/1705/1724/1745) and maid (1686); read governanta 980-1010 and 1700-1758 confirming no keepalive/signal in any of the 4; read maid 1685-1696; grep `from "@/lib/field-api"` → 10 files already migrated (houseman, maintenance, maintenance-ops, porter, MinibarSheet, MaintenanceReportSheet, guest-service, etc.), leaving only these two stragglers.

**Impacto de remover:** 5 write blocks consolidated; governanta's conference/assign/reject/create gain phone-lock survival and stuck-spinner protection for free — this is operational hardening, not just LoC (the incident history in memory is precisely about field writes dying on lock).

**Risco:** maid's postAction throws error CODES that the caller maps to translated toasts — when migrating, read `res.error` from postFieldAction's result and rethrow/map, preserving the code strings. Test on a real phone flow per producao-limites rules; governanta swap is behavior-add only.


<a id="cron-secret-guard-15-copies"></a>
### CRON_SECRET auth guard pasted into 15 cron routes in two divergent dialects

`cron-secret-guard-15-copies` · duplicate-logic · confiança high · recomendação **consolidate** · verificação: ⚠️ sem verificação (rodada 1)

**Arquivos:** `src/app/api/cron/daily-automations/route.ts` · `src/app/api/cron/breakfast-attendance/route.ts` · `src/app/api/cron/daily-lodging/route.ts` · `src/app/api/cron/evening-revalidation/route.ts` · `src/app/api/cron/asset-depreciation/route.ts` · `src/app/api/cron/daily-housekeeping/route.ts` · `src/app/api/cron/housekeeping-routines/route.ts` · `src/app/api/cron/process-messages/route.ts` · `src/app/api/cron/wedding-status/route.ts` · `src/app/api/cron/crm-status/route.ts` · `src/app/api/cron/hsystem-sync/route.ts` · `src/app/api/cron/stock-expiry/route.ts` · `src/app/api/cron/maintenance/route.ts` · `src/app/api/cron/whatsapp-watchdog/route.ts` · `src/lib/api-auth.ts`

**Por que sobra:** Every cron route hand-writes the same bearer check, but in two dialects that drifted: dialect A `if (NODE_ENV === 'production' && authHeader !== Bearer …)` (enforces ONLY in production — daily-automations:32, breakfast-attendance:30, evening-revalidation:30, daily-housekeeping:31, process-messages:36, whatsapp-watchdog:19) vs dialect B `if (authHeader !== Bearer … && NODE_ENV !== 'development')` (enforces everywhere except development — daily-lodging:24, asset-depreciation:22, housekeeping-routines:27, wedding-status:19, crm-status:17, hsystem-sync:25, stock-expiry:22, maintenance:103). An auth check is the one snippet that should not have 15 slightly different copies — a future fix (e.g. timing-safe compare, or requiring the secret to be non-empty) must find all 15.

**Evidência:** Grep `CRON_SECRET` over src → 15 route guards listed with line numbers above (plus docs mentions); read the two condition shapes verbatim in the grep output.

**Impacto de remover:** A 6-line `requireCronSecret(req)` in src/lib/api-auth.ts (returning the 401 response or null, matching the existing requireAuth/isAuthError style) replaces 15 copies (~60 LoC) and forces one deliberate answer to the current A/B divergence.

**Risco:** The dialects behave identically on Vercel (prod/preview run NODE_ENV=production, local dev runs development) — only NODE_ENV=test differs. Pick dialect B (stricter) as the unified rule; changing dialect-A routes to it does not affect deployed behavior. All 15 routes are live (some via external cron per docs/CRON.md) — pure refactor, no route deletion.


<a id="rate-service-bundle-vs-ratedata"></a>
### RateService.getBundle re-inlines everything getRateData does (5 queries + settings-defaults merge)

`rate-service-bundle-vs-ratedata` · duplicate-logic · confiança high · recomendação **consolidate** · verificação: ⚠️ sem verificação (rodada 1)

**Arquivos:** `src/services/rate-service.ts`

**Por que sobra:** getBundle (rate-service.ts:254-304) and getRateData (:848-877) both run the identical Promise.all over rate_tables/rate_periods/rate_settings/cabin_categories/rate_fluctuations with identical ordering, the identical DEFAULT_RATE_SETTINGS + fluctuations/discounts/promos/categoryLinks defaults merge, and the identical `fluctRes.error ? null : data` migration-pending signal. getBundle only adds channels + weddings. The settings-defaults merge is the dangerous copy: a new default added to one loader but not the other silently forks quote math between the admin bundle and the server-side quote/wedding-site paths (getRateData feeds saveQuote, wedding-site-service, marketing settings).

**Evidência:** Read rate-service.ts:253-304 and :848-877 side by side — the 5 shared queries and the settings spread are token-identical apart from getBundle's two extra Promise.all entries. Grep `getRateData` → 6 call sites (rate-service internal ×2, wedding-site-service ×3, api/admin/marketing/settings) confirming both loaders are live.

**Impacto de remover:** getBundle becomes `const data = await this.getRateData(propertyId)` plus the channels/weddings queries — ~25 duplicated lines deleted and, more importantly, the rate-settings default merge becomes single-source for every consumer of the tarifário.

**Risco:** getBundle currently runs all 7 queries in one Promise.all; composing adds one sequential hop (getRateData then channels/weddings, or Promise.all the extras alongside it) — trivial latency, or keep a shared private loader both call. Verify quote totals unchanged with pnpm build + one admin quote smoke test.


<a id="guest-today-sequential-roundtrips"></a>
### /api/guest/today runs 6 sequential DB round trips where 3 waves suffice (guest portal home, hit on every portal open)

`guest-today-sequential-roundtrips` · redundant-io · confiança high · recomendação **simplify** · verificação: ⚠️ sem verificação (rodada 1)

**Arquivos:** `src/app/api/guest/today/route.ts`

**Por que sobra:** After the ownership check (stays, line 47 — must stay first), the route awaits serially: properties.settings (58), fb_orders (65), structure_bookings (79), structures names (85), events (94), concierge count (106). Dependencies are only: fb_orders needs property.settings (to know breakfast modality) and structures needs bookings ids. So wave 2 = Promise.all(property, bookings, events, conciergeCount) and wave 3 = Promise.all(fb_orders?, structures?) — 6 round trips become 3. On serverless + remote Postgres each round trip is real latency on the portal's first paint.

**Evidência:** Read src/app/api/guest/today/route.ts lines 30-129 in full; confirmed each await is a separate `await supabaseAdmin...` statement with no Promise.all, and traced the two genuine data dependencies (fb at line 59-64 gates the fb_orders query; bookings ids feed the structures query at 84-85).

**Impacto de remover:** Roughly halves the route's DB-bound latency (6 RTs → 3) on the most-opened guest screen ('Sua jornada hoje'); no schema or payload change.

**Risco:** Keep the stay ownership check strictly before anything else (it authorizes the request). If fb_orders is moved into wave 2 unconditionally it adds a tiny read for non-delivery properties — keep it in wave 3 behind the settings check to avoid that.


<a id="save-quote-sequential-awaits"></a>
### RateService.saveQuote awaits getRateData, getChannels and getQuoteById sequentially — three independent reads on every quote save/copy/send

`save-quote-sequential-awaits` · redundant-io · confiança high · recomendação **simplify** · verificação: ⚠️ sem verificação (rodada 1)

**Arquivos:** `src/services/rate-service.ts`

**Por que sobra:** saveQuote awaits this.getRateData(propertyId) at line 919 (itself 5 parallel queries — fine), then CrmService.getChannels(propertyId) at 1054, then this.getQuoteById(propertyId, payload.id) at 1058. None depends on another's result (channels validate `source`, existing feeds the optimistic-lock check; both use only the payload). Wrapping the three in one Promise.all removes 2 round trips from the hottest write path of the comercial module — saveQuote runs on every save, on 'Copiar' (which auto-saves), and via updateQuote-adjacent flows.

**Evidência:** Read src/services/rate-service.ts lines 894-1070 in full (awaits at 919, 1054, 1058 with no data dependency between them); read getRateData (849-877, already Promise.all of 5) and getQuoteById (879-885). Verified CrmService.getChannels takes only propertyId.

**Impacto de remover:** 2 fewer serial DB round trips per quote save; also applies to the copy/send path in NewQuoteWizard which calls save before markSent.

**Risco:** None functional — all three are reads executed before any write; QuoteConflictError logic (1063-1066) is unchanged since `existing` is still resolved before the insert/update.


<a id="archive-quotes-per-row-inserts"></a>
### archiveExpiredQuotes inserts crm_interactions one row at a time in a loop instead of one batch insert

`archive-quotes-per-row-inserts` · redundant-io · confiança high · recomendação **simplify** · verificação: ⚠️ sem verificação (rodada 1)

**Arquivos:** `src/services/rate-service.ts` · `src/services/crm-service.ts`

**Por que sobra:** rate-service.ts lines 2068-2072: `for (const r of rows) { await CrmService.logInteraction(...) }` — each call is a single-row insert into crm_interactions (crm-service.ts:110-133). The quotes themselves are already updated with one batched `.in('id', ...)` at 2063-2066, so the pattern is proven right next door. When a season block lapses (the exact scenario this cron exists for — 'Data da estadia passou'), dozens of quotes expire the same morning → dozens of sequential inserts. A `CrmService.logInteractions(rows[])` batch insert makes it one.

**Evidência:** Read rate-service.ts 2053-2096 and crm-service.ts logInteraction 110-133 (single-row insert, error swallowed). The cron caller is crm-status (vercel.json 08:45 daily per docs/CRON.md).

**Impacto de remover:** N sequential inserts → 1 per archive reason (2 total); bounds the cron's runtime on mass-expiry days.

**Risco:** logInteraction currently swallows per-row errors; a batch should keep that semantics (log-and-continue) so an interactions failure never blocks the archiving itself — it already ran before the loop.


<a id="maid-checklist-browser-io"></a>
### Maid checklist path still does 3 sequential reads + 2 direct browser Supabase writes — the exact cold-lock hazard the rest of the app was migrated off

`maid-checklist-browser-io` · redundant-io · confiança high · recomendação **consolidate** · verificação: ⚠️ sem verificação (rodada 1)

**Arquivos:** `src/app/maid/page.tsx`

**Por que sobra:** TaskSheet.loadChecklist (lines 625-669) awaits HousekeepingService.getChecklistTemplates (browser client, select('*') on checklists — housekeeping-service.ts:119), then supabase.from('cabins').select('housekeepingItems') at 641, then supabase.from('stays').select('housekeepingItems') at 648 — three independent reads run serially — and then WRITES the assembled checklist via browser client at 659. handleToggle (2014) also writes housekeeping_tasks directly from the browser per checkbox tap. This contradicts the project rule 'field mutations go through /api/field/* — never direct browser Supabase writes (they hang on the cold lock)' stated in CLAUDE.md, and the file itself acknowledges it 12 lines below (line 676 comment: 'Catálogo via rota field (leitura pelo browser trava no lock frio)'). One field-route action ('ensure-checklist', and 'toggle-item') would make it 1 round trip server-side (server can parallelize the 3 reads) and remove the hang class from the two remaining browser writes in this app. ProfileScreen also calls StaffService.getStaffByProperty (1460) — browser select('*') on staff to render an avatar strip.

**Evidência:** Read maid/page.tsx 595-720 and 2005-2027; ran `grep -n 'supabase\.' src/app/maid/page.tsx` → only hits are 641, 648, 659, 2014 (checklist path); read housekeeping-service.ts:118-121 (getChecklistTemplates uses browser `supabase`) and staff-service.ts:31-43 (select('*') on staff). CLAUDE.md 'Mobile / field-staff apps' section states the field-api rule.

**Impacto de remover:** 3 serial reads+1 write → 1 POST /api/field/housekeeping-tasks per first-open of a task; eliminates the last direct-write hang candidates in the maid app (the memory's 'radar de pendentes' can drop maid entirely); staff select('*') → select('id, fullName, role, active, profilePictureUrl') trims a needless wide read.

**Risco:** handleToggle is optimistic with rollback — the field-route version must keep last-write-wins semantics on the checklist JSON (single assigned maid writes it, so no real contention). The checklist write at 659 doubles as persistence for the default checklist; the route action must replicate the 'only when empty' guard.


<a id="governanta-cabin-history-select-star"></a>
### Governanta cabin-history taps fetch 40 full housekeeping_tasks rows (checklist JSON included) via browser client to render 9 columns

`governanta-cabin-history-select-star` · redundant-io · confiança high · recomendação **simplify** · verificação: ⚠️ sem verificação (rodada 1)

**Arquivos:** `src/app/governanta/page.tsx`

**Por que sobra:** openCabinHistory (lines 1558-1576) runs `supabase.from('housekeeping_tasks').select('*')...limit(40)` on the browser client. The history sheet (2296-2345) renders only id, type, customLocation, status, assignedTo, createdAt, startedAt, finishedAt, observations — but each row ships its full `checklist` JSON array (the column that made the old all-tasks route 779 kB per the comment in housekeeping-service.ts:140). It is also a browser-client read in a field app, the same class the page's own bootstrap comment (1610-1623) documents as hanging on cold lock; here it fails silently to an empty history. Fix: explicit column list, and serve it from /api/field/housekeeping-tasks (a `history=cabinId` mode) like every other read in this page.

**Evidência:** Read governanta/page.tsx 1558-1576 (the query) and 2296-2345 (the rendering — enumerated the fields actually referenced); read housekeeping-service.ts 136-141 for the measured weight of full task rows; grep confirmed this is the page's only remaining browser .from() read besides the intentional warm-up ping at 1616.

**Impacto de remover:** Per tap on any cabin card: 40 wide rows with checklist arrays → 40 narrow rows (~an order of magnitude less egress on a repeated daily gesture), plus removes a silent-empty failure mode on cold sessions.

**Risco:** None — read-only display; keep the limit(40) and ordering.


<a id="daily-automations-wide-scan"></a>
### daily-automations cron scans ALL active/pending stays of every property with select('*') and then does per-stay guest/cabin/messages queries

`daily-automations-wide-scan` · redundant-io · confiança medium · recomendação **simplify** · verificação: ⚠️ sem verificação (rodada 1)

**Arquivos:** `src/app/api/cron/daily-automations/route.ts`

**Por que sobra:** Lines 52-88: properties select('*'), then per property automation_rules select('*'), message_templates select('*'), and stays select('*') for every pending/pre_checkin_done/active stay — full rows (stays carry counts, areaConfigs, bedAssignments, pets, folio-adjacent JSON) when the trigger decision needs only id, guestId, cabinId, status, checkIn, checkOut, automationFlags. Inside the stay loop, each firing stay costs 3-4 more round trips: messages dedup check 127-133, guests select('*') 141, cabins select('*') 149, flags update 192. The wide stays scan is the daily egress cost (every stay, every day); the N+1 part only fires for triggering stays (few/day) — so the cheap win is a two-phase read: narrow-column scan to decide, full fetch only for the stays that fire (guest/cabin select('*') there is defensible because queueMessage expands template placeholders from those objects).

**Evidência:** Read src/app/api/cron/daily-automations/route.ts lines 40-199 in full; confirmed the trigger decision (103-123) touches only the narrow columns and that guest/cabin/full-stay data is consumed only inside `if (triggerToFire)` via AutomationService.queueMessage(…guest, cabin, stay…).

**Impacto de remover:** Daily cron egress on the stays table drops to a fraction (narrow columns × all stays + full rows × ~handful); rules/templates select('*') are small tables, leave them.

**Risco:** queueMessage's placeholder expansion needs the FULL stay row — the two-phase approach must re-fetch the complete stay for firing stays, not pass the narrow one. Verify template placeholders (guest/cabin/stay fields) before narrowing anything they read.


<a id="dead-getstaysbystatus-n1"></a>
### StayService.getStaysByStatus has zero callers — dead code carrying a textbook N+1 (2 queries per stay)

`dead-getstaysbystatus-n1` · dead-code · confiança high · recomendação **delete** · verificação: ⚠️ sem verificação (rodada 1)

**Arquivos:** `src/services/stay-service.ts`

**Por que sobra:** stay-service.ts:480-509 fetches stays select('*') then, per stay, a guests query and a cabins query inside Promise.all(map) — 1+2N round trips. No call site exists anywhere: not in src, not in whatsapp-service/, not in scripts/. If anything ever revives it, it should be rewritten with two batched `.in()` lookups anyway — today it is just an attractive nuisance for the next copy-paste.

**Evidência:** Ran `grep -rn 'getStaysByStatus' src whatsapp-service scripts --include='*.ts' --include='*.tsx'` → only the definition in stay-service.ts. Read the method body 480-509. (Its sibling getGroupStays IS used — src/app/api/guest/precheckin/route.ts:55 — and was left out of this finding.)

**Impacto de remover:** ~30 lines deleted; removes the only N+1-patterned read in StayService from the copy-paste surface.

**Risco:** None found — verify with pnpm build after removal (a type-only reference would surface there).


<a id="evolution-api-key-tracked-claude-settings"></a>
### Git-tracked .claude/settings.local.json leaks the CURRENT production Evolution API key

`evolution-api-key-tracked-claude-settings` · tech-debt · confiança high · recomendação **delete** · verificação: ⚠️ sem verificação (rodada 1)

**Arquivos:** `.claude/settings.local.json`

**Por que sobra:** settings.local.json is per-machine Claude Code permission state and should never be committed. This one is tracked in git and one of its Bash allowlist entries embeds a full curl command with the real Evolution API key: 'curl -s "https://api.aaura.app.br/instance/fetchInstances" -H "apikey: BFu4X3ANkFlkIVeoLQsal9ulmx01C393"'. That endpoint is public and that key matches the live EVOLUTION_API_KEY.

**Evidência:** git ls-files (from git root C:\Aura-Experience) shows aura/.claude/settings.local.json tracked; git check-ignore on it returns rc=1 (not ignored); git log shows it committed across multiple commits (f5d3e1c, 7952039, 2faf376). Read the file: the apikey value appears verbatim in a permissions.allow entry. Grepped the key string against .env.local, .env.prod.local and .env.dev.local — ALL THREE match, variable name EVOLUTION_API_KEY (values not echoed). This finding is NOT in docs/CLEANUP.md (grep 'settings.local|BFu4X3|apikey' docs/CLEANUP.md → zero hits) — it is new versus the 29/08 review.

**Impacto de remover:** Closes an active credential exposure: anyone with repo access can send WhatsApp messages as the hotel and manage the Evolution instance at https://api.aaura.app.br. Also stops per-machine permission churn from landing in git.

**Risco:** Rotating the key breaks the app until EVOLUTION_API_KEY is updated in Vercel + all local .env files (same key is used in prod, dev and local). Removing the file from the index (git rm --cached + .gitignore entry) does not purge git history — rotation is the real fix. Only Arthur can rotate (Evolution/Coolify console).


---

_Gerado das rodadas de 29-30/08/2026 da revisão multi-agente. Saída bruta (JSON) preservada fora
do repositório; para reproduzir, rodar a mesma varredura._
