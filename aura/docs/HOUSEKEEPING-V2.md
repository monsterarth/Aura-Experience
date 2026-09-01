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

### O que foi implementado (01/09/2026)

Passos 1 a 3 feitos; falta medir e, depois, o índice.

- **`src/lib/housekeeping-duplicates.ts`** — `findOpenDuplicate()`, a lista de status abertos e o
  `DuplicateTaskError`. Fica em `lib` porque o motor e o service são os dois consumidores e um
  importar o outro criaria ciclo. Falha de consulta **não** bloqueia a criação: melhor uma duplicata
  do que uma faxina que não existe porque o banco piscou.
- **Motor** — os 6 inserts passaram a usar `insertUnlessOpen()`, que checa por **tipo + local +
  status aberto**. Os guards que existiam antes checavam por `ruleId` ("eu já criei esta hoje"),
  cegos ao que a pessoa criou — era exatamente essa cegueira que produzia as 106. Quando pula,
  registra no log **por quê** e se a existente era do motor ou da mão.
- **`HousekeepingService.createTask`** — levanta `DuplicateTaskError` com a tarefa que colidiu, a
  menos que receba `force: true`. Falha alto de propósito: um retorno especial seria ignorado por
  chamador desatento e a duplicata voltaria calada. Criação forçada fica marcada na auditoria com
  texto próprio ("mesmo havendo uma aberta").
- **Máquina** (`structure-service`, turnover de estrutura) — engole o erro e segue.
- **Pessoa** — o modal do admin mostra um diálogo dizendo **o que já existe** (status, quem é o
  responsável, quando foi criada, se veio do motor ou da mão) com *Criar assim mesmo* / *Deixar como
  está*; a rota de campo devolve **409 com a tarefa que colidiu** e a governanta mostra o mesmo
  aviso antes de reenviar com `force`.
- **`postFieldAction`** passou a devolver o corpo da resposta **também no erro** — sem isso o 409
  chegava sem o duplicado dentro.

**Verificado contra produção** (não só `pnpm build`, que aqui é quase cego): a consulta foi simulada
sobre uma tarefa aberta real e encontrou a colisão, com todas as colunas de volta. Um nome de coluna
errado teria transformado a trava num no-op silencioso.

**Ainda em aberto:**
- **Medir em 30 dias.** As 125 excedentes têm de cair. **Se não caírem, a hipótese estava errada** —
  e o motivo de quem insistiu (visível na auditoria pelo texto próprio) dirá qual é a certa.
- **[Abrir essa]** — hoje a saída é *Deixar como está* e a tarefa existente aparece na lista. Um
  atalho que abre a tarefa que colidiu exige navegação a partir do modal; fica para depois.
- **Índice único parcial** no banco, como rede de segurança — exige tratar o erro 23505 nos pontos
  de escrita, então não é o primeiro passo.

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
