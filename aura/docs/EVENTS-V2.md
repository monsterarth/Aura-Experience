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

### O campo

Uma coluna: `quoteNotice text NOT NULL DEFAULT 'none'`, com CHECK em
`('none','invite','notice')`.

**A semântica é o que salva o campo de ser impreenchível.** `quoteNotice` não
classifica o humor do hóspede (indecidível — luau é atrativo para uns, incômodo
para outros); classifica **o que a pousada é obrigada a dizer antes de vender**:

| valor | significado operacional |
|---|---|
| `none` (default) | não entra em comunicação comercial nenhuma |
| `invite` | **convite** — o hóspede ganha em saber; se ignorar, não houve dano |
| `notice` | **obrigação de informar** — há impacto em quem *não* participa (som, estacionamento, área ocupada) |

São **níveis ordenados**, não categorias paralelas: `notice` faz tudo que
`invite` faz e acrescenta a linha de impacto. É assim que o "atrativo para um,
incômodo para outro" se resolve sem um segundo campo — o texto **abre
convidando e fecha informando**.

### Quem preenche — a regra que mais importa

**O parceiro nunca escreve o que o cliente lê numa proposta comercial da
pousada.** A rota `/api/partner/*` **ignora** qualquer `quoteNotice` do payload
e grava `'none'`, sempre. Um humano do AURA promove para `invite`/`notice` no
formulário. Assim, evento do Altamare que ninguém revisou **não pode** chegar ao
cliente — e o risco morre no schema, não numa checagem de UI que alguém remove
em seis meses. Fricção deliberada: com 13 eventos/ano, revisar custa minutos e
compra o direito de imprimir aquele texto num documento comercial.

### Relação com `blocksProperty`: ortogonais

`blocksProperty` é eixo de **venda** (a data está comprometida, a
disponibilidade muda). `quoteNotice` é eixo de **comunicação** (o que o cliente
lê). Os quatro quadrantes existem de verdade: sunset (`false`/`invite`), luau
com som (`false`/`notice`), casamento exclusivo que ainda vendeu cabanas
(`true`/`notice`), montagem interna sem impacto (`true`/`none`). Única regra
derivada: `blocksProperty=true` com venda acontecendo **deveria** ser ao menos
`notice` — validado como **aviso no formulário**, não como CHECK no banco.

### Onde aparece

| superfície | veredito |
|---|---|
| **Proposta pública** | **obrigatório** — é o pedido literal e o artefato que sobrevive ao encaminhamento |
| **Wizard (atendente)** | **alterado** — badge por nível nos `invite`/`notice`, mais linha cinza com os `none` do período ("outros eventos, não informados ao cliente"): o vendedor precisa saber do casamento mesmo que ele não vá à proposta |
| **Mensagem de WhatsApp** | **mantida**, só trocando a fonte para `noticeEvents` |
| **Portal do hóspede** | **excesso** — já tem agenda e listagem; duplicar é convidar divergência |

**Sem toggle de "suprimir este aviso nesta cotação".** É a tentação óbvia e é
armadilha: no dia em que o vendedor pode esconder, a prova de transparência vale
zero. Curadoria acontece **no evento**, não na cotação.

**Posição:** entre "O que está incluso" e "Regras da pousada"
(`ProposalClient.tsx:533-536`), reaproveitando o molde de card que já existe
ali. O cliente é obrigado a passar pelo bloco porque o checkbox de política
(`:565-573`) fica abaixo e trava o aceite (`canAccept`, `:256-258`) — a trava faz
o trabalho de layout de graça.

### O texto — convite primeiro, impacto depois, saída por último

Luau com som (`notice`):

> 🔥 **Durante a sua estadia**
> **Luau na praia** — sábado, 14 de fevereiro, a partir das 20h
> Fogueira, música ao vivo e drinks na beira-mar. A entrada é livre para hóspedes.
> *A música toca até por volta de 01h e pode ser ouvida nas cabanas mais próximas
> ao mar. Se você prefere uma noite silenciosa, é só nos avisar — acomodamos você
> na parte alta da propriedade.*

Festival gastronômico (`invite`) — três linhas, **sem** ressalva: acrescentar
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
Casamento segue na pílula do header; só vira bloco quando alguém marcar
`quoteNotice` no evento, com dedupe contra `quote.wedding`.

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

### Fatias

| # | o quê |
|---|---|
| **pré** | multi-dia (fatia 4) e higiene do `type` (fatia 1) — sem eles o cliente lê data errada e o filtro não é confiável |
| **1** | coluna + tipo + seletor no form + `noticeEvents` no context + `loadQuoteEvents()` + bloco na proposta + badge no wizard + `buildEventNotices` lendo a nova fonte |
| **2** | `acceptedContext` (a prova) |
| **3** | override de texto multilíngue e imagem no bloco — *só se a operação pedir* |
| **4** | junto do Altamare: `quoteNotice='none'` forçado na rota do parceiro + fila "aguardando curadoria" |

Guard de segurança em qualquer fatia: filtro **positivo**
(`quoteNotice IN ('invite','notice')` + `status='published'` +
`type IN ('local','external')`), nunca "tudo que não é privado" — com
`type='internal'` em 8 linhas, blacklist vazaria.

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
