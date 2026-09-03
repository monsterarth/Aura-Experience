"use client";

// A jornada de uma pessoa, em TRÊS perguntas.
//
// O armazenamento é geral (duas bases e uma lista de regras em jsonb), mas a
// interface é estreita de propósito: "como trabalha", "que horário" e "e os
// domingos". Expor um editor de regras genérico seria devolver ao usuário a
// complexidade que o modelo absorveu.
//
// O que NÃO aparece aqui: uma lista com dezesseis tipos de escala. Produção tem
// três (6x1 com 9 pessoas, 12x36 com 4, 5x2 com 2). Menu grande deixa a tela
// mais difícil, não mais fácil.

import React, { useMemo, useState } from "react";
import { Dialog, Button, Field, FieldRow, Input, Select, SectionLabel, T } from "@/components/aura";
import type { PatternRule, WorkPattern } from "@/lib/schedule-engine";
import type { WorkPatternTemplate } from "@/types/hr";

type Forma = "folga_fixa" | "dias_fixos" | "ciclo" | "none";
type Domingo = "todos" | "um_a_cada_4" | "primeiro_do_mes";

const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

/** Da forma escolhida na tela para o padrão que o banco guarda. */
function montar(
  forma: Forma,
  folgaFixa: number,
  diasMarcados: number[],
  on: number,
  off: number,
  ancora: string,
  domingo: Domingo,
): Pick<WorkPattern, "base" | "weekdays" | "cycleOnDays" | "cycleOffDays" | "cycleAnchor" | "rules"> {
  if (forma === "none") {
    return { base: "none", weekdays: null, cycleOnDays: null, cycleOffDays: null, cycleAnchor: null, rules: [] };
  }

  if (forma === "ciclo") {
    return {
      base: "cycle",
      weekdays: null,
      cycleOnDays: on,
      cycleOffDays: off,
      cycleAnchor: ancora || null,
      rules: [],
    };
  }

  const weekdays =
    forma === "folga_fixa"
      ? [0, 1, 2, 3, 4, 5, 6].filter(d => d !== folgaFixa)
      : [...diasMarcados].sort((a, b) => a - b);

  const rules: PatternRule[] = [];
  // A regra de domingo só faz sentido se a pessoa trabalha domingo.
  if (weekdays.includes(0)) {
    if (domingo === "um_a_cada_4" && ancora) {
      rules.push({ kind: "nth_weekday_off", weekday: 0, everyN: 4, index: 3, anchor: ancora });
    } else if (domingo === "primeiro_do_mes") {
      rules.push({ kind: "monthly_weekday_off", weekday: 0, nth: 1 });
    }
  }

  return { base: "weekly", weekdays, cycleOnDays: null, cycleOffDays: null, cycleAnchor: ancora || null, rules };
}

/** Do padrão gravado de volta para a forma da tela. */
function ler(p: WorkPattern | null) {
  if (!p || p.base === "none") {
    return { forma: "none" as Forma, folgaFixa: 1, dias: [1, 2, 3, 4, 5], on: 1, off: 1, ancora: "", domingo: "todos" as Domingo };
  }
  const rules = p.rules ?? [];
  const domingo: Domingo = rules.some(r => r.kind === "nth_weekday_off" && r.weekday === 0)
    ? "um_a_cada_4"
    : rules.some(r => r.kind === "monthly_weekday_off" && r.weekday === 0)
      ? "primeiro_do_mes"
      : "todos";

  if (p.base === "cycle") {
    return {
      forma: "ciclo" as Forma, folgaFixa: 1, dias: [1, 2, 3, 4, 5],
      on: p.cycleOnDays ?? 1, off: p.cycleOffDays ?? 1,
      ancora: p.cycleAnchor ?? "", domingo: "todos" as Domingo,
    };
  }

  const dias = p.weekdays ?? [];
  const faltando = [0, 1, 2, 3, 4, 5, 6].filter(d => !dias.includes(d));
  return {
    forma: (dias.length === 6 ? "folga_fixa" : "dias_fixos") as Forma,
    folgaFixa: faltando[0] ?? 1,
    dias,
    on: 1,
    off: 1,
    ancora: p.cycleAnchor ?? "",
    domingo,
  };
}

export function PadraoDialog({
  open, onClose, staffId, staffName, atual, modelos, vigenciaPadrao, onSave,
}: {
  open: boolean;
  onClose: () => void;
  staffId: string;
  staffName: string;
  atual: WorkPattern | null;
  modelos: WorkPatternTemplate[];
  vigenciaPadrao: string;
  onSave: (pattern: Partial<WorkPattern> & { staffId: string }) => Promise<unknown>;
}) {
  const inicial = useMemo(() => ler(atual), [atual]);

  const [forma, setForma] = useState<Forma>(inicial.forma);
  const [folgaFixa, setFolgaFixa] = useState(inicial.folgaFixa);
  const [dias, setDias] = useState<number[]>(inicial.dias);
  const [on, setOn] = useState(inicial.on);
  const [off, setOff] = useState(inicial.off);
  const [ancora, setAncora] = useState(inicial.ancora);
  const [domingo, setDomingo] = useState<Domingo>(inicial.domingo);
  const [startTime, setStartTime] = useState(atual?.startTime ?? "08:00");
  const [endTime, setEndTime] = useState(atual?.endTime ?? "17:00");
  const [effectiveFrom, setEffectiveFrom] = useState(vigenciaPadrao);
  const [modeloId, setModeloId] = useState<string>("");
  const [salvando, setSalvando] = useState(false);

  function aplicarModelo(id: string) {
    setModeloId(id);
    const m = modelos.find(x => x.id === id);
    if (!m) return;
    setStartTime(m.startTime);
    setEndTime(m.endTime);
    if (m.base === "cycle") {
      setForma("ciclo");
      setOn(m.cycleOnDays ?? 1);
      setOff(m.cycleOffDays ?? 1);
    } else {
      setForma(m.weekdays?.length ? "dias_fixos" : "folga_fixa");
      if (m.weekdays?.length) setDias(m.weekdays);
      if ((m.rules ?? []).some(r => r.kind === "nth_weekday_off")) setDomingo("um_a_cada_4");
    }
  }

  async function salvar() {
    setSalvando(true);
    try {
      await onSave({
        id: atual?.id,
        staffId,
        templateId: modeloId || atual?.templateId || null,
        startTime: forma === "none" ? null : startTime,
        endTime: forma === "none" ? null : endTime,
        // O diálogo não expõe horário por dia da semana, então ele viaja de volta
        // como está. Sem isto, abrir a jornada do Davi e clicar em Salvar sem
        // mudar nada apagava o domingo 08:20–16:20 dele — e não havia como
        // perceber nem desfazer pela tela.
        weekdayTimeOverrides: atual?.weekdayTimeOverrides ?? null,
        note: atual?.note ?? null,
        effectiveFrom,
        ...montar(forma, folgaFixa, dias, on, off, ancora, domingo),
      });
      onClose();
    } finally {
      setSalvando(false);
    }
  }

  const trabalhaDomingo = forma === "folga_fixa" ? folgaFixa !== 0 : dias.includes(0);
  const precisaAncora = forma === "ciclo" || (forma !== "none" && trabalhaDomingo && domingo === "um_a_cada_4");
  const podeSalvar = forma === "none" || (Boolean(startTime && endTime) && (!precisaAncora || Boolean(ancora)));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      title={`Jornada de ${staffName}`}
      subtitle="Vale a partir da data escolhida. A jornada anterior fica guardada."
      footer={
        <>
          <Button variant="primary" onClick={salvar} loading={salvando} disabled={!podeSalvar}>Salvar jornada</Button>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        </>
      }
    >
      <div style={{ display: "grid", gap: 14 }}>
        {modelos.length > 0 && (
          <Field label="Usar um modelo" hint="Preenche o horário e a forma. Depois dá para ajustar.">
            <Select value={modeloId} onChange={e => aplicarModelo(e.target.value)}>
              <option value="">— não usar modelo —</option>
              {modelos.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </Field>
        )}

        <SectionLabel>1. Como essa pessoa trabalha?</SectionLabel>
        <Field>
          <Select value={forma} onChange={e => setForma(e.target.value as Forma)}>
            <option value="folga_fixa">Todo dia, com uma folga fixa na semana (6x1)</option>
            <option value="dias_fixos">Em dias fixos da semana (5x2, meio período…)</option>
            <option value="ciclo">Um dia sim, um dia não, a partir de uma data (12x36)</option>
            <option value="none">Sem jornada fixa (direção, administração)</option>
          </Select>
        </Field>

        {forma === "folga_fixa" && (
          <Field label="Dia de folga" hint="Cada pessoa do time costuma folgar num dia diferente — é assim que os sete dias ficam cobertos.">
            <Select value={String(folgaFixa)} onChange={e => setFolgaFixa(Number(e.target.value))}>
              {DIAS.map((d, i) => <option key={i} value={String(i)}>{d}</option>)}
            </Select>
          </Field>
        )}

        {forma === "dias_fixos" && (
          <Field label="Dias que trabalha">
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {DIAS.map((d, i) => {
                const marcado = dias.includes(i);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setDias(marcado ? dias.filter(x => x !== i) : [...dias, i])}
                    className="ak-press"
                    style={{
                      minHeight: 44, minWidth: 52, borderRadius: 10, fontSize: 12, fontWeight: 700,
                      border: `1px solid ${marcado ? T.g1Border : T.border}`,
                      background: marcado ? T.gradSoft : T.glass2,
                      color: marcado ? T.brandText : T.muted,
                    }}
                  >
                    {d.slice(0, 3)}
                  </button>
                );
              })}
            </div>
          </Field>
        )}

        {forma === "ciclo" && (
          <FieldRow>
            <Field label="Dias trabalhando"><Input type="number" min={1} value={on} onChange={e => setOn(Number(e.target.value))} /></Field>
            <Field label="Dias de folga"><Input type="number" min={0} value={off} onChange={e => setOff(Number(e.target.value))} /></Field>
          </FieldRow>
        )}

        {forma !== "none" && (
          <>
            <SectionLabel>2. Que horário?</SectionLabel>
            <FieldRow>
              <Field label="Entrada"><Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} /></Field>
              <Field label="Saída"><Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} /></Field>
            </FieldRow>
          </>
        )}

        {forma !== "none" && forma !== "ciclo" && trabalhaDomingo && (
          <>
            <SectionLabel>3. E os domingos?</SectionLabel>
            <Field>
              <Select value={domingo} onChange={e => setDomingo(e.target.value as Domingo)}>
                <option value="todos">Trabalha todos os domingos</option>
                <option value="um_a_cada_4">Folga um domingo a cada quatro</option>
                <option value="primeiro_do_mes">Folga o primeiro domingo do mês</option>
              </Select>
            </Field>
          </>
        )}

        {precisaAncora && (
          <Field
            label={forma === "ciclo" ? "Primeiro dia de trabalho do ciclo" : "Data de referência do ciclo de domingos"}
            hint="É a partir daqui que o sistema conta. Mudar esta data desloca a escala inteira."
            required
          >
            <Input type="date" value={ancora} onChange={e => setAncora(e.target.value)} />
          </Field>
        )}

        <Field label="Vale a partir de" hint="A jornada anterior é encerrada na véspera e fica no histórico.">
          <Input type="date" value={effectiveFrom} onChange={e => setEffectiveFrom(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}
