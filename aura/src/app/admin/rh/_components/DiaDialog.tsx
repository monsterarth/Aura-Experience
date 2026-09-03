"use client";

// O menu curto de uma célula. Clicar num dia não abre formulário: abre quatro
// escolhas. É o que mantém a tela do mês um editor de exceções e não um
// construtor de grade.

import React, { useState } from "react";
import { Dialog, Button, Field, FieldRow, Input, Select, SectionLabel, Pill, T } from "@/components/aura";
import type { AbsenceType, StaffShift } from "@/types/hr";

const TIPOS: Array<{ id: AbsenceType; label: string }> = [
  { id: "ferias", label: "Férias" },
  { id: "atestado", label: "Atestado" },
  { id: "folga", label: "Folga" },
  { id: "afastamento", label: "Afastamento" },
  { id: "falta", label: "Falta" },
  { id: "banco_horas", label: "Banco de horas" },
  { id: "outro", label: "Outro" },
];

function br(ymd: string) {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

export function DiaDialog({
  open, onClose, staffId, staffName, date, dia, onAcao,
}: {
  open: boolean;
  onClose: () => void;
  staffId: string;
  staffName: string;
  date: string;
  dia?: StaffShift;
  onAcao: (body: Record<string, unknown>, msgs: { loading: string; success: string }) => Promise<unknown>;
}) {
  const [modo, setModo] = useState<"menu" | "horario" | "ausencia">("menu");
  const [startTime, setStartTime] = useState(dia?.startTime ?? "08:00");
  const [endTime, setEndTime] = useState(dia?.endTime ?? "17:00");
  const [tipo, setTipo] = useState<AbsenceType>("folga");
  const [ate, setAte] = useState(date);
  const [motivo, setMotivo] = useState("");

  function fechar() {
    setModo("menu");
    onClose();
  }

  async function folgar() {
    await onAcao(
      { action: "ajustarDia", day: { staffId, date, isWork: false, note: "Folga lançada à mão" } },
      { loading: "Marcando folga…", success: "Folga marcada." },
    );
    fechar();
  }

  async function salvarHorario() {
    await onAcao(
      { action: "ajustarDia", day: { staffId, date, isWork: true, startTime, endTime } },
      { loading: "Salvando horário…", success: "Horário salvo." },
    );
    fechar();
  }

  async function salvarAusencia() {
    await onAcao(
      {
        action: "salvarAusencia",
        absence: { staffId, type: tipo, startDate: date, endDate: ate < date ? date : ate, reason: motivo || null },
      },
      { loading: "Lançando ausência…", success: "Ausência lançada." },
    );
    fechar();
  }

  async function voltarAoPadrao() {
    await onAcao(
      { action: "desfazerDia", staffId, date },
      { loading: "Voltando ao padrão…", success: "Dia voltou ao padrão." },
    );
    fechar();
  }

  return (
    <Dialog
      open={open}
      onClose={fechar}
      size="sm"
      title={staffName}
      subtitle={`${br(date)} · ${dia?.isWork ? `${dia.startTime ?? ""} às ${dia.endTime ?? ""}` : dia ? "Folga" : "Sem escala"}`}
      footer={
        modo === "menu" ? (
          <Button variant="ghost" onClick={fechar}>Fechar</Button>
        ) : (
          <>
            <Button variant="primary" onClick={modo === "horario" ? salvarHorario : salvarAusencia}>Salvar</Button>
            <Button variant="ghost" onClick={() => setModo("menu")}>Voltar</Button>
          </>
        )
      }
    >
      {modo === "menu" && (
        <div style={{ display: "grid", gap: 8 }}>
          {dia?.origin === "manual" && (
            <Pill tone="blue">Este dia foi ajustado à mão — o gerador não mexe nele.</Pill>
          )}
          {dia?.origin === "absence" && (
            <Pill tone="amber">Este dia vem de uma ausência lançada{dia.note ? `: ${dia.note}` : "."}</Pill>
          )}

          <Button variant="ghost" onClick={folgar} style={{ justifyContent: "flex-start" }}>
            Marcar folga só neste dia
          </Button>
          <Button variant="ghost" onClick={() => setModo("horario")} style={{ justifyContent: "flex-start" }}>
            Mudar o horário deste dia
          </Button>
          <Button variant="ghost" onClick={() => setModo("ausencia")} style={{ justifyContent: "flex-start" }}>
            Lançar férias, atestado ou afastamento…
          </Button>
          {dia?.origin !== "pattern" && (
            <Button variant="ghost" onClick={voltarAoPadrao} style={{ justifyContent: "flex-start", color: T.muted }}>
              Voltar este dia ao padrão
            </Button>
          )}
        </div>
      )}

      {modo === "horario" && (
        <FieldRow>
          <Field label="Entrada"><Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} /></Field>
          <Field label="Saída"><Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} /></Field>
        </FieldRow>
      )}

      {modo === "ausencia" && (
        <div style={{ display: "grid", gap: 12 }}>
          <SectionLabel>Ausência</SectionLabel>
          <Field label="Tipo">
            <Select value={tipo} onChange={e => setTipo(e.target.value as AbsenceType)}>
              {TIPOS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </Select>
          </Field>
          <FieldRow>
            <Field label="De"><Input type="date" value={date} disabled /></Field>
            <Field label="Até"><Input type="date" value={ate} min={date} onChange={e => setAte(e.target.value)} /></Field>
          </FieldRow>
          <Field label="Observação" hint="Opcional. Aparece na célula da grade.">
            <Input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="ex: retorno dia 12" />
          </Field>
        </div>
      )}
    </Dialog>
  );
}
