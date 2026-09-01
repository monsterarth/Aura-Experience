"use client";

// src/app/admin/ponto/page.tsx
//
// Ponto — histórico do período, correções e relatório.
//
// Duas leituras convivem na mesma tela: a pessoa vê o próprio ponto, e a gestão
// escolhe de quem quer ver. Quem decide isso é a rota (`canManage`), não esta
// página — aqui o seletor de pessoa só aparece quando o servidor mandou a lista.
import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Clock, Download, Plus, Printer, UserCog } from "lucide-react";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import {
  Button, EmptyState, KpiCard, KpiGrid, Loadable, PageHeader, PageShell,
  Select, SkeletonList, T,
} from "@/components/aura";
import { isModuleOn } from "@/lib/modules";
import { formatDayLabel, formatMinutes, localHM, minutesToDecimal } from "@/lib/timeclock";
import type { TimeClockEvent, UserRole, WorkSession } from "@/types/aura";
import { usePonto } from "./_components/usePonto";
import { DayCard } from "./_components/DayCard";
import { PunchDialog, type PunchDialogState } from "./_components/PunchDialog";
import { PontoPrint } from "./_components/PontoPrint";

/** Ponto não é privilégio de cargo: quem registra, registra. O acesso ao ponto
 *  DE OUTRA PESSOA é que é restrito, e isso a rota decide. */
const ALL_ROLES: UserRole[] = [
  "super_admin", "admin", "director", "manager", "reception", "governance", "maid",
  "maintenance", "technician", "kitchen", "waiter", "porter", "houseman", "marketing", "compras",
];

function monthLabel(anchor: Date): string {
  return anchor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

/** Planilha em pt-BR: separador `;` e BOM, senão o Excel abre tudo numa coluna
 *  e come os acentos. */
function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function PontoPage() {
  return (
    <RoleGuard allowedRoles={ALL_ROLES}>
      <PontoInner />
    </RoleGuard>
  );
}

function PontoInner() {
  const { userData } = useAuth();
  const { currentProperty } = useProperty();
  const ponto = usePonto(userData?.id, currentProperty?.id);
  const [dialog, setDialog] = useState<PunchDialogState | null>(null);
  const [printing, setPrinting] = useState(false);

  const moduleOn = isModuleOn(currentProperty?.settings, "ponto");
  const tracksOwn = (userData?.timeSource ?? "none") !== "none";

  const personName = useMemo(() => {
    if (ponto.viewingSelf) return userData?.fullName ?? "—";
    return ponto.staff.find(s => s.id === ponto.staffId)?.fullName ?? "—";
  }, [ponto.viewingSelf, ponto.staff, ponto.staffId, userData?.fullName]);

  const shiftMonth = (delta: number) => {
    const next = new Date(ponto.anchor);
    next.setMonth(next.getMonth() + delta, 1);
    ponto.setAnchor(next);
  };

  const exportCsv = () => {
    const rows: string[][] = [["Dia", "Entrada", "Saída", "Horas", "Horas (decimal)", "Observação"]];
    for (const day of [...ponto.days].reverse()) {
      for (const session of day.sessions) {
        const orphan = session.status === "orphanOut";
        rows.push([
          formatDayLabel(day.date),
          orphan ? "" : localHM(session.start.ts),
          session.end ? localHM(session.end.ts) : "",
          session.status === "closed" ? formatMinutes(session.minutes) : "",
          session.status === "closed" ? minutesToDecimal(session.minutes) : "",
          session.status === "closed" ? "" : session.status === "open" ? "em andamento" : "pendência",
        ]);
      }
    }
    rows.push([]);
    rows.push(["Total", "", "", formatMinutes(ponto.totals.minutes), minutesToDecimal(ponto.totals.minutes), `${ponto.totals.days} dias`]);
    downloadCsv(`ponto-${personName.split(" ")[0].toLowerCase()}-${ponto.anchor.getFullYear()}-${String(ponto.anchor.getMonth() + 1).padStart(2, "0")}.csv`, rows);
  };

  const openCreate = (kind: "in" | "out" = "in", ts = new Date()) =>
    setDialog({ mode: "create", kind, ts });

  const openEdit = (event: TimeClockEvent) =>
    setDialog({ mode: "edit", event, kind: event.kind, ts: new Date(event.ts) });

  /** "Lançar saída" numa jornada esquecida já abre o diálogo no dia certo — a
   *  correção não deve exigir que a pessoa relembre a data. */
  const openFix = (session: WorkSession) => {
    const reference = new Date(session.start.ts);
    if (session.status === "dangling") {
      const end = new Date(reference);
      end.setHours(18, 0, 0, 0);
      setDialog({ mode: "create", kind: "out", ts: end });
    } else {
      const start = new Date(reference);
      start.setHours(8, 0, 0, 0);
      setDialog({ mode: "create", kind: "in", ts: start });
    }
  };

  if (!moduleOn) {
    return (
      <PageShell>
        <PageHeader title="Ponto" icon={Clock} />
        <EmptyState
          icon={Clock}
          title="Módulo de Ponto desligado"
          description="Ligue em Configurações → Módulos para registrar entradas e saídas nesta pousada."
          bordered
        />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title="Ponto"
        titleAccent={ponto.viewingSelf ? undefined : personName}
        icon={Clock}
        subtitle={`${monthLabel(ponto.anchor)} · ${formatMinutes(ponto.totals.minutes)} em ${ponto.totals.days} ${ponto.totals.days === 1 ? "dia" : "dias"}`}
        actions={
          <>
            <Button variant="secondary" icon={Download} onClick={exportCsv} disabled={!ponto.days.length}>Planilha</Button>
            <Button variant="secondary" icon={Printer} onClick={() => setPrinting(true)} disabled={!ponto.days.length}>Imprimir</Button>
          </>
        }
        primaryAction={
          tracksOwn || ponto.canManage
            ? { label: "Lançar batida", icon: Plus, onClick: () => openCreate() }
            : undefined
        }
      />

      {/* Período + pessoa */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 2, background: T.glass2, border: `1px solid ${T.border}`, borderRadius: 10, padding: 2 }}>
          <Button variant="ghost" size="sm" icon={ChevronLeft} onClick={() => shiftMonth(-1)} aria-label="Mês anterior" />
          <span style={{ minWidth: 132, textAlign: "center", fontSize: 13, fontWeight: 800, color: T.text, textTransform: "capitalize" }}>
            {monthLabel(ponto.anchor)}
          </span>
          <Button variant="ghost" size="sm" icon={ChevronRight} onClick={() => shiftMonth(1)} aria-label="Próximo mês" />
        </div>

        {ponto.canManage && ponto.staff.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 220 }}>
            <UserCog size={15} style={{ color: T.muted, flexShrink: 0 }} />
            <Select
              value={ponto.staffId ?? ""}
              onChange={e => ponto.setStaffId(e.target.value || undefined)}
              fieldSize="sm"
            >
              <option value="">Meu ponto</option>
              {ponto.staff.filter(s => s.id !== userData?.id).map(s => (
                <option key={s.id} value={s.id}>
                  {s.fullName}{s.timeSource === "rep" ? " (relógio)" : ""}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      <KpiGrid cols={4}>
        <KpiCard label="Horas no mês" value={formatMinutes(ponto.totals.minutes)} sub="jornadas fechadas" icon={Clock} tone="brand" />
        <KpiCard label="Dias trabalhados" value={ponto.totals.days} sub={monthLabel(ponto.anchor)} tone="blue" />
        <KpiCard label="Média por dia" value={formatMinutes(ponto.totals.average)} sub="nos dias com registro" tone="green" />
        <KpiCard label="Dias com pendência" value={ponto.totals.pending} sub="batida faltando" tone={ponto.totals.pending > 0 ? "amber" : "neutral"} />
      </KpiGrid>

      <Loadable
        loading={ponto.loading}
        skeleton={<SkeletonList rows={5} avatar={false} />}
        error={ponto.error}
        onRetry={ponto.reload}
        isEmpty={ponto.days.length === 0}
        empty={
          <EmptyState
            icon={Clock}
            title="Nenhuma batida neste mês"
            description={
              ponto.viewingSelf && !tracksOwn
                ? "Seu cadastro ainda não está marcado para registrar ponto. Peça a um administrador para ativar em Equipe."
                : "Quando alguém bater o ponto, os dias aparecem aqui."
            }
            bordered
          />
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {ponto.days.map(day => (
            <DayCard key={day.date} day={day} onEdit={openEdit} onFix={openFix} />
          ))}
        </div>
      </Loadable>

      <PunchDialog
        state={dialog}
        onClose={() => setDialog(null)}
        onCreate={ponto.addManual}
        onAdjust={ponto.adjust}
        onDelete={ponto.remove}
      />

      {printing && (
        <PontoPrint
          days={ponto.days}
          totals={ponto.totals}
          personName={personName}
          periodLabel={monthLabel(ponto.anchor)}
          propertyName={currentProperty?.name}
          onClose={() => setPrinting(false)}
        />
      )}
    </PageShell>
  );
}
