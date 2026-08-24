// Aba Calendário — a estrela da página nova: mês a mês, o preço "a partir
// de" de cada noite (menor diária entre as categorias, no nº de pagantes
// escolhido), a regra que cobre a noite, a flutuação por período aplicada e
// os casamentos. Noite futura SEM regra fica em alerta — sem regra não há
// orçamento. O painel de regras (criar/editar, conflito Sobrepor/Preencher)
// é de gestão; recepção consulta.
"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Heart, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { T } from "@/lib/admin-tokens";
import { RatePeriod } from "@/types/aura";
import { Dialog, useConfirm } from "@/components/aura";
import type { RateBundle } from "@/services/rate-service";
import { dateToIso, formatDateBR, isWeekendNight } from "@/lib/rate-engine";
import { S, pillS } from "@/app/admin/comercial/_components/shared";

const fieldLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase",
  color: T.muted, marginBottom: 5, display: "block",
};

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

export function CalendarioTab({ propertyId, bundle, canManage, onRefresh }: {
  propertyId: string;
  bundle: RateBundle;
  canManage: boolean;
  onRefresh: () => Promise<void> | void;
}) {
  const [form, setForm] = useState<PeriodForm>(EMPTY_FORM);
  const [formOpen, setFormOpen] = useState(false);
  const confirm = useConfirm();
  const [saving, setSaving] = useState(false);
  const [conflicts, setConflicts] = useState<{ name: string; startDate: string; endDate: string }[] | null>(null);
  const [viewDate, setViewDate] = useState(() => new Date());
  const [pax, setPax] = useState(2);

  const tables = bundle.tables;
  const periods = useMemo(
    () => [...bundle.periods].sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [bundle.periods]
  );
  const fluctuations = bundle.fluctuations ?? [];
  const tableById = useMemo(() => new Map(tables.map((t) => [t.id, t])), [tables]);
  const tableName = (id?: string | null) => tableById.get(id ?? "")?.name || "—";
  // Selects de regra: só tabelas ativas — EXCETO a já vinculada (marcada),
  // para editar uma regra nunca derrubar o vínculo em silêncio.
  const selectableTables = (currentId: string) =>
    tables.filter((t) => !t.archivedAt || t.id === currentId);

  // ── Grade do mês ───────────────────────────────────────────────────────────
  const y = viewDate.getFullYear();
  const m = viewDate.getMonth();
  const firstDay = new Date(y, m, 1).getDay();
  const lastDate = new Date(y, m + 1, 0).getDate();
  const todayIso = dateToIso(new Date());

  const dayCells = useMemo(() => {
    const cells: {
      iso: string; day: number; rule?: RatePeriod;
      price: number | null; fluctPct: number | null; adjusted: number | null;
      wedding?: RateBundle["weddings"][number];
    }[] = [];
    for (let d = 1; d <= lastDate; d++) {
      const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const rule = periods.find((p) => iso >= p.startDate && iso <= p.endDate);
      let price: number | null = null;
      if (rule) {
        const tableId = isWeekendNight(iso) ? rule.weekendTableId : rule.weekdayTableId;
        const table = tableId ? tableById.get(tableId) : undefined;
        if (table) {
          const values = Object.values(table.prices || {})
            .map((row) => Number(row?.[String(pax)]) || 0)
            .filter((v) => v > 0);
          if (values.length > 0) price = Math.min(...values);
        }
      }
      const fluct = fluctuations.find((f) => iso >= f.startDate && iso <= f.endDate);
      const fluctPct = fluct ? fluct.pct : null;
      // O "a partir de" mostrado É o que a cotação Automática cobraria.
      const adjusted = price !== null
        ? Math.round(price * (1 + (fluctPct ?? 0) / 100))
        : null;
      cells.push({
        iso, day: d, rule, price, fluctPct, adjusted,
        wedding: bundle.weddings.find(
          (w) => iso >= w.checkin.slice(0, 10) && iso <= w.checkout.slice(0, 10)
        ),
      });
    }
    return cells;
  }, [y, m, lastDate, periods, fluctuations, tableById, pax, bundle.weddings]);

  // ── Regras (gestão) ────────────────────────────────────────────────────────
  const save = async (mode: "strict" | "overwrite" | "fill") => {
    if (!form.name.trim() || !form.startDate || !form.endDate) {
      return toast.error("Preencha nome e datas da regra.");
    }
    if (form.startDate > form.endDate) return toast.error("Data inicial maior que a final.");
    if (!form.weekdayTableId || !form.weekendTableId) {
      return toast.error("Escolha as tabelas de semana e de fim de semana.");
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/tarifario/periods", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId, mode,
          period: {
            id: form.id, name: form.name.trim(),
            startDate: form.startDate, endDate: form.endDate,
            minNights: form.minNights,
            weekdayTableId: form.weekdayTableId || null,
            weekendTableId: form.weekendTableId || null,
          },
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error);
      if (data?.conflict?.length) { setConflicts(data.conflict); return; }
      if (mode === "fill" && data?.created === 0) {
        toast.info("Não há dias vazios para preencher neste período.");
        setConflicts(null);
        return;
      }
      toast.success(
        mode === "overwrite"
          ? "Regra salva — as antigas foram aparadas nessas datas."
          : data?.created > 1 ? `Regra salva em ${data.created} trechos livres.` : "Regra salva."
      );
      setForm(EMPTY_FORM);
      setFormOpen(false);
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
      id: p.id, name: p.name, startDate: p.startDate, endDate: p.endDate,
      minNights: p.minNights,
      weekdayTableId: p.weekdayTableId || "", weekendTableId: p.weekendTableId || "",
    });
    setFormOpen(true);
  };

  const remove = async (p: RatePeriod) => {
    if (!(await confirm({ title: "Excluir regra?", description: `A regra "${p.name}" será removida e as noites dela ficam sem preço.`, confirmLabel: "Excluir", tone: "danger" }))) return;
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

  return (
    <div>
      <style>{`
        .tarif-cal-grid { display: grid; gap: 14px; }
        @media (min-width: 1100px) {
          .tarif-cal-grid { grid-template-columns: 1fr 350px; align-items: start; }
        }
      `}</style>
      <div className="tarif-cal-grid">
        {/* Calendário — o miolo */}
        <div style={{ ...S.card, padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            <button onClick={() => setViewDate(new Date(y, m - 1, 1))}
              style={{ ...S.ghostBtn, padding: "6px 9px" }}><ChevronLeft size={14} /></button>
            <h3 style={{
              margin: 0, fontSize: 15, fontWeight: 900, letterSpacing: ".04em",
              textTransform: "uppercase", color: T.text, minWidth: 170, textAlign: "center",
            }}>
              {viewDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
            </h3>
            <button onClick={() => setViewDate(new Date(y, m + 1, 1))}
              style={{ ...S.ghostBtn, padding: "6px 9px" }}><ChevronRight size={14} /></button>

            <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10.5, color: T.muted, fontWeight: 700 }}>a partir de, para</span>
              <select value={pax} onChange={(e) => setPax(Number(e.target.value))}
                style={{ ...S.input, width: "auto", padding: "5px 8px", fontSize: 12, background: T.card }}>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>{n} pagante{n > 1 ? "s" : ""}</option>
                ))}
              </select>
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 5, marginBottom: 5 }}>
            {WEEK_HEADER.map((d) => (
              <div key={d} style={{ textAlign: "center", fontSize: 9, fontWeight: 900, letterSpacing: ".08em", color: T.muted, padding: "3px 0" }}>
                {d}
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 5 }}>
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`e-${i}`} style={{ minHeight: 78, borderRadius: 10, background: T.glass }} />
            ))}
            {dayCells.map((c) => {
              const future = c.iso >= todayIso;
              const uncovered = future && !c.rule;
              const title = c.rule
                ? `${c.rule.name} · mín ${c.rule.minNights}n\nSem: ${tableName(c.rule.weekdayTableId)} · FDS: ${tableName(c.rule.weekendTableId)}`
                  + (c.fluctPct !== null ? `\nFlutuação ${c.fluctPct > 0 ? "+" : ""}${c.fluctPct}%` : "")
                  + (c.wedding ? `\n💍 ${c.wedding.couple}` : "")
                : uncovered ? "Sem regra de tarifário — orçamento bloqueado nesta noite" : "";
              return (
                <div key={c.iso} title={title}
                  onClick={() => { if (canManage && c.rule) edit(c.rule); }}
                  style={{
                    minHeight: 78, borderRadius: 10, padding: "6px 7px", overflow: "hidden",
                    display: "flex", flexDirection: "column", gap: 2,
                    cursor: canManage && c.rule ? "pointer" : "default",
                    background: c.rule ? T.glass2 : "transparent",
                    border: `1px ${uncovered ? "dashed" : "solid"} ${
                      uncovered ? "rgba(248,113,113,0.4)" : c.rule ? T.border2 : T.border
                    }`,
                  }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 900,
                      color: c.iso === todayIso ? T.g1 : T.text,
                    }}>
                      {c.day}
                    </span>
                    {c.wedding && <Heart size={9} color="#fb7185" fill="#fb7185" />}
                    {c.fluctPct !== null && (
                      <span style={{
                        marginLeft: "auto", fontSize: 8.5, fontWeight: 900, borderRadius: 999,
                        padding: "1px 5px", lineHeight: 1.5,
                        background: c.fluctPct > 0 ? T.amberBg : T.emeraldBg,
                        color: c.fluctPct > 0 ? T.amber : T.emerald,
                        border: `1px solid ${c.fluctPct > 0 ? T.amberBorder : T.emeraldBorder}`,
                      }}>
                        {c.fluctPct > 0 ? "+" : ""}{c.fluctPct}%
                      </span>
                    )}
                  </div>
                  {c.adjusted !== null ? (
                    <div style={{ marginTop: "auto" }}>
                      {c.fluctPct !== null && c.price !== null && c.adjusted !== c.price && (
                        <div style={{ fontSize: 8.5, color: T.muted2, textDecoration: "line-through" }}>
                          {c.price.toLocaleString("pt-BR")}
                        </div>
                      )}
                      <div style={{ fontSize: 12, fontWeight: 900, color: T.g2 }}>
                        {c.adjusted.toLocaleString("pt-BR")}
                      </div>
                    </div>
                  ) : uncovered ? (
                    <div style={{ marginTop: "auto", fontSize: 8.5, fontWeight: 800, color: T.red }}>
                      sem regra
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: 10.5, color: T.muted, margin: "10px 0 0" }}>
            Preço = menor diária entre as categorias para {pax} pagante{pax > 1 ? "s" : ""}, com a
            flutuação do período aplicada (o que a cotação Automática cobra). 💍 casamentos ·
            borda vermelha = noite futura sem regra{canManage ? " · clique num dia para editar a regra" : ""}.
          </p>
        </div>

        {/* Painel de regras */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <p style={{ fontSize: 10, fontWeight: 900, letterSpacing: ".14em", textTransform: "uppercase", color: T.muted, margin: 0, flex: 1 }}>
              Regras de calendário
            </p>
            {canManage && !formOpen && (
              <button onClick={() => { setForm(EMPTY_FORM); setFormOpen(true); }}
                style={{ ...S.ghostBtn, padding: "6px 10px", fontSize: 11 }}>
                <Plus size={12} /> Nova regra
              </button>
            )}
          </div>

          {canManage && formOpen && (
            <div style={{ ...S.card, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center" }}>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: T.text, flex: 1 }}>
                  {form.id ? "Editar regra" : "Nova regra"}
                </span>
                <button onClick={() => { setForm(EMPTY_FORM); setFormOpen(false); }}
                  style={{ padding: 4, borderRadius: 8, background: "none", border: "none", color: T.muted, cursor: "pointer", display: "flex" }}>
                  <X size={13} />
                </button>
              </div>
              <div>
                <label style={fieldLabel}>Nome do período</label>
                <input style={S.input} value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex.: Carnaval 2027" />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <label style={fieldLabel}>Primeira noite</label>
                  <input type="date" style={S.input} value={form.startDate}
                    onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
                </div>
                <div>
                  <label style={fieldLabel}>Última noite</label>
                  <input type="date" style={S.input} value={form.endDate}
                    onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
                </div>
              </div>
              <div>
                <label style={fieldLabel}>Tabela — semana (dom–qui)</label>
                <select style={{ ...S.input, background: T.card }} value={form.weekdayTableId}
                  onChange={(e) => setForm({ ...form, weekdayTableId: e.target.value })}>
                  <option value="">Selecione…</option>
                  {selectableTables(form.weekdayTableId).map((t) => (
                    <option key={t.id} value={t.id}>{t.name}{t.archivedAt ? " (arquivada)" : ""}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={fieldLabel}>Tabela — fim de semana (sex/sáb)</label>
                <select style={{ ...S.input, background: T.card }} value={form.weekendTableId}
                  onChange={(e) => setForm({ ...form, weekendTableId: e.target.value })}>
                  <option value="">Selecione…</option>
                  {selectableTables(form.weekendTableId).map((t) => (
                    <option key={t.id} value={t.id}>{t.name}{t.archivedAt ? " (arquivada)" : ""}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={fieldLabel}>Mínimo de diárias</label>
                <input type="number" min={1} style={S.input} value={form.minNights}
                  onChange={(e) => setForm({ ...form, minNights: Math.max(1, parseInt(e.target.value) || 1) })} />
              </div>
              <button disabled={saving} onClick={() => save("strict")}
                style={{ ...S.gradBtn, justifyContent: "center", opacity: saving ? 0.6 : 1 }}>
                {saving && <Loader2 size={13} className="animate-spin" />}
                {form.id ? "Atualizar regra" : "Salvar regra"}
              </button>
            </div>
          )}

          {periods.map((p) => {
            const past = p.endDate < todayIso;
            return (
              <div key={p.id} style={{
                ...S.row, padding: "10px 13px", display: "flex", alignItems: "center", gap: 8,
                opacity: past ? 0.55 : 1, borderLeft: `3px solid ${past ? T.border2 : T.g1}`,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12.5, fontWeight: 800, color: T.text, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {p.name}
                  </p>
                  <p style={{ fontSize: 10.5, color: T.muted, margin: "2px 0 0" }}>
                    {formatDateBR(p.startDate)} a {formatDateBR(p.endDate)} · mín {p.minNights}n
                  </p>
                  <p style={{ fontSize: 10, color: T.muted2, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    Sem: {tableName(p.weekdayTableId)} · FDS: {tableName(p.weekendTableId)}
                  </p>
                </div>
                {canManage && (
                  <span style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                    <button onClick={() => edit(p)} title="Editar"
                      style={{ padding: 5, borderRadius: 8, background: "none", border: "none", color: T.muted, cursor: "pointer", display: "flex" }}>
                      <Pencil size={12} />
                    </button>
                    <button onClick={() => remove(p)} title="Excluir"
                      style={{ padding: 5, borderRadius: 8, background: "none", border: "none", color: T.red, cursor: "pointer", display: "flex" }}>
                      <Trash2 size={12} />
                    </button>
                  </span>
                )}
              </div>
            );
          })}
          {periods.length === 0 && (
            <p style={{ fontSize: 12, color: T.muted, textAlign: "center", padding: "14px 0", margin: 0 }}>
              Nenhuma regra ainda — sem regra não há orçamento.
            </p>
          )}
        </div>
      </div>

      {/* Modal de conflito (port do SIT) */}
      <Dialog open={!!conflicts} onClose={() => setConflicts(null)} presentation="auto" size="sm" title="Conflito de datas" iconTone="red">
        {conflicts && (<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ fontSize: 12.5, color: T.muted, margin: 0 }}>
              Já existe{conflicts.length > 1 ? "m" : ""} {conflicts.length} regra{conflicts.length > 1 ? "s" : ""} nesse intervalo:
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 140, overflowY: "auto" }}>
              {conflicts.map((c, i) => (
                <div key={i} style={{ ...S.row, padding: "7px 11px", fontSize: 12, color: T.text }}>
                  <b>{c.name}</b> · {formatDateBR(c.startDate)} a {formatDateBR(c.endDate)}
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button onClick={() => save("overwrite")} disabled={saving}
                style={{
                  border: `1px solid ${T.redBorder}`, background: T.redBg, borderRadius: 13,
                  padding: 12, textAlign: "left", cursor: "pointer", fontFamily: "inherit",
                  opacity: saving ? 0.6 : 1,
                }}>
                <p style={{ fontSize: 12.5, fontWeight: 900, color: T.red, margin: 0 }}>Sobrepor</p>
                <p style={{ fontSize: 11, color: T.muted, margin: "3px 0 0" }}>
                  Apara as regras antigas nessas datas e impõe a nova.
                </p>
              </button>
              <button onClick={() => save("fill")} disabled={saving}
                style={{
                  border: `1px solid ${T.blueBorder}`, background: T.blueBg, borderRadius: 13,
                  padding: 12, textAlign: "left", cursor: "pointer", fontFamily: "inherit",
                  opacity: saving ? 0.6 : 1,
                }}>
                <p style={{ fontSize: 12.5, fontWeight: 900, color: T.blue, margin: 0 }}>Preencher vazios</p>
                <p style={{ fontSize: 11, color: T.muted, margin: "3px 0 0" }}>
                  Mantém o que existe e aplica a nova só nos dias livres.
                </p>
              </button>
            </div>
            <button onClick={() => setConflicts(null)} disabled={saving}
              style={{ ...S.ghostBtn, justifyContent: "center", opacity: saving ? 0.6 : 1 }}>
              Cancelar operação
            </button>
          </div>)}
      </Dialog>
    </div>
  );
}
