# Motor de faxinas — estudo do modelo

> **Status: ESTUDO, não iniciado.** Levantamento de 01/09/2026, com medição em produção.
> Não implementar nada daqui antes das decisões da última seção.

## O problema, medido

A pergunta que abriu o estudo foi do Arthur: *"as governantas estão delegando em cima das tarefas
criadas automaticamente ou estão criando à mão?"* — medida em produção, não estimada.

**Um mês (01/08 a 01/09/2026), 631 tarefas em `housekeeping_tasks`.**

> ⚠️ **Correção de 01/09, mesma tarde.** A primeira leitura destes números foi **errada** e chegou a
> ser commitada: eu contei todo `status='cancelled'` como rejeição humana e concluí que "metade das
> automáticas é cancelada, o motor erra o dobro de um humano". **Não é.** A maior parte daqueles
> cancelamentos é o próprio sistema encerrando tarefa que ficou obsoleta — e isso é o desenho
> funcionando, não falhando. O que segue já está reclassificado.

**Dois cancelamentos automáticos, ambos corretos, que inflavam a conta:**
- `/api/admin/stays/[id]` no check-out cancela a `daily` pendente da cabana e a substitui pela
  faxina de saída (`observations: "Cancelada automaticamente por Check-out"`) — **37 casos**.
- `closeObsoleteCheckinInspections` encerra a vistoria de check-in que perdeu a validade
  ("check-in já realizado", "Pular Faxina" pela recepção) — **37 casos**.

**O quadro real, separando sistema de gente:**

| | Criadas | Canceladas pelo sistema | Canceladas por gente | **Rejeição humana** |
|---|---|---|---|---|
| Automáticas (têm `ruleId`) | 280 | 74 | 31 | **11 %** |
| À mão (sem `ruleId`) | 351 | 28 | 64 | **18 %** |

**A conclusão se inverteu: o motor NÃO está sendo rejeitado.** As pessoas descartam tarefa
automática *menos* (11 %) do que descartam a que elas mesmas criaram (18 %). As regras que pareciam
piores — `daily` (52 % bruto) e `inspection_checkin` (50 % bruto) — caem para **12 %** e
**praticamente zero** de rejeição humana quando se tira o encerramento automático.

**O que continua de pé, e é o fato interessante:** **56 % das tarefas são criadas à mão** (351 contra
280). Isso não é contorno do motor — é volume de trabalho avulso que nenhuma regra cobre. A pergunta
deixa de ser "por que rejeitam o motor" e passa a ser **"o que são essas 351, e alguma regra as
cobriria?"**.

**Quem cancela** (98 cancelamentos com autor na auditoria, desde 01/08): **Sandra 65**, Arthur 28,
Rosi 3, Grazi 2. Das 64 tarefas que a Sandra cancelou, **41 eram criadas à mão** — a maior fatia,
22, do tipo `custom`. Ou seja: o churn está no fluxo manual, não no motor.

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

**Sendo honesto: o dado NÃO sustenta isso como conserto de um problema.** Com 11 % de rejeição
humana, o motor acerta quase sempre — trocar criação por sugestão adicionaria um passo de aceite a
~250 tarefas por mês para filtrar ~31. O custo operacional é maior que o ganho.

**Onde a ideia continua fazendo sentido:** como **instrumentação**, não como filtro. Hoje o motor não
tem métrica própria — foi preciso escavar auditoria e texto de observação para descobrir que ele vai
bem. Um campo simples de "por que cancelou" no ato do cancelamento resolveria isso com uma fração do
atrito, e serviria tanto para tarefa automática quanto manual. Vale considerar isso antes de mexer
no fluxo de criação.

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
