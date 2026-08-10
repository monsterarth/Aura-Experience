# Modularização — core × módulos, planos por propriedade

> **Status: planejado, execução adiada de propósito** (decisão de 10/08/2026). O produto ainda
> está em desenvolvimento e há um único tenant real; enforcement completo hoje seria testar
> comportamento degradado que ninguém usa. Este documento é o registro de decisão + o mapa de
> execução para quando chegar o gatilho — mas as **regras da seção 1 valem desde já** para todo
> desenvolvimento novo.
>
> **Gatilhos para executar:** (a) segunda propriedade com data para entrar, ou (b) prospect real
> querendo a versão enxuta. Nesse momento: Fase 0 → Fase 1 (dias, não semanas — a auditoria de
> acoplamento da seção 8 já está feita).

---

## 1. Regras EM VIGOR desde já (desenvolvimento novo)

Custam minutos por feature e congelam a dívida de retrofit no tamanho de hoje. O que encarece a
modularização não é o código existente (mapeado, seção 8) — é acoplamento **novo** criado sem
essas regras.

1. **Módulo novo nasce com flag.** Toda área desligável nova ganha sua chave em
   `properties.settings` no dia um, allowlisted em `src/lib/property-settings.ts` como
   super_admin-only — exatamente como `hasStock` nasceu ("decisão de plano/contrato, não
   preferência de operação").
2. **Fluxo core nunca depende duro de tabela de módulo.** Efeito colateral de módulo dentro de
   fluxo core sempre passa por um check suave com **default LIGADO** (off só se `=== false`).
   Padrão de referência: `src/services/stock-integration.ts`.
3. **Cron novo nasce com gate.** Cron que varre propriedades pula quem não tem o módulo
   (`daily-housekeeping` já degrada naturalmente ao pular propriedade sem regras ativas).
4. **Decisão de fronteira vai para este arquivo.** O que é core, o que cada módulo arrasta,
   onde nasce acoplamento — registrar aqui para não re-decidir depois.

## 2. O que já existe no código (a semente)

O mecanismo não parte do zero — o `hasStock` é o gabarito completo do padrão:

- Proto-flags em `properties.settings`: `hasStock`, `hasBreakfast`, `hasKDS`, `whatsappEnabled`.
- Allowlist com dono por chave: `src/lib/property-settings.ts` (flags de módulo = super_admin).
- Sidebar escondendo grupo por flag: `src/components/admin/Sidebar.tsx` (gate do
  `estoque_grupo` por `settings.hasStock === false`).
- Hub de configurações com seções condicionais: `src/app/admin/configuracoes/_lib/catalog.ts`
  (`requires: hasStock`).
- Integração suave com default ON: `src/services/stock-integration.ts`.
- Página de contratação: `src/app/admin/configuracoes/modulos/page.tsx` (toggle único hoje;
  vira a matriz completa na Fase 0). Texto de lá que vira princípio: **"nada é apagado"**.

## 3. Taxonomia: core × módulos

**Core (nunca desliga — é "o programa"):** estadias + mapa de reservas + calendário · cabanas
(inclusive o *status* delas — ver seção 4) · hóspedes/contatos · pré check-in (FNRH) · portal do
hóspede (casca: home, jornada do dia, políticas, mapa via `mapConfig`) · avaliações/Survey ·
recepção (fólio, diárias — cron `daily-lodging`) · equipe (cadastro/login) · configurações ·
logs · dashboard · changelog.

**Módulos desligáveis** (~14 chaves propostas):

| Chave | Cobre | Arrasta consigo |
|---|---|---|
| `governanca` | Tarefas, regras, kanban | Apps governanta + camareira, cron `daily-housekeeping` |
| `manutencao` | Chamados, preventivas, kanban | Apps técnico + coordenador (`maintenance-ops`), cron `maintenance` |
| `cafe` | Café da manhã (CafeBuilder, salão) | Aba café do portal, apps garçom + mensageiro, cron `breakfast-attendance` |
| `kds` | Display de cozinha | **requer `cafe`** (hoje `hasKDS`) |
| `fb` | Restaurante / room service / pedidos | Menu Gastronomia, tela de pedidos |
| `concierge` | Loja de mimos | Aba do portal + admin |
| `estoque` | Estoque, compras, fornecedores, perdas + patrimônio (v1 junto) | **Já implementado** (`hasStock`), crons `stock-expiry` + `asset-depreciation` |
| `comercial` | Pipelines de reserva, lista de espera | Cron `crm-status` |
| `tarifario` | Tabelas, flutuações, calendário de preços | Rate engine dos orçamentos |
| `casamentos` | Gestão + pipeline de casamentos | Cron `wedding-status` |
| `eventos` | Agenda de eventos | Aba eventos do portal |
| `estruturas` | Espaços agendáveis | Aba "explorar" do portal, agendamentos |
| `comunicacao` | WhatsApp/Chatwoot, automações, broadcast | Crons de mensageria (`daily-automations`, `process-messages`) |
| `rh` | RH + escalas | (cadastro básico de equipe fica no core) |
| `marketing` | Descontos, promos, pesquisas | (página comercial/marketing) |

Exemplo do requisito original: "tem concierge mas não tem room service" = `concierge` ON, `fb` OFF.

## 4. Princípio central: *status é core, workflow é módulo*

O acoplamento mais delicado é o checkout (seção 8): ele insere `housekeeping_tasks`, põe a
cabana em `cleaning` e aplica regras. Comportamento com `governanca` OFF:

- A cabana **continua** virando `cleaning` no checkout — o gestor solo ainda quer ver no mapa o
  que está sujo. `cabins.status` é core.
- O módulo desligado remove só a *camada de workflow*: nenhuma task criada, nenhuma regra,
  nenhum app de campo. No lugar, um clique "cabana pronta" no mapa/recepção flipa
  `cleaning → available`.

Generalização (a regra de degradação de todos os módulos): **desligar um módulo nunca quebra um
fluxo core; só remove a orquestração em volta.** Sem `comunicacao`, o link do pré check-in
continua existindo, copiável na mão. Sem `tarifario`, o orçamento aceita valor digitado. Sem
`manutencao`, não há chamados nem preventivas (se precisar de um mínimo: anotação livre na
cabana — ou nada).

Dados: desligar é sempre **soft** — nada é apagado, histórico continua legível, religar volta
como estava. Módulo OFF apenas para de criar linhas novas.

## 5. Mecânica técnica

**Registry central** — `src/lib/modules.ts` (novo):

```ts
export type ModuleKey = 'governanca' | 'manutencao' | 'cafe' | 'kds' | /* … */;
export const MODULES: Record<ModuleKey, {
  label: string; description: string;
  requires?: ModuleKey[];      // ex.: kds → cafe (cascata na UI)
  defaultOn: boolean;
}>;
// Função pura, roda em server e client:
export function isModuleEnabled(settings: Property['settings'] | null | undefined, key: ModuleKey): boolean;
```

**Armazenamento** — `settings.modules?: Partial<Record<ModuleKey, boolean>>`; chave ausente =
default do registry. O resolver lê os **aliases legados** para não migrar dado nenhum:
`hasStock → estoque`, `hasBreakfast → cafe`, `hasKDS → kds`. Allowlist: chave `modules` em
`property-settings.ts`, super_admin. Atenção ao merge raso do `merge_property_settings`: mandar
`modules` substitui o objeto inteiro — a página carrega e grava o objeto completo (mesmo
contrato do `fbSettings`).

**Cinco camadas de aplicação** (todas com padrão já existente):

1. **Sidebar** — `NavItem`/`NavGroup` ganham `module?: ModuleKey`; o filtro `canSee` checa
   (generaliza o gate hardcoded do estoque).
2. **Páginas** — `<ModuleGuard module="…">` irmão do `RoleGuard` em `src/components/auth/`;
   redireciona ao dashboard com aviso.
3. **API** — `requireModule(propertyId, key)` ao lado do `requireAuth` em `src/lib/api-auth.ts`
   → 403 nas rotas do módulo (fecha o acesso por URL direta).
4. **Crons** — no loop de propriedades: `if (!isModuleEnabled(settings, key)) continue`.
5. **Portal do hóspede** — as abas já são condicionais a `fbSettings`/`mapConfig`; passam a
   condicionar também ao módulo (o portal já recebe `settings` da propriedade).

## 6. Planos = presets, não billing

Plano é um conjunto nomeado de flags aplicado de uma vez, com ajuste à la carte por cima:

- **Essencial** — core puro (gestor solo). Opcionalmente + `concierge`.
- **Operação** — Essencial + `governanca` + `manutencao` + `cafe`.
- **Completo** — tudo (Fazenda do Rosa hoje).

A página `/admin/configuracoes/modulos` vira a matriz: presets em cima, toggles individuais
embaixo, dependências desligando em cascata (desligou `cafe` → `kds` apaga junto). Billing e
contrato ficam fora do sistema; um campo `planName` de exibição basta.

## 7. Fases de execução

- **Fase 0 — Fundação** (≈ meio dia; pode ser feita a qualquer momento, zero mudança de
  comportamento): registry `modules.ts` + `isModuleEnabled` + aliases legados + matriz na
  página de módulos + chave `modules` na allowlist. Torna a regra 1 da seção 1 automática.
- **Fase 1 — Superfícies**: sidebar, painel (children), hub de config, `<ModuleGuard>` nas
  páginas, `requireModule` nas rotas de API, abas do portal. O sistema passa a "parecer"
  modular.
- **Fase 2 — Comportamento** (a fase sutil): fallback do checkout sem governança (seção 4),
  gates nos crons, automações silenciando por módulo, `src/lib/notifications.ts` respeitando
  módulo.
- **Fase 3 — Planos**: presets + aplicação em cascata + `planName`.
- **Fase 4 — Modo solo**: onboarding de propriedade nova já nascendo no Essencial, dashboard
  enxuto.

## 8. Auditoria de acoplamento (feita em 10/08/2026 — os pontos que a Fase 2 toca)

- **Checkout** — `src/app/api/admin/stays/[id]/route.ts` (~l.52–119): insere
  `housekeeping_tasks`, cabana → `cleaning`, aplica regras `on_checkout`, dispara automações
  (`checkout_thanks`, NPS). Ponto principal do fallback da seção 4.
- **`src/services/stay-service.ts`**: `undoCheckOut` cancela tasks `turnover` (~l.595); troca
  de cabana insere `turnover` quando a antiga vai para limpeza (~l.759).
- **Crons → módulo** (gate por propriedade): `daily-housekeeping` → `governanca` ·
  `maintenance` → `manutencao` · `breakfast-attendance` → `cafe` · `wedding-status` →
  `casamentos` · `crm-status` → `comercial` · `stock-expiry` + `asset-depreciation` →
  `estoque` · `daily-automations` + `process-messages` → `comunicacao`. Core (sem gate):
  `daily-lodging`, `evening-revalidation`.
- **Portal** — `check-in/[code]/_portal/`: `HomeScreen` (atalho café via
  `fbSettings.breakfast.enabled`), `OrdersScreen`, `CafeBuilder`, abas concierge/estruturas/
  eventos. Já condicionais a config; falta a dimensão módulo.
- **Apps de campo → módulo**: `governanta` + `maid` → `governanca` · `maintenance` +
  `maintenance-ops` → `manutencao` · `waiter` + `houseman` → `cafe` · `director` → core.
- **Sidebar** — gate hardcoded do `estoque_grupo`; **hub de config** —
  `configuracoes/_lib/catalog.ts` (`requires: hasStock`). Ambos trocam para o registry.
- **Notificações** — `src/lib/notifications.ts` roteia por cargo; na Fase 2 passa a considerar
  módulo.

## 9. Decisões em aberto (recomendação registrada; confirmar na execução)

| # | Decisão | Recomendação |
|---|---|---|
| 1 | Checkout sem `governanca` | Cabana fica `cleaning` + botão "pronta" (status é core) — **não** pular direto para `available` |
| 2 | Patrimônio | Junto do `estoque` no v1; chave própria quando houver cliente que queira um sem o outro |
| 3 | Pipeline de casamentos | Pertence ao módulo `casamentos` (some junto com ele), não ao `comercial` |
| 4 | Comercial × Tarifário | Chaves separadas — permite vender tarifário dinâmico como upgrade |
| 5 | Nomes dos presets | Sugestão Essencial / Operação / Completo — naming final é decisão de produto |
