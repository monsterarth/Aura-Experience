"use client";

// /admin/rh — Gente.
//
// A tela do mês é um EDITOR DE EXCEÇÕES: abre já gerada a partir da jornada de
// cada pessoa, destaca só o que precisa de atenção, e a ação principal é
// Publicar. Com ~20 pessoas de jornada real o mês tem ~600 células e cerca de 15
// exceções — se a pessoa tivesse que preencher as 600, nenhuma interface
// resolveria. Era esse o problema da tela antiga, não o desenho dela.
//
// GATE DE MÓDULO POR ABA, NUNCA NA PÁGINA. `/admin/rh` é destino de login de
// admin e manager (`ROLE_HOME` em `src/lib/role-routes.ts`): um guard de página
// que redirecionasse para a home entraria em loop infinito. As abas de escala e
// ausências checam `isModuleOn(settings, "rh")` e mostram um estado vazio.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Users, Clock, Plane, AlertTriangle, RefreshCw, Send, Copy } from "lucide-react";
import { toast } from "sonner";
import {
  PageShell, PageHeader, SegmentedTabs, useTabParam, KpiGrid, KpiCard, Card, Button,
  Pill, EmptyState, DataList, SectionLabel, Loadable, SkeletonList, T, alpha,
} from "@/components/aura";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { useProperty } from "@/context/PropertyContext";
import { isModuleOn } from "@/lib/modules";
import { addDaysYMD } from "@/lib/schedule-engine";
import type { StaffAbsence, StaffShift, WorkPatternTemplate } from "@/types/hr";
import type { WorkPattern } from "@/lib/schedule-engine";
import { EscalaGrid } from "./_components/EscalaGrid";
import { DiaDialog } from "./_components/DiaDialog";
import { PadraoDialog } from "./_components/PadraoDialog";
import { useEscala, hojeBrt, mesAtualBrt } from "./_components/useEscala";

const TABS = ["escala", "jornadas", "ausencias"] as const;
type Tab = (typeof TABS)[number];

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function nomeMes(month: string) {
  const [y, m] = month.split("-").map(Number);
  return `${MESES[m - 1]} de ${y}`;
}

function br(ymd: string) {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}`;
}

interface PadraoComRotulo extends WorkPattern { label?: string }
interface Pessoa { id: string; fullName: string; role: string; active: boolean }

export default function RhPage() {
  const { currentProperty } = useProperty();
  const propertyId = currentProperty?.id;
  const [tab, setTab] = useTabParam<Tab>("tab", "escala", TABS);

  const rhOn = isModuleOn(currentProperty?.settings, "rh");
  const pontoOn = isModuleOn(currentProperty?.settings, "ponto");

  const { month, setMonth, grid, loading, erro, moduloDesligado, acao } = useEscala(propertyId);

  const [celula, setCelula] = useState<{ staffId: string; staffName: string; date: string; dia?: StaffShift } | null>(null);
  const [padraoDe, setPadraoDe] = useState<{ staffId: string; staffName: string } | null>(null);

  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [padroes, setPadroes] = useState<PadraoComRotulo[]>([]);
  const [modelos, setModelos] = useState<WorkPatternTemplate[]>([]);
  const [ausencias, setAusencias] = useState<StaffAbsence[]>([]);
  const [carregandoAba, setCarregandoAba] = useState(false);

  const carregarApoio = useCallback(async () => {
    if (!propertyId || !rhOn) return;
    setCarregandoAba(true);
    try {
      const [p, pd, md, au] = await Promise.all([
        fetch(`/api/admin/rh?section=pessoas&propertyId=${propertyId}`).then(r => r.json()),
        fetch(`/api/admin/rh?section=padroes&propertyId=${propertyId}`).then(r => r.json()),
        fetch(`/api/admin/rh?section=modelos&propertyId=${propertyId}`).then(r => r.json()),
        fetch(`/api/admin/rh?section=ausencias&propertyId=${propertyId}&from=${month}-01&to=${addDaysYMD(`${month}-01`, 365)}`).then(r => r.json()),
      ]);
      setPessoas(Array.isArray(p) ? p.filter((x: Pessoa) => x.active) : []);
      setPadroes(Array.isArray(pd) ? pd : []);
      setModelos(Array.isArray(md) ? md : []);
      setAusencias(Array.isArray(au) ? au : []);
    } catch {
      toast.error("Falha ao carregar pessoas e jornadas.");
    } finally {
      setCarregandoAba(false);
    }
  }, [propertyId, rhOn, month]);

  useEffect(() => { void carregarApoio(); }, [carregarApoio]);

  const vigentePorPessoa = useMemo(() => {
    const mapa = new Map<string, PadraoComRotulo>();
    for (const p of padroes) {
      if (p.effectiveTo) continue;
      mapa.set(p.staffId, p);
    }
    return mapa;
  }, [padroes]);

  const alertasAltos = grid?.alerts.filter(a => a.severity === "alta") ?? [];
  const publicada = grid?.status === "publicada";

  async function agir(body: Record<string, unknown>, msgs: { loading: string; success: string }) {
    const r = await acao(body, msgs);
    await carregarApoio();
    return r;
  }

  return (
    <RoleGuard allowedRoles={["super_admin", "admin", "manager"]} redirectTo="/admin/login">
      <PageShell>
        <PageHeader
          title="Gente"
          titleAccent={grid ? nomeMes(month) : undefined}
          icon={Users}
          subtitle={
            rhOn
              ? publicada
                ? "Escala publicada — o time já vê este mês."
                : "Rascunho — o time ainda não vê este mês."
              : "Cadastro de equipe. A escala precisa do módulo Gente."
          }
          primaryAction={
            rhOn && tab === "escala"
              ? {
                  label: publicada ? "Republicar" : "Publicar mês",
                  icon: Send,
                  onClick: () =>
                    agir({ action: "publicar" }, { loading: "Publicando…", success: "Mês publicado — o time já vê." }),
                }
              : undefined
          }
          actions={
            rhOn && tab === "escala" ? (
              <>
                <Button
                  variant="ghost"
                  icon={RefreshCw}
                  onClick={() => agir({ action: "materializar" }, { loading: "Gerando…", success: "Escala gerada." })}
                >
                  Gerar
                </Button>
                <Button
                  variant="ghost"
                  icon={Copy}
                  onClick={() => agir({ action: "replicar" }, { loading: "Replicando…", success: "Mês anterior replicado." })}
                >
                  Replicar anterior
                </Button>
              </>
            ) : undefined
          }
          tabs={
            <SegmentedTabs<Tab>
              items={[
                { id: "escala", label: "Escala", icon: CalendarDays },
                { id: "jornadas", label: "Jornadas", icon: Users },
                { id: "ausencias", label: "Ausências", icon: Plane, count: ausencias.length || undefined },
                ...(pontoOn ? [{ id: "ponto" as Tab, label: "Ponto", icon: Clock, href: "/admin/ponto" }] : []),
              ]}
              value={tab}
              onChange={setTab}
              ariaLabel="Seções de Gente"
            />
          }
        />

        {!rhOn || moduloDesligado ? (
          <EmptyState
            icon={CalendarDays}
            title="Módulo Gente desligado"
            description="Ligue em Configurações → Módulos para montar escala, lançar férias e acompanhar as jornadas. O cadastro da equipe continua funcionando sem ele."
          />
        ) : (
          <>
            {/* ─── navegação do mês ─────────────────────────────────────── */}
            <Card style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: 12 }}>
              <Button variant="ghost" size="sm" onClick={() => setMonth(addDaysYMD(`${month}-01`, -1).slice(0, 7))}>← mês anterior</Button>
              <div style={{ fontWeight: 700, color: T.text, minWidth: 150, textAlign: "center" }}>{nomeMes(month)}</div>
              <Button variant="ghost" size="sm" onClick={() => setMonth(addDaysYMD(`${month}-01`, 32).slice(0, 7))}>próximo mês →</Button>
              {month !== mesAtualBrt() && (
                <Button variant="ghost" size="sm" onClick={() => setMonth(mesAtualBrt())}>voltar para hoje</Button>
              )}
              <div style={{ marginLeft: "auto" }}>
                <Pill tone={publicada ? "green" : "amber"}>{publicada ? "Publicada" : "Rascunho"}</Pill>
              </div>
            </Card>

            {tab === "escala" && (
              <Loadable loading={loading} skeleton={<SkeletonList rows={6} />}>
                {erro ? (
                  <EmptyState icon={AlertTriangle} title="Não deu para carregar" description={erro} />
                ) : grid ? (
                  <>
                    <KpiGrid cols={4}>
                      <KpiCard label="Pessoas na escala" value={grid.rows.filter(r => r.plannedMinutes > 0).length} icon={Users} tone="brand" />
                      <KpiCard
                        label="Horas previstas"
                        value={`${Math.round(grid.rows.reduce((a, r) => a + r.plannedMinutes, 0) / 60)}h`}
                        icon={Clock}
                        tone="blue"
                      />
                      <KpiCard label="Avisos" value={grid.alerts.length} sub={`${alertasAltos.length} importante(s)`} icon={AlertTriangle} tone={alertasAltos.length ? "amber" : "neutral"} />
                      <KpiCard label="Sem jornada" value={grid.semPadrao.length} sub="não entram na escala" icon={Users} tone={grid.semPadrao.length ? "amber" : "neutral"} />
                    </KpiGrid>

                    {grid.alerts.length > 0 && (
                      <Card style={{ padding: 12, display: "grid", gap: 6 }}>
                        <SectionLabel>Avisos — a escala não trava, só avisa</SectionLabel>
                        {grid.alerts.slice(0, 8).map((a, i) => (
                          <div
                            key={i}
                            style={{
                              display: "flex", gap: 8, alignItems: "center", fontSize: 12,
                              color: a.severity === "alta" ? T.amber : T.muted,
                              background: a.severity === "alta" ? alpha(T.amber, 8) : undefined,
                              padding: "6px 8px", borderRadius: 8,
                            }}
                          >
                            <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                            <span>{a.message}</span>
                          </div>
                        ))}
                        {grid.alerts.length > 8 && (
                          <div style={{ fontSize: 11, color: T.muted2 }}>e mais {grid.alerts.length - 8} aviso(s).</div>
                        )}
                      </Card>
                    )}

                    {grid.rows.length === 0 ? (
                      <EmptyState
                        icon={CalendarDays}
                        title="Nenhuma jornada cadastrada"
                        description="Cadastre a jornada das pessoas na aba Jornadas e a escala aparece pronta aqui."
                      />
                    ) : (
                      <EscalaGrid
                        grid={grid}
                        onCell={(staffId, staffName, date, dia) => setCelula({ staffId, staffName, date, dia })}
                      />
                    )}
                  </>
                ) : null}
              </Loadable>
            )}

            {tab === "jornadas" && (
              <DataList<Pessoa>
                rows={pessoas}
                rowKey={p => p.id}
                loading={carregandoAba}
                onRowClick={p => setPadraoDe({ staffId: p.id, staffName: p.fullName })}
                empty={<EmptyState icon={Users} title="Nenhuma pessoa ativa" description="Cadastre a equipe em Configurações → Equipe." />}
                columns={[
                  { id: "nome", header: "Pessoa", mobile: "title", cell: p => p.fullName },
                  { id: "cargo", header: "Cargo", mobile: "meta", cell: p => p.role },
                  {
                    id: "jornada",
                    header: "Jornada",
                    mobile: "meta",
                    cell: p => {
                      const v = vigentePorPessoa.get(p.id);
                      return v ? (
                        <Pill tone={v.base === "none" ? "neutral" : "brand"}>{v.label ?? v.base}</Pill>
                      ) : (
                        <Pill tone="amber">sem jornada</Pill>
                      );
                    },
                  },
                  {
                    id: "horario",
                    header: "Horário",
                    mobile: "meta",
                    cell: p => {
                      const v = vigentePorPessoa.get(p.id);
                      return v?.startTime ? `${v.startTime} às ${v.endTime ?? ""}` : "—";
                    },
                  },
                ]}
              />
            )}

            {tab === "ausencias" && (
              <DataList<StaffAbsence>
                rows={ausencias}
                rowKey={a => a.id}
                loading={carregandoAba}
                empty={
                  <EmptyState
                    icon={Plane}
                    title="Nenhuma ausência lançada"
                    description="Férias, atestado, folga e afastamento entram clicando no dia da pessoa na aba Escala."
                  />
                }
                rowActions={a => [
                  {
                    id: "apagar",
                    label: "Apagar",
                    danger: true,
                    onClick: () =>
                      void agir({ action: "apagarAusencia", id: a.id }, { loading: "Apagando…", success: "Ausência apagada." }),
                  },
                ]}
                columns={[
                  {
                    id: "pessoa",
                    header: "Pessoa",
                    mobile: "title",
                    cell: a => pessoas.find(p => p.id === a.staffId)?.fullName ?? a.staffId,
                  },
                  { id: "tipo", header: "Tipo", mobile: "meta", cell: a => <Pill tone="amber">{a.type}</Pill> },
                  {
                    id: "periodo",
                    header: "Período",
                    mobile: "meta",
                    cell: a => (a.startDate === a.endDate ? br(a.startDate) : `${br(a.startDate)} a ${br(a.endDate)}`),
                  },
                  { id: "motivo", header: "Observação", mobile: "meta", cell: a => a.reason ?? "—" },
                ]}
              />
            )}
          </>
        )}

        {celula && (
          <DiaDialog
            open
            onClose={() => setCelula(null)}
            staffId={celula.staffId}
            staffName={celula.staffName}
            date={celula.date}
            dia={celula.dia}
            onAcao={agir}
          />
        )}

        {padraoDe && (
          <PadraoDialog
            open
            onClose={() => setPadraoDe(null)}
            staffId={padraoDe.staffId}
            staffName={padraoDe.staffName}
            atual={vigentePorPessoa.get(padraoDe.staffId) ?? null}
            modelos={modelos}
            vigenciaPadrao={hojeBrt()}
            onSave={pattern => agir({ action: "salvarPadrao", pattern }, { loading: "Salvando jornada…", success: "Jornada salva." })}
          />
        )}
      </PageShell>
    </RoleGuard>
  );
}
