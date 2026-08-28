"use client";

// Corpo do Painel da Plataforma — APRESENTAÇÃO PURA.
//
// Separado de page.tsx de propósito: a página cuida do RoleGuard e da busca dos
// dados, e este arquivo só desenha o que recebe. Isso mantém o componente
// renderizável fora do fluxo de login, o que é o que permite conferir o layout
// (390/768/1440, claro e escuro) sem sessão.
import React, { useMemo } from "react";
import {
  PageShell, PageHeader, Card, SectionLabel, KpiCard, KpiGrid, Button, Pill,
  EmptyState, SegmentedTabs, Skeleton, useMediaQuery, T, alpha,
} from "@/components/aura";
import {
  Layers, RefreshCw, Activity, Building2, Database, HardDrive, Zap, Server,
  MessageSquare, TriangleAlert, ShieldAlert, Timer, Gauge, Boxes, ImageIcon,
  CircleCheck, CircleAlert, Users, Bug,
} from "lucide-react";
import { formatDistanceToNowStrict, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { PlatformSnapshot, PropertyHealth } from "@/services/platform-health-service";
import { WorkArea, RankBars, BandColumns, Meter, compact, bytes } from "./charts";

// ─── Rótulos ─────────────────────────────────────────────────────────────────

const WORK_LABELS: Record<string, string> = {
  governanca: "Governança", estoque: "Estoque", cafe: "Café", checkins: "Check-ins",
  agendamentos: "Agendamentos", concierge: "Concierge", folio: "Fólio",
  fb: "F&B", manutencao: "Manutenção",
};

/** Cron → o que ele faz e de quanto em quanto tempo DEVERIA rodar (horas). */
const CRON_EXPECTED: Record<string, { label: string; everyH: number; logs: "always" | "onAction" }> = {
  CRON_DAILY_AUTOMATIONS:    { label: "Automações do dia",     everyH: 24,      logs: "always" },
  CRON_DAILY_HOUSEKEEPING:   { label: "Governança do dia",     everyH: 24,      logs: "always" },
  CRON_MAINTENANCE:          { label: "Preventivas",           everyH: 24,      logs: "always" },
  CRON_EVENING_REVALIDATION: { label: "Revalidação da noite",  everyH: 24,      logs: "always" },
  CRON_BREAKFAST_ATTENDANCE: { label: "Presença do café",      everyH: 24,      logs: "always" },
  CRON_STOCK_EXPIRY:         { label: "Vencimento de estoque", everyH: 24,      logs: "always" },
  CRON_DAILY_LODGING:        { label: "Diárias no fólio",      everyH: 24,      logs: "always" },
  CRON_ASSET_DEPRECIATION:   { label: "Depreciação",           everyH: 24 * 31, logs: "always" },
  // Estes dois saem cedo quando não há o que fazer, ANTES de gravar auditoria:
  // process-messages retorna na fila vazia (route.ts:74) e crm-status só escreve
  // `if (expired > 0 || lapsed > 0)`. Cobrar frescor deles pinta de vermelho um
  // cron que rodou certinho numa madrugada quieta. Para a fila, quem denuncia
  // travamento de verdade é o KPI "Mensagens travadas" acima — estado, não relógio.
  CRON_PROCESS_MESSAGES:     { label: "Fila de mensagens",     everyH: 1,       logs: "onAction" },
  CRON_CRM_STATUS:           { label: "Status de orçamento",   everyH: 24,      logs: "onAction" },
};

/**
 * Rotinas que NÃO gravam auditoria com ação `CRON_*` — o painel é cego para elas.
 * Ficam listadas de propósito: sem isto o cabeçalho diria "todas em dia" contando
 * só as que dá para ver, que é mentir por omissão.
 */
const CRON_UNOBSERVABLE = [
  { label: "Status de casamento", why: "grava WEDDING_AUTO_COMPLETED, e só quando um casamento vira realizado" },
  { label: "Sincronização Hsystem", why: "cron externo (cronjob.org); não grava auditoria" },
  { label: "Vigia do WhatsApp", why: "roda dentro do process-messages; não grava auditoria própria" },
  { label: "Rotinas de governança", why: "não grava auditoria" },
];

const hoursSince = (iso: string) => (Date.now() - new Date(iso).getTime()) / 3_600_000;
const ago = (iso: string | null | undefined) =>
  iso ? formatDistanceToNowStrict(new Date(iso), { locale: ptBR, addSuffix: true }) : "nunca";

// ─── Peças pequenas ──────────────────────────────────────────────────────────

/** Linha rótulo→valor. Usada onde um KpiCard seria peso demais. */
function Stat({ label, value, sub, tone: toneName }: { label: string; value: React.ReactNode; sub?: string; tone?: "muted" | "red" | "green" }) {
  const color = toneName === "red" ? T.red : toneName === "green" ? T.green : T.text;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
      <span style={{ fontSize: 18, fontWeight: 800, color, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>{value}</span>
      <span style={{ fontSize: 10, color: T.muted, letterSpacing: "0.05em", textTransform: "uppercase" }}>{label}</span>
      {sub && <span style={{ fontSize: 10, color: T.muted2 }}>{sub}</span>}
    </div>
  );
}

/** Chip de módulo colorido pela RECÊNCIA de uso — verde vivo → cinza abandonado. */
function ModuleChip({ module, lastUsed, n30 }: { module: string; lastUsed: string | null; n30: number }) {
  const h = lastUsed ? hoursSince(lastUsed) : Infinity;
  const state = h <= 48 ? "vivo" : h <= 24 * 14 ? "morno" : h <= 24 * 60 ? "frio" : "parado";
  const color = state === "vivo" ? T.green : state === "morno" ? T.amber : state === "frio" ? T.muted : T.muted2;
  return (
    <span
      title={`${module} — última vez ${ago(lastUsed)}${n30 ? ` · ${n30} nos últimos 30 dias` : " · nada nos últimos 30 dias"}`}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 9px", borderRadius: 999,
        border: `1px solid ${alpha(color, 26)}`, background: alpha(color, 8),
        fontSize: 11, color: T.text, whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 999, background: color, flexShrink: 0 }} />
      {module}
      <span style={{ color: T.muted2, fontVariantNumeric: "tabular-nums" }}>{n30 ? compact(n30) : "—"}</span>
    </span>
  );
}

// ─── Cartão de propriedade ───────────────────────────────────────────────────

function PropertyCard({ p }: { p: PropertyHealth }) {
  const q = p.quality;
  const issues = q.guestsProvisional + q.phonesNoDdi + q.staysOpenFolio;
  // Uma propriedade sem estadia e sem ação em 7 dias não está "saudável nem
  // doente": está desligada. Dizer isso é mais útil que pintar tudo de verde.
  const dormant = p.staysTotal === 0 || (p.actions7d === 0 && p.staysActive === 0);
  const live = p.modules.filter(m => m.lastUsed && hoursSince(m.lastUsed) <= 24 * 14).length;

  return (
    <Card
      pad={16}
      header={{
        title: p.name,
        sub: `${p.slug} · desde ${p.createdAt ? format(new Date(p.createdAt), "MMM/yy", { locale: ptBR }) : "—"}`,
        icon: Building2,
        tone: dormant ? "neutral" : "brand",
        aside: dormant
          ? <Pill tone="neutral" label="Dormente" />
          : <Pill tone={issues > 0 ? "amber" : "green"} icon={issues > 0 ? CircleAlert : CircleCheck}
                  label={issues > 0 ? `${issues} a corrigir` : "Dado limpo"} />,
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(88px,1fr))", gap: 12, marginBottom: 14 }}>
        <Stat label="Estadias ativas" value={p.staysActive} sub={`${p.staysTotal} no total`} />
        <Stat label="Equipe ativa 7d" value={`${p.staffActive7d}/${p.staffTotal}`} />
        <Stat label="Ações 7d" value={compact(p.actions7d)} />
        <Stat label="Hóspedes" value={compact(p.guests)} />
        <Stat label="Módulos vivos" value={`${live}/${p.modules.length}`} sub="usados em 14 dias" />
      </div>

      <SectionLabel style={{ marginBottom: 8 }}>Adoção de módulos · uso nos últimos 30 dias</SectionLabel>
      {p.modules.length === 0 ? (
        <p style={{ fontSize: 12, color: T.muted2, margin: "4px 0 12px" }}>Nenhum módulo registrou uso.</p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
          {p.modules.map(m => <ModuleChip key={m.module} {...m} lastUsed={m.lastUsed} />)}
        </div>
      )}

      <SectionLabel style={{ marginBottom: 8 }}>Qualidade de dado</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 10 }}>
        {([
          ["Fichas provisórias", q.guestsProvisional, "hóspede sem CPF — o id ainda é GUEST-*"],
          ["Telefones sem DDI", q.phonesNoDdi, "envio de WhatsApp falha com 400"],
          ["Fólio aberto após saída", q.staysOpenFolio, "estadia encerrada com conta em aberto"],
          ["Sem conta fechada", q.staysNoBillClosed, "encerrada sem billClosedAt — some do histórico"],
          ["Hóspede sem e-mail", q.guestsNoEmail, "não recebe pré-check-in nem pesquisa"],
        ] as const).map(([label, n, why]) => (
          <div key={label} title={why}
               style={{ padding: "8px 10px", borderRadius: 12, border: `1px solid ${n > 0 ? T.amberBorder : T.border}`,
                        background: n > 0 ? T.amberBg : T.glass }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: n > 0 ? T.amber : T.muted, fontVariantNumeric: "tabular-nums" }}>{n}</div>
            <div style={{ fontSize: 10, color: T.muted, lineHeight: 1.3 }}>{label}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Corpo ───────────────────────────────────────────────────────────────────

export interface PlatformBodyProps {
  snap: PlatformSnapshot | null;
  loading: boolean;
  days: string;
  onDays: (d: string) => void;
  onRefresh: () => void;
}

/** Janelas oferecidas no cabeçalho. */
const WINDOWS = [
  { id: "7", label: "7 dias" }, { id: "30", label: "30 dias" }, { id: "90", label: "90 dias" },
];

export function PlatformBody({ snap, loading, days, onDays, onRefresh }: PlatformBodyProps) {
  // O herói só divide em duas colunas quando há largura de verdade; abaixo
  // disso o ranking desce para baixo do gráfico em vez de espremer os dois.
  const wide = useMediaQuery("(min-width: 1100px)");

  // ── Derivados ──────────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const w = snap?.work ?? [];
    const sum = (k: string) => w.reduce((s, p) => s + Number((p as unknown as Record<string, number>)[k] ?? 0), 0);
    const all = w.reduce((s, p) => s + p.total, 0);
    const msgs = sum("mensagens");
    const breakdown = Object.keys(WORK_LABELS)
      .map(k => ({ label: WORK_LABELS[k], value: sum(k) }))
      .filter(r => r.value > 0)
      .sort((a, b) => b.value - a.value);
    const perDay = w.length ? Math.round(all / w.length) : 0;
    return { all, msgs, breakdown, perDay };
  }, [snap]);

  const cronRows = useMemo(() => {
    const rows = snap?.pulse?.cron ?? [];
    return rows
      .filter(c => CRON_EXPECTED[c.action])
      .map(c => {
        const spec = CRON_EXPECTED[c.action];
        const h = hoursSince(c.lastRun);
        // Folga de 50% para um atraso de minutos não virar alarme. E só cobra
        // frescor de quem registra TODA execução: para os `onAction`, a data é
        // "a última vez que teve o que fazer", não "a última vez que rodou".
        return { ...c, ...spec, late: spec.logs === "always" && h > spec.everyH * 1.5, h };
      })
      .sort((a, b) => Number(b.late) - Number(a.late) || a.h - b.h);
  }, [snap]);

  const lateCrons = cronRows.filter(c => c.late).length;

  const infra = snap?.infra;
  const memUsedPct = infra?.memTotalBytes && infra?.memAvailableBytes
    ? (1 - infra.memAvailableBytes / infra.memTotalBytes) * 100 : null;
  const diskUsedPct = infra?.diskSizeBytes && infra?.diskAvailBytes
    ? (1 - infra.diskAvailBytes / infra.diskSizeBytes) * 100 : null;

  const queue = snap?.pulse?.queue ?? {};
  const stuck = Number(queue.processing ?? 0) + Number(queue.pending ?? 0) + Number(queue.queued ?? 0);
  const storageTotal = (snap?.storage?.buckets ?? []).reduce((s, b) => s + Number(b.bytes), 0);
  const storageObjects = (snap?.storage?.buckets ?? []).reduce((s, b) => s + Number(b.objects), 0);

  return (
    <PageShell maxWidth="xl" gap={20}>
        <PageHeader
          icon={Layers}
          title="Plataforma"
          titleAccent="Aura"
          subtitle="O que a plataforma executou, o que está quebrado e quanto de infraestrutura isso custa."
          tabs={<SegmentedTabs items={WINDOWS} value={days} onChange={onDays} size="sm" ariaLabel="Janela de tempo" />}
          actions={<Button variant="secondary" icon={RefreshCw} onClick={onRefresh} loading={loading}>Atualizar</Button>}
        />

        {/* ── HERÓI: o trabalho que o Aura fez ────────────────────────────── */}
        <Card pad={20}>
          <div style={{ display: "grid", gap: 20, gridTemplateColumns: wide ? "minmax(0,2fr) minmax(0,1fr)" : "minmax(0,1fr)" }}>
            <div style={{ minWidth: 0 }}>
              <SectionLabel>Trabalho que o Aura fez · últimos {days} dias</SectionLabel>
              {loading ? (
                <Skeleton w={200} h={54} radius={10} style={{ margin: "10px 0 6px" }} />
              ) : (
                <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", margin: "6px 0 2px" }}>
                  <span style={{ fontSize: 52, fontWeight: 800, lineHeight: 1, letterSpacing: "-0.02em", color: T.text }}>
                    {totals.all.toLocaleString("pt-BR")}
                  </span>
                  <span style={{ fontSize: 13, color: T.muted }}>
                    eventos · <strong style={{ color: T.text }}>{totals.perDay.toLocaleString("pt-BR")}</strong> por dia
                  </span>
                </div>
              )}
              <p style={{ fontSize: 11, color: T.muted2, margin: "0 0 6px" }}>
                Mensagens entregues, tarefas geradas, check-ins, lançamentos de fólio, pedidos e movimentações — somados.
              </p>
              {loading ? <Skeleton w="100%" h={210} radius={14} /> : <WorkArea data={snap?.work ?? []} />}
            </div>

            <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ padding: "12px 14px", borderRadius: 14, border: `1px solid ${T.border}`, background: T.glass }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: T.muted, fontSize: 11 }}>
                  <MessageSquare size={13} /> Mensagens de WhatsApp
                </div>
                <div style={{ fontSize: 26, fontWeight: 800, color: T.text, fontVariantNumeric: "tabular-nums", lineHeight: 1.2 }}>
                  {totals.msgs.toLocaleString("pt-BR")}
                </div>
                <div style={{ fontSize: 10, color: T.muted2 }}>
                  Separadas do ranking abaixo: sozinhas são {totals.all ? Math.round((totals.msgs / totals.all) * 100) : 0}% do volume
                  e achatariam todo o resto.
                </div>
              </div>
              <div style={{ minWidth: 0 }}>
                <SectionLabel style={{ marginBottom: 6 }}>Trabalho operacional</SectionLabel>
                {loading ? <Skeleton w="100%" h={280} radius={14} />
                  : totals.breakdown.length === 0
                    ? <EmptyState compact icon={Activity} title="Sem eventos na janela" />
                    : <RankBars rows={totals.breakdown} />}
              </div>
            </div>
          </div>
        </Card>

        {/* ── PLANTÃO ─────────────────────────────────────────────────────── */}
        <div>
          <SectionLabel style={{ marginBottom: 10 }}>Plantão · o que precisa de você agora</SectionLabel>
          <KpiGrid cols={4}>
            <KpiCard icon={Timer} tone={stuck > 0 ? "red" : "green"} loading={loading}
                     label="Mensagens travadas" value={stuck}
                     sub={snap?.pulse?.stuckOldest ? `a mais antiga ${ago(snap.pulse.stuckOldest)}` : "fila limpa"} />
            <KpiCard icon={TriangleAlert} tone={(snap?.pulse?.failed24h ?? 0) > 0 ? "amber" : "green"} loading={loading}
                     label="Falhas de envio 24h" value={snap?.pulse?.failed24h ?? 0}
                     sub={`${snap?.pulse?.failedTotal ?? 0} desde sempre`} />
            <KpiCard icon={ShieldAlert} tone={(snap?.pulse?.loginFails24h ?? 0) > 20 ? "amber" : "neutral"} loading={loading}
                     label="Logins recusados 24h" value={snap?.pulse?.loginFails24h ?? 0} sub="tentativas sem sucesso" />
            <KpiCard icon={Bug} tone={(snap?.pulse?.openBugs ?? 0) > 0 ? "amber" : "green"} loading={loading}
                     label="Problemas reportados" value={snap?.pulse?.openBugs ?? 0} sub="abertos pelo portal" />
          </KpiGrid>

          <Card pad={16} style={{ marginTop: 12 }}
                header={{ title: "Rotinas automáticas", sub: `${cronRows.length} observáveis pela auditoria · ${CRON_UNOBSERVABLE.length} que o painel não enxerga`, icon: Zap,
                          tone: lateCrons > 0 ? "amber" : "green",
                          aside: <Pill tone={lateCrons > 0 ? "amber" : "green"}
                                       label={lateCrons > 0 ? `${lateCrons} atrasada(s)` : `${cronRows.length} em dia`} /> }}>
            {loading ? <Skeleton w="100%" h={90} radius={12} />
              : cronRows.length === 0
                ? <EmptyState compact icon={Zap} title="Nenhuma rotina registrou execução"
                              description="Os crons gravam auditoria com ação CRON_*; sem esses registros não dá para afirmar que rodaram." />
                : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(190px,1fr))", gap: 8 }}>
                    {cronRows.map(c => {
                      const onAction = c.logs === "onAction";
                      const dot = c.late ? T.amber : onAction ? T.muted : T.green;
                      return (
                        <div key={c.action}
                             title={onAction
                               ? `${c.label} — sai cedo quando não há o que fazer, então isto é a última vez que AGIU, não a última execução. Silêncio aqui não é falha.`
                               : `${c.runs7d} execuções em 7 dias`}
                             style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 12,
                                      border: `1px solid ${c.late ? T.amberBorder : T.border}`, background: c.late ? T.amberBg : T.glass }}>
                          <span style={{ width: 6, height: 6, borderRadius: 999, background: dot, flexShrink: 0 }} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 12, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.label}</div>
                            <div style={{ fontSize: 10, color: c.late ? T.amber : T.muted2 }}>
                              {onAction ? `agiu ${ago(c.lastRun)}` : ago(c.lastRun)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
            {/* O verde acima só vale para quem registra. Dizer quais ficam de fora
                é o que impede o cartão de prometer uma cobertura que ele não tem. */}
            <p style={{ fontSize: 10, color: T.muted2, margin: "10px 0 0", lineHeight: 1.5 }}>
              Fora do alcance da auditoria:{" "}
              {CRON_UNOBSERVABLE.map((c, i) => (
                <span key={c.label} title={c.why}>
                  {i > 0 && " · "}<span style={{ borderBottom: `1px dotted ${T.muted2}` }}>{c.label}</span>
                </span>
              ))}
              . Estas não gravam ação <code>CRON_*</code>, então o painel não afirma nada sobre elas —
              nem que rodaram, nem que falharam.
            </p>
          </Card>
        </div>

        {/* ── INFRAESTRUTURA ──────────────────────────────────────────────── */}
        <div>
          <SectionLabel style={{ marginBottom: 10 }}>Infraestrutura · o que a plataforma consome</SectionLabel>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))" }}>
            <Card pad={16} header={{ title: "Instância do banco", sub: infra ? `medido ${ago(infra.scrapedAt)}` : "sem leitura", icon: Server, tone: "brand" }}>
              {loading ? <Skeleton w="100%" h={120} radius={12} />
                : !infra ? <EmptyState compact icon={Server} title="Métricas indisponíveis"
                                       description="O endpoint de métricas do Supabase não respondeu com a chave de serviço." />
                : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <Meter label="Memória em uso" tone={(memUsedPct ?? 0) > 85 ? "red" : (memUsedPct ?? 0) > 70 ? "amber" : "brand"}
                           pct={memUsedPct ?? 0}
                           value={`${bytes((infra.memTotalBytes ?? 0) - (infra.memAvailableBytes ?? 0))} / ${bytes(infra.memTotalBytes)}`} />
                    <Meter label="Disco em uso" tone={(diskUsedPct ?? 0) > 85 ? "red" : (diskUsedPct ?? 0) > 70 ? "amber" : "brand"}
                           pct={diskUsedPct ?? 0}
                           value={`${bytes((infra.diskSizeBytes ?? 0) - (infra.diskAvailBytes ?? 0))} / ${bytes(infra.diskSizeBytes)}`} />
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(84px,1fr))", gap: 10, paddingTop: 4 }}>
                      <Stat label="Banco" value={infra.dbSizeMb != null ? `${infra.dbSizeMb.toFixed(0)} MB` : "—"} />
                      <Stat label="Carga (1 min)" value={infra.load1?.toFixed(2) ?? "—"} />
                      <Stat label="Realtime" value={infra.realtimeSubscriptions ?? "—"} sub="assinaturas" />
                      <Stat label="Conexões" value={infra.connections.reduce((s, c) => s + c.n, 0)}
                            sub={infra.connections.slice(0, 2).map(c => `${c.user} ${c.n}`).join(" · ")} />
                    </div>
                  </div>
                )}
            </Card>

            <Card pad={16}
                  header={{ title: "Quem consome o banco", icon: Gauge, tone: "brand",
                            sub: snap?.dbLoad?.statsSince ? `acumulado desde ${format(new Date(snap.dbLoad.statsSince), "dd/MM", { locale: ptBR })}` : "tempo total de execução" }}>
              {loading ? <Skeleton w="100%" h={200} radius={12} />
                : !snap?.dbLoad?.topQueries?.length ? <EmptyState compact icon={Gauge} title="Sem estatísticas de consulta" />
                : (
                  <>
                    <RankBars
                      rows={snap.dbLoad.topQueries.slice(0, 6).map(q => ({ label: q.label, value: Math.round(q.totalMs / 1000) }))}
                      format={(v) => v >= 3600 ? `${(v / 3600).toFixed(1)} h` : v >= 60 ? `${Math.round(v / 60)} min` : `${v} s`}
                      unit={(v) => v >= 3600 ? `${(v / 3600).toFixed(1)} horas de banco` : `${v} segundos de banco`}
                    />
                    <p style={{ fontSize: 10, color: T.muted2, margin: "8px 0 0", lineHeight: 1.4 }}>
                      Tempo total de execução, não bytes: o egress faturado só existe no billing do Supabase.
                      Isto responde <em>quem</em> consome — que é a pergunta acionável.
                    </p>
                  </>
                )}
            </Card>
          </div>

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", marginTop: 12 }}>
            <Card pad={16}
                  header={{ title: "Acervo de imagens", icon: ImageIcon,
                            tone: storageTotal > 400 * 1024 ** 2 ? "amber" : "brand",
                            sub: storageObjects ? `${storageObjects} arquivos · média de ${bytes(Math.round(storageTotal / storageObjects))}` : "sem arquivos" }}>
              {loading ? <Skeleton w="100%" h={168} radius={12} />
                : !snap?.storage?.sizeBands?.length
                  ? <EmptyState compact icon={ImageIcon} title="Acervo vazio nesta base"
                                description="O espelho de DEV não carrega os objetos do Storage — em produção este bloco enche." />
                  : (
                    <>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
                        <span style={{ fontSize: 26, fontWeight: 800, color: T.text }}>{bytes(storageTotal)}</span>
                        <span style={{ fontSize: 11, color: T.muted }}>em {snap.storage.buckets.length} bucket(s)</span>
                      </div>
                      <BandColumns rows={snap.storage.sizeBands} />
                      <p style={{ fontSize: 10, color: T.muted2, margin: "8px 0 0", lineHeight: 1.4 }}>
                        Arquivos acima de 3 MB são anteriores à compressão no upload. Metade do egress que estourou a cota
                        gratuita em agosto saiu daqui.
                      </p>
                    </>
                  )}
            </Card>

            <Card pad={16} header={{ title: "Maiores tabelas", icon: Database, tone: "brand",
                                     sub: snap?.dbLoad ? `banco com ${bytes(snap.dbLoad.dbSizeBytes)}` : undefined }}>
              {loading ? <Skeleton w="100%" h={200} radius={12} />
                : !snap?.dbLoad?.topTables?.length ? <EmptyState compact icon={Database} title="Sem dados de tabela" />
                : <RankBars
                    rows={snap.dbLoad.topTables.slice(0, 6).map(t => ({ label: t.table, value: Number(t.bytes) }))}
                    format={bytes} unit={bytes} />}
            </Card>
          </div>
        </div>

        {/* ── PROPRIEDADES ────────────────────────────────────────────────── */}
        <div>
          <SectionLabel style={{ marginBottom: 10 }}>
            Propriedades · {snap?.properties.length ?? 0} na base
          </SectionLabel>
          {loading ? (
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))" }}>
              {[0, 1, 2].map(i => <Skeleton key={i} w="100%" h={300} radius={18} />)}
            </div>
          ) : !snap?.properties.length ? (
            <EmptyState icon={Boxes} title="Nenhuma propriedade" />
          ) : (
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))" }}>
              {snap.properties.map(p => <PropertyCard key={p.id} p={p} />)}
            </div>
          )}
        </div>

        {/* Fontes que falharam ficam visíveis: zero silencioso é pior que erro. */}
        {!!snap?.errors?.length && (
          <Card pad={12} tone="amber">
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 11, color: T.amber }}>
              <CircleAlert size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <strong>Fontes indisponíveis nesta leitura:</strong> {snap.errors.join(" · ")}
              </div>
            </div>
          </Card>
        )}

        {snap && (
          <p style={{ fontSize: 10, color: T.muted2, textAlign: "center", margin: 0 }}>
            <Users size={10} style={{ display: "inline", verticalAlign: -1, marginRight: 4 }} />
            Retrato gerado em {format(new Date(snap.generatedAt), "dd/MM 'às' HH:mm:ss", { locale: ptBR })} ·
            uma chamada agregada, sem realtime
          </p>
        )}
      </PageShell>
  );
}
