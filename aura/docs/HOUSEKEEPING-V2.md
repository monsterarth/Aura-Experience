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
