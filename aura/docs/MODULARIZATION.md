# Modularização — core × módulos, planos por propriedade

> **Status: EM EXECUÇÃO** (decisão de 02/09/2026). O plano original é de 10/08/2026 e ficou parado
> de propósito. O gatilho chegou: o fundador quer testar o produto com pousadas pequenas para
> passar a vender, e **produção já tem três propriedades** — `fazenda-do-rosa` (427 estadias, real),
> `fazenda-modelo-aura` "Teste do Rosa" (45, demo) e `estanciadovale` (2 funcionários, 1 cabana,
> 0 estadias).
>
> Este documento foi reescrito em 02/09/2026 sobre um levantamento de 44 agentes que leram o
> código e mediram a base de produção. **Onde o plano antigo divergia do código, o código venceu** —
> as divergências estão registradas na seção 3, porque várias delas quebrariam produção se alguém
> executasse o doc antigo ao pé da letra.
>
> **O modo Lite vem DEPOIS.** Decisão do fundador: a modularização termina antes do plano do Lite
> começar. O que o Lite vai exigir está registrado na seção 12 como requisito, não como tarefa.

---

## 1. Regras EM VIGOR para todo desenvolvimento novo

Custam minutos por feature e congelam a dívida de retrofit no tamanho de hoje.

1. **Módulo novo nasce com flag** em `properties.settings`, allowlistada em
   `src/lib/property-settings.ts` como super_admin-only.
2. **Fluxo core nunca depende duro de tabela de módulo.** Efeito colateral de módulo dentro de
   fluxo core passa por check suave. Padrão: `src/services/stock-integration.ts`.
3. **Cron novo nasce com gate** de módulo no loop de propriedades.
4. **Decisão de fronteira vai para este arquivo.**
5. **(nova, 02/09) Chave só nasce na fatia que a APLICA.** Chave sem enforcement é toggle que
   mente — era o defeito da página de Módulos até 04/09 (prometia "desativa suas automações" e
   nenhum cron lia módulo nenhum). **Vale para o texto também:** aviso de UI só promete o que o
   código daquela fatia faz. A revisão da fatia 1 pegou quatro promessas falsas em texto e comentário.
6. **(nova, 02/09) Chave nova vem com backfill explícito.** Ver seção 6 — `defaultOn` implícito já
   produziu dois defeitos medidos em produção.
7. **(nova, 02/09) Nada de acesso a `guests` sem `propertyId`.** Ver seção 10.

---

## 2. O que existe hoje — medido, não suposto

| Peça | Estado em 02/09/2026 | Depois da fatia 1 (04/09/2026) |
|---|---|---|
| Registry isomórfico `src/lib/modules.ts` | **Existe.** 4 chaves: `estoque`, `guarita`, `hsystem`, `ponto` | 5 chaves (`rh` veio com o RH v2 em 03/09); `parent` + resolução em árvore; **default de toda chave desligado**, com backfill explícito |
| Gate no menu | **Parcial.** 2 itens de 66 têm `module:` (`Sidebar.tsx:172`, `:220`). O grupo estoque é `if` hardcoded (`:784`). `NavGroup` e `SubItem` não têm campo `module` | `module` em `NavItem`, `NavGroup` e `SubItem`; o `if` do estoque virou `group.module`; `painel_estoque`, `estoque_config` e `hsystem` gateados. Busca do topo filtra por módulo |
| Ordem do gate vs. atalho de super_admin | **Correto** (`Sidebar.tsx:594-595`) — preservar | Preservada, e replicada no dropdown do Painel |
| `<ModuleGuard>` | **Não existe.** Exceção manual em `/admin/ponto` (`page.tsx:66`) | **Existe** (`src/components/auth/ModuleGuard.tsx`) — renderiza aviso, não redireciona. Aplicado em `/admin/estoque/*`, `/admin/patrimonio/*` (layouts) e `/admin/guarita`. O Ponto mantém a exceção manual de propósito (deixa passar quem bate o próprio ponto) |
| `requireModule` na API | **Não existe** como helper. Existe bespoke e funcionando: `api/admin/guarita/route.ts:22` e `api/field/guarita/route.ts:26` via `guarita-service.ts:58` | **Existe** (`src/lib/api-auth.ts`), extraído das 4 cópias (guarita ×2, rh, rh/afd), que agora o chamam. As 17 rotas de estoque/patrimônio ainda não — fatia 3 |
| Gate nos crons | **Zero.** Nenhuma das 14 rotas de cron chama `isModuleOn`. O único gate (`hsystem-sync:31`) reescreve a regra à mão | Inalterado, exceto `rh-materialize` (veio gateado do RH v2). Fatia 4 |
| Portal do hóspede | **Zero.** Nenhum arquivo de `check-in/` ou `api/guest/` conhece módulo | Inalterado. Fatia 7 |
| Hub de configurações | **Diverge.** `configuracoes/_lib/catalog.ts:56` reimplementa `hasStock !== false` à mão | Usa o registry |
| Página de contratação | 3 toggles (`modulos/page.tsx`); `hsystem` tem toggle próprio na sua página | 5 toggles, incluindo Hsystem; desligar Gente desliga o Ponto em cascata; o texto deixou de prometer o que a fatia 4 ainda não faz |

**Leitores da regra fora do registry (5):** `stock-integration.ts:19`, `catalog.ts:56`,
`useConcierge.ts:43`, `useMenu.ts:59`, `wedding-site-service.ts:163`. Hoje concordam por
coincidência; divergem no dia em que um default mudar.

**Seis mapas de navegação paralelos**, não um: `NAV_GROUPS` (`Sidebar.tsx`), `SEARCH_ROUTES`
(`AdminTopbar.tsx:144-181`, 36 rotas, **sem filtro de cargo nem de módulo**), `ROLE_TABS` e
`ROLE_HOME` (`role-routes.ts`), `ROUTE_LABELS` (`AdminTopbar.tsx`), e o bounce de
`MOBILE_ONLY_ROLES` no middleware. O plano antigo previa gate em um só.

### Defeitos medidos em produção

- **Café fantasma.** `breakfast-attendance` (`route.ts:39`) cria sessão para **toda** propriedade
  sem ler configuração nenhuma: **348 das 516 sessões do banco nunca foram abertas** — 166 de
  `estanciadovale` (0 estadias), 150 da demo, 2 de `village`, propriedade que **já não existe**.
  Mais 1.002 linhas de presença na Fazenda, todas `status='expected'`, nenhuma jamais tocada.
- **Propriedade nova nasce com Estoque ligado.** `hasStock` tem `defaultOn: true`; `estanciadovale`
  nunca contratou nada e tem o grupo Compras & Estoque no menu.
- **Duas flags zumbis.** `hasBreakfast` e `hasKDS` são gravadas no nascimento da propriedade
  (`core/properties/page.tsx:80-81`), allowlistadas e tipadas — e **nunca lidas por ninguém**.
  `hasKDS` é `false` na Fazenda e o KDS abre normalmente.
- **Uma flag fora da taxonomia.** `hasWeddingSite` tem exatamente um leitor
  (`wedding-site-service.ts:163`) e nunca entrou na lista de módulos.
- **O dono sozinho não recebe nada.** `NOTIFICATION_ALERT_ROLES = ["reception"]`
  (`notifications.ts:22`) e o push é montado com o cargo escrito na mão:
  `<PushNotificationManager role="reception" />` (`AdminLayoutClient.tsx:76`).

---

## 3. Onde o plano antigo estava errado

Registrado porque executar o doc antigo ao pé da letra derrubaria produção.

| O doc antigo dizia | O código diz |
|---|---|
| `waiter` + `houseman` → módulo `cafe` (l.182 da versão anterior) | `/houseman` **não tem uma linha** sobre café: roda sobre `concierge_requests` + `restock_requests`, com 108 pedidos nos últimos 90 dias. É o app mais vivo depois do da camareira. Seguir o doc derrubaria ele |
| Criar `settings.modules` como objeto + aliases legados | O merge de settings é **raso** — mandar `modules` substitui o objeto inteiro e dois toggles paralelos se sobrescrevem em silêncio. E os aliases mapeariam as duas flags zumbis: não há o que preservar. **Chaves planas `hasX` são estritamente melhores** |
| Checkout sem governança trava a cabana | **Falso.** O caminho de saída existe: `ReservationMapClient.tsx:313` abre o diálogo da cabana suja e `:339` força `status='available'`. Há ainda dois outros escritores: `maintenance-service.ts:211` e `stay-service.ts:596` (`undoCheckOut`) |
| Todo cron varre propriedades (`docs/CRON.md:5`) | **Falso para 5 deles.** `daily-lodging`, `wedding-status` e `crm-status` não têm loop de propriedade — não há onde pôr `continue` |
| Módulo `cafe` cobre café + garçom + KDS num bloco | São **duas features** com fronteira real, e o código não as separa. Ver seção 9 |

---

## 4. Taxonomia fechada (decidida em 02/09/2026)

### Núcleo — nunca desliga, em nenhum plano

> **O portal do hóspede tem documento próprio desde 04/09/2026: `docs/PORTAL-NUCLEO.md`.**
> Declarar "portal (a casca)" como núcleo não bastava — cinco dos seis produtores da agenda
> do dia são de módulo, e a seção some quando a lista fica vazia. A fronteira detalhada do
> portal, as decisões de 04/09 (entrega de mensagem, janela pré-chegada, upgrade no
> pré-check-in) e a dívida verificada vivem lá. **Naquele recorte, aquele documento manda.**

Estadias · mapa de reservas · calendário · hóspedes/contatos · **ficha (FNRH) e pré check-in** ·
cabanas: cadastro, status e **bloqueio por reforma** · recepção/fólio · diárias · equipe
(cadastro + login) · configurações · logs · dashboard · changelog · **portal do hóspede (a casca)** ·
**Survey/pesquisas, inclusive a tela admin** · **estruturas/espaços: o cadastro e a aba "explorar"** ·
mapa ilustrado (opcional por propriedade: sem imagem, só satélite — é opção, não módulo) ·
**motor de mensagens** (templates + regras que dizem qual mensagem em que momento).

> **Dois itens do núcleo ainda moram dentro de módulos e precisam mudar de casa:**
> **bloquear cabana por reforma** só existe como ordem de manutenção
> (`ReservationMapClient.tsx:1051`), e **o motor de mensagens** está grudado na entrega
> automática. Isso é trabalho das fatias 5 e 6.

### Módulos

| Chave | Nome comercial | Conteúdo | Pai | Nota |
|---|---|---|---|---|
| `operacional` | Operacional básico | Governança + Manutenção | — | Desligável de verdade |
| `gastronomia` | Gastronomia | Café da manhã + Restaurante | — | Precisa de plano próprio |
| ↳ `salao` | Salão / buffet | Garçom, KDS, mesas, presença | `gastronomia` | **Piloto** — seção 9 |
| `concierge` | Concierge | Loja de mimos, app do mensageiro | — | Separado de gastronomia |
| `comercial` | Comercial | Funil, orçamentos, tarifário, marketing/descontos | — | Pesquisas ficam no núcleo |
| ↳ `tarifa_flutuante` | Tarifa dinâmica | Flutuação automática por período | `comercial` | upgrade |
| `eventos` | Eventos | Agenda de eventos | — | |
| `casamentos` | Casamentos | Pipeline + site dos noivos (`hasWeddingSite`) | — | Nichado destination wedding |
| `agendamento` | Agenda de espaços | Reserva/bloqueio de estrutura | — | Cadastro é núcleo |
| `estoque` | Compras & Estoque | Estoque + compras + **patrimônio** | — | Existe (`hasStock`) |
| `guarita` | Guarita | Estacionamento + app do porteiro | — | upgrade · existe |
| `rh` | Gente | RH + **ponto** + **escalas** | — | |
| ↳ `ponto` | Ponto | Batida + relatório de horas | `rh` | Existe (`hasTimeclock`) — **cuidado, seção 6** |
| `canais` | Canais (OTA) | Hsystem/HUNIT hoje; iCal no Lite | — | upgrade · existe (`hasHsystem`) |
| `comunicacao_auto` | Envio automático | Evolution / API oficial da Meta | — | upgrade · o motor é núcleo |

**"Upgrade" é rótulo comercial, não mecanismo.** Tudo é chave no mesmo registry, com `parent`.

### Upsell — "informar sem poluir"

Módulo não contratado aparece em **dois** lugares e em nenhum outro: a página
Configurações → Módulos (lista tudo, com estado e "falar com a plataforma") e **um card discreto
no Painel**. Nunca item cinza no menu, nunca resultado de busca.

---

## 5. Princípio de degradação

**Desligar um módulo nunca quebra um fluxo core; só remove a orquestração em volta.**

- Sem `operacional`: a cabana **continua** virando `cleaning` no checkout (status é core) e o
  gestor libera pelo caminho que já existe. Nenhuma task, nenhuma regra, nenhum app de campo.
- Sem `comunicacao_auto`: o motor continua dizendo qual mensagem mandar; o gestor clica e manda
  pelo `wa.me/`.
- Sem `comercial`: o orçamento aceita valor digitado.
- Sem `agendamento`: as estruturas continuam no mapa e no "explorar"; some a agenda.

**Desligar é sempre soft — nada é apagado.** Módulo OFF só para de criar linhas novas. Religar
volta como estava.

---

## 6. Registry v2 — a mecânica

### Armazenamento: chaves planas, backfill explícito

Nada de `settings.modules`. Cada chave é um booleano em `properties.settings` (`hasStock`,
`hasOperacional`, …), allowlistada como super_admin em `property-settings.ts`.

**A mudança de método:** `defaultOn` implícito já produziu dois defeitos medidos — propriedade
nova nascendo com Estoque, e a armadilha de matar o Ponto (abaixo). A regra passa a ser:

> **Toda fatia que introduz uma chave traz junto uma migration que grava o valor explícito para
> as propriedades existentes.** Depois disso, o default de toda chave é **desligado**.

Concretamente, a fatia 1 grava as cinco flags em toda propriedade — o estoque decidido **pelo
dado** (`EXISTS stock_settings`), não pelo nome: a Estância nunca salvou configuração de estoque e
recebe `false`. `estoque.defaultOn` vira `false`. Uma propriedade nova nasce com tudo desligado e
o preset liga o que foi vendido.

**A única flag que continua default-LIGADO no sistema é `hasWeddingSite`** (`wedding-site-service.ts:163`,
`=== false` à mão). Fica assim de propósito até a chave `casamentos` nascer: criar a chave só para
o site seria chave sem enforcement do resto do módulo (regra 5).

> **Armadilha verificada — o Ponto morre se ninguém prestar atenção.** `hasTimeclock: true` está
> gravado na Fazenda e o Ponto entrou em produção em 01/09 com a folha de agosto carregada. No
> momento em que `ponto` passa a ter `parent: 'rh'`, a resolução vira `próprio && pai` — e como
> nenhuma propriedade tinha a chave do RH, o Ponto desligaria sozinho.
>
> **Resolvido em 03/09.** O módulo `rh` nasceu na fatia 1 do `docs/HR-V2.md` com a chave
> **`hasRH`** (era assim no HR-V2 e `hasRh` aqui — o nome é string literal em `properties.settings`,
> case-sensitive, então divergir custaria um módulo que não liga), e a migration
> `hr_fatia1_modelo.sql` grava `hasRH: true` na Fazenda e `false` nas outras, com backfill
> explícito. `ponto` **ainda não tem `parent`** — a resolução em árvore não existe no `isModuleOn`,
> e introduzir o campo sem ela desligaria o Ponto em silêncio. Quando a árvore entrar, a chave já
> está gravada.

### Resolução: árvore, não grafo

Cada feature declara **um único** `parent`. Isso é deliberado: uma primeira proposta usava uma
lista `requires` com resolução recursiva e memo compartilhado, e o resultado — verificado
rodando o código — era que `salao` (a chave do piloto) retornava `false` para sempre, por causa
de um diamante `salao → {gastronomia, cafe}` + `cafe → gastronomia`. Árvore não tem esse problema
e termina sempre.

```ts
interface ModuleDef {
  setting: string;      // chave em properties.settings
  label: string;
  parent?: ModuleKey;   // UM pai. Feature só liga se o pai estiver ligado.
  defaultOn: boolean;   // desligado para toda chave nova (ver backfill acima)
}

// isModuleOn(settings, key) = flagPrópria(key) && (parent ? isModuleOn(settings, parent) : true)
```

---

## 7. As cinco camadas de enforcement

Decisão do fundador: o "desligado" vale em **todas**.

| # | Camada | Como |
|---|---|---|
| 1 | **API** | `requireModule(propertyId, key)` ao lado do `requireAuth`, devolvendo 403 `MODULE_OFF`. **Extrai** o que já roda em `guarita-service.ts:58` — não inventa |
| 2 | **Navegação** | Campo `module` em `NavItem`, `NavGroup` **e** `SubItem`; o mesmo filtro aplicado aos **seis** mapas |
| 3 | **Páginas** | `<ModuleGuard module="…">`, irmão do `RoleGuard` |
| 4 | **Crons** | Gate no loop de propriedades, respeitando as armadilhas da seção 11 |
| 5 | **Portal + notificação** | Abas por módulo; roteamento de alerta por pessoa, não só por cargo |

**A ordem importa: camada 1 antes da camada 2.** Esconder no menu e deixar a URL aberta é
maquiagem. Até 04/09 a busca do topo não filtrava por módulo e "some do menu" significava
"invisível na nav, alcançável por Cmd+K e por URL"; a busca foi fechada na fatia 1. **A fatia 1
violou esta ordem de propósito para `estoque`, `patrimônio` e `hsystem`** (menu e páginas antes
das rotas) porque a Estância já tinha a API aberta e o menu à mostra — o commit só estreitou. A
dívida está nomeada na fatia 3.

**Armadilha do loop de login:** `ROLE_HOME` pode mandar um cargo direto para a página de um
módulo desligado, que o `ModuleGuard` devolve — loop. Todo gate de rota precisa do fallback de
`ROLE_HOME` **no mesmo commit**, não no seguinte.

---

## 8. Fatias de execução

Cada uma entrega sozinha e tem critério de pronto. A ordem é deliberada.

**Fatia 0 — Escopo de `guests` (BLOQUEANTE).** Seção 10.
*Pronto quando:* nenhuma escrita em `guests` acontece sem `propertyId`, e o repro do roubo de
ficha no DEV deixa de reproduzir.

**Fatia 1 — Fundação do registry. EXECUTADA em 04/09/2026 (branch `pet-policy`, DEV).**
`parent` + resolução em árvore + `requireModule` + `<ModuleGuard>` + migration
`modules_backfill_flags.sql` + os 4 leitores soltos de `hasStock` passando a usar o registry
(`stock-integration`, `catalog`, `useConcierge`, `useMenu`). O quinto leitor,
`wedding-site-service.ts:163` (`hasWeddingSite`), fica como está até a chave `casamentos` nascer —
criar a chave agora só para ele violaria a regra 5. Nenhuma chave nova. Verificado no DEV: as 3
propriedades com as 5 flags explícitas; a Estância sem Estoque. **Falta:** rodar a migration em
produção (`--target prod`) junto com o deploy.
*Pronto quando:* existe um lugar só que responde "este módulo está ligado?" e três formas de
aplicá-lo; `estanciadovale` não tem mais Estoque no menu.

**Fatia 2 — O piloto: desligar o salão na Fazenda.** Seção 9.
*Pronto quando:* o salão sumiu, a cesta de café não perdeu um pedido sequer em 30 dias.

**Fatia 3 — Navegação unificada + API fechada.** A fatia 1 já gateou menu, dropdown do Painel e
busca para as 5 chaves existentes. O que falta, nomeado pela revisão adversarial de 04/09:
- `requireModule` nas **17 rotas** de `api/admin/estoque/**` e `api/admin/patrimonio/**` e em
  `api/admin/timeclock` (hoje sem gate nenhum: com Gente desligado o botão some e a API continua
  batendo ponto). Admin/manager/compras da Estância chamam todas e recebem 200.
- `ROLE_HOME`, `ROLE_TABS`, `ROUTE_LABELS` e o bounce do middleware cientes de módulo. Caso concreto:
  `ROLE_HOME.compras = /admin/estoque` (`role-routes.ts:22`) numa pousada sem estoque cai no aviso
  do `ModuleGuard`, cujo "Voltar ao Painel" redespacha para `/admin/estoque` — não é loop (o guard
  renderiza), mas o botão é morto para esse cargo.
- `<ModuleGuard module="hsystem">` em `/admin/hsystem` e **um** interruptor só para `hasHsystem` —
  hoje há dois (página de Módulos e `hsystem/page.tsx:407`), com leitores diferentes.
*Pronto quando:* desligar `estoque` numa propriedade de teste não deixa nenhum item órfão em
nenhum dos seis mapas, e a URL direta de qualquer rota de módulo devolve 403.

**Fatia 4 — Crons.** Gate nos 14, respeitando as armadilhas. `daily-lodging` **em separado** —
gate errado nele é um tenant que para de ser cobrado por pernoite. Inclui trocar os dois leitores
manuais de `hasHsystem === true` (`hsystem-service.ts:166,173` e `cron/hsystem-sync/route.ts:38-39`)
pelo registry — hoje concordam por coincidência e divergem no dia em que `hsystem` ganhar pai.
*Pronto quando:* a frase da página de Módulos passa a ser verdade e nenhuma propriedade sem
módulo recebe linha nova. Fim do café fantasma.

**Fatia 5 — Os dois itens do núcleo que moram em módulos.** Bloquear cabana por reforma sai da
manutenção; o motor de mensagens (templates + "mensagens do dia" + `wa.me`) sai da entrega
automática.
*Pronto quando:* numa propriedade com `operacional` e `comunicacao_auto` desligados, dá para
bloquear uma cabana e mandar a mensagem de boas-vindas.

**Fatia 6 — Chaves restantes**, uma fatia por chave, cada uma com sua migration de backfill e
seu enforcement completo (regra 5).

**Fatia 7 — Portal e notificação.** Abas por módulo; alerta por pessoa.
*Pronto quando:* um `admin` sozinho recebe push de pedido de concierge.

**Fatia 8 — Presets + card de upsell no Painel + propriedade nova nascendo enxuta.**
*Pronto quando:* criar propriedade nova produz um menu do tamanho do que foi vendido.

---

## 9. O piloto — desligar o salão/garçom na Fazenda do Rosa

### A medição que autoriza

- **O salão nunca foi aberto na Fazenda. Nenhuma vez.** 174 sessões, todas `status='closed'` com
  `openedAt = NULL`. As 4 únicas aberturas da história do banco são do próprio fundador na
  propriedade demo, em março de 2026.
- **1.002 linhas de presença, todas `expected`**, nenhuma com `arrivedAt`/`seatedAt`/`leftAt`.
- **`fb_orders` com `modality='buffet'`: 2 no banco inteiro**, ambas da demo, março de 2026.
- **Zero staff com cargo `waiter`. Zero com `kitchen`.** Em nenhuma propriedade.
- **A cesta, em contraste, está viva:** 54 pedidos `modality='delivery'` na Fazenda, 40 nos
  últimos 90 dias, o último **ontem**.

> **Armadilha de leitura:** a coluna `requested_by` vem `'waiter'` em 54 de 54 desses pedidos,
> porque a rota do hóspede só grava `requested_by` quando `modality='buffet'`
> (`guest/breakfast-orders/route.ts:158`) e a coluna tem default. Quem contar "garçom" por essa
> coluna conclui exatamente o oposto do que aconteceu.

### A fronteira real (e por que um gate ingênuo mata a cesta)

`/waiter` e `/admin/cafe-salao` são **o mesmo app**, e o salão é uma **aba** dentro dele
(`waiter/page.tsx:29`). Toda a API do `/waiter` é café. Gatear o layout de `/waiter`, ou as rotas
`api/admin/fb/*`, ou `api/guest/breakfast-*` por `salao` **mata os 54 pedidos/mês** — e mata
calado, porque o portal engole o erro.

O que `salao` pode gatear: os 3 itens de menu (KDS, Cozinha/KDS no dropdown do Painel, Garçom em
Apps Mobile), a entrada da busca, as **abas** `salao`/`cozinha` dentro das duas telas, a rota do
KDS, e a criação de sessão no cron. Nada mais.

### Os três passos

1. **Hoje, sem deploy, reversível num clique:** em Configurações → Gastronomia, trocar
   "Modalidade" de "Buffet + entrega" para "Apenas entrega". O ramo buffet fica inalcançável nos
   três pontos que o resolvem (`OrdersScreen.tsx:197`, `HomeScreen.tsx:120`,
   `api/guest/today/route.ts:85`). **Anotar o objeto `fbSettings` inteiro antes de salvar** — o
   merge é raso.
2. **Depois que ninguém reclamar:** chave `salao` no registry, `defaultOn: false`, gateando só o
   que a fronteira acima permite. Volta atrás por um toggle, sem deploy.
3. **Por último:** gate no cron `breakfast-attendance`, com o `continue` **antes** do insert da
   sessão — no lugar errado, sobra um rastro de sessões vazias pior que o de hoje.

**Antes do passo 2, corrigir `ROLE_HOME`:** `kitchen` aponta para `/admin/cafe-salao/kds`
(`role-routes.ts:20`) e `waiter` para `/waiter` (`:28`, e está em `MOBILE_ONLY_ROLES`). Hoje não
atinge ninguém — 0 staff nesses cargos — mas o fallback entra no mesmo commit.

**Medição de sucesso (definir antes de desligar):** em 30 dias, (a) nenhum chamado da recepção
sobre café, (b) o volume de `fb_orders` `delivery` não cai (baseline: ~13/mês), (c) nenhum
`FB_ORDER_CREATED` com `modality='buffet'`, (d) `breakfast_attendance` para de crescer. Se (b)
cair, o desligamento pegou a cesta junto e o passo 1 se desfaz num clique.

**Não apagar nada.** As 516 sessões e 1.030 presenças ficam no banco, inclusive as 2 órfãs de
`village`. Limpar isso é operação irreversível travestida de faxina, e não é o que o piloto testa.

---

## 10. `guests` multi-tenant — CONCLUÍDO no DEV em 05/09/2026

> **Status: os 4 passos executados** (branch `pet-policy`, **fora do `main`**).
> **As duas migrations NÃO foram aplicadas em produção** — elas e o código vão no MESMO deploy.
> Aplicar a PK composta sozinha faz o PostgREST recusar toda gravação de ficha, porque o código
> publicado ainda usa `onConflict: 'id'`.

### O bug, e por que a primeira correção não bastava

`guests.id` é o documento (o CPF, quando há um) e era chave primária **global**. `upsertGuestDirect`
lia `.eq('id', id)` sem propriedade e gravava com `onConflict: 'id'`: a pousada B sobrescrevia a
linha da pousada A **e levava o `propertyId` junto**. Como `findByDocument` filtra por propriedade,
A nunca mais achava a ficha.

A fatia 0 (04/09, `7226ea9`) escopou as escritas e trocou a corrupção por uma **recusa com
mensagem**. Foi a decisão certa para uma base com um tenant real, e errada como estado final: ela
bloqueia um hóspede legítimo que já se hospedou na pousada vizinha. Numa região de pousadas
pequenas isso acontece na primeira semana, não no primeiro ano.

Pior: a mesma colisão tinha **três** comportamentos, e dois falhavam calados.

| Caminho | Antes |
|---|---|
| Recepção cadastra a ficha | Erro na tela |
| Hóspede faz o pré check-in | `promoteGuestId` desistia em silêncio; ficha ficava `GUEST-*` para sempre |
| Reserva entra pela OTA | Caía em `GUEST-HU-<locator>`, provisória para sempre |

A premissa já era falsa para uma ficha em cada oito: de 417 fichas em produção, 53 têm id
provisório, 33 têm documento que não é CPF (passaporte, CNH, RG) e 9 não têm documento nenhum.

### A decisão: ficha por pousada

A pergunta de fundo não era o tipo do identificador, e sim se o hóspede é **global** ou **por
pousada**. Global significa a pousada B enxergar que a pessoa se hospedou na A. Cada pousada é
controladora de dados própria, então isso é compartilhamento sem base legal — e era o que a chave
global implementava por acidente.

Decidido "por pousada", a chave composta `(propertyId, id)` é o caminho barato: as 7 tabelas
filhas e o `audit_logs` **já carregavam `propertyId`**. O id sintético (documento virando campo
indexado) resolveria também o estrangeiro sem CPF e a troca de documento, ao custo de repontar
~1.400 linhas e desfazer a premissa "o id é o documento", espalhada por `guest-doc.ts`,
`promoteGuestId`, a busca do CRM e as telas de cadastro. **A composta não impede a sintética
depois; o gatilho dela é o passaporte, não a multi-tenancy.**

### O que foi feito

**Faxina (05/09).** As 18 linhas contaminadas (17 estadias + 1 contato, 2 CPFs de teste do
fundador, todas encerradas) foram removidas dos dois bancos, com backup em disco antes. As
estadias e seus 15 dependentes (2 tarefas de faxina canceladas, 12 mensagens, 1 presença de café)
foram apagados; o contato foi **desvinculado**, não apagado, porque é um contato de WhatsApp real.
A estadia órfã `59beae73` ficou de pé: não é cruzada, não bloqueia nada, e apagá-la destruiria uma
estadia finalizada de verdade.

**Passo 1 — as leituras (`8a8fdfc`).** Medido antes de mexer: 73 pontos de acesso a `guests`, 10
escritas (7 já escopadas) e 63 leituras (14 já escopadas). Das 49 sem escopo, **44 já tinham
`propertyId` como parâmetro da própria função**, 5 tiraram de um `stay` já carregado, e **nenhuma
exigiu mudar cadeia de chamada** — o que derruba o número de "71 call sites num deploy atômico"
que este documento trazia antes. Enquanto não existe documento duplicado, é um no-op.

**Passo 2 — a chave (`8a72dad`).** `migrations/guests_composite_pk.sql`, com travas que abortam se
houver `propertyId` NULL, par repetido, ou `guests` numa publicação de realtime. Junto,
`onConflict: 'propertyId,id'` no upsert. Zero linha transformada.

**Passo 3 — as FKs.** `migrations/guests_composite_fk.sql`: as 7 `(propertyId, guestId) REFERENCES
guests(propertyId, id)` que **nunca existiram**. Até aqui quem garantia o escopo era o service
lembrar de filtrar, e foi assim que as 18 linhas atravessaram. `stays` entra `NOT VALID` por causa
da estadia órfã: vale para toda linha nova sem tocar no histórico.

**Passo 4 — o fim da trava.** Some a recusa por documento de outra pousada, a desistência
silenciosa do `promoteGuestId` e o fallback `GUEST-HU` do Hsystem. Os três existiam pelo mesmo
motivo, e o motivo acabou. A leitura do upsert continua, escopada, só para o log distinguir
criação de atualização.

### Provado no DEV

- O mesmo CPF coexiste nas duas pousadas, e a ficha original fica intacta.
- O upsert composto funciona no insert e no update.
- Estadia da Estância apontando para ficha que só existe na Fazenda é recusada com `23503`.

### O que falta

1. **As duas migrations em produção, no mesmo deploy do código.** Nesta ordem: subir o código,
   rodar `guests_composite_pk.sql --target prod`, depois `guests_composite_fk.sql --target prod`.
2. **`ALTER TABLE stays VALIDATE CONSTRAINT stays_guest_fk`**, depois de decidir o destino da
   estadia órfã `59beae73` (anular o `guestId` ou recriar a ficha).
3. **`contacts` tem a mesma doença**: PK global cujo id é o telefone. Duas pousadas não podem ter
   o mesmo contato. Fora do escopo desta rodada.
4. **As 53 fichas provisórias `GUEST-*`** (35 na Fazenda, 19 na demo) agora conseguem ser
   promovidas mesmo quando o documento já existe noutra pousada. Vale medir daqui a um mês se o
   número caiu sozinho.
5. **Fora de escopo, para `auth-security-remediation`:** os acessos a `stays` e `cabins` por id
   cru. Não corrompem dado, são IDOR.

---

## 11. Armadilhas verificadas dos crons

O gate ingênuo quebra coisas. Cada item foi confirmado no código por mais de um revisor.

- **`daily-automations`** roda o vencimento **global** de solicitações de estrutura **antes** do
  loop (`route.ts:43-47` → `structure-service.ts:397-410`, `UPDATE` sem `propertyId`). Gatear o
  cron por `comunicacao_auto` mata isso junto.
- **`daily-housekeeping`** roda `closeObsoleteCheckinInspections` **de propósito** antes do corte
  (`route.ts:59-69`). Gate no topo do loop mata a limpeza de inspeções obsoletas.
- **`daily-lodging`, `wedding-status` e `crm-status` não têm loop de propriedade**
  (`finance-service.ts:126-141`, `rate-service.ts:2053`). Não há onde pôr `continue` — precisam
  ganhar o loop antes de ganhar o gate. `docs/CRON.md:5` afirma o contrário e está errado.
- **`daily-lodging` lança diária no fólio.** Fatia separada, revisão separada.
- **`breakfast-attendance`** é o mais barato de todos e o de maior lucro: o gate acaba com o café
  fantasma. Mas o `continue` vai **antes** da criação da sessão, e a rota precisa passar a trazer
  `settings` no `select` (`route.ts:42` hoje traz só `id`).

---

## 12. O que o modo Lite vai exigir (registro, não tarefa)

Decisões já tomadas com o fundador em 02/09/2026, para que a modularização não feche portas:

- **Alvo:** 1 a 10 UHs, uma pessoa (no máximo 3), faxina normalmente terceirizada. Celular no
  campo, notebook no fechamento.
- **Casca própria, não preset.** "A quantidade de telas é pensada numa operação fragmentada;
  vai ficar maçante para uma pessoa gerir." Componentes reaproveitados, reunidos de outro jeito —
  com 3 UHs, estadias e mapa de ocupação provavelmente são **uma tela só**.
- **Canais:** iCal (grátis, os dois sentidos) no básico; HUNIT vira upgrade. É a chave `canais`.
- **WhatsApp:** só `wa.me` no básico — e isso **já é** a decisão de comunicação da seção 4, que
  vale para a Fazenda também.
- **Portal + pré check-in:** núcleo. É o maior diferencial de venda.
- **Financeiro:** registro simples (a receber / recebido), sem contabilidade. **Fiscal fica de
  fora** — a pousada pequena emite pelo portal da prefeitura.
- **Faxina terceirizada:** tela tipo `/maid` simplificada, com checklist montado pelo
  proprietário — ou só "cabana pronta". Opção da propriedade.
- **Onboarding manual** nos primeiros clientes.

---

## 13. Decisões em aberto

| # | Decisão | Estado |
|---|---|---|
| 1 | Gastronomia precisa de plano próprio (café vs. restaurante; restaurante é terceirizado e a ideia é integrar por API — ver `docs/ALTAMARE.md`) | **Aberta**, e o fundador já sinalizou que é o módulo mais trabalhoso |
| 2 | A estadia órfã e as 54 fichas `GUEST-*` | Aberta — depende do fundador |
| 3 | `contacts` tem a mesma doença de `guests` (PK global, o id é o telefone) | Registrada; não entra na fatia 0 |
| 4 | Nomes dos presets | Sugestão: Essencial / Operação / Completo |
| 5 | O que aparece no lugar das linhas abertas quando alguém desliga um módulo | Aberta |
