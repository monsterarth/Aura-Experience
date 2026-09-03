# RH v2 — escala, ponto, ausências e ficha

> **Status: PLANO. Não iniciado.** Escrito em 03/09/2026 sobre medição direta da base de
> produção (projeto `luihcsfvnfdshhqltjig`), não sobre leitura de código apenas.
>
> O gatilho: o módulo de escalas foi feito às pressas em abril/2026 e **nunca chegou a ser
> adotado** — os números da seção 1 mostram isso sem margem para interpretação. Com o módulo de
> Ponto entrando (fase 1 em produção desde 01/09) e a modularização em execução, é o momento de
> refazer em vez de remendar.
>
> Este documento nasce **dentro** de `docs/MODULARIZATION.md` — as 7 regras da seção 1 daquele
> documento valem aqui integralmente, e a seção 6 registra como cada uma é cumprida.

---

## 1. O retrato medido (03/09/2026)

Tudo abaixo veio de `SELECT` em produção. Nada é estimativa.

### 1.1 O módulo de escalas nunca foi adotado

| Tabela | Estado real |
|---|---|
| `staff_schedules` (grade semanal por `dayOfWeek`) | **7 linhas, 1 pessoa, todas criadas em 23/04/2026.** Nunca mais tocada |
| `staff_schedule_overrides` (exceção por data) | **12 registros no total**, 6 pessoas, de 20/04 a **31/05** — parada há 3 meses |
| `staff_schedule_checkpoints` (âncora de ciclo) | 11 registros, 10 pessoas, de 02/04 a 28/06 |
| `staff.scheduleConfig` (jsonb) | **19 de 32 ativos** — a única peça viva |

São **30 registros** somando as três tabelas. Não há o que migrar.

### 1.2 Quatro representações da mesma pergunta

"Quando o Greff trabalha?" tem hoje quatro fontes que ninguém reconcilia:

1. `staff_schedules` — grade semanal (morta: 1 pessoa)
2. `staff.scheduleConfig` — gerador `5x2 | 12x36 | 6x1 | custom` (viva: 19 pessoas)
3. `staff_schedule_overrides` — exceção por data (parada desde maio)
4. `staff_schedule_checkpoints` — âncora de ciclo (parada desde junho)

E o **histórico de mudança de escala vive num array dentro do JSON** (`ScheduleConfig.history`,
`src/types/aura.ts:1216`). Medição: a **Grazi tem 18 versões empilhadas numa célula**; Laura tem 7,
Davi 5, Arthur P 5. Não existe consulta possível para "quem estava em 12x36 em maio" sem varrer 37
blobs no navegador.

**É esta a causa raiz da queixa "não é inteligente".** Não é a interface — é que o modelo não
responde nenhuma pergunta agregada: horas previstas no mês, quem trabalha domingo, quem está
escalado e de férias ao mesmo tempo, custo de escala por setor. Nada disso é consultável.

### 1.3 O cálculo roda no navegador de todo mundo

`resolveEffectiveDaySchedule` (`src/lib/schedule-calculator.ts`, 195 linhas) é importado por
**11 arquivos**, incluindo os 6 apps de campo:

| Arquivo | Para quê |
|---|---|
| `src/app/maid/page.tsx:1444` | linha "07:00 às 15:00" ou "Folga" + grade da semana |
| `src/app/governanta/page.tsx:1406` | a mesma linha |
| `src/app/waiter/page.tsx:374` | a mesma linha |
| `src/app/houseman/page.tsx:11` · `maintenance/page.tsx:12` · `director/page.tsx:16` | idem |
| `src/app/admin/escalas/page.tsx` (1184 linhas) e `escalas/mensal/page.tsx` (545) | as duas telas |
| `src/app/admin/hr/_components/useHrDashboard.ts` | painel |
| `src/components/admin/profile/{PersonalScheduleCard,ProfileView}.tsx` | perfil |

Cada app de campo dispara **3 requisições HTTP** (`schedules` + `schedule-overrides` +
`schedule-checkpoints`) para renderizar **uma linha de texto**. Não existe service. Não existe
endpoint que responda "quem trabalha hoje". Com o egress do plano free já estourado
(ver `docs/` e o histórico de 25/08), são 18 chamadas evitáveis por rodada de apps.

**Lado bom:** o acoplamento é fino. Um endpoint único mata os 11 call sites — o refactor não
precisa reescrever app de campo nenhum, só trocar a fonte da linha.

### 1.4 O ponto ainda não é ponto

| Métrica | Valor |
|---|---|
| Batidas em `time_clock_events` | **95**, de 01/08 a 02/09/2026 |
| Pessoas distintas que bateram | **1** |
| Batidas por origem | **`manual` 93 · `aura` 2** |
| Ativos com `timeSource = 'aura'` | 1 |
| Ativos com `timeSource = 'rep'` | 0 |
| Dias com número ímpar de batidas (jornada aberta) | 1 |

Ou seja: o módulo funciona, mas o que existe hoje é **lançamento manual da folha de uma pessoa**,
não registro de ponto. A tabela em si é bem modelada (`migrations/timeclock_phase1.sql` — batidas
soltas em vez de colunas `entrada1/saida1`, exclusão lógica, `originalTs` preservado, par
`repSerial`+`nsr` já previsto para idempotência do AFD). **Nada a refazer aqui — só a fase 2.**

### 1.5 O que não existe

| Peça | Estado |
|---|---|
| Férias | **Nenhuma tabela.** Nenhuma coluna. Nada |
| Atestado / afastamento / falta | Nada |
| Banco de horas | Existe como **texto livre** no campo `reason` de um override — 2 registros |
| Desligamento | Só o booleano `staff.active`. **5 inativos, zero com data ou motivo** |
| Cargo com histórico | Não existe — `role` é um campo que se sobrescreve |
| Documentos do funcionário | Nada |
| Avaliação / advertência / treinamento | Nada |

Os motivos de override em produção, na íntegra: `Folga` (5), *vazio* (3), `Banco de horas` (2),
`Domingo Mes` (1), `Rodízio — ciclo invertido` (1). **O texto livre é o sistema avisando que a
modelagem não tem onde pôr o que a operação precisa.**

### 1.6 Higiene do cadastro

37 registros em `staff`, 32 ativos. Dos 16 ativos sem escala nenhuma:

| Grupo | Quem | Quantos |
|---|---|---|
| Sem jornada por natureza | Marilia, Paulo, Pedro, Regina (`director`); `arth`, `Arthur`, `Recepção` (`admin`); `Arthur Petry` (`super_admin`) | **8** |
| **Contas de teste vivas em produção** | `Governanta teste`, `Mensageiro teste`, `Camareira teste`, `teste` | **4** |
| **Falta cadastrar de verdade** | Bruna da Silva Marques (maid, admitida 28/08), Drika da Silva (maid, 20/08), Marcelo Pereira (technician, 2016), Michel (technician, 2021) | **4** |

O buraco real é de **4 pessoas**, não de 16 — e metade foi admitida nas últimas duas semanas.
Passivos à parte, todos medidos:

- **4 contas do mesmo Arthur**: `arth`, `Arthur`, `Arthur P`, `Arthur Petry`.
- **`hireDate = 0001-01-01`** em 2 registros (`Recepção`, `Camareira - Freela`).
- **7 dos 32 ativos sem data de admissão.**
- 4 contas de teste marcadas como ativas, poluindo toda contagem de RH.

### 1.7 Segurança

| Tabela | RLS | Políticas |
|---|---|---|
| `staff` | ligada | 2 — escopadas por `propertyId` e `auth.uid()`, corretas |
| `staff_schedules` | ligada | 2 |
| `staff_schedule_overrides` | ligada | **2 — e uma delas é um vazamento** |
| `staff_schedule_checkpoints` | ligada | **0** (nega tudo fora de service_role — seguro) |
| `time_clock_events` | ligada | **0** (idem — seguro) |

O vazamento:

```sql
staff_schedule_overrides_select | SELECT | (auth.role() = 'authenticated')
```

**Qualquer usuário logado lê a folga de qualquer funcionário de qualquer propriedade.** Sem filtro
de `propertyId`. Isso entra na conta de `auth-security-remediation` e tem que morrer na fatia 0 —
antes de qualquer dado novo de RH encostar nessa família de tabelas.

---

## 2. Decisões fechadas (Arthur, 03/09/2026)

| # | Pergunta | Decisão |
|---|---|---|
| 1 | Como a escala funciona no mundo real | **Mistura: depende do setor.** Recepção/portaria têm turno que repete; governança e salão variam com ocupação e evento |
| 2 | Quem monta | **Centralizado** — uma pessoa monta a de todos os setores |
| 3 | Escopo do RH | Escala + ponto + férias · **ficha completa do funcionário** · **gestão de gente** |
| 4 | Autoatendimento | **Ver escala e bater ponto.** Sem pedido de folga/troca/férias pelo app nesta rodada |
| 5 | Escala manda na operação? | **Sugere, não trava.** Mostra quem está de serviço e avisa se escolherem alguém de folga — mas não bloqueia |
| 6 | Ponto | **REP Hexa para todos; o AURA importa o AFD** |
| 7 | Salário no AURA | **Não.** Só dados de trabalho. Valores ficam com a contabilidade |
| 8 | Férias | **A contabilidade controla o período aquisitivo.** O AURA só precisa saber quem está fora e quando |
| 9 | Navegação | **Um `/admin/rh` com abas.** As 5 entradas atuais viram uma |
| 10 | Dados atuais de escala | **Zerar.** 30 registros, nenhum em uso; preserva-se só o `scheduleConfig` das 19 pessoas |
| 11 | Os 16 sem escala | Corrigido pela medição 1.6 — 8 não têm jornada, 4 são teste, **4 faltam** |
| 12 | Primeira fatia | **Escala materializada + tela do mês** |

### Consequências que essas decisões liberam

- **Decisão 8 é a que mais simplifica.** Se a contabilidade calcula período aquisitivo, concessivo,
  1/3 e abono, então férias **não é um cálculo trabalhista dentro do AURA** — é um período em que
  a pessoa não está. Some toda a máquina de férias e sobra uma ausência com tipo e datas.
- **Decisão 6 tira a Portaria 671 do caminho.** Com o Hexa como REP, o AURA é *software de
  tratamento* de ponto lendo o AFD — não é o registrador. Não precisa emitir comprovante, nem gerar
  AFD próprio, nem garantir inviolabilidade de hardware. **Confirmar com a contabilidade antes de
  fechar a fatia 4** — é o desenho padrão, mas é uma afirmação sobre a lei, não sobre o código.
- **Decisão 7 mantém o risco baixo.** Sem salário, a ficha completa é dado cadastral comum. Ainda
  assim, documentos e CPF pedem a fatia 0 de segurança feita primeiro.
- **Decisão 5 mantém a escala como módulo.** Se travasse, viraria core e um bug nela pararia a
  distribuição de faxina.

---

## 3. O modelo proposto

### 3.1 Três camadas, não quatro fontes

```
  PADRÃO          a jornada contratual da pessoa (6x1, 12x36, 5x2, custom, sem jornada fixa)
     ↓            versionado em LINHAS, com vigência — não num array dentro de JSON
  AUSÊNCIA        períodos em que a pessoa não está (férias, atestado, folga, afastamento, falta)
     ↓            uma entidade só, com tipo — não 5 tabelas nem texto livre em `reason`
  ESCALA          o dia materializado: uma linha por pessoa por dia
     ↓            = padrão − ausências + exceções pontuais
  REALIZADO       as batidas (AFD do Hexa) — já existe, `time_clock_events`
```

### 3.2 Por que materializar

Hoje o dia é **calculado** no navegador de cada pessoa, e por isso nada é consultável. Materializar
uma linha por pessoa/dia custa **~11.700 linhas por ano** para 32 pessoas — irrelevante para o
Postgres, e transforma toda pergunta agregada numa query trivial:

- horas previstas de setembro, por pessoa e por setor
- quem trabalha no domingo do casamento
- quem está escalado num dia em que está de férias (hoje: impossível detectar)
- previsto × realizado do mês, contra o AFD
- quantas folgas a Grazi tirou no trimestre

O gerador de padrão continua existindo — ele passa a **preencher a tabela** em vez de rodar em 11
lugares. A escala materializada é a fonte da verdade; o padrão é como ela nasce.

### 3.3 Tabelas

Nomes propostos; colunas em camelCase com aspas, seguindo a convenção do repositório.

**`work_pattern_templates`** — o modelo de jornada reutilizável. **Nasce da medição**, não de
teoria: das 16 pessoas com escala hoje, **9 camareiras são 6x1 `08:20–16:20` idêntico** e **4 da
recepção são 12x36 `08:30–20:30` idêntico**. O horário é digitado pessoa por pessoa, 13 vezes o
mesmo. Com modelo, configura-se "Camareira padrão" uma vez, anexa-se a pessoa, e mudar o horário
do setor muda todo mundo de uma vez.

```
id · propertyId · name          ex: "Camareira padrão", "Recepção 12x36"
  (mesmos campos de recorrência de staff_work_patterns)
archivedAt
```

**`staff_work_patterns`** — o padrão versionado da pessoa. Substitui `scheduleConfig.history`,
`staff_schedules` e `staff_schedule_checkpoints`.

```
id · staffId · propertyId
templateId       fk opcional — herda do modelo, com campos locais sobrepondo
patternType      'none' | 'cycle' | 'weekly' | 'monthly'    ← ver 3.5
startTime · endTime
cycleOnDays · cycleOffDays     'cycle': 6x1 = 6/1 · 12x36 = 1/1 com turno de 12h · 5x2 = 5/2
cycleReferenceDate             âncora do ciclo (absorve o papel do checkpoint)
weekdays                       'weekly': int[] — {1,2,3,4,5} para seg-sex
monthlyRule                    'monthly': jsonb — {"nth": 1, "weekday": 0, "action": "off"}
weekdayTimeOverrides           jsonb — horário diferente por dia da semana
effectiveFrom · effectiveTo    ← A MUDANÇA CENTRAL: vigência em coluna, não em array
note · createdBy · createdAt
```

Uma linha por versão. As 18 versões da Grazi viram 18 linhas consultáveis. O checkpoint deixa de
ser uma tabela separada: mudar a âncora do ciclo é criar uma nova vigência.

`patternType = 'none'` é o estado explícito **sem jornada fixa** — os 8 da direção/admin deixam de
aparecer como pendência para sempre.

**`staff_absences`** — férias, atestado, folga, afastamento, falta, banco de horas.

```
id · staffId · propertyId
type       'ferias' | 'atestado' | 'folga' | 'afastamento' | 'falta' | 'banco_horas' | 'outro'
startDate · endDate       ← período, não um dia (é o que `staff_schedule_overrides` não sabia fazer)
isPartialDay · startTime · endTime    ← saída ao médico às 14h não vira dia inteiro
status     'prevista' | 'confirmada' | 'cancelada'
reason · documentUrl      ← o atestado escaneado
createdBy · createdAt · updatedAt
```

Substitui `staff_schedule_overrides` inteiro. `Folga`, `Banco de horas` e `Rodízio` deixam de ser
string num campo de motivo.

**`staff_shifts`** — o dia materializado.

```
id · staffId · propertyId · date
isWork      boolean
startTime · endTime
plannedMinutes
origin      'pattern' | 'absence' | 'manual'   ← de onde este dia veio
absenceId   fk quando origin='absence'
note · updatedBy · updatedAt
unique (staffId, date)
```

**`schedule_periods`** — o estado de publicação de um mês (ver 3.6).

```
id · propertyId · month          'YYYY-MM'
status      'rascunho' | 'publicada'
publishedAt · publishedBy
unique (propertyId, month)
```

**`staff` — colunas novas** (ficha, fatia 5): `exitDate`, `exitReason`, `department`, `documentId`
(CPF), `contractType`. `scheduleType` e `scheduleConfig` são **removidas** depois que a fatia 1
migrar as 19 pessoas para `staff_work_patterns`.

### 3.4 O endpoint que mata os 11 call sites

```
GET /api/admin/rh/escala?from=&to=&staffId=      grade de um período
GET /api/rh/meu-dia                              a linha do app de campo — 1 request, não 3
GET /api/admin/rh/quem-trabalha-hoje             para a governanta distribuir faxina (decisão 5)
```

Toda a lógica em `src/services/hr-service.ts`. `src/lib/schedule-calculator.ts` deixa de ser
importado por página nenhuma — vira função interna do service que **gera** a materialização.

### 3.5 As quatro formas de recorrência

Pesquisa do `escala.app` (03/09/2026 — ver seção 9). Eles suportam quatro maneiras de expressar
"quando esta pessoa trabalha", e **a nossa produção provou que precisamos de pelo menos três**:

| Forma | O que expressa | Prova de que precisamos |
|---|---|---|
| `cycle` — ciclo | trabalha X dias, folga Y | 6x1 (9 pessoas), 12x36 (4), 5x2 (2) |
| `weekly` — regra semanal | "todas as segundas", "seg a sex" | é o que `fixedDayOff` tenta fazer com meio campo |
| `monthly` — definição mensal | "o primeiro domingo do mês", "o 4º domingo folga" | **`reason = 'Domingo Mes'` existe em produção como texto livre**, e `sundayOffCycle` é um booleano que resolve um caso só |
| `none` — sem jornada fixa | direção, admin | 8 pessoas hoje aparecem como pendência eterna |

A quarta forma deles — **turno avulso que o profissional pega** — fica CORTADA nesta rodada
(decisão 4, sem autoatendimento de pedido). Registrada porque temos um `Camareira - Freela` no
cadastro: o dia em que freelas entrarem na escala, é este o modelo.

### 3.6 Rascunho → Publicada

O conceito de UX que mais falta hoje. A escala atual é sempre "ao vivo": mexeu numa célula, já
vale, e ninguém sabe quando o mês ficou pronto.

- A pessoa que monta trabalha o mês inteiro em **rascunho**, com calma.
- **Publicar** é um ato único: notifica o time e passa a valer para os apps de campo.
- Antes de publicar, o app de campo mostra o mês anterior — nunca meio mês montado.
- Republicar um mês já publicado avisa quem teve o dia alterado, e só essas pessoas.

Isso é o que faz o time confiar na escala — e é o que faltou para a de abril ser adotada.

---

## 4. As fatias

### Fatia 0 — higiene (bloqueante, pequena)

Antes de qualquer dado novo encostar nessa família de tabelas:

1. Trocar `staff_schedule_overrides_select` por política escopada em `propertyId` — ou, já que a
   tabela vai morrer, negar tudo fora de `service_role` (é o que `time_clock_events` já faz).
2. Resolver as 4 contas de teste — desativar ou remover.
3. Resolver as 4 contas do Arthur.
4. Corrigir os 2 `hireDate = 0001-01-01` e preencher os 7 sem data de admissão.
5. Cadastrar as 4 pessoas que faltam (Bruna, Drika, Marcelo, Michel).

Os itens 2–5 são operação, não código. Podem rodar em paralelo com a fatia 1.

### Fatia 1 — modelo + tela do mês *(a escolhida para começar)*

- Migration: cria as tabelas; migra os 19 `scheduleConfig` (com seu `history`) para linhas de
  `staff_work_patterns`; cria os modelos "Camareira padrão" (6x1 08:20–16:20, 9 pessoas) e
  "Recepção 12x36" (08:30–20:30, 4 pessoas) e anexa quem já bate com eles; **zera**
  `staff_schedules`, `staff_schedule_overrides` e `staff_schedule_checkpoints` (decisão 10).
- `hr-service.ts`: gerador que materializa `staff_shifts` a partir do padrão, respeitando
  ausências. A tabela `staff_absences` **nasce nesta fatia** (o gerador precisa dela) mesmo com a
  UI vindo na fatia 3 — sem isso a materialização nasce errada e teria que ser refeita.
- `/admin/rh` com abas: **Visão geral · Pessoas · Escala · Ponto · Ausências**. Redirects de
  `/admin/hr`, `/admin/escalas`, `/admin/escalas/mensal`, `/admin/staff` e `/admin/ponto`.
- Trocar os 11 call sites por `/api/rh/meu-dia` — 1 requisição no lugar de 3.
- Identidade visual: a página nasce no padrão de `concierge`/`casamentos`/`hr` (tokens T, dark
  glass + gradiente), conforme a regra de identidade do admin.

**A tela do mês é um EDITOR DE EXCEÇÕES, não um construtor de grade.** É o requisito de
simplicidade, e ele decide o desenho inteiro:

- **Ninguém começa de tela em branco.** O mês abre já gerado do padrão. Com ~20 pessoas de padrão
  real, o mês tem ~600 células e talvez 15 exceções — o trabalho é 2,5% do que a grade sugere. Se a
  pessoa tiver que preencher 600 células, nenhuma interface salva.
- Uma linha por pessoa, uma coluna por dia; cor para trabalho, folga e ausência.
- Clicar numa célula abre um menu curto — Folga · Férias · Atestado · Mudar horário — não um
  formulário.
- Faixa de alertas acima da grade, cada alerta clicável levando à célula: sem folga na semana,
  mais de 6 dias seguidos, menos de 11h entre turnos, escalado num dia de ausência, setor
  descoberto no sábado. **Alerta, nunca bloqueio** (decisão 5).
- Cabeçalho com o placar do mês (pessoas · conflitos · sem padrão) e o botão **Publicar** (3.6).
- Verbo **Replicar mês anterior**, para o que o padrão não cobre.

### Fatia 2 — a escala que o setor pede

O que a decisão 1 exige e o gerador de padrão não cobre: governança e salão variam com ocupação e
evento. Sugestão de dimensionamento a partir das estadias confirmadas e dos eventos do dia — a
escala **propõe** quantas camareiras o sábado pede, e a pessoa que monta aceita ou muda.

### Fatia 3 — ausências na interface

Lançar férias, atestado, folga e afastamento por período; férias em lote por departamento;
anexo do atestado. Aviso na operação: "a Rosi está de férias até 12/10".

### Fatia 4 — import do AFD do Hexa

Fase 2 do ponto. A tabela já está pronta para isso (`repSerial` + `nsr` tornam a reimportação
idempotente — o AFD é cumulativo e reimportar o mesmo arquivo é o caso normal). Fechamento do mês
com **previsto × realizado**: a escala materializada de um lado, as batidas do outro.
**Confirmar com a contabilidade** a premissa da decisão 6 antes de começar.

### Fatia 5 — ficha do funcionário

Admissão, desligamento com data e motivo, cargo com histórico, departamento, documentos, contrato.
Sem salário (decisão 7).

### Fatia 6 — gestão de gente

Turnover, custo de escala por setor, avaliação, advertência, treinamento. Depende das fatias 1 e 5
estarem com dado limpo — não antes.

---

## 5. O que foi CORTADO

Registrado para ninguém reabrir por engano:

- **Cálculo de período aquisitivo/concessivo de férias.** A contabilidade faz (decisão 8). O AURA
  não alerta vencimento, não calcula 1/3, não trata abono nem fracionamento legal.
- **Folha de pagamento.** Não entra. Nem salário, nem holerite, nem cálculo de rescisão.
- **O AURA como REP.** O relógio Hexa é o registrador (decisão 6). Sem comprovante de batida, sem
  AFD próprio, sem exigência de inviolabilidade.
- **Pedido de folga/troca/férias pelo funcionário.** O app mostra a escala e bate ponto; não abre
  fluxo de solicitação e aprovação (decisão 4). Isso muda o desenho o suficiente para virar fatia
  própria no futuro.
- **Escala travando a operação.** Sugere e avisa, não bloqueia (decisão 5).
- **Migrar os 30 registros antigos de escala.** Zerar (decisão 10).

---

## 6. Como cada regra da modularização é cumprida

| Regra (`docs/MODULARIZATION.md` §1) | Como |
|---|---|
| 1. Módulo novo nasce com flag | Nova chave `rh` (`hasRH`, `defaultOn: false`) em `src/lib/modules.ts` + allowlist em `property-settings.ts`. `ponto` já existe |
| 2. Fluxo core nunca depende duro de tabela de módulo | A aba **Pessoas** é **core** (toda propriedade tem funcionário) e não lê `staff_shifts`. Escala e Ausências são gated por `rh`; Ponto por `ponto`. A sugestão de escala na distribuição de faxina passa por check suave, padrão `stock-integration.ts` — governança funciona igual com o módulo desligado |
| 3. Cron novo nasce com gate | A materialização diária de `staff_shifts` (cron) checa `isModuleOn(settings, 'rh')` no loop de propriedades |
| 4. Decisão de fronteira vai para o arquivo | Esta tabela |
| 5. Chave só nasce na fatia que a APLICA | `hasRH` nasce na fatia 1, junto do `<ModuleGuard>` na página e do gate na API. Não antes |
| 6. Chave nova vem com backfill explícito | A migration da fatia 1 grava `hasRH = true` na Fazenda do Rosa e `false` nas outras — nada implícito |
| 7. Nada de acesso a `guests` sem `propertyId` | Não se aplica: RH não toca `guests`. Mas a mesma disciplina vale para `staff` — toda query nova escopada por `propertyId` |

---

## 7. Perguntas abertas

1. **A premissa da Portaria 671 está certa?** Com o Hexa como REP, o AURA é software de tratamento
   e não registrador. É o desenho padrão, mas é uma afirmação sobre a lei — **a contabilidade
   confirma antes da fatia 4.**
2. **Qual o formato do AFD que o Hexa exporta**, e como o arquivo chega até aqui (pendrive, rede,
   portal do fabricante)? Define se a fatia 4 é upload manual ou integração.
3. **Como a escala de governança e salão é decidida hoje na prática?** A decisão 1 diz que varia
   com ocupação e evento — a fatia 2 precisa saber a regra de bolso ("um sábado de 20 cabanas
   ocupadas pede quantas camareiras?").
4. **Os 4 técnicos e camareiras que faltam têm jornada qual?** Precisa antes da fatia 1 para a
   materialização nascer completa.
5. **Departamento existe como conceito, ou `role` basta?** A fatia 6 (custo por setor) depende
   disso, e hoje não há coluna.

---

## 8. Armadilhas medidas

- **O `history[]` dentro do JSON tem 18 níveis numa pessoa.** A migration da fatia 1 tem que
  desempilhar isso corretamente — inclusive o `getEffectiveConfig` atual
  (`schedule-calculator.ts:48`) usa uma lógica de "primeiro item cujo `endDate >= data`", que é
  sutil e precisa ser reproduzida ou explicitamente corrigida, não reinventada por acidente.
- **Os apps de campo quebram se os 3 endpoints sumirem antes do substituto.** Trocar os 11 call
  sites e só então remover as rotas antigas.
- **`staff` tem 4 contas do mesmo Arthur.** Qualquer contagem de RH ("32 ativos") está errada até
  a fatia 0 rodar.
- **`time_clock_events` e `staff_schedule_checkpoints` têm RLS ligada com zero políticas.** Isso
  nega tudo fora de `service_role` — está correto e deve ser preservado, não "consertado".
- **Não religar nada de escala automática antes da fatia 2.** Mesmo erro do cron
  `housekeeping-routines` registrado em `docs/HOUSEKEEPING-V2.md`.

---

## 9. Pesquisa: o que o `escala.app` faz (03/09/2026)

Levantado a pedido do fundador, com a pergunta certa: **o que torna a criação de escala simples?**

**O que é.** Criado em 2015 no laboratório de inovação do Hospital Albert Einstein. Hoje ~130 mil
profissionais, dois produtos: **Jornadas** (CLT — 12x36, 6x1, 5x2 e mais 13 tipos) e **Plantões**
(plantonista/freela, com vaga que o profissional pega e check-in pelo celular). **Preço não
publicado — venda consultiva.** Não é produto que se assina para 32 pessoas, e a comparação de
comprar-vs-construir não se sustenta: o valor aqui é o cruzamento com ocupação, eventos, ponto e
os apps de campo, que nenhum sistema de fora tem.

### O que ADOTAMOS

| Deles | Onde entrou aqui | Por quê (com prova nossa) |
|---|---|---|
| Quatro formas de recorrência (ciclo · semanal · mensal · vaga) | §3.5 | `reason = 'Domingo Mes'` existe em produção como texto livre — alguém precisou de recorrência mensal e não tinha onde |
| Escala-base replicada, não montada do zero | §3.2 + verbo "Replicar mês anterior" | confirma a decisão de materializar; acrescenta o verbo que faltava |
| Rascunho → Publicada | §3.6 | é o que faltou para a escala de abril ser adotada |
| Alertar infração, nunca bloquear | Fatia 1 (faixa de alertas) | bate com a decisão 5 |
| Dimensionamento (setor sobre/subdimensionado) | Fatia 2 | **aqui temos sinal melhor que o deles**: um hospital não sabe quantos pacientes chegam sábado; nós sabemos a ocupação e os eventos com semanas de antecedência |

### O que NÃO adotamos

- **Os 16 tipos de escala.** Produção tem três: 6x1 (9), 12x36 (4), 5x2 (2). Um menu de 16 opções
  deixa a tela mais difícil, não mais fácil. Nascemos com `cycle`/`weekly`/`monthly`/`none`, que
  cobrem os três e ainda o `Domingo Mes`.
- **Motor de conformidade CLT que bloqueia.** Decisão 5 (sugere) e decisão 8 (contabilidade cuida).
- **Troca entre funcionários e pedido de folga pelo app.** Decisão 4.
- **Painel financeiro por profissional.** Decisão 7 (sem salário).
- **Vaga avulsa que o profissional pega.** Cortada nesta rodada, mas registrada: temos um
  `Camareira - Freela` no cadastro, e é este o modelo no dia em que freelas entrarem na escala.

### O que veio dos NOSSOS dados, não deles

**Modelo de jornada reutilizável** (§3.3, `work_pattern_templates`). 9 camareiras com 6x1
`08:20–16:20` idêntico e 4 recepcionistas com 12x36 `08:30–20:30` idêntico — o horário é digitado
13 vezes. Nenhuma pesquisa apontou isso; o `SELECT` apontou.

**Fontes:** [escala.app](https://escala.app) · [escalas flexíveis](https://escala.app/escala-de-trabalho/escalas-flexiveis/) · [como funciona o app](https://escala.app/blog/aplicativo-de-escala-de-trabalho/) · [gerador de escala](https://escala.app/blog/gerador-de-escala/) · [como usar](https://escala.app/blog/escala-como-usar/) · [tipos de escala](https://escala.app/escala-de-trabalho/)

---

## 10. O que foi construído — fatias 0 e 1 (03/09/2026)

Executado no mesmo dia do plano. **No DEV; ainda não foi para o `main`.** Branch `rh-v2`,
cinco commits. As migrations `hr_fatia0_rls_escalas.sql` e `hr_fatia1_modelo.sql` estão
registradas em `migrations/README.md`.

### Feito

| O quê | Onde |
|---|---|
| **Fatia 0 — o vazamento de RLS**, aplicado em DEV **e em produção** | `migrations/hr_fatia0_rls_escalas.sql` |
| Modelo novo: 5 tabelas, migração dos 19 configs, zeragem do velho, flag `hasRH` com backfill | `migrations/hr_fatia1_modelo.sql` |
| Motor puro da escala (duas bases + regras, contas de data em UTC) | `src/lib/schedule-engine.ts` |
| Service: materialização, grade do mês, alertas, publicação, ausências | `src/services/hr-service.ts` |
| API do admin (grade, padrões, modelos, ausências, dias) e `/api/rh/meu-dia` | `src/app/api/admin/rh/`, `src/app/api/rh/meu-dia/` |
| Cron diário que mantém três meses rolando, com gate de módulo | `src/app/api/cron/rh-materialize/` + `vercel.json` |
| `/admin/rh` — grade do mês, menu curto da célula, jornada em 3 perguntas, avisos, publicar | `src/app/admin/rh/` |
| Os 11 call sites trocados por um endpoint | apps de campo, perfil, painel de gestão, `/director` |
| Modelo velho removido | `schedule-calculator.ts`, 3 rotas e 10 métodos do `StaffService` |

### Provas rodadas, não afirmadas

> **A primeira versão desta seção afirmava "zero divergências em 6.935 dias-pessoa" — e a prova
> era CEGA.** Ela rodou depois de a própria migration ter esvaziado `staff_schedule_checkpoints`,
> então os dois motores caíam no mesmo fallback e o defeito que existia ali era invisível para
> ela. Uma revisão adversarial dos commits encontrou isso. A prova foi refeita com os 11
> checkpoints reais lidos de produção, e o número abaixo é o da versão que enxerga o caso.
>
> A lição vale além deste doc: **prova de equivalência não pode rodar depois da migração que
> destrói um dos lados.**

- **O motor novo reproduz o velho: zero divergências em 6.935 dias-pessoa** (19 pessoas × 365
  dias), com os checkpoints alimentando o calculador antigo. O mesmo arreio, rodado SEM os
  checkpoints, dá 834 divergências — Rodrigo e Romina em 365 de 365 dias cada, mais 26 em cada
  um dos quatro 6x1 — que é exatamente o defeito que a versão anterior deixou passar.
- **A invariante do ajuste manual está de pé.** Um dia marcado como `manual` no banco, cron
  rodado em seguida: `gravados: 1546, preservados: 1`, e a linha ficou intacta.
- **O gate de módulo funciona no cron**: 2 propriedades puladas, 1 processada.
- **`/api/rh/meu-dia` sem sessão responde 401.**
- `pnpm build` limpo; `tsc --noEmit` limpo.
- Setembro materializado no DEV: 1.547 dias. Luciane 215,6h em 22 dias; as quatro da recepção
  180h em 15 dias cada; 10 ou 11 pessoas em cada domingo. **Nenhuma dessas perguntas tinha
  resposta antes.**

### Onde o desenho mudou depois de ler o código

1. **Não existe coluna `scheduleType`.** `schedule-calculator.ts` mostrou que os três tipos não
   são a mesma coisa: `6x1` é regra semanal mais uma regra periódica de domingo, `5x2` é regra
   semanal, e só `12x36` é ciclo. São duas **bases** (`weekly`/`cycle`) e uma lista de **regras**.
   O `monthly_weekday_off` é o que dá casa ao `Domingo Mes`.
2. **O `history` não foi migrado.** Ele parece versionamento e é log de save: a Grazi tem 18
   itens com 5 configurações distintas, sete idênticos ao atual, com `endDate` fora de ordem —
   o que já torna arbitrária a escala que o sistema mostra para o passado. Migrou-se o config
   atual, vigente de 01/09/2026, e o blob cru ficou em `legacyConfig`.
3. **O modelo de jornada guarda tipo e horário, não o dia de folga.** A leitura inicial dizia
   "9 camareiras idênticas"; o `SELECT` mostrou que seis compartilham 6x1 08:20–16:20 mas **cada
   uma folga num dia diferente** — que é como um time 6x1 cobre os sete dias. Pôr a folga no
   modelo colocaria o time inteiro de folga junto.
4. **Quem não tem jornada não gera linha.** Gravar 30 dias de `isWork=false` para um diretor faz
   o relatório dizer "30 folgas" onde a verdade é "não tem escala" — eram 819 linhas por
   trimestre de dado que mentia.
5. **`meu-dia` calcula na hora quando o mês ainda não foi gerado.** Sem esse fallback, esquecer
   de rodar o gerador apagaria a linha de turno de todo mundo antes de alguém perceber.
6. **Gate de módulo por ABA, nunca na página.** `/admin/rh` é `ROLE_HOME` de admin e manager: um
   guard de página que redirecionasse para a home entraria em loop de login. Pelo mesmo motivo o
   item do menu não leva `module: "rh"`.

### Defeitos de terceiros encontrados no caminho

Todos consertados junto, nenhum era do escopo:

- **A data saía do relógio do aparelho.** Os cinco apps de campo montavam o dia com
  `toISOString()`; depois das 21h em BRT isso já era o dia seguinte em UTC, e a pessoa via a
  escala de amanhã achando que era a de hoje.
- **A semana da camareira caía no ano errado** quando atravessava o Ano-Novo: a grade era
  remontada com `today.getFullYear()`.
- **Os painéis mostravam como "trabalhando" quem estava de férias** — o cálculo antigo só
  conhecia o padrão.
- **`/admin/escalas` e `/admin/escalas/mensal` passavam os overrides do período inteiro** onde a
  função esperava os do dia (ela faz `find` por `staffId` sem olhar data). Morreu com as telas.
- **O card de escala do perfil lia `staff_schedules` pelo client do browser** — o padrão que
  pendura no lock frio.

### Onde o escopo ficou menor do que o plano dizia — e por quê

- **As abas são Escala · Jornadas · Ausências**, com Ponto como link para `/admin/ponto`.
  `/admin/hr` (o painel) e `/admin/staff` (o cadastro) continuam nas rotas delas. Engolir o
  módulo de Ponto — em produção desde 01/09 com folha real carregada — no mesmo commit que
  reescreve o modelo de escala é risco sem ganho. Os dois já leem o modelo novo.
- **Os tipos do RH foram para `src/types/hr.ts`**, não para `aura.ts`. São cinco tabelas novas,
  o `aura.ts` já passa de 1.200 linhas (`docs/REFACTORING.md` quer justamente parti-lo) e ele
  estava com trabalho em andamento não commitado.
- **A fatia 0 está pela metade, e o resto é operação, não código.** Falta: desativar as 4 contas
  de teste, resolver as 4 contas do Arthur, corrigir os 2 `hireDate = 0001-01-01` e os 7 sem data
  de admissão, e cadastrar a jornada de Bruna, Drika, Marcelo e Michel. Só o Arthur pode decidir
  cada uma.

### Antes de subir para produção

1. `pnpm db:sql migrations/hr_fatia1_modelo.sql --target prod` — **antes** do deploy do código.
   A migration zera as três tabelas velhas, e o código velho em produção ainda as lê: rodar na
   ordem inversa deixaria o `/admin/escalas` antigo vazio por alguns minutos.
2. Deploy da branch.
3. Rodar `/api/cron/rh-materialize` uma vez à mão para gerar o trimestre.
4. Conferir a grade de setembro em `/admin/rh` e publicar o mês.


---

## 11. Revisão adversarial dos commits (03/09/2026)

Seis lentes independentes sobre o diff dos seis primeiros commits, cada achado passando por
dois céticos instruídos a REFUTAR. **26 achados brutos, 15 confirmados, 11 refutados** — os 15
são 11 defeitos distintos, alguns encontrados por mais de uma lente.

Todos consertados no mesmo dia (commit `1bea4d4`, mais `8d90ae0` e `a58abe7`, que eu mesmo
achei antes).

| # | Defeito | Onde |
|---|---|---|
| 1 | **A migration lia o `cycleReferenceDate` do jsonb e ignorava o checkpoint** — que é quem vence, e que ela apagava no mesmo script. 9 das 19 pessoas; Rodrigo e Romina com a paridade do 12x36 invertida em todos os dias | `hr_fatia1_modelo.sql` |
| 2 | Salvar a jornada fazia UPDATE na vigência atual em vez de criar uma nova: histórico nunca acumulava, e o começo do mês virava folga | `hr-service.ts` · `PadraoDialog.tsx` |
| 3 | Salvar apagava `weekdayTimeOverrides` (o domingo do Davi caía de 8h para 4h, sem aviso e sem desfazer) | `PadraoDialog.tsx` |
| 4 | Replicar copiava o mês inteiro como `manual`, trazendo férias antigas e **congelando o mês contra qualquer ausência futura** | `hr-service.ts` |
| 5 | Ausência para quem não tem jornada materializava o trimestre inteiro como folga | `hr-service.ts` |
| 6 | Apagar a ausência deixava os dias no banco para sempre | `hr-service.ts` |
| 7 | Gerar um mês anterior à vigência gravava a equipe toda folgando | `hr-service.ts` |
| 8 | `section=padroes` com `staffId` lia jornada de outra propriedade | `api/admin/rh/route.ts` |
| 9 | O gate do `meu-dia` olhava só o cargo primário e barrava as 3 governantas de cargo secundário | `api/rh/meu-dia/route.ts` |
| 10 | "Próxima folga" apontava **amanhã** para as 17 pessoas sem jornada | `ProfileView.tsx` |
| 11 | O rótulo da escala no perfil lia `staff.scheduleType`, coluna que ninguém mais escreve | `ProfileView.tsx` |
| 12 | Replicar deixava os últimos 2–3 dias do mês sem cópia | `hr-service.ts` |
| 13 | O clique na aba Ponto disputava com a própria navegação | `admin/rh/page.tsx` |

### O que essa rodada ensinou sobre o próprio método

Dois dos defeitos (1 e 12) são do mesmo tipo: **uma conta que parece certa e que a prova
existente não conseguia enxergar**. A prova de equivalência rodava sobre um banco onde a
migration já tinha apagado o outro lado; a de replicação nunca foi escrita. Nos dois casos o
código estava comentado com confiança, e o comentário não é prova.

O padrão que funcionou: comparar os dois motores dia a dia sobre o **dado real**, e rodar a
comparação também na configuração em que ela deveria FALHAR. Se a prova não sabe falhar, ela
não está provando nada.

### Reprovado no DEV depois dos consertos

- Equivalência com checkpoints: **0 divergências**; sem eles, **834** (a prova enxerga o caso).
- Ausência para quem não tem jornada: **1 linha** gravada, não 92.
- Apagar essa ausência: `apagados: 1`, zero linhas fantasma.
- Ajuste manual: `preservados: 1`, linha intacta.
- Zero linhas com `note = 'Sem padrão'` no banco.
- Replicação: 0 dias sem cópia e 0 dias da semana trocados nos cinco pares que quebravam.
