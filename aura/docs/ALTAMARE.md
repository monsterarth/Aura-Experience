# Integração Altamare — plano e contrato

> Status: **em negociação técnica (rodada 2 enviada)**. Atualizado em 25/08/2026.
>
> A troca acontece **entre os dois Claudes** (nosso e o do Maicon), mediada por
> Arthur e Maicon — cada mensagem é revisada pelos dois antes de ir. Regras da
> troca: nada de credenciais; modelos, nunca código-fonte.
>
> Decisões já fechadas pelos humanos: **o AURA expõe a API e o parceiro consome**
> (para agenda/pipeline) · o AURA é fonte da verdade de **data e espaço** ·
> **preço de negociação não cruza; consumo do cliente cruza com valor** · a
> pousada **não toca em pagamento do restaurante** · **o Allan passa a operar SÓ
> no AURA** (CONFIRMADO pelo Arthur na rodada 2; a tela de locação deles será
> aposentada) · ordem cardápio-primeiro ACEITA · relação tratada como mesmo
> grupo, com o compartilhamento declarado na política de privacidade ·
> **avaliações REABERTAS** (entram por push, decisão da rodada 2).

## O problema (e como ele cresceu)

Um casamento no Altamare é uma festa vendida em duas partes: o **espaço** (Allan,
funil no AURA) e a **gastronomia** (restaurante, sistema próprio em produção com
oito pessoas operando). A proposta original deles — Allan dentro da plataforma do
restaurante — dobraria o funil dele; a integração resolve com cada equipe na sua
ferramenta.

Na rodada 1 o escopo cresceu: além de agenda + pipeline, entra o **cardápio
vivo** (o PDV SuiteTable é a verdade; o sistema do Altamare distribui; o portal
do hóspede exibe) e, por último e com cuidado, a **pessoa do ecossistema**.

## Verdade por superfície

A regra é uma só — a verdade fica com quem executa:

| superfície | verdade | consequência |
|---|---|---|
| data e espaço da propriedade | **AURA** | eles consultam `/availability` antes de vender |
| pipeline do espaço | **AURA** (Allan) | `etapa_espaco` deles vira espelho read-only |
| pipeline da gastronomia | **Altamare** | nós só exibimos o estágio no card |
| evento gastronômico (sunset, luau) | **Altamare** | eles criam; nós recebemos e exibimos |
| **cardápio e carta** | **Altamare** (origem: PDV SuiteTable) | o portal **renderiza o JSON deles** — nunca cópia editável |
| hóspede / estadia | **AURA** | eles recebem o mínimo operacional |
| a pessoa do ecossistema | nenhum sozinho | opt-in do hóspede; última fase |

## Identidade — a correção que a rodada 1 forçou

**`guests.id` É o documento (CPF normalizado)** — `src/lib/guest-doc.ts`. Ele
JAMAIS cruza a fronteira. Para o parceiro existe o **`guestRef`**: uuid opaco por
hóspede, numa tabela de mapeamento nossa (`partner_guest_refs`). Eles pediram
explicitamente para **não** receber CPF — alinhado.

Telefone no contrato: **E.164** (`+5548...`). Nosso banco guarda dígitos com DDI
(maioria), com legado inconsistente — a normalização é nossa (`src/lib/phone.ts`
já tem `splitPhone`/`joinPhone`; falta só o `+`). Casamento por telefone é
**sugestão de vínculo, nunca fusão automática**.

## O contrato (v0.2)

### Lado A — API do AURA (`/api/partner/*`, eles consomem)

Auth `Authorization: Bearer <token>`; **um token = uma empresa** (Altamare e
Maram são tenants distintos lá).

| Método | Rota | Para quê |
|---|---|---|
| `GET` | `/availability?from&to` | por dia: bloqueios (casamento `confirmed` + exclusividade) e **opções** (`tentative`, não bloqueia, com contagem) — fecha a fresta do "confirmado ≠ assinado" dos dois lados |
| `GET` | `/events?from&to` · `POST /events` · `PATCH /events/{id}` | agenda: eles criam/atualizam os eventos deles; `externalRef` (id deles) idempotente — repetir = atualizar |
| `GET` | `/weddings?from&to` · `GET /weddings/{id}` | pipeline do espaço + **leitura de reconciliação** (por nosso id ou `?externalRef=`) — é o que protege o "verde da cerimônia" deles de webhook perdido |
| `POST` | `/weddings/{id}/gastronomy-stage` | eles informam o estágio da gastronomia (vira `partnerStage` no card) |
| `POST` | `/leads` | **dia 1** — lead de espaço (site do Maram) nasce no funil com `source='site-maram'` + alarme na Fila + push por cargo |
| `GET` | `/guests/today` | hóspedes ativos por `guestRef`: nome, cabana, período, aniversário (MM-DD, sem ano), restrições quando houver |
| `POST` | `/consumption` | consumo do hóspede (com valor) → CRM |
| `POST` | `/cache/menu-invalidate` | ping deles para invalidarmos o cache do cardápio antes do TTL |

Regras: `Idempotency-Key` em toda escrita · recursos carregam `version`
(updatedAt); `If-Match` opcional → `409 version_conflict` · **cada lado só edita
o que criou** (evento do parceiro é read-only na UI do AURA) · rate limit **60
req/min por token** (`429` + `Retry-After`) · erros `{error:{code,message,details?}}`
· `409 date_conflict` em `POST /events` sobre data bloqueada, com o bloqueio
descrito (tipo + período, **sem valores**).

### Lado B — cardápio (endpoint deles, nós consumimos)

Portal → **proxy server-side nosso** (`/api/guest/restaurant-menu`) → endpoint
deles, com cache ~10 min + `If-None-Match`/ETag + fallback de idioma para PT.
**Sem tabela, sem cópia editável** — pedido explícito deles, aceito: o problema
de origem é exatamente "existe uma segunda versão do cardápio". Payload traz
`sincronizado_em` (viagem do PDV) e flags `exibir_preco` (decisão do Maicon) e
`disponivel_hoje` (PDV + toggle humano do maître). Cardápio velho **exibe mesmo
assim** (com aviso discreto se >24h); nunca esconder.

### Webhooks (AURA → eles)

`wedding.created` · `wedding.updated` (com bloco `previous` — data/hora/espaço
antigos) · `wedding.stage_changed` (com `from/to` e `cause: manual|cron` — os
crons de 08:30/08:45 mudam status sozinhos) · `wedding.cancelled` ·
`handoff.gastronomy` (a passagem do Allan) · `lead.created`?

Assinatura **HMAC-SHA256**: `X-Aura-Signature: t=<unix>,v1=<hex>` sobre
`t + "." + body`, com **secret dedicado** (≠ token). Timeout 10s. Retries
exponenciais (1m, 5m, 30m, 2h, 12h) → dead-letter + varredura diária. Entrega
**at-least-once** → eles deduplicam por `deliveryId`. Secret trocado **fora
desta conversa** (canal direto Arthur↔Maicon).

## A saída do Allan — obrigações de dia 1

Três funções deles quebram quando a tela de locação sair. Viram entregas nossas
**antes** da virada:

1. **`POST /leads`** — o formulário do site do Maram passa a criar a negociação
   aqui, com `source='site-maram'` (slug registrado em `settings.crmChannels` —
   a procedência que o Maicon quer medir). Notificação: alarme CRM
   (`CrmService.createAlarm`) + `fanOutByRole` push. Hoje a criação de casamento
   **não notifica ninguém** — isso muda junto.
2. **Handoff** — ação "Encaminhar para gastronomia" no card do casamento →
   webhook `handoff.gastronomy`. Caminho inverso (casal chega pela comida) =
   mesmo `POST /leads` com `source='altamare'`.
3. **Reconciliação** — `GET /weddings/{id}` sob demanda, porque o "verde da
   cerimônia" na página do casal deles passa a depender do nosso webhook.

**Critério de virada (proposta):** a tela deles só desliga com as três entregas
no ar + ~7 dias de paralelo sem perda de lead. Data: decisão Arthur+Maicon.

**Nuance do funil:** nosso kanban de casamento tem **5 estados**
(`tentative/confirmed/completed/cancelled/lost` — `shared.ts:62`), sem o grão
fino deles (8 no espaço, 14 na gastronomia). O espelho deles mapeia:
`tentative` cobre lead→negociação; **`confirmed` ≈ `assinado`**; nossa trava de
data é uma só. `tentative` **não segura data** (N casais disputando é venda
normal) — igual ao modelo deles.

## Eventos deles dentro do AURA

- **Público** → `events` com `status='published'` → portal (Explore + agenda do
  dia) e admin. **Fechado/bloqueio** → `status='published'` +
  **`visibility='internal'`** (valor novo): aparece no calendário admin, nunca
  para o hóspede. Hoje `visibility` é campo morto (nunca filtrado) — ativá-lo
  exige o filtro `.neq('visibility','internal')` nas 3 leituras públicas
  (`api/guest/events`, `api/guest/today`, `getPublishedEvents`).
- **Sanitização deles, aceita:** evento fechado atravessa como `"Evento privado"`
  — sem nome de casal, sem valor. `casal` é nome de pessoa real.
- **`reserva` nunca cruza** (centenas/temporada); **sem recorrência** no
  contrato (cada data = uma linha = um id); eventos fora da propriedade não vêm.
- **`category`: as categorias base são exigência do contrato** (decisão de
  26/08 — antes era de-para nosso). Publicamos os valores na doc da API e eles
  mandam a nossa `category`; o `tipo_evento` deles continua deles. Fora do
  padrão, tentamos normalizar; o que não normaliza vira `other` preservando o
  rótulo original. **Pelo critério de `docs/EVENTS-V2.md`,
  `imageUrl`/`externalUrl`/`locationUrl` exigem allowlist de host** antes de o
  parceiro escrevê-los — viram `src`/`href` na tela do hóspede.
- **A vitrine é nossa; a agenda é compartilhada.** O parceiro escreve na agenda
  **interna** (o que inclui os eventos que ele quer divulgar) e **não escreve
  `status='published'`** — publicar no portal do hóspede é ato editorial do
  AURA. Isso tira do contrato toda a discussão de "evento não revisado chegando
  ao hóspede", e abre a mesma porta para outros estabelecimentos da região
  sugerirem evento no futuro (a fila de curadoria não nasce exclusiva do
  Altamare). Ver a seção "A vitrine é nossa" em `docs/EVENTS-V2.md`.
- **Meia-noite/multi-dia:** regra deles aceita — `endDate = startDate+1` quando
  `hora_fim < hora_inicio`. E um débito nosso descoberto na varredura: o portal
  testa **só `startDate`** (`/api/guest/events` `.gte`, `/today` `.eq`) — evento
  multi-dia some no meio. Corrigir na fase em que os eventos deles entram.
- **Espaço:** não temos entidade de venue (`Event.location` é texto livre).
  Contrato define vocabulário canônico: `space: maram|mayan|null` +
  `resource: lounge|bistro|mesa|beira_mar|null`; guardamos composto no
  `location` no dia 1. Nossa `exclusivity` é **binária e bloqueia a propriedade
  inteira** (as duas casas) — se um dia existir buy-out só do Mayan, é evolução.
- **Conflito:** hoje o AURA **não valida** sobreposição de eventos/casamentos em
  lugar nenhum — a rota do parceiro nasce com a checagem (409) usando a mesma
  consulta do `getQuoteContext`.
- **Imagem:** portal usa `<img>` (qualquer host); recomendação 16:9 ≥1200px,
  centro seguro (também vira thumb 46px). Adicionar o domínio deles ao
  `next.config` (`remotePatterns`) pelas superfícies com `next/image`.
- **Lotes de ingresso:** aceitamos `lotes[]` no payload desde o dia 1 (guardamos
  raw); a UI renderiza a string composta (`priceDescription`) até evoluir.
- **`cateringBy`** (quem faz a comida): campo novo no casamento, editável pelos
  dois (eles via API quando ganham/perdem; Allan na UI), auditado.

## Infra nossa — correções e decisões

- **Token de parceiro NÃO vai no cofre `property_secrets`** (correção deste
  plano): lá é 1 linha por propriedade, texto puro, e o `db:mirror` **zera** o
  cofre no DEV. Nasce `partners` + `partner_tokens`: **hash SHA-256** do token +
  prefixo visível, `scopes[]`, `revokedAt`, `lastUsedAt`, `webhookUrl`,
  `webhookSecret` — RLS sem policy + REVOKE (mesmo regime do cofre).
- **Fila de webhooks de saída** nos moldes do worker real (`process-messages`):
  claim → `processing` → recovery por timeout → `attempts` → `failed`; adaptações:
  backoff exponencial e **safe-mode** (fora de produção, só entrega para URL de
  sandbox — o espelho do DEV não pode disparar webhook no endpoint de produção
  deles). Atenção: `message-queue-service.ts` é código morto — o molde é o cron.
- **Cron externo** para a varredura (a branch DEV não roda cron da Vercel; mesmo
  caminho do `hsystem-sync`).
- **Rate limit por token**: `login_attempts` não serve (por IP, só falhas) —
  contador próprio por token (janela deslizante).
- **AuditService**: aceita ator não-staff (`userId:'partner:altamare'`), mas as
  uniões `action`/`entity` são fechadas — estender com `PARTNER_*`.
- **Sandbox**: ambiente DEV completo (deploy da branch DEV + Supabase espelho +
  propriedade de teste) com token de sandbox próprio. Caveats: projeto free
  hiberna após ~7 dias parado; crons por trigger externo.
- **⚠️ Egress Supabase: ~4,3 GB dos 5 GB/mês já consumidos ANTES da integração.**
  Rate limit e payload mínimo não são teoria; o upgrade para o Supabase Pro
  (US$25/mês) provavelmente vira pré-requisito do go-live. Decisão do Arthur.

## Ordem do programa (aceita, com um ajuste)

Aceitamos a ordem deles — cardápio primeiro (sem PII, só leitura, dor semanal) —
com o ajuste de que a **fundação da nossa API** (partners/tokens/auth/rate
limit) corre em paralelo desde já, porque a fatia 2 (leads) tem prazo imposto
pela saída do Allan:

| # | fatia | dono |
|---|---|---|
| 0 | cardápio sai do código deles e vira tabela sincronizada do PDV | deles |
| F | fundação da API de parceiro (tabelas, auth, rate limit, sandbox) | nosso, paralelo a 0 |
| **E** | **Eventos v2 — `docs/EVENTS-V2.md` (fatias 1–5): higiene, rota admin, RLS real, multi-dia e as 6 colunas do contrato** | **nosso, pré-requisito da fatia 5** |
| 1 | portal renderiza o cardápio (proxy + cache + ETag) | os dois |
| 2 | `POST /leads` + alarme + push (**prazo: virada do Allan**) | os dois |
| 3 | handoff gastronomia (webhook, ida e volta) | os dois |
| 4 | espelho do funil do espaço + `GET /weddings/{id}` | os dois |
| 5 | eventos deles → agenda AURA + portal (visibility internal, endDate fix) | os dois |
| 6 | fila de webhooks + reenvio + varredura | nosso |
| 7 | nossos casamentos → `ocupacoes` deles | os dois |
| 8 | `guestRef`, opt-in, `/guests/today`, `/consumption` | os dois |
| 9 | consumo item a item (exige comanda nominal no PDV) | fase própria |

## Dados que pedimos por push (rodada 2 — "máximo de dado, custo zero")

Ingress é grátis; tudo que eles EMPURRAM entra de graça no nosso banco. Além do
consumo/visita já previsto: **compromissos do casamento** (degustação marcada,
reunião feita — linha do tempo no card do Allan), **backfill one-shot dos 26
casamentos históricos** (`gastronomia_de` + estágio atual — o funil nasce
completo), **perfil gastronômico do casal** (o quiz deles, junto do estágio) e
**avaliações pós-evento**. Regra de tom fixada pelo Arthur: a mensagem ao
parceiro NÃO expõe débitos internos nossos — ajuste interno é nosso, contrato é
o que se negocia.

## Terreno firme antes do contrato

Antes de o parceiro escrever na nossa tabela `events`, sete fatias de conserto
saem do forno — plano completo em **`docs/EVENTS-V2.md`**, com o veredito de uma
crítica adversarial que cortou ~70% do desenho inicial. O essencial:

- **`type='internal'` em 8 dos 13 eventos de produção** é valor fora do enum, e
  os mapas de ícone/label não têm fallback: categoria desconhecida derruba a
  lista inteira. Higiene primeiro.
- **RLS de `events` tem uma policy `USING(true)`** que anula o escopo por
  propriedade. Com terceiro escrevendo, isso fecha antes de qualquer token.
- **Multi-dia quebrado em 5 call sites** — o evento em curso do parceiro
  simplesmente não apareceria para o hóspede.
- **6 colunas** no contrato físico: `source`, `externalRef` (unique parcial →
  idempotência), `space`, `resource`, `blocksProperty`, `parentEventId`.
- **Filtro que faltava:** evento do parceiro só entra em `getQuoteContext`
  (cotação de tarifa e site dos noivos) se `blocksProperty=true` — senão um
  sunset do restaurante vira restrição de venda da pousada.

O que **não** vamos absorver do modelo deles, por decisão: tabela de lotes
(vira JSONB se vier payload real), view de ocupação (bypassa RLS), galeria (eles
não entregam foto — bucket privado com consentimento), vitrine com slug (não
temos página pública de evento) e inventário por recurso (não vendemos lounge).

## Pendências dos humanos

| pendência | de quem |
|---|---|
| Data da virada do Allan (Q21) | Arthur + Maicon |
| Preço do cardápio aparece no app? (Q24) | Maicon |
| Upgrade Supabase Pro antes do go-live (egress 4,3/5 GB) | Arthur |
| Confirmar plano da Vercel (evidência: não é Hobby — 10 crons variados) | Arthur |
| Troca do webhook secret por canal direto (nunca pela conversa dos Claudes) | Arthur + Maicon |
| Cascata espaço×gastronomia (a rodada 1 deles CONCORDA com a nossa proposta implícita: perder espaço não mata a ficha deles — gastronomia pode vender para quem alugou outro lugar; formalizar) | Arthur + Allan + Maicon |

## Riscos (atualizados)

- **Time pequeno + banco único do lado deles** (preview aponta para produção):
  todo teste bidirecional passa pelo NOSSO sandbox. Sem exceção.
- **Webhook perdido = cerimônia "pendente" na página do casal deles.** Por isso
  reconciliação não é redundância, é requisito (já aconteceu a versão local
  desse bug lá).
- **Push quebrado em produção**: `push_subscriptions` não existe no banco de
  produção (pendência aberta de 24/08) — o alarme CRM cobre o dia 1 do lead;
  resolver a tabela antes de prometer push.
- **Dado sensível** no `/guests/today` (restrição alimentar = saúde): escopo
  próprio no token, política atualizada — e transparência: o campo de alergias
  existe e é **pouco preenchido** hoje; vai quando houver.
- Sem preço de negociação cruzando, relatório financeiro conjunto continua
  manual — custo consciente.
