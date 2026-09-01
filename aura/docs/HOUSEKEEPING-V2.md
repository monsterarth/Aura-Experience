# Motor de faxinas — estudo do modelo

> **Status: ESTUDO, não iniciado.** Levantamento de 01/09/2026, com medição em produção.
> Não implementar nada daqui antes das decisões da última seção.

## O problema, medido

A pergunta que abriu o estudo foi do Arthur: *"as governantas estão delegando em cima das tarefas
criadas automaticamente ou estão criando à mão?"* — medida em produção, não estimada.

**Um mês (01/08 a 01/09/2026), 631 tarefas em `housekeeping_tasks`:**

| | Criadas | Canceladas | Taxa |
|---|---|---|---|
| Automáticas (têm `ruleId`) | 280 | 105 | **37 %** |
| — só `daily` (diária de estadia ativa) | 92 | 48 | **52 %** |
| — só `inspection_checkin` (vistoria) | 74 | 37 | **50 %** |
| À mão (sem `ruleId`) | **351 (56 % do total)** | 92 | 26 % |

**Duas leituras, e as duas incomodam:**

1. **A governança cria mais tarefa à mão do que o motor inteiro** (351 × 280). O motor não é o
   caminho principal; é um ruído que se contorna.
2. **Metade das automáticas de `daily` e de vistoria é cancelada**, contra 26 % das manuais. O motor
   erra com o dobro da frequência de um humano — e não tem como saber, porque criar e ser cancelado
   não é sinal que volte para lugar nenhum.

## Como o motor funciona hoje

Seis gatilhos em `src/lib/housekeeping-rule-engine.ts`, cada um com **1 regra** cadastrada:

| Gatilho | Quem aplica | Estado |
|---|---|---|
| `on_checkout` | `applyOnCheckout`, na rota `/api/admin/stays/[id]` do checkout | vivo |
| `stay_duration_days` | dentro de `applyDailyRules` | vivo |
| `active_stay_daily` | `applyDailyRules` → cron `daily-housekeeping` | vivo |
| `on_checkin_day` | `applyCheckinDayRules` → cron `daily-housekeeping` | vivo |
| `on_checkout_day` | `applyCheckoutDayRules` → cron `daily-housekeeping` | vivo |
| `fixed_interval_days` | `applyFixedIntervalRules` → cron `housekeeping-routines` | **órfão** |

**O gatilho órfão:** o cron `housekeeping-routines` não está no `vercel.json` e nenhum cron externo o
chama (confirmado nos logs da Vercel em 01/09). A única regra desse tipo — **"Recepção", a cada 3
dias, `active: true`, criada em 07/05/2026** — está com `lastTriggeredAt: null`. Quase quatro meses,
~40 limpezas que nunca viraram tarefa. A governanta vinha criando essa tarefa manualmente, e a regra
segue aparecendo na tela de configuração como se funcionasse.

## A ideia na mesa: sugestão em vez de criação

Proposta do Arthur: o motor **propõe** e alguém aceita ou recusa, em vez de criar a tarefa direto.
O dado sustenta: metade do que ele cria é descartado, então hoje ele já produz "sugestões" — só que
com o custo de poluir a lista de trabalho de quem opera e exigir um cancelamento explícito.

**O que a mudança compra, além de menos ruído:** uma taxa de aceite. Hoje o motor não tem como saber
que erra; com aceite/recusa, a própria operação vira o termômetro de cada regra — e a regra que é
recusada 9 em 10 vezes se denuncia sozinha.

**O que precisa ser decidido no desenho** (não decidir aqui, decidir com a governanta):
- A sugestão tem prazo? Sugestão não respondida some, vira tarefa, ou fica acumulando?
- Quem aceita — só governança, ou a própria camareira?
- Recusar pede motivo? Sem motivo não há aprendizado; com motivo, há atrito.
- As 6 regras viram sugestão, ou só as de alta recusa (`daily` e `inspection_checkin`)? Vistoria de
  check-in pode ser justamente a que não deve ser opcional.

## A trava de duplicata — o achado que sustenta a direção

Proposta do Arthur (01/09): **impedir criar tarefa igual enquanto já houver uma aberta**, ou
sobrescrever a existente.

**Medido, e é grande.** Agrupando as 631 tarefas do mês por `(tipo, local, dia)`:

| | |
|---|---|
| Grupos com mais de uma tarefa idêntica | **123** |
| Tarefas excedentes | **125 — 20 % de tudo que foi criado no mês** |
| Duplicata **automática + à mão** | **106** |
| Duplicata à mão + à mão | 18 |
| Duplicata automática + automática | 1 |

**Isso explica tudo o que estava solto.** As 351 tarefas manuais: boa parte é gente recriando o que o
motor já tinha criado. Os cancelamentos humanos: é alguém matando uma das duas. E o motor
duplicando-se a si mesmo é praticamente inexistente (1 caso) — os guards internos dele funcionam. **O
buraco é entre as fontes, não dentro delas.**

Exemplos reais: `daily` na mesma cabana em 01/08 → duas, **ambas `completed`** (a faxina foi
registrada duas vezes); `inspection_checkin` em 20/08 → três, todas canceladas.

### Onde a trava tem de morar

Hoje **não existe ponto único de criação** — são 8 inserções diretas em `housekeeping_tasks`:
6 no `housekeeping-rule-engine.ts` (uma por gatilho), 1 em `HousekeepingService.createTask`
(caminho manual: admin + rotas de campo) e 1 em `stay-service.ts:713` (check-in). Qualquer trava
precisa que os 8 passem pelo mesmo lugar, senão nasce furada.

### Decisões de desenho

**1. O que é "igual"** — chave `(propertyId, type, local)`, onde local é
`cabinId ?? structureId ?? customLocation`. Foi essa chave que encontrou os 123 grupos. `stayId`
fica **fora**: duas estadias no mesmo dia na mesma cabana geram tipos diferentes (`turnover` vs
`daily`), então o tipo já separa.

**2. O que é "aberta"** — `pending`, `in_progress`, `waiting_conference` e pausada. Concluída,
cancelada e pulada não bloqueiam.

**3. Bloquear ou mostrar** — *aqui a recomendação diverge do pedido, de propósito*:
- **Motor: bloqueia em silêncio.** Máquina não deve insistir; se já há uma aberta, a regra não cria.
- **Pessoa: NÃO bloquear — mostrar.** 106 das 125 duplicatas são pessoa colidindo com o motor, e a
  causa provável é que **ela não viu a que já existia**. Bloquear sem mostrar não resolve isso: leva
  a governanta a driblar (um `customLocation` levemente diferente e a trava passa a não ver nada).
  O certo é interceptar e exibir: *"já existe uma faxina aberta nesta cabana, criada pelo sistema às
  06:00, atribuída à Fulana"* → **[Abrir essa]** ou **[Criar assim mesmo]**. Isso resolve a maioria e
  ensina sobre a minoria.

**4. Sobrescrever** — só quando a existente ainda estiver **intocada** (`pending`, sem responsável e
sem `startedAt`). Sobrescrever uma tarefa em andamento apagaria checklist preenchido e delegação já
feita — o remédio viraria a doença.

**5. Rede de segurança no banco** (fase 2) — índice único parcial em
`(propertyId, type, coalesce(cabinId, structureId, customLocation))` restrito aos status abertos.
Garante a regra mesmo se algum caminho novo escapar do service. Exige tratar o erro 23505 nos
8 pontos, então não é o primeiro passo.

### Ordem sugerida

1. `findOpenDuplicate(propertyId, type, local)` no service, e os 8 pontos passando por ele.
2. Motor: pular em silêncio quando houver aberta (e registrar que pulou, para medir).
3. UI: o diálogo "já existe — abrir ou criar assim mesmo", com o motivo quando ela insiste.
4. Medir de novo em 30 dias: as 125 excedentes têm de cair. **Se não caírem, a hipótese estava
   errada** — e o motivo coletado no passo 3 dirá qual é a certa.
5. Só então o índice único.

## Histórico de última limpeza — o dado já existe

Pedido do Arthur: saber quando cada lugar foi limpo pela última vez, **inclusive as estruturas**.

**Não falta dado, falta tela.** Já existem **957 tarefas com `finishedAt`** (702 concluídas em
cabanas, 89 em estruturas), e cada tarefa carrega `cabinId` / `structureId` / `customLocation`.
Metade da funcionalidade também já existe: `openCabinHistory` no `/governanta` mostra o histórico
por cabana (limit 40).

**Falta:** o equivalente para **estruturas**, e uma visão de "último toque por lugar" — uma lista de
todos os lugares ordenada por quanto tempo faz que ninguém limpa. É consulta e tela, não migration.

## O que NÃO fazer

**Não religar o cron `housekeeping-routines` antes de decidir o modelo.** Ligar hoje só somaria mais
tarefa automática num sistema onde metade delas já é cancelada — pioraria exatamente o sintoma que
este estudo quer resolver. A regra da Recepção é o caso de teste ideal quando o modelo estiver
definido: é conhecida, é pequena, e a governanta já sabe o que espera dela.

## Perguntas que dependem da operação, não do código

1. Por que metade das `daily` é cancelada? A regra está errada (cria em dia que não devia), ou a
   camareira já limpou e a tarefa chegou depois? São consertos opostos.
2. A vistoria de check-in cancelada em 50 % — está sendo feita e não registrada, ou não está sendo
   feita? Se for o segundo, o problema não é de software.
3. As 351 tarefas manuais: são coisas que uma regra cobriria (e então faltam regras), ou são
   genuinamente avulsas (e então o motor está no tamanho certo, só barulhento)?

A resposta dessas três muda o desenho inteiro. Vale sentar com a governanta antes de escrever
qualquer linha — a medição diz **que** há um problema, não **qual**.
