# Eventos v2 — consertar o módulo antes de abrir a API

> Status: **plano aprovado, não iniciado**. Escrito em 26/08/2026.
>
> Motivo: a integração com o Altamare (`docs/ALTAMARE.md`) vai fazer um sistema
> de terceiro **escrever** na nossa tabela `events`. O dono do produto decidiu
> consertar o terreno antes de assinar o contrato — e absorver do modelo deles
> o que fizer sentido.
>
> Este plano é o resultado de um desenho em três frentes (schema, blast radius,
> UI) seguido de uma **crítica adversarial** que cortou ~70% do que foi
> proposto. O que sobrou está aqui.

## O que os dados dizem (sondado em produção, 26/08)

| Fato | Número | Consequência |
|---|---|---|
| Eventos em produção | **13** (5 published · 5 draft · 3 cancelled) | não há acervo a proteger: migração é trivial |
| `type='internal'` | **8 de 13** | valor que **não existe** no enum TS (`local\|external\|private`) — bomba armada |
| `type='external'` | **0** | é o DEFAULT do banco e ninguém usa |
| `visibility` | 13/13 `all_guests` | campo **nunca filtrado** em lugar nenhum |
| Constraints | só a PK | nenhum CHECK, nenhuma FK |
| Índices | só a PK | falta `(propertyId, startDate)` |
| Realtime | **está na publicação** | o canal do admin funciona (ao contrário do que se supôs) |
| RLS | **3 policies** | `property_scoped_all` existe, mas `Staff can manage events USING(true)` a anula (policies são OR) |
| Casamentos | 53, **48 com exclusividade** | bloqueio é a norma, não a exceção |

## O princípio de corte

O modelo do Altamare resolve **venda de ingresso e produção de casa de eventos**.
O nosso resolve **informar o hóspede e não vender a mesma data duas vezes**.

Absorvemos o **vocabulário** deles (para o contrato fechar sem tradutor) e
recusamos a **mecânica** onde ela pressupõe uma operação que não temos. Teste
para cada campo: *existe uma tela ou uma query do AURA que lê isso?* Se não
existe e não vem no contrato, fica fora.

Contagem que decidiu o plano: as propostas iniciais somavam **27 colunas + 1
tabela + 1 view + 8 índices** para uma tabela de 13 linhas. O contrato precisa
de **6 colunas**.

## As 7 fatias — antes do contrato

Cada uma sobe num deploy próprio (regra do repo: uma mudança estrutural por vez).

### 1 · Higiene (a única fatia que REDUZ o blast radius)

- Backfill `type='internal' → 'local'` (8 linhas) e default do banco
  `'external' → 'local'`.
- **Fallbacks** em `TYPE_TONE`, `TYPE_LABELS`, `CATEGORY_ICONS`
  (`EventCard.tsx:13`, `eventos-utils.ts`): hoje uma categoria desconhecida
  renderiza `<undefined size={32}/>` e **derruba a lista inteira**. Com o
  parceiro escrevendo, categoria nova é questão de tempo.
- **Deletar** `privateEventId` (0 linhas, 0 leituras — órfão declarado em
  `aura.ts:1431`), `StaffMobileHub.tsx` (sem importadores) e a página legada
  `check-in/[code]/events/page.tsx` (duplica o Explore do portal).

### 2 · `/api/admin/eventos` — tirar o service do browser

`event-service.ts` usa o client do navegador e `useEventos.ts` o chama direto,
contra o padrão do repo. A rota nova traz três coisas que são **pré-requisito
físico** do resto: `supabaseAdmin`, **whitelist de colunas na escrita** (hoje
`handleSave` manda `{...event}` inteiro) e normalização `"" → null`.

### 3 · RLS de verdade

Dropar `Staff can manage events USING(true)`, que anula por OR a
`property_scoped_all` já existente. Com o parceiro escrevendo na tabela,
`USING(true)` é contrato assinado sobre chão de terra. Realtime já está na
publicação e **respeita RLS** — ganha isolamento de graça.

### 4 · Multi-dia (bug de hóspede, hoje)

Helper único `spansDay(d)` / `overlaps(from,to)` aplicado nos **5** call sites:
`api/guest/events:40` (`.gte` — evento em curso some da lista),
`api/guest/today:91` (`.eq` — some nos dias do meio),
`eventos-utils:53` (calendário só marca primeiro e último dia),
`event-service:39`, `director/dashboard:166`.
Junto: **validar o formato de `from`** (`^\d{4}-\d{2}-\d{2}$`) — hoje ele é
interpolado cru num `.or()`, o que permite reescrever o filtro do PostgREST e
puxar rascunho.

### 5 · Migration única — exatamente 6 colunas

| Coluna | De onde vem | Para quê |
|---|---|---|
| `source` | contrato | `aura` \| `altamare` — quem criou |
| `externalRef` | contrato | id do parceiro; unique parcial → idempotência |
| `space` | vocabulário deles | `maram` \| `mayan` \| null |
| `resource` | vocabulário deles | `lounge` \| `bistro` \| `mesa` \| `beira_mar` \| null |
| `blocksProperty` | regra deles (exclusividade) | a linha bloqueia a data |
| `parentEventId` | `evento_pai_id` deles | welcome party é filha do casamento |

Mais: índice `(propertyId, startDate)` e CHECKs de `type`/`status`/`visibility`/
`category`. **Ordem obrigatória dentro do arquivo**: backfill → constraints (o
runner roda tudo numa transação; CHECK antes do backfill aborta o arquivo
inteiro). E a migration entra **um deploy antes** do código que usa as colunas —
`PUBLIC_COLUMNS` em `api/guest/events` é string concatenada à mão: coluna citada
antes de existir derruba a rota e o portal fica sem eventos.

### 6 · Conflito de data — como aviso, não como trava

`EventService.getConflicts()` reusando o padrão de `rate-service.ts:741-767`
(dois queries em `Promise.all`), exposto na rota e exibido como **aviso âmbar**
no dialog, registrado em auditoria. Nada de `409` na cara da recepção: um bloqueio
num módulo que hoje não valida nada vira workaround pior.

**E o filtro que ninguém tinha visto:** no minuto em que eventos do parceiro
entrarem como `published`, eles passam a aparecer em
`RateService.getQuoteContext` (`rate-service.ts:750-756`) e a **contaminar
cotação de tarifa e o site dos noivos**. Só `blocksProperty=true` pode entrar no
contexto comercial — senão um sunset do restaurante vira restrição de venda da
pousada.

### 7 · Flag + os 4 pontos do contrato

`hasEventos` em `property-settings.ts` (regra de `MODULARIZATION.md`), e no
documento com o Altamare: **fuso e convenção de data** (locais, sem offset;
`endTime < startTime` = dia seguinte), **tombstone de cancelamento** (parceiro
apaga evento → não pode sobrar fantasma bloqueando data), **autenticação e rate
limit** da rota, e **idioma** dos textos que chegam.

## Cortado — e por quê

| Proposto | Por que não |
|---|---|
| Tabela `event_tiers` (lotes) | Um único escritor e substituição do array inteiro é atômica. Tabela compra FK, RLS, unique, upsert e órfãos — o padrão que já destruiu dados aqui. Se vier lote real: coluna `ticketTiers JSONB`. |
| View `event_occupancy` | View nasce sem `security_invoker`: **bypassa a RLS** de events e weddings, entra no PostgREST com grants default e o `label` concatenaria nome de casal — o dado que juramos não cruzar. |
| `slug` + `visibility='public'` | Sustentam uma página `/eventos/[slug]` que não existe. Coluna morta no dia 1 — o pecado exato do `visibility` que estamos consertando. |
| Galeria de imagens | Não é débito nem requisito: **o parceiro não entrega foto** (bucket privado com consentimento). Trabalho e egress novos para 13 eventos. |
| `endDateEff` gerada | Coluna `GENERATED` faz `setForm({...event})` quebrar todo update com `428C9`, escondido pelo catch genérico. Só depois da whitelist da fatia 2 — e só se 13 linhas virarem 1300. |
| `overnight` boolean | Derivável de `endTime < startTime`. Booleano mantido à mão pode mentir. |
| `paymentFormat`, `ticketSaleChannel`, `expectedAudience`, `conceito` | A própria proposta de UI recusou construir tela para eles. Coluna sem tela e sem query é o débito nascendo de novo. |
| `createdBy`/`createdByName` | `AuditService` já grava autor; nome denormalizado envelhece. |
| `partnerPayload` na tabela quente | `getEvents` faz `select('*')` sem filtro de data e o admin refaz a lista a cada ação — blob na linha quente com o egress no limite. Vai para tabela fria. |
| Categoria `sunset` | É `nightlife` com pôr do sol. Cada valor de enum é ícone + label + CHECK + filtro para sempre. Mapeia no adaptador. |
| Dialog com 4 abas | Formulário usado ~13 vezes por ano por recepcionista. Uma coluna + "Mais opções" colapsado. |

## Depois, se doer

`holdOnly` com hachura no calendário · `ticketTiers JSONB` quando vier payload
real · `weddingId`/evento-filho quando existir o primeiro welcome party ·
tagline/includes/lineup quando o card parecer pobre · refetch em
`visibilitychange` no portal · casamentos no `/admin/calendario` (débito antigo,
não bloqueia contrato) · `finished` só sobrevive se ganhar cron ou virar
derivado de data.

## Ordem contra a integração

| Fatia | Libera |
|---|---|
| 1, 2, 3 | qualquer escrita externa segura na tabela |
| 4 | evento multi-dia do parceiro aparecer certo no portal |
| 5 | `POST /partner/events` ter onde gravar (`externalRef`, `space`, `blocksProperty`) |
| 6 | `GET /availability` e o 409 de data conflitante |
| 7 | assinar o contrato sem buraco de fuso, cancelamento ou auth |

**As fatias 1–5 são pré-requisito da fase "eventos do parceiro" do
`docs/ALTAMARE.md`.** A fase do cardápio (primeira no acordo) **não depende**
de nenhuma delas — pode correr em paralelo.
