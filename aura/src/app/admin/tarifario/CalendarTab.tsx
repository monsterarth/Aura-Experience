// Aba Calendário — regras tarifárias por período (tabela de semana × fim de
// semana, mínimo de diárias) com o mesmo tratamento de conflito do SIT
// (sobrepor ou preencher vazios) e visual mensal com casamentos.
"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Heart, Loader2, Pencil, Trash2 } from "lucide-react";
import { RatePeriod } from "@/types/aura";
import type { RateBundle } from "@/services/rate-service";
import { dateToIso, formatDateBR } from "@/lib/rate-engine";

interface Props {
  propertyId: string;
  bundle: RateBundle;
  onRefresh: () => Promise<void> | void;
}

interface PeriodForm {
  id?: string;
  name: string;
  startDate: string;
  endDate: string;
  minNights: number;
  weekdayTableId: string;
  weekendTableId: string;
}

const EMPTY_FORM: PeriodForm = {
  name: "", startDate: "", endDate: "", minNights: 2, weekdayTableId: "", weekendTableId: "",
};

const WEEK_HEADER = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

export default function CalendarTab({ propertyId, bundle, onRefresh }: Props) {
  const [form, setForm] = useState<PeriodForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [conflicts, setConflicts] = useState<{ name: string; startDate: string; endDate: string }[] | null>(null);
  const [viewDate, setViewDate] = useState(() => new Date());

  const tables = bundle.tables;
  const periods = useMemo(
    () => [...bundle.periods].sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [bundle.periods]
  );

  const tableName = (id?: string | null) => tables.find((t) => t.id === id)?.name || "—";

  const save = async (mode: "strict" | "overwrite" | "fill") => {
    if (!form.name.trim() || !form.startDate || !form.endDate) {
      return toast.error("Preencha nome e datas da regra.");
    }
    if (form.startDate > form.endDate) return toast.error("Data inicial maior que a final.");
    if (tables.length === 0) return toast.error("Crie tabelas de preço primeiro (aba Tabelas).");
    if (!form.weekdayTableId || !form.weekendTableId) {
      return toast.error("Escolha as tabelas de semana e de fim de semana.");
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/tarifario/periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId,
          mode,
          period: {
            id: form.id,
            name: form.name.trim(),
            startDate: form.startDate,
            endDate: form.endDate,
            minNights: form.minNights,
            weekdayTableId: form.weekdayTableId || null,
            weekendTableId: form.weekendTableId || null,
          },
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error);

      if (data?.conflict?.length) {
        setConflicts(data.conflict);
        return;
      }
      if (mode === "fill" && data?.created === 0) {
        toast.info("Não há dias vazios para preencher neste período.");
        setConflicts(null);
        return;
      }
      toast.success(
        data?.created > 1 ? `Regra salva em ${data.created} trechos livres.` : "Regra salva."
      );
      setForm(EMPTY_FORM);
      setConflicts(null);
      await onRefresh();
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Erro ao salvar a regra.");
    } finally {
      setSaving(false);
    }
  };

  const edit = (p: RatePeriod) => {
    setForm({
      id: p.id,
      name: p.name,
      startDate: p.startDate,
      endDate: p.endDate,
      minNights: p.minNights,
      weekdayTableId: p.weekdayTableId || "",
      weekendTableId: p.weekendTableId || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const remove = async (p: RatePeriod) => {
    if (!confirm(`Excluir a regra "${p.name}"?`)) return;
    try {
      const res = await fetch(
        `/api/admin/tarifario/periods?id=${p.id}&propertyId=${propertyId}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error();
      toast.success("Regra excluída.");
      await onRefresh();
    } catch {
      toast.error("Erro ao excluir (verifique sua permissão).");
    }
  };

  // ── Calendário visual ──────────────────────────────────────────────────────
  const y = viewDate.getFullYear();
  const m = viewDate.getMonth();
  const firstDay = new Date(y, m, 1).getDay();
  const lastDate = new Date(y, m + 1, 0).getDate();
  const todayIso = dateToIso(new Date()); // data local, não UTC

  const dayCells = useMemo(() => {
    const cells: { iso: string; day: number; rule?: RatePeriod; wedding?: RateBundle["weddings"][number] }[] = [];
    for (let d = 1; d <= lastDate; d++) {
      const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({
        iso,
        day: d,
        rule: periods.find((p) => iso >= p.startDate && iso <= p.endDate),
        wedding: bundle.weddings.find(
          (w) => iso >= w.checkin.slice(0, 10) && iso <= w.checkout.slice(0, 10)
        ),
      });
    }
    return cells;
  }, [y, m, lastDate, periods, bundle.weddings]);

  return (
    <div className="grid lg:grid-cols-[380px_1fr] gap-4 items-start">
      {/* Coluna esquerda: form + lista */}
      <div className="space-y-4">
        <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
          <h3 className="font-semibold text-foreground">
            {form.id ? "✏️ Editar regra" : "📅 Nova regra de calendário"}
          </h3>
          <div>
            <label className="field-label">Nome do período</label>
            <input className="field-input" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ex.: Carnaval 2027 - mínimo 5 diárias" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Primeira noite</label>
              <input type="date" className="field-input" value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <div>
              <label className="field-label">Última noite</label>
              <input type="date" className="field-input" value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="field-label">Tabela — dias de semana (dom–qui)</label>
            <select className="field-input" value={form.weekdayTableId}
              onChange={(e) => setForm({ ...form, weekdayTableId: e.target.value })}>
              <option value="">Selecione…</option>
              {tables.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Tabela — fim de semana (sex/sáb)</label>
            <select className="field-input" value={form.weekendTableId}
              onChange={(e) => setForm({ ...form, weekendTableId: e.target.value })}>
              <option value="">Selecione…</option>
              {tables.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Mínimo de diárias</label>
            <input type="number" min={1} className="field-input" value={form.minNights}
              onChange={(e) => setForm({ ...form, minNights: Math.max(1, parseInt(e.target.value) || 1) })} />
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" disabled={saving} onClick={() => save("strict")}>
              {saving && <Loader2 size={14} className="mr-1 animate-spin" />}
              {form.id ? "Atualizar regra" : "Salvar regra"}
            </Button>
            {form.id && (
              <Button variant="ghost" onClick={() => setForm(EMPTY_FORM)}>Cancelar</Button>
            )}
          </div>
        </div>

        <div className="space-y-2">
          {periods.map((p) => (
            <div key={p.id}
              className="bg-card border border-border border-l-4 border-l-blue-500 rounded-xl px-4 py-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-sm text-foreground truncate">{p.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDateBR(p.startDate)} a {formatDateBR(p.endDate)} · mín {p.minNights}d
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  Sem: {tableName(p.weekdayTableId)} · FDS: {tableName(p.weekendTableId)}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="sm" onClick={() => edit(p)}><Pencil size={14} /></Button>
                <Button variant="ghost" size="sm" className="text-red-600" onClick={() => remove(p)}>
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
          ))}
          {periods.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhuma regra ainda — sem regra não há orçamento.
            </p>
          )}
        </div>
      </div>

      {/* Coluna direita: calendário */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <Button variant="outline" size="sm"
            onClick={() => setViewDate(new Date(y, m - 1, 1))}>
            <ChevronLeft size={15} />
          </Button>
          <h3 className="font-bold text-foreground uppercase">
            {viewDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
          </h3>
          <Button variant="outline" size="sm"
            onClick={() => setViewDate(new Date(y, m + 1, 1))}>
            <ChevronRight size={15} />
          </Button>
        </div>
        <div className="grid grid-cols-7 gap-1.5 mb-1">
          {WEEK_HEADER.map((d) => (
            <div key={d} className="text-center text-[10px] font-black text-muted-foreground py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`empty-${i}`} className="min-h-[76px] rounded-lg bg-secondary/30" />
          ))}
          {dayCells.map((c) => (
            <div key={c.iso}
              className={`min-h-[76px] rounded-lg border p-1.5 text-xs overflow-hidden ${
                c.wedding
                  ? "border-purple-400 bg-purple-50"
                  : c.rule
                    ? "border-emerald-300 bg-emerald-50/60"
                    : "border-border bg-background"
              }`}>
              <span className={`font-bold ${c.iso === todayIso ? "text-red-600" : "text-foreground"}`}>
                {c.day}
              </span>
              {c.wedding && (
                <div className="mt-0.5 flex items-center gap-0.5 rounded bg-purple-600 text-white px-1 py-0.5 text-[9px] font-bold truncate"
                  title={c.wedding.couple}>
                  <Heart size={8} className="shrink-0" /> <span className="truncate">{c.wedding.couple}</span>
                </div>
              )}
              {c.rule && (
                <div className="mt-0.5 rounded bg-blue-600/90 text-white px-1 py-0.5 text-[9px] font-bold truncate cursor-pointer"
                  title={c.rule.name} onClick={() => edit(c.rule!)}>
                  {c.rule.name}
                </div>
              )}
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground mt-3">
          💍 Casamentos vêm do módulo Casamentos · regras clicáveis para editar.
        </p>
      </div>

      {/* Modal de conflito (port do SIT) */}
      {conflicts && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-background rounded-2xl w-full max-w-lg p-6 space-y-4">
            <h3 className="font-bold text-lg text-red-600">⚠️ Conflito de datas</h3>
            <p className="text-sm text-muted-foreground">
              Já existe{conflicts.length > 1 ? "m" : ""} {conflicts.length} regra{conflicts.length > 1 ? "s" : ""} nesse intervalo:
            </p>
            <ul className="text-sm space-y-1 max-h-32 overflow-y-auto">
              {conflicts.map((c, i) => (
                <li key={i} className="bg-secondary rounded-lg px-3 py-1.5">
                  <b>{c.name}</b> · {formatDateBR(c.startDate)} a {formatDateBR(c.endDate)}
                </li>
              ))}
            </ul>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => save("overwrite")}
                className="border-2 border-red-400 rounded-xl p-3 text-left hover:bg-red-50 transition-colors">
                <p className="font-bold text-red-600 text-sm">🔥 Sobrepor</p>
                <p className="text-xs text-muted-foreground">Apara as regras antigas nessas datas e impõe a nova.</p>
              </button>
              <button onClick={() => save("fill")}
                className="border-2 border-blue-400 rounded-xl p-3 text-left hover:bg-blue-50 transition-colors">
                <p className="font-bold text-blue-600 text-sm">🧩 Preencher vazios</p>
                <p className="text-xs text-muted-foreground">Mantém o que existe e aplica a nova só nos dias livres.</p>
              </button>
            </div>
            <Button variant="ghost" className="w-full" onClick={() => setConflicts(null)}>
              Cancelar operação
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
