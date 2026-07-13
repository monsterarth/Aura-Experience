# ROADMAP — AURA

> Roadmap prospectivo do produto. O **changelog** (`/admin/changelog`, no banco) é retrospectivo — registra o que já saiu. Este documento registra **para onde vamos** e **por quê**.
>
> Origem: reunião de apresentação de resultados à direção em **26/06/2026**. Última revisão: 27/06/2026.
>
> **Sequência decidida:** (1) **Manutenção → produção**, com report por foto para colaborador **e** hóspede; (2) **todos os fixes**; (3) **ideias novas da direção** (compras, guarita, etc.).

---

## 1. Avaliação da reunião (26/06)

### Resultados que provam adoção/valor (últimos ~3 meses, desde a recepção operando de fato)
- 139 pré-check-ins preenchidos pelo portal + 85 agendamentos via portal = **224 interações fora do balcão (~30% menos atendimento presencial)**.
- 189 hóspedes enviaram dados antes de chegar.
- Avaliações: de ~6/mês → **14/mês**, nota **4,6**, **80% recomendaria**.
- Leitura estratégica: o diferencial do produto é colocar **o hóspede como parte da operação** (pré-check-in, agendamentos, pedidos, avaliação) e dar **gestão por dados** em vez de achismo.

### O que a direção validou / pediu como rotina
- Revisão **mensal das avaliações** pelos líderes de setor (o que deu certo/errado e por quê) — usar o **Modo Diretor**.
- **Simulação completa** com toda a gestão na volta do Arthur (cada um operando seu controle).

### Diretrizes estratégicas da direção (capturadas para não se perderem)
1. **Separar Obras/Investimentos (equipe do Paulo) da Manutenção periódica vinculada à hospedagem** — esta última fica sob o "guarda-chuva" da **Governança**. **Decisão de modelo (atualizada):** não haverá um "gerente de manutenção" à parte — a **governanta acumula a gerência da manutenção** (no sistema: ganha `maintenance` como cargo secundário e troca entre os apps); a execução de campo fica com alguém de perfil operacional/rotina (perfil "Roger").
2. **Qualquer pessoa — colaborador OU hóspede — pode reportar um problema com foto**; a demanda entra num **pool sem responsável** até alguém assumir.
3. Pool de demandas: **primeiro que pega** assume; **gestor pode direcionar**; opção de **rodízio automático**.
4. **Preventivas periódicas** cadastradas com periodicidade e **auto-disparo** (substitui o antigo "livro de manutenção").
5. **Histórico/log online** de tudo (quem fez, quando).
6. Demandas podem ficar **pendentes** (ex.: dependem de terceiro).
7. **Módulo de Solicitação de Compras / Contratações / Terceirizados ("módulo do Lucas")**: painel de demandas (não o "buraco negro" do WhatsApp), reputação de fornecedor, postergar/lembrete, controle de qualidade do serviço.
8. **Guarita/Portaria**: protocolo de passagem de bastão dia/noite, portão fechado enquanto há guarita, **botoeira** para o hóspede sair, registro fotográfico na recepção (RFID na chave; facial é caro/futuro), e o problema do motor do portão novo (fornecedor terceiro).
9. **Blacklist de hóspedes** + identificação no pré-check-in; **consultar o jurídico** sobre a prerrogativa de recusa; limitação: reservas online (Booking/Expedia) não dá para filtrar.
10. **Casamentos**: site do casamento dentro do AURA — convidado faz pré-reserva de cabana via link com senha; lista de presentes/convidados.
11. **Upsell/upgrade automático** no pré-check-in (ex.: +R$200/noite p/ cabana com banheira) + **cashback/cupom** para a próxima estadia + marketing no pré-check-in.
12. **Integração com o Gamax** (PMS/faturamento) — hoje gera trabalho duplo; fazer **depois** de fechar os módulos.
13. **Módulo comercial + CRM**: usar a recepção liberada para vender; entender cada hóspede.

### Itens organizacionais/operacionais (não-software) a encaminhar em paralelo
- Definir quem será a "manutenção da governança" (Roger / Dinho / Marcelo).
- Consultar jurídico sobre blacklist.
- Resolver o fornecedor do portão (motor / garantia).
- Comprar celulares de trabalho básicos e travados no app para o campo.

> **Reconciliação discurso × código:** na reunião a Manutenção foi tratada como "a única coisa que falta / em desenvolvimento". Na prática **já existe bastante** (app, modelo de dados, regras periódicas e cron). O que falta para produção é pontual — ver o ciclo "Agora". Isso **reduz o tamanho do trabalho**: é polimento + 3 lacunas, não um módulo do zero.

---

## 2. Roadmap (Now / Next / Later)

### 🟢 AGORA — Manutenção em produção (foco único do ciclo)
**Meta:** todos passam a usar o módulo; qualquer colaborador ou hóspede abre demanda com foto; preventivas rodando sozinhas.

> **Realidade do módulo:** quase tudo já foi *escrito*, mas **nada foi devidamente testado**. O trabalho do ciclo é **menos "construir" e mais "endurecer + testar + ligar"**. Validação ponta a ponta é o **gate de go-live**, não um extra.

**Já existe (não reconstruir):**
- ✅ **Report do hóspede com foto** — o portal já tem "Relatar um problema" (cabana / área comum / bug no app), com upload de foto e opção "pode entrar agora" (desliga o DND). Cabana e área comum **já criam `maintenance_tasks`** (`status: pending`, no pool); bug do app vai para `system_bugs`. Via server action `src/app/actions/issue-actions.ts` (`reportCabinIssue` / `reportStructureIssue` / `reportAppBug`) — roda server-side (`supabaseAdmin`), então **não** sofre do lock frio. Sheet em `src/app/check-in/[code]/_portal/sheets.tsx` (`ReportSheet`).
- ✅ **Report da governança** — o app da governanta já tem "Chamado de Manutenção" → `MaintenanceService.createTask` (`src/app/governanta/page.tsx`). ⚠️ porém escreve pelo **client do browser** (ver lacuna abaixo).
- ✅ **Preventivas = tarefas recorrentes** — a lógica existe no cron (`src/app/api/cron/maintenance/route.ts`): **dois mecanismos sobrepostos** — regras em `maintenance_rules` (`applyMaintenanceRules`, com `interval`/`intervalUnit`) **e** tarefas-pai com `isRecurring`/`recurrenceRule`. ⚠️ **não testada** e o cron **não está agendado** (ver abaixo). Decidir: consolidar nos `maintenance_rules` e aposentar o caminho `isRecurring` (evita disparo duplo).
- ✅ **Multi-cargo (encanação)** — `Staff.secondaryRoles?: UserRole[]` existe e é honrado por `RoleGuard`, `RoleSwitcher` (mostra botões "Governanta" + "Manutenção" e troca de app) e `StaffEditModal` (admin atribui). Plano: dar à governanta `secondaryRoles: ['maintenance']` para ela acumular a gerência de manutenção. ⚠️ falta o app reconhecê-la como *gestora* (ver abaixo).

**Lacunas reais para o go-live:**
- **[Simplificar] "Cargo = app" (em vez de `isManager`)** — replicar o padrão já usado em camareira/governanta/mensageiro: o cargo decide **qual app**, sem split de gestor/operário dentro do app. O console de coordenador já existe e está completo (`/maintenance-ops`: criar/atribuir/validar). Mapear:
  - `technician` → `/maintenance` (vira só a visão do técnico)
  - `maintenance` (coordenador) → `/maintenance-ops`
  - governanta acumula com `secondaryRoles: ['maintenance']` → o `RoleSwitcher` mostra "Manutenção" e a leva ao `/maintenance-ops` como **gestora** (sem cálculo de flag — o cargo a leva ao app de gestão).

  3 ajustes nas fontes únicas de verdade: **`src/lib/role-routes.ts`** (`maintenance: '/maintenance-ops'`), **`RoleSwitcher`** (`maintenance` → `/maintenance-ops`), **`supabase-middleware.ts`** `roleForRoute` (entrada específica `'/maintenance-ops': ['maintenance']` — ⚠️ casar o caminho **mais específico primeiro**, pois `/maintenance-ops` também bate em `startsWith('/maintenance')`). Depois, o `isManager` e os branches de coordenador dentro de `/maintenance` viram código morto → remover com calma (não bloqueia).
- **[Endurecer] Rotear ESCRITAS de manutenção via `/api/field/*`** — `MaintenanceService.createTask` (e demais writes do `maintenance-service.ts`) usam `supabase.from('maintenance_tasks').insert/update/delete` no browser, que **pendura no lock frio**. O "Chamado de Manutenção" da governanta cai nisso. A criação de *faxina* já foi movida para a rota de campo (`/api/field/housekeeping-tasks`); a de *manutenção* **não** — replicar o mesmo padrão. *(memória `field-app-browser-write-hangs`)*
- **[Construir] Estender o report a TODOS os apps** — hoje só governanta tem o botão; **maid não tem**. Adicionar "Reportar manutenção" (com foto) em maid / waiter / houseman / recepção, apontando para a rota de campo endurecida acima. *(direção: "qualquer pessoa da pousada, como qualquer hóspede")*
- **[Ligar] Cron de preventivas** — confirmado: o route existe mas **não está no `vercel.json`** → preventivas não rodam em produção. Agendar (ex.: diário) + checar `CRON_SECRET`. Validar dedup por `(recurrenceSourceId, recurrenceDate)`.
- **[Construir] CRUD admin de regras periódicas** — UI para `maintenance_rules` (intervalo / unidade / ativo / checklist) em `/admin/maintenance`. Hoje não há tela de edição das regras.
- **[GATE] Testar tudo ponta a ponta** — nada na manutenção foi testado. Roteiro mínimo: hóspede/colaborador abre → pool → governanta-gestora atribui/direciona → técnico assume/finaliza com foto → gestora valida → preventiva cadastrada dispara sozinha (1 ciclo do cron) sem duplicar → histórico íntegro. **Sem isso não vai a produção.**
- **[Opcional] Rodízio automático (por config)** — round-robin de atribuição no pool; "primeiro que pega" e "gestor direciona" já existem (`assignedTo[]` + AssignTechSheet). *Não bloqueia o go-live.*
- **[Opcional] Tipo da demanda (rotina × obra)** — distinguir *rotina (sob Governança)* de *obra/investimento (equipe Paulo)* via categoria/filtro, para a manutenção-rotina não se misturar com obras. *Não bloqueia o go-live.*
- **[Surfacing] Histórico/log** — já há `AuditService`; expor uma visão de histórico por cabana/estrutura.

**Definição de pronto:** governanta entra como **gestora** de manutenção (multi-cargo) e troca de app pelo switcher; hóspede e qualquer colaborador abrem com foto (escritas via rota de campo, sem lock frio); demanda aparece no pool; alguém assume e finaliza com foto; uma preventiva cadastrada dispara sozinha sem duplicar; tudo fica no histórico — **com o roteiro de teste acima passando**.

### 🟡 PRÓXIMO — Fixes & endurecimento de campo
- **Bug do café para grupo** — no portal (`src/app/check-in/[code]/breakfast/page.tsx`) um hóspede preenche o pedido inteiro como se fosse 1 pessoa quando a cabana é casal. Corrigir: o painel do pedido deve mostrar **número da cabana + nº de ocupantes**, alertar/bloquear quando o pedido cobre só 1 de N, e denormalizar a contagem de ocupantes no `fb_orders` para a cozinha/recepção ver (`additionalGuests` hoje não vai para a ordem).
- **Resiliência a internet instável no campo** — apps de campo travam por falta de internet; tratar (tolerância offline / repetição, feedback claro). Cross-cutting, beneficia inclusive a Manutenção recém-lançada.
- **Celulares de trabalho travados no app** (kiosk) — habilitar uso em aparelho básico travado na tela do app (sem Instagram/WhatsApp). *(software de lock + ação de compra de hardware em paralelo)*
- Varredura de fixes/polimento pendentes dos módulos já em produção (governança, recepção, frigobar, café, avaliações, portal).

### 🔵 DEPOIS — Ideias da direção (novos módulos)
- **Solicitação de Compras / Terceirizados ("módulo do Lucas")** — painel de demandas de compra/contratação; reputação de fornecedor; postergar com lembrete; controle de qualidade. *(ABSENTE hoje — o "compras" do estoque é ordem de fornecedor de insumo, não esse fluxo)*
- **Guarita/Portaria + Estacionamento** — protocolo de portão, botoeira do hóspede, registro fotográfico (webcam) na entrada/saída, futuro RFID na chave. *(hoje só existem POIs de mapa)*
- **Blacklist de hóspedes** — registro + alerta no pré-check-in; bloqueio quando o titular usa os próprios dados. **Dependência: parecer jurídico.**
- **Casamentos — site do casal** — link com senha para convidados pré-reservarem cabana; lista de presentes/convidados. *(módulo `/admin/casamentos` já existe para gestão interna; falta o site público do casal)*
- **Upsell/upgrade + cashback** no pré-check-in do portal.
- **Integração Gamax** (PMS/faturamento) — eliminar trabalho duplo na recepção. Decisão: fazer **depois** de fechar os módulos.

### ⚪ BACKLOG / VISÃO (repriorizar conforme a operação pedir)
- **Módulo Comercial** (usar recepção liberada para vendas) + **CRM** avançado (hoje `contacts` é CRUD básico).
- **Marketing** (role existe, sem app) — campanhas / segmentação.
- **Relatórios de receita / folio** (RevPAR, ocupação, P&L) — hoje há `FolioItem`, falta analítico.
- **App de Compras (campo)** / role `compras` sem app.
- **Timesheets** (há `StaffSchedule` / checkpoints, falta apuração de horas).
- **Multipropriedade consolidada** (rollup de KPIs entre propriedades).
- **Checklists de qualidade avançados** (foto por item, nota).

---

## 3. Estado atual do produto (baseline — não reabrir)

Em produção/pronto: Governança/Camareiras, Recepção/Stays/Agendamentos, Café-salão + Garçom + KDS, Frigobar (via Concierge/Estoque), **Estoque/Patrimônio (Fases 0–5)**, Avaliações/Survey 2.0, Modo Diretor, Eventos, **Portal do hóspede "camaleão"**, Automações (WhatsApp/Evolution), Changelog.

> Detalhe e caminhos por módulo: ver [`docs/MODULES.md`](MODULES.md) (fonte canônica).
