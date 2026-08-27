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

> ✅ **Feito em 26/08** (menos as três exclusões, que ficaram em aberto — ver o
> fim desta seção). Migration `migrations/events_type_hygiene.sql`, aplicada no
> DEV.

- Backfill `type='internal' → 'local'` (8 linhas) e default do banco
  `'external' → 'local'`.
- **Fallbacks** em `TYPE_TONE`, `TYPE_LABELS`, `CATEGORY_ICONS`
  (`EventCard.tsx:13`, `eventos-utils.ts`): hoje uma categoria desconhecida
  renderiza `<undefined size={32}/>` e **derruba a lista inteira**. Com o
  parceiro escrevendo, categoria nova é questão de tempo.
- **Deletar** `privateEventId` (0 linhas, 0 leituras — órfão declarado em
  `aura.ts:1431`), `StaffMobileHub.tsx` (sem importadores) e a página legada
  `check-in/[code]/events/page.tsx` (duplica o Explore do portal).

> ⏸ **As três exclusões estão EM ABERTO, de propósito.** Apagar é a única parte
> irreversível desta fatia, e uma delas mudou de status no meio do caminho:
>
> - **`privateEventId` não deve mais ser apagada.** O guard positivo desenhado
>   depois (seção "O filtro que falta") usa `privateEventId IS NULL` como a
>   trava que impede evento vinculado a casamento de aparecer na proposta de um
>   terceiro. A coluna passou de órfã a peça do desenho — **manter**.
> - `StaffMobileHub.tsx` continua sem importadores (o grep só acha o próprio
>   arquivo). Exclusão segura, mas é código de tela: decisão do dono.
> - A página legada `check-in/[code]/events/page.tsx` está órfã na navegação —
>   as chaves `events`/`eventsSub` sobraram na tradução da home do portal sem
>   nenhum uso. Mas a rota continua respondendo por URL direta, então quem tem
>   link antigo ainda chega nela. Foi **corrigida** junto do multi-dia em vez de
>   apagada; apagar é decisão à parte.

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

> ✅ **Feito em 26/08.** Helper em `src/lib/event-dates.ts`. Foram **7** call
> sites, não 5 — dois só apareceram lendo o código: o filtro "Hoje"/"Esta
> semana" da página legada do portal e o `isToday` do Explore (portal 2.0),
> ambos client-side, ambos perguntando pela data de INÍCIO. E de quebra o `from`
> enviado à API era calculado em **UTC** (`toISOString()`): das 21h à meia-noite
> em Brasília o portal já pedia "amanhã", e o evento daquela noite sumia da aba
> "Hoje" enquanto acontecia. Agora há `localIso()`/`todayIso()` no mesmo helper.

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
`category`. As **4 colunas do aviso** (`quoteNotice` + os três textos) NÃO entram
aqui — são migration própria, depois, e dependem desta (ver "Fatias — reordenadas"). **Ordem obrigatória dentro do arquivo**: backfill → constraints (o
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
cotação de tarifa e o site dos noivos**.

> ⚠️ **Correção (26/08):** a primeira versão deste plano dizia "só
> `blocksProperty=true` entra em `getQuoteContext`". **Está errado** — aplicado
> assim, apagaria justamente o aviso de luau/sunset ao cliente, que é o
> requisito da seção "Aviso de evento na cotação". O erro de fundo é
> `getQuoteContext` devolver **uma** lista servindo a dois propósitos. Corrigir
> para duas: `blockingEvents` (blocksProperty=true → restrição de venda, só
> admin) e `noticeEvents` (quoteNotice != none → comunicação, admin + cliente).
> Um evento pode estar nas duas.

### 7 · Flag + os 4 pontos do contrato

`hasEventos` em `property-settings.ts` (regra de `MODULARIZATION.md`), e no
documento com o Altamare: **fuso e convenção de data** (locais, sem offset;
`endTime < startTime` = dia seguinte), **tombstone de cancelamento** (parceiro
apaga evento → não pode sobrar fantasma bloqueando data), **autenticação e rate
limit** da rota, e **idioma** dos textos que chegam.

## Categorias: vocabulário comum com o parceiro

Nossa `category` e o `tipo_evento` deles são **eixos diferentes**, e confundi-los seria o primeiro
erro do contrato:

- **`category` (nosso)** = o *assunto* do evento, na linguagem do hóspede — é o que vira ícone e
  filtro no portal.
- **`tipo_evento` (deles)** = o *tipo comercial/operacional* — casamento, pacote extra, produção da
  casa, reserva — é o que decide por qual funil a ficha passa lá dentro.

Um "luau de lua cheia" é `producao_casa` para eles e `entertainment` para nós, e as duas
classificações estão certas. Então: **cada lado mantém o seu eixo**, o contrato transporta a nossa
`category` (que é a que o hóspede lê) e o tipo deles fica com eles.

### A lista, revisada para servir aos dois

A lista atual foi escrita pensando só na pousada. Duas adições cobrem o que o restaurante mais
produz e hoje não tem casa boa:

| categoria | quando usar |
|---|---|
| `entertainment` | shows, luau, atrações em geral |
| `music` | **nova** — música ao vivo (o caso mais comum do restaurante; hoje cairia em `nightlife`, que dá a leitura errada de "balada") |
| `gastronomy` | jantar harmonizado, festival gastronômico, degustação |
| `wellness` | **nova** — yoga, meditação, retiro, sunset de bem-estar (hoje não tem onde cair) |
| `nightlife` | festa noturna de fato |
| `sports` · `culture` | esporte, arte, exposição |
| `corporate` · `wedding` · `birthday` | eventos privados |
| `other` | **o pouso seguro** — não encaixou, cai aqui |

### A regra do `other` (dupla proteção)

1. **No contrato:** categoria que não estiver na lista é gravada como `other`, **preservando o
   rótulo original do parceiro** num campo de origem — não perdemos a informação, e o portal nunca
   fica sem ícone.
2. **No código:** todo mapa de ícone/rótulo/tom ganha fallback. Hoje `CATEGORY_ICONS[category]`
   devolve `undefined` para valor desconhecido e o React quebra a tela inteira ao tentar renderizar
   — é a fatia 1 deste plano, e vale independentemente do parceiro.

A lista completa, com o significado de cada valor, entra na documentação da API que o parceiro
recebe — junto dos valores de `status` e do vocabulário de espaço.

### Quem preenche a categoria: eles — e por que isso não fere a regra do aviso

Decisão (26/08): **o parceiro escolhe a NOSSA `category`** ao publicar o evento,
em vez de nós derivarmos do `tipo_evento` dele. O contrato de campos não muda —
muda o dono do mapeamento, que passa a ser quem conhece o evento. Um de-para
nosso seria palpite sobre a intenção deles, atualizado tarde e sempre por último.

Isso parece bater de frente com a regra do aviso ("o parceiro não escreve o que o
cliente lê"). Não bate — e o critério que separa os dois casos é **mecânico**,
checável numa rota, não filosófico:

| teste | pergunta | `category` | texto do aviso |
|---|---|---|---|
| **chave × cópia** | o valor é validado contra allowlist fechada e a tela renderiza um rótulo NOSSO (`CATEGORY_LABELS[v]`), ou é interpolado verbatim? | **chave** — pior caso é classificação errada | **cópia** — sai impresso |
| **informativa × probatória** | a superfície tem aceite gravado no servidor e trava de aceite? | **informativa** — portal, revogável | **probatória** — proposta, com `acceptedAt` |

`category` passa nos dois. E passa com folga, porque hoje ela **nem chega ao
hóspede**: a coluna sai em `PUBLIC_COLUMNS` (`api/guest/events/route.ts:19-22`),
mas nenhuma tela do portal a lê — card, badge e tom são todos por `type`
(`check-in/[code]/events/page.tsx:449-460`, `_portal/ExploreScreen.tsx:53-71`) e a
agenda do dia nem seleciona a coluna. `category` só é lida em tela de staff, e não
muda comportamento nenhum: o filtro por categoria existe no service e **não tem
chamador** (`event-service.ts`, `useEventos.ts:38`). Deixar o parceiro escrever
custa, no pior caso, um ícone errado no admin.

**A consequência honesta do critério — que a versão anterior deste plano
escondia:** o que sai impresso na comunicação comercial hoje é o `{NOME_EVENTO}`,
e `{NOME_EVENTO}` **é `events.title`** (`rate-engine.ts:619-632`), que o parceiro
escreve via `POST/PATCH /events`. A frase "o parceiro nunca escreve o que o
cliente lê" era **falsa como estava escrita**. A regra defensável é mais estreita
e está corrigida na seção do aviso.

**Dois campos reprovam nos dois testes e ninguém tinha olhado:** `externalUrl` e
`locationUrl` viram `<a target="_blank">` na tela do hóspede
(`events/page.tsx:394-424`, `_portal/sheets.tsx:386-393`) e `imageUrl` vira
`<img>` de qualquer host. Escritos pelo parceiro, isso é link arbitrário e beacon
de IP na tela do hóspede — risco acima de tudo que a discussão de categoria
levantou. **Allowlist de host obrigatória antes de o parceiro escrever qualquer um
dos três.**

**Pré-requisito que falta para qualquer um desses guards:** a linha não sabe quem
a escreveu. `Event` não tem `source` nem `externalRef` (`aura.ts:1406-1434`) — são
plano (fatia 5), não código. Enquanto `source` não existir, todo guard é "confie na
rota" — e a rota não é o único escritor (ver fatias do aviso, abaixo). Por isso a
**fatia 5 é pré-requisito das colunas do aviso**, não paralela a elas.

## Aviso de evento na cotação (`quoteNotice`)

Requisito do dono do produto: *"evento que altere o andamento da pousada (música
alta, movimento no estacionamento) deve ser informado no ato da reserva — e na
tela em que o hóspede aceita a cotação"*.

### Correção de premissa: o aviso NÃO está quebrado

O pipeline `getQuoteContext` → `buildEventNotices` → `{AVISO_EVENTO}` →
clipboard está **íntegro** (`rate-engine.ts:446,580,619-632`). O template padrão
já existe, já é configurável por propriedade em três idiomas
(`/admin/configuracoes/comercial`) e o tom **já é convidativo**:

> 🍹 Durante sua estadia teremos um evento especial: *{NOME_EVENTO}* em
> {DATA_EVENTO}. Aproveite!

O que existe de errado são **dois vazamentos** que explicam a percepção de
"quebrou":

1. **`LeadDrawer.tsx:1024-1036` copia só a URL** da proposta. Todo reenvio pelo
   drawer perde o aviso — e reenviar é o caminho normal depois do primeiro
   contato.
2. **Só 5 dos 13 eventos estão `published`.** Evento em rascunho não avisa
   ninguém, e ninguém sabe disso.

E o que **nunca foi implementado**: a metade pública. `PublicQuoteView`
(`rate-quote-public-service.ts:70-127`) não tem campo de evento e o service
nunca consulta a tabela. Daí a conclusão de desenho: **a fonte da verdade do
aviso deve ser a proposta pública** — o único artefato que sobrevive a
encaminhamento, reenvio e print. A mensagem de WhatsApp vira redundância
bem-vinda, não o canal.

### O campo — um interruptor e o texto, não três níveis

Decisão do dono do produto (26/08), que **substitui o enum de três valores**: não
são dois toggles. Um interruptor — informa na cotação, sim ou não — e o **texto**
é que carrega o convite, a ressalva, ou os dois. O raciocínio é o mesmo que
derrubou o enum: se `notice` é `invite` mais uma linha, quem decide o tom é a
redação, não uma coluna.

```sql
"quoteNotice"       boolean NOT NULL DEFAULT false
"quoteNoticeText"   text
"quoteNoticeTextEn" text
"quoteNoticeTextEs" text
CHECK ("quoteNotice" = false OR btrim(coalesce("quoteNoticeText",'')) <> '')
```

Dos 14 pontos do plano que dependiam do enum, 8 ficam idênticos (troca
`IN ('invite','notice')` por `= true`), 4 pedem ajuste cosmético e **3 morrem**: a
tabela de níveis, o molde de texto por nível e a distinção curto × longo. Os dois
primeiros são exatamente o que a redação substitui. O terceiro **não morre
sozinho** — ver "WhatsApp", abaixo.

**O CHECK não some, muda de alvo.** Com enum ele garantia valor válido; com
booleano garante o invariante que passou a importar: *interruptor ligado exige
texto*. Sem ele, `quoteNotice=true` com texto vazio cai no template padrão da
propriedade — 🍹 "…*{NOME_EVENTO}*… Aproveite!" — e a **obrigação de informar
impacto sai impressa com tom de convite**, que é justamente o cenário que o enum
tornava indizível. O `eventTemplate` por propriedade continua valendo como moldura
do caminho legado; nunca como rede silenciosa de um aviso ligado.

**Coluna nova, não reaproveitar `description`:** `description` é a cópia do portal
(pública, vitrine); o aviso é comercial e mora em documento com aceite. Os três
idiomas entram junto, com o mesmo fallback PT do resto do sistema — e o público
que mais vai ler esse bloco é o convidado de casamento, cujo idioma vem de
`navigator.language`. Consequência de plano: o que era "fatia 3, override de texto
multilíngue, só se a operação pedir" **sobe para dentro da fatia 1** — no modelo
booleano o texto não é override, é a semântica.

**A semântica dos níveis não morre, muda de lugar:** o que era tabela de valores
vira **texto de ajuda e placeholder no formulário** — *"é convite ou é obrigação
de informar? se há impacto em quem não participa, escreva a linha de impacto"* —
junto da lista "nunca escrever". É onde ela sempre foi útil.

### Quem arma o aviso — a regra que mais importa, corrigida

**A rota `/api/partner/*` ignora `quoteNotice` e os três campos de texto do
payload e grava `false`/`null`, sempre.** Um humano do AURA liga o interruptor e
escreve o texto. Evento do Altamare que ninguém revisou não pode chegar ao
cliente, e o risco morre no schema — não numa checagem de UI que alguém remove em
seis meses.

O que a versão anterior dizia — *"o parceiro nunca escreve o que o cliente lê"* —
**era falso**, e vale corrigir por escrito: o `{NOME_EVENTO}` impresso hoje é o
`title` do parceiro. A regra defensável é mais estreita: **o parceiro não arma a
superfície, e o texto do aviso é nosso.**

**E isso ainda não fecha — o furo do conteúdo mutável.** O gate é imutável depois
da curadoria; o `title` não é. `PATCH /events/{id}` é idempotente por
`externalRef`, a proposta é `force-dynamic` e lê ao vivo, e evento do parceiro é
read-only na nossa UI. Sequência real: o humano cura, a proposta é enviada, o
parceiro renomeia o evento — e **o documento comercial já entregue passa a dizer
outra coisa**, sem auditoria e sem ninguém no AURA poder editar. Duas saídas, e é
preciso escolher uma antes da fatia 1:

1. **O texto do aviso substitui integralmente o título na impressão** — o parceiro
   renomeia à vontade, o cliente lê só o nosso texto. *(Preferida: é regra de
   render, não de rota, e não depende de vigilância.)*
2. **PATCH do parceiro em campo que alimenta superfície probatória rebaixa o
   gate** (`quoteNotice=false`) e emite `needs_attention` para re-curadoria.

Não fazer nem uma nem outra é o pior dos mundos — e é o desenho que os dois planos
somados descreviam.

### Relação com `blocksProperty`: ortogonais, com uma ressalva prática

`blocksProperty` é eixo de **venda** (a data está comprometida); o aviso é eixo de
**comunicação** (o que o cliente lê). Os quatro quadrantes existem de verdade:
sunset (bloqueia não / avisa sim), luau com som (não / sim, com linha de impacto),
casamento exclusivo que ainda vendeu cabanas (sim / sim), montagem interna (sim /
não).

Cuidado com a regra derivada, porém: `blocksProperty` **não existe em código** —
zero ocorrências em `src/` e `migrations/`, só prosa nos dois documentos. Ela nasce
do contrato, e é **o parceiro** quem a escreve, enquanto o parceiro está proibido
de escrever o aviso. Um alerta "bloqueia e não avisa" acenderia em **100% dos
eventos importados, por construção** — ruído permanente que ninguém lê depois da
segunda semana. O alerta só faz sentido escopado à fila de curadoria (evento já
revisado por humano) ou a evento criado dentro do AURA.

### Onde aparece

| superfície | veredito |
|---|---|
| **Proposta pública** | **obrigatório** — é o pedido literal e o artefato que sobrevive ao encaminhamento |
| **Wizard (atendente)** | **alterado** — badge nos eventos com aviso ligado, mais linha cinza com os demais do período ("outros eventos, não informados ao cliente"): o vendedor precisa saber do casamento mesmo que ele não vá à proposta |
| **Mensagem de WhatsApp** | **mantida — mas NÃO "igual"**, ver abaixo |
| **Portal do hóspede** | **excesso** — já tem agenda e listagem; duplicar é convidar divergência |

**O WhatsApp não sobrevive sem regra de tamanho.** Hoje `buildEventNotices` faz
`.join('\n')` de uma linha curta por evento e injeta em `{AVISO_EVENTO}` no meio
da mensagem (`rate-engine.ts:619-632,580`). Com texto por evento, o exemplo deste
próprio documento tem quatro linhas — três eventos no período viram ~12 linhas
espremidas entre o resumo das cabanas e o link. A distinção **curto (mensagem) ×
longo (card)**, que morreu junto do enum, precisa voltar como regra explícita: o
WhatsApp recebe a primeira linha (ou N caracteres) mais o link da proposta; o texto
integral vive no card. **Definir antes de o campo existir**, não depois do primeiro
orçamento torto.

**A proposta pública não passa por `getQuoteContext`.** `rate-quote-public-service`
nunca consulta `events`; os dois únicos chamadores de `getQuoteContext` são a rota
do tarifário (wizard) e o site do casal. Reusá-lo na proposta arrastaria cabins +
todas as stays que cruzam o período + weddings a cada page view `force-dynamic`, em
plena crise de egress. Por isso entra **`loadQuoteEvents(propertyId, períodos[])`**
— query dedicada só em `events`, recebendo a **união** dos períodos dos quartos (a
proposta carrega check-in/out por quarto) e devolvendo `{id, startDate, endDate}`,
com dedupe por id. E `getQuoteContext` ganha um caminho *availability-only* para o
site do casal, que hoje dispara o select de eventos e joga fora
(`wedding-site-service.ts:222,236-243`).

**Sem toggle de "suprimir este aviso nesta cotação".** É a tentação óbvia e é
armadilha: no dia em que o vendedor pode esconder, a prova de transparência vale
zero. Curadoria acontece **no evento**, não na cotação.

**Posição:** entre "O que está incluso" e "Regras da pousada"
(`ProposalClient.tsx:533-536`), reaproveitando o molde de card que já existe ali. O
cliente é obrigado a passar pelo bloco porque o checkbox de política (`:565-573`)
fica abaixo e trava o aceite (`canAccept`, `:256-258`) — a trava faz o trabalho de
layout de graça.

### O texto — convite primeiro, impacto depois, saída por último

Luau com som — convite, impacto, saída:

> 🔥 **Durante a sua estadia**
> **Luau na praia** — sábado, 14 de fevereiro, a partir das 20h
> Fogueira, música ao vivo e drinks na beira-mar. A entrada é livre para hóspedes.
> *A música toca até por volta de 01h e pode ser ouvida nas cabanas mais próximas
> ao mar. Se você prefere uma noite silenciosa, é só nos avisar — acomodamos você
> na parte alta da propriedade.*

Festival gastronômico — as três primeiras linhas, **sem** ressalva: acrescentar
"caso o movimento incomode" onde não há incômodo ensina o cliente a ler o bloco
como reclamação.

**Nunca escrever:** "pedimos desculpas pelo transtorno" (constrói o evento como
defeito antes de o cliente decidir se é) · eufemismo que a operação não sustenta
("pequena celebração" para 120 pessoas — vira prova contra a pousada) ·
**promessa** de que o evento acontecerá ou de acesso a ele (evento é cancelado e
a proposta aceita virou obrigação) · nome de terceiros não públicos · qualquer
valor ou dado de negociação · tradução automática (sem `titleEn`, cai para PT
dentro da moldura no idioma do hóspede).

**Casamento não vira bloco automático.** 48 dos 53 têm `exclusivity=true` —
automatizar poria bloco em quase toda proposta e mataria a atenção ao aviso.
Casamento segue na pílula do header; só vira bloco quando alguém ligar o
interruptor no evento. **O dedupe é contra a pílula, não contra `quote.wedding`:**
`loadWedding` acende o chip para qualquer casamento `confirmed|tentative` que cruze
as datas, mesmo sem `weddingId` na cotação (`rate-quote-public-service.ts:186-192`,
impresso em `ProposalClient.tsx:308-323`). Deduplicar só pelo vínculo deixaria o
cliente lendo o mesmo casamento duas vezes.

### Live para exibir, carimbo no aceite para provar

A tela lê **ao vivo** (a página já é `force-dynamic`) — snapshot puro quebraria
o caso que motivou o pedido: o Altamare vai agendar eventos **depois** da cotação
existir, e uma proposta de outubro para janeiro nasceria sem o luau marcado em
dezembro.

No clique de aceite, `acceptQuote` grava `rate_quotes.acceptedContext jsonb` com
o que estava na tela — **recalculado no servidor**, nunca a partir de payload do
browser (payload do cliente é editável e o valor probatório seria zero). Resolve
os três cenários: evento criado depois (o carimbo mostra que ele não viu), evento
cancelado (some da tela, fica no carimbo) e "não fui informado" (o carimbo
responde).

### O filtro que falta — latente, não vazando (ainda)

`getQuoteContext` filtra **só** `status='published'` (`rate-service.ts:750-756`):
não filtra `type`, não filtra `privateEventId`, não filtra `visibility`. As duas
leituras públicas do portal são igualmente cegas (`api/guest/events/route.ts:33-40`,
`api/guest/today/route.ts:89-92`). Um evento `type='private'` publicado se
anunciaria por nome e data no WhatsApp de um terceiro.

**Sondado em produção (26/08): não está vazando hoje.** Nenhuma das 13 linhas tem
`type='private'`; os 5 publicados são todos `local`, `all_guests`, com
`privateEventId` nulo, e os 8 `internal` estão em `draft`/`cancelled`. É buraco
aberto sem ninguém ter caído — e o parceiro escrevendo é exatamente quem passa a
andar por perto dele.

Guard **positivo**, em toda leitura que sai de casa:
`status='published' AND type IN ('local','external') AND "privateEventId" IS NULL`
(mais `"quoteNotice" = true` no caso do aviso). Nunca blacklist: com
`type='internal'` em 8 linhas, "tudo que não é privado" vaza.

Duas dependências que o guard cria, e é melhor saber antes:

- **Privacidade não herda pelo `parentEventId`.** Filho de evento privado — a
  welcome party filha do casamento, que é o caso modelado no contrato — não tem
  `privateEventId` próprio. Ou o guard sobe a cadeia de pai, ou o pai propaga o
  vínculo aos filhos na escrita.
- **`type='internal'` vira armadilha silenciosa.** O formulário só oferece
  `local`/`external` (`EventFormDialog.tsx:80`), mas 8 linhas em produção são
  `internal`: com o guard, ligar o aviso num evento desses **salva com sucesso e
  não aparece em lugar nenhum**, sem erro. Alerta âmbar no formulário, e a higiene
  do `type` (fatia 1) continua pré-requisito.

### O convidado de casamento já recebe proposta pública — e o aviso iria junto

Descoberta cruzada; ninguém tinha ligado os dois módulos. A pré-reserva do site do
casal insere em `rate_quotes` com `status='open'` e `expiresAt: null`
(`wedding-site-service.ts:421-451`), e `open` está em `OPEN_STATUSES` — logo
`/cotacao/<uuid>` **renderiza e aceita** essa linha. No dia em que a fatia 1
colocar o bloco de aviso na proposta, ele passa a aparecer **automaticamente nas
pré-reservas dos convidados do casamento**, cujo período é exatamente a janela do
casamento — que é exatamente onde os eventos do Altamare (welcome party,
`parentEventId`) vão existir. Texto curado para "cliente que não é do casamento"
impresso para o convidado do casamento, sem ninguém ter decidido isso.

**Decisão mínima antes da fatia 1:** proposta com `weddingId` — ou com a pílula de
casamento acesa — **não** recebe bloco de aviso de evento filho daquele casamento.
Evento alheio que impacte continua aparecendo: o convidado tem o mesmo direito de
saber do luau.

### Fatias — reordenadas

O campo de texto livre não pode nascer antes de a porta de escrita estar fechada.
Hoje `EventService` escreve pelo **client do navegador** (`event-service.ts:85,105`,
insert e update com spread cru) sob a policy `Staff can manage events USING(true)`,
que anula o escopo por propriedade (policies são OR). Traduzido: qualquer sessão de
staff — qualquer papel, qualquer propriedade — edita a string que vai impressa num
documento comercial. Com enum já era ruim; com booleano mais texto livre, a
semântica inteira mora nesse campo.

| # | o quê |
|---|---|
| **pré** | fatia 1 (higiene do `type` + fallbacks), fatia 2 (`/api/admin/eventos` server-side, whitelist de colunas, `requireAuth`), fatia 3 (RLS — dropar `USING(true)`) e fatia 4 (multi-dia) |
| **1** | as 4 colunas + CHECK + `source` + interruptor e textos no form + `noticeEvents`/`blockingEvents` no context + `loadQuoteEvents()` + bloco na proposta + badge no wizard + regra de tamanho no WhatsApp + guard positivo em **todas** as leituras |
| **2** | `acceptedContext` (a prova) |
| **3** | junto do Altamare: gate forçado `false` na rota do parceiro, allowlist de host para `imageUrl`/`externalUrl`/`locationUrl`, fila "aguardando curadoria" |

**Ordem de deploy, sem exceção:** migration (4 colunas + CHECK + `source`) →
recarregar o schema cache do PostgREST → deploy do código. `PUBLIC_COLUMNS` é
string concatenada à mão e `handleSave` manda o form inteiro
(`useEventos.ts:89`): schema e código fora de sincronia derrubam a rota do portal e
todo save de evento. **As colunas novas não entram em `PUBLIC_COLUMNS`** — o aviso é
comercial, não é do portal.

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
| aviso | a proposta pública informar evento — depende de 1–5, e a rota do parceiro grava o gate como `false` |

**As fatias 1–5 são pré-requisito da fase "eventos do parceiro" do
`docs/ALTAMARE.md`.** A fase do cardápio (primeira no acordo) **não depende**
de nenhuma delas — pode correr em paralelo.
