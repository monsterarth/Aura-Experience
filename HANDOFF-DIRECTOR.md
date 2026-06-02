# Handoff: App Mobile da Diretoria (`/director`)

> Documento para o Claude Code. Contém tudo que é necessário para implementar a role `director` e o app mobile de gestão estratégica da pousada, sem precisar rederivir contexto.

---

## 1. Contexto do Projeto

**Aura Experience** — plataforma de gestão de pousadas em Next.js 14 (App Router), TypeScript, Supabase (Postgres + Realtime), Tailwind CSS no admin, mas **inline styles com design tokens** nos apps mobile.

**Localização do app:** `aura/` (subpasta do repositório).

**Stack:**
- Next.js 14 App Router
- TypeScript
- Supabase (`@supabase/ssr`) — browser client em `src/lib/supabase-browser.ts`, server/admin em `src/lib/supabase.ts` e `src/lib/supabase-server.ts`
- `supabaseAdmin` (service role) nas API routes — importar de `@/lib/supabase`
- Auth via `useAuth()` (`src/context/AuthContext.tsx`)
- Property via `useProperty()` (`src/context/PropertyContext.tsx`)
- Toasts via `sonner`
- Ícones via `lucide-react`
- Font nos apps mobile: **DM Sans** (importada via Google Fonts inline no CSS injetado)

---

## 2. Padrão dos Apps Mobile Existentes

Os apps mobile vivem em rotas de nível superior (`/maid`, `/maintenance`, `/waiter`, `/houseman`, `/governanta`). Cada um tem:

```
src/app/{role}/
  layout.tsx   ← AuthProvider + PropertyProvider + RoleGuard + PushNotificationManager
  page.tsx     ← O app inteiro em um único componente, com inline styles
```

**Não usam Tailwind** — tudo inline styles com um objeto de design tokens `T` no topo do arquivo.

**Layout padrão** (copiar de `/maid/layout.tsx`, ajustando roles):

```tsx
"use client";
import { AuthProvider } from "@/context/AuthContext";
import { PropertyProvider } from "@/context/PropertyContext";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { PushNotificationManager } from "@/components/PushNotificationManager";

export default function DirectorLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <PropertyProvider>
        <RoleGuard allowedRoles={["director", "super_admin", "admin"]} redirectTo="/admin/login">
          <PushNotificationManager role="director" />
          {children}
        </RoleGuard>
      </PropertyProvider>
    </AuthProvider>
  );
}
```

**CSS injetado** no `page.tsx` (igual ao `/maid`):

```tsx
const STYLE = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800;9..40,900&display=swap');
.dir-shell *  { box-sizing: border-box; }
.dir-shell    { font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif; }
.dir-scroll   { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
.dir-scroll::-webkit-scrollbar { display: none; }
@keyframes dir-spin { to { transform: rotate(360deg) } }
.dir-shell button { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
.dir-shell button:not([disabled]):active { opacity: .7; transform: scale(.97); }
`;
```

**Design tokens** (objeto `T` no topo do page.tsx):

```ts
const T = {
  bg:          "#06080f",
  glass:       "rgba(255,255,255,0.035)",
  glass2:      "rgba(255,255,255,0.055)",
  glass3:      "rgba(255,255,255,0.08)",
  border:      "rgba(255,255,255,0.08)",
  border2:     "rgba(255,255,255,0.13)",
  text:        "#eef0f8",
  muted:       "rgba(238,240,248,0.42)",
  muted2:      "rgba(238,240,248,0.22)",
  g1:          "#9b6dff",
  g2:          "#4ec9d4",
  grad:        "linear-gradient(135deg,#9b6dff 0%,#4ec9d4 100%)",
  gradSoft:    "linear-gradient(135deg,rgba(155,109,255,0.18) 0%,rgba(78,201,212,0.18) 100%)",
  green:       "#2dd4bf",
  greenBg:     "rgba(45,212,191,0.1)",
  greenBorder: "rgba(45,212,191,0.25)",
  amber:       "#f59e0b",
  amberBg:     "rgba(245,158,11,0.1)",
  amberBorder: "rgba(245,158,11,0.28)",
  blue:        "#60a5fa",
  blueBg:      "rgba(96,165,250,0.1)",
  blueBorder:  "rgba(96,165,250,0.25)",
  violet:      "#c084fc",
  violetBg:    "rgba(192,132,252,0.1)",
  violetBorder:"rgba(192,132,252,0.25)",
  orange:      "#fb923c",
  orangeBg:    "rgba(251,146,60,0.1)",
  red:         "#f87171",
  redBg:       "rgba(248,113,113,0.1)",
  redBorder:   "rgba(248,113,113,0.25)",
  pink:        "#f472b6",
  pinkBg:      "rgba(244,114,182,0.1)",
  pinkBorder:  "rgba(244,114,182,0.25)",
};
```

**Shell structure** (estrutura base do page.tsx):

```tsx
return (
  <>
    <style>{STYLE}</style>
    <div className="dir-shell" style={{
      display: "flex", flexDirection: "column",
      height: "100dvh", background: T.bg, color: T.text, overflow: "hidden",
    }}>
      {/* Conteúdo scrollável */}
      <div className="dir-scroll" style={{ flex: 1 }}>
        {/* seções/tabs */}
      </div>

      {/* Bottom nav fixo */}
      <BottomNav active={section} onChange={setSection} />
    </div>
  </>
);
```

---

## 3. Arquivos a Criar

### 3.1 `src/app/director/layout.tsx`
Conforme padrão acima. `allowedRoles={["director", "super_admin", "admin"]}`.

### 3.2 `src/app/director/page.tsx`
Dashboard principal da diretoria. Detalhes na seção 5.

### 3.3 `src/app/director/equipe/page.tsx`
Visão mobile de equipe e escalas. Detalhes na seção 6.

### 3.4 `src/app/api/director/dashboard/route.ts`
API que agrega todos os dados necessários para o dashboard. Detalhes na seção 7.

---

## 4. Arquivos a Modificar

### 4.1 `src/types/aura.ts`
Adicionar `'director'` ao `UserRole`:

```ts
// antes:
export type UserRole =
  | 'super_admin'
  | 'admin'
  | 'manager'
  // ...

// depois — adicionar logo após 'admin':
  | 'director'   // Diretoria / Proprietário (app mobile de gestão estratégica)
```

### 4.2 `src/app/admin/dashboard/page.tsx`
Adicionar ao `ROLE_DESTINATIONS`:

```ts
const ROLE_DESTINATIONS: Record<string, string> = {
  super_admin:  "/admin/core/dashboard",
  admin:        "/admin/reception",
  director:     "/director",          // ← adicionar esta linha
  // ...resto inalterado
};
```

### 4.3 `src/app/admin/mobile-apps/page.tsx`
Adicionar card "Diretoria" ao array `APPS`:

```ts
const APPS = [
  { id: "diretoria", label: "Diretoria", description: "Dashboard estratégico para proprietários e diretores", color: "#9b6dff", icon: "staff" },
  // ...apps existentes
];
```

E adicionar ao `APP_META` em `src/app/admin/mobile-apps/[app]/page.tsx`:

```ts
diretoria: { label: "Diretoria", path: "/director", color: "#9b6dff" },
```

### 4.4 `src/components/admin/Sidebar.tsx`
Adicionar `"director"` às roles do ROLE_META para exibição do badge (caso o director acesse o admin por qualquer motivo):

```ts
director: {
  label: "Diretor", short: "DR", color: T.g1,
  badge: "Diretor", badgeBg: "rgba(155,109,255,0.12)", badgeBorder: "rgba(155,109,255,0.28)"
},
```

O director **não aparece no sidebar** — a role não deve ser adicionada a nenhum item de navegação do sidebar, pois o acesso deles é exclusivamente via `/director`.

---

## 5. Dashboard Principal (`/director/page.tsx`)

### Estrutura de navegação

Bottom nav com 4 seções:
1. **Início** — ícone `LayoutGrid` ou `Home`
2. **Agenda** — ícone `Calendar` (casamentos + eventos dos próximos 30 dias)
3. **Equipe** — ícone `Users` (navega para `/director/equipe` com `useRouter().push`)
4. **Relatórios** — ícone `BarChart2` (placeholder "em breve" por ora)

### Seção: Início

Tabs no topo: **Hoje** | **Semana** | **Mês**

#### Tab: Hoje

**1. Header**
- Saudação com horário do dia: "Bom dia / Boa tarde / Boa noite, {userData.fullName}"
- Chip com nome da propriedade + indicador verde piscando "Sistema ativo"
- Pill com quantidade de hóspedes ativos: "N hóspedes agora na propriedade"

**2. Card de Ocupação (hero)**
- Percentual grande (ex: 50%) + "N / total cabanas"
- Barra de progresso
- 2 sub-cards: "Check-ins hoje (feitos/total)" e "Check-outs hoje (feitos/total)"

**3. Receita — PLACEHOLDER "Em breve"**
- Card com borda dashed, ícone `TrendingUp`, texto:
  > "Módulo financeiro em breve"
  > "Receita, ADR e RevPAR serão exibidos aqui quando o módulo for ativado"
- **Não implementar lógica financeira** — apenas o visual de placeholder.

**4. Satisfação dos Hóspedes (NPS)**
- Score NPS grande (ex: 8.7 / 10)
- Mini barras de distribuição de estrelas (5★ a 1★)
- Pills: Promotores % | Neutros % | Detratores %
- Dados vêm de `survey_responses` e `survey_insights` (últimos 30 dias)

**5. Alertas para Diretoria**
- Somente alertas de nível diretor:
  - Avaliações negativas (NPS ≤ 6) das últimas 48h
  - Ordens de manutenção com `priority = 'urgent'` abertas
- Máximo 5 alertas. Sem barulho operacional (não mostrar tarefas de governança, pedidos de concierge etc.)

**6. Operação Agora (resumo)**
- 4 mini-cards em grid 2×2: Governança (N tarefas ativas), Concierge (N pedidos pendentes), F&B (N pedidos do dia), Equipe (N ativos hoje)
- Apenas contagens — sem drill-down operacional

**7. Próximo Evento**
- O casamento mais próximo (data futura) com nome, data, exclusividade e quantidade de convidados
- Botão/chevron abre a seção Agenda

#### Tab: Semana

- Mini gráfico de barras: ocupação dos próximos 7 dias (% por dia, dia atual destacado em roxo)
- Receita prevista → **placeholder "Em breve"**
- KPIs: check-ins esperados, ocupação média, pico da semana, casamentos na semana
- Lista de chegadas (stays com checkIn nos próximos 7 dias, agrupados por dia)

#### Tab: Mês

- Receita do mês → **placeholder "Em breve"**
- KPIs: Ocupação % do mês, hóspedes únicos, diárias vendidas, casamentos no mês
- Card de indicadores de qualidade: NPS médio, reclamações registradas, ordens de manutenção, hóspedes únicos

### Seção: Agenda

Lista de casamentos dos próximos 30 dias, ordenada por data:
- Nome do casal, data, exclusividade (sim/não), quantidade de convidados
- Dias restantes como chip colorido (verde <7d, azul >7d)
- Dados de `WeddingService` ou query direta em `weddings`

### Seção: Equipe

Navega para `/director/equipe` via `useRouter().push('/director/equipe')`.

---

## 6. View de Equipe (`/director/equipe/page.tsx`)

Versão mobile-first da `src/app/admin/hr/page.tsx`. Reusar os mesmos services.

**Services a usar:**
```ts
import { StaffService } from "@/services/staff-service";
import { resolveEffectiveDaySchedule } from "@/lib/schedule-calculator";
```

Carregar com:
```ts
const [scheduleView, overrides, checkpoints] = await Promise.all([
  StaffService.getPropertyScheduleView(propertyId),
  StaffService.getPropertyScheduleOverrides(propertyId, fromYMD, toYMD),
  StaffService.getPropertyCheckpoints(propertyId),
]);
```

**Estrutura da tela (scroll vertical, sem tabs):**

1. **Header** — "Equipe" + data de hoje como chip

2. **KPI cards (grid 2×2):**
   - Equipe ativa (total staff.active)
   - Hoje em turno (staff resolvido como isWork=true hoje)
   - Aniversários (staff com birthDate no mês atual) — chip com contagem
   - Folgas esta semana (overrides sem startTime)

3. **Barras de escala da semana** — gráfico de barras horizontais simples, um por dia da semana (Seg–Dom), altura proporcional ao número de escalas. Dia atual destacado em roxo.

4. **Distribuição por setor** — lista com barra de progresso por role, usando as cores de `ROLE_COLORS` existentes

5. **Filtros de turno + Lista da equipe hoje** — filtros: Todos | Manhã | Tarde | Noite. Para cada membro escalado hoje: avatar (iniciais), nome, cargo, horário (HH:mm–HH:mm), chip de turno.
   - Classificação de turno: start < 12h → manhã, 12h–18h → tarde, ≥ 18h → noite, duração ≥ 12h → plantão

6. **Aniversários do mês** — lista com nome, cargo e data. Destacar quem está nos próximos 7 dias.

**Botão "Voltar"** no topo esquerdo → `router.back()` ou `router.push('/director')`

---

## 7. API Route (`/api/director/dashboard/route.ts`)

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';
```

**Query params:** `propertyId` (obrigatório)

**Dados a retornar (um único objeto JSON):**

```ts
{
  // Ocupação
  stats: {
    occupiedCabins: number,      // stays active
    totalCabins: number,
    checkinsDone: number,        // stays active com checkIn hoje
    checkinsTotal: number,       // stays com checkIn hoje (pending+pre_checkin_done+active)
    checkoutsDone: number,       // stays checked_out/finished com checkOut hoje
    checkoutsTotal: number,      // stays com checkOut hoje
    guestsOnProperty: number,    // sum de guestCount das stays active
  },

  // NPS / Satisfação
  nps: {
    score: number | null,        // média dos npsScore das últimas 30 survey_responses
    promoters: number,           // % com npsScore >= 9
    passives: number,            // % com npsScore 7-8
    detractors: number,          // % com npsScore <= 6
    distribution: { stars: number, count: number }[], // agrupado por rating (1-5)
  },

  // Alertas de nível diretor
  alerts: {
    type: 'detractor' | 'maintenance_urgent',
    title: string,
    desc: string,
    createdAt: string,
  }[],

  // Operação — apenas contagens
  ops: {
    hkActiveTasks: number,        // housekeeping_tasks status in (pending, in_progress, waiting_conference)
    conciergeePending: number,    // concierge_requests status = pending
    fbOrdersToday: number,        // fb_orders com deliveryDate = hoje
    staffOnDuty: number,          // calculado no cliente com StaffService
  },

  // Próximo casamento
  nextWedding: {
    id: string,
    coupleName: string,
    date: string,
    exclusive: boolean,
    guestCount: number,
    daysUntil: number,
  } | null,

  // Semana — ocupação próximos 7 dias
  weekOccupancy: {
    date: string,        // YYYY-MM-DD
    dayLabel: string,    // "Seg", "Ter" etc.
    occupied: number,
    total: number,
    pct: number,
    checkinsExpected: number,
  }[],

  // Mês — KPIs
  monthStats: {
    occupancyPct: number,       // diárias ocupadas / diárias possíveis no mês até hoje
    uniqueGuests: number,       // guests distintos em stays do mês
    nightsSold: number,         // sum de noites das stays do mês
    weddingsCount: number,      // casamentos no mês
    maintenanceOrders: number,  // maintenance_tasks abertas no mês
    complaints: number,         // survey_responses com npsScore <= 6 no mês
  },

  // Casamentos próximos 30 dias (para a seção Agenda)
  upcomingWeddings: {
    id: string,
    coupleName: string,
    date: string,
    exclusive: boolean,
    guestCount: number,
    daysUntil: number,
  }[],
}
```

**Padrão das queries:** seguir exatamente o padrão de `src/app/api/admin/reception/dashboard/route.ts` — usar `supabaseAdmin`, `Promise.all`, tratar erros individualmente com fallback para 0/null.

---

## 8. Notas de Implementação

### O que NÃO implementar ainda
- Dados financeiros (receita, ADR, RevPAR) — colocar apenas placeholder visual com borda dashed e texto "Módulo financeiro em breve"
- A tela de "Relatórios" no bottom nav — colocar placeholder com mesmo visual de "Em breve"

### Sidebar do admin
- A role `director` **não deve aparecer** na sidebar do admin
- Não adicionar `"director"` a nenhum item de nav em `src/components/admin/Sidebar.tsx`
- Se um `director` acessar `/admin/*`, o RoleGuard das páginas vai redirecionar normalmente

### RoleGuard nas páginas admin existentes
- Não é necessário alterar os RoleGuards existentes nesta etapa
- O director só acessa o universo `/director/*`

### Referência de cores por role (para chips/badges)
```ts
const ROLE_COLORS = {
  governance:  { color: "#c084fc", bg: "rgba(192,132,252,0.1)", border: "rgba(192,132,252,0.25)" },
  reception:   { color: "#2dd4bf", bg: "rgba(45,212,191,0.1)",  border: "rgba(45,212,191,0.22)"  },
  kitchen:     { color: "#fb923c", bg: "rgba(251,146,60,0.1)",  border: "rgba(251,146,60,0.22)"  },
  maintenance: { color: "#f59e0b", bg: "rgba(245,158,11,0.1)",  border: "rgba(245,158,11,0.22)"  },
  porter:      { color: "#60a5fa", bg: "rgba(96,165,250,0.1)",  border: "rgba(96,165,250,0.22)"  },
  houseman:    { color: "#60a5fa", bg: "rgba(96,165,250,0.1)",  border: "rgba(96,165,250,0.22)"  },
  technician:  { color: "#60a5fa", bg: "rgba(96,165,250,0.1)",  border: "rgba(96,165,250,0.22)"  },
  marketing:   { color: "#f472b6", bg: "rgba(244,114,182,0.1)", border: "rgba(244,114,182,0.22)" },
  maid:        { color: "#9b6dff", bg: "rgba(155,109,255,0.1)", border: "rgba(155,109,255,0.22)" },
  waiter:      { color: "#4ec9d4", bg: "rgba(78,201,212,0.1)",  border: "rgba(78,201,212,0.22)"  },
};
```

### Realtime
Usar Supabase Realtime nos mesmos canais já existentes onde fizer sentido:
- `stays` → atualiza stats de ocupação
- `housekeeping_tasks` → atualiza contagem de HK
- `concierge_requests` → atualiza contagem de concierge

Padrão:
```ts
const channel = supabase.channel(`director_stays_${property.id}`)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'stays',
      filter: `propertyId=eq.${property.id}` }, () => loadDashboard(true))
  .subscribe();
// cleanup: safeRemoveChannel(channel, subscribed)
```

---

## 9. Sequência de Implementação Sugerida

1. **`src/types/aura.ts`** — adicionar `'director'` ao UserRole (1 linha)
2. **`src/app/admin/dashboard/page.tsx`** — adicionar entrada no ROLE_DESTINATIONS (1 linha)
3. **`src/app/api/director/dashboard/route.ts`** — API com todos os dados agregados
4. **`src/app/director/layout.tsx`** — layout com RoleGuard
5. **`src/app/director/page.tsx`** — dashboard principal com tabs Hoje/Semana/Mês + nav Início/Agenda/Equipe/Relatórios
6. **`src/app/director/equipe/page.tsx`** — view mobile de equipe
7. **`src/app/admin/mobile-apps/page.tsx`** + `[app]/page.tsx` — card "Diretoria" no hub de apps

---

## 10. Referências Rápidas

| Necessidade | Referência |
|---|---|
| Layout mobile | `src/app/maid/layout.tsx` |
| Design tokens + CSS inline | `src/app/maid/page.tsx` (objeto `T` no topo) |
| API agregada | `src/app/api/admin/reception/dashboard/route.ts` |
| Equipe/schedules | `src/app/admin/hr/page.tsx` |
| Resolução de escala | `src/lib/schedule-calculator.ts` → `resolveEffectiveDaySchedule` |
| Supabase Admin | `import { supabaseAdmin } from '@/lib/supabase'` |
| Auth na API route | `import { requireAuth, isAuthError } from '@/lib/api-auth'` |
| RoleGuard | `src/components/auth/RoleGuard.tsx` |
| Cores por role | `src/app/admin/hr/page.tsx` → `ROLE_COLORS` |
| Casamentos | `src/services/wedding-service.ts` |
| NPS/Surveys | `src/services/survey-service.ts` |
| Manutenção | `src/services/maintenance-service.ts` |
