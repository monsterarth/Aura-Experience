// Lista de espera para períodos — aba da página Comercial · Reservas.
// Agrupada por PERÍODO (UI do projeto de design): cada data concorrida vira
// um card com a fila numerada por ordem de chegada. "Converter" abre o
// wizard de cotação AQUI MESMO (onConvert), pré-preenchido; a entrada só
// vira 'converted' quando o orçamento salvo bate com o lead (FunnelPage).
"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Archive, CalendarDays, Calculator, Check, Loader2, Phone, PhoneCall, Plus,
  Trash2, Users,
} from "lucide-react";
import { T } from "@/lib/admin-tokens";
import { WaitlistEntry, WaitlistStatus } from "@/types/aura";
import { S, fmtBR, pillS } from "./shared";
import { useConfirm } from "@/components/aura";

const STATUS_CFG: Record<WaitlistStatus, { label: string; bg: string; fg: string; bd: string }> = {
  waiting:   { label: "Aguardando", bg: T.amberBg,  fg: T.amber,   bd: T.amberBorder },
  contacted: { label: "Contatado",  bg: T.blueBg,  fg: T.blue,    bd: T.blueBorder },
  converted: { label: "Convertido", bg: T.emeraldBg,              fg: T.emerald, bd: T.emeraldBorder },
  archived:  { label: "Arquivado",  bg: T.glass2,                 fg: T.muted,   bd: T.border2 },
};

const EMPTY_FORM = { name: "", phone: "", email: "", periodStart: "", periodEnd: "", guests: "" };

export function WaitlistTab({
  propertyId, entries, onChanged, onConvert,
}: {
  propertyId: string;
  entries: WaitlistEntry[];
  onChanged: () => Promise<void> | void;
  /** Abre o wizard de cotação semeado com a entrada (o pai arma a conversão). */
  onConvert: (entry: WaitlistEntry) => void;
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const confirm = useConfirm();
  const [showForm, setShowForm] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const visible = entries.filter((e) =>
    showClosed ? true : e.status === "waiting" || e.status === "contacted"
  );
  const closedCount = entries.length - entries.filter((e) => e.status === "waiting" || e.status === "contacted").length;

  const create = async () => {
    if (!form.name.trim() || !form.periodStart || !form.periodEnd) {
      toast.error("Preencha nome e período.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/comercial/waitlist", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId, name: form.name, phone: form.phone, email: form.email,
          periodStart: form.periodStart, periodEnd: form.periodEnd,
          guests: form.guests ? Number(form.guests) : null,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error);
      setForm(EMPTY_FORM);
      setShowForm(false);
      await onChanged();
      toast.success("Adicionado à lista de espera.");
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Erro ao registrar.");
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (entry: WaitlistEntry, status: WaitlistStatus) => {
    setBusyId(entry.id);
    try {
      const res = await fetch("/api/admin/comercial/waitlist", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, id: entry.id, status }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Erro ao atualizar.");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (entry: WaitlistEntry) => {
    if (!(await confirm({ title: "Excluir da lista de espera?", description: `${entry.name} sai da fila.`, confirmLabel: "Excluir", tone: "danger" }))) return;
    setBusyId(entry.id);
    try {
      const res = await fetch(`/api/admin/comercial/waitlist?propertyId=${propertyId}&id=${entry.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      await onChanged();
      toast.success("Entrada excluída.");
    } catch {
      toast.error("Erro ao excluir.");
    } finally {
      setBusyId(null);
    }
  };

  const smallActionBtn = (fg: string, bg: string): React.CSSProperties => ({
    display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 12px",
    borderRadius: 10, border: "none", background: bg, color: fg,
    fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
  });

  const fieldLabel: React.CSSProperties = {
    fontSize: 10, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase",
    color: T.muted, marginBottom: 5, display: "block",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <button onClick={() => setShowForm((v) => !v)}
          style={showForm ? S.ghostBtn : S.gradBtn}>
          <Plus size={14} /> {showForm ? "Fechar" : "Adicionar à espera"}
        </button>
        {closedCount > 0 && (
          <button onClick={() => setShowClosed((v) => !v)}
            style={{
              background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
              fontSize: 11, color: T.muted, textDecoration: "underline", textUnderlineOffset: 3,
            }}>
            {showClosed ? "ocultar" : "mostrar"} convertidas/arquivadas ({closedCount})
          </button>
        )}
      </div>

      {showForm && (
        <div style={{
          ...S.card, padding: 16, display: "grid", gap: 10,
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        }}>
          <div style={{ gridColumn: "span 2" }}>
            <label style={fieldLabel}>Nome *</label>
            <input style={S.input} value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label style={fieldLabel}>Telefone</label>
            <input style={S.input} inputMode="tel" placeholder="Só dígitos" value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, "") }))} />
          </div>
          <div>
            <label style={fieldLabel}>E-mail</label>
            <input style={S.input} type="email" value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <label style={fieldLabel}>De *</label>
            <input style={S.input} type="date" value={form.periodStart}
              onChange={(e) => setForm((f) => ({ ...f, periodStart: e.target.value }))} />
          </div>
          <div>
            <label style={fieldLabel}>Até *</label>
            <input style={S.input} type="date" value={form.periodEnd}
              onChange={(e) => setForm((f) => ({ ...f, periodEnd: e.target.value }))} />
          </div>
          <div>
            <label style={fieldLabel}>Pessoas</label>
            <input style={S.input} type="number" min={1} value={form.guests}
              onChange={(e) => setForm((f) => ({ ...f, guests: e.target.value }))} />
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "flex-end" }}>
            <button onClick={create} disabled={saving} style={{ ...S.gradBtn, opacity: saving ? 0.7 : 1 }}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              Registrar
            </button>
          </div>
        </div>
      )}

      {visible.length === 0 ? (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", padding: "64px 0", gap: 8, color: T.muted,
        }}>
          <CalendarDays size={28} style={{ opacity: 0.4 }} />
          <p style={{ fontSize: 13, margin: 0 }}>Ninguém aguardando período — registre interessados aqui.</p>
        </div>
      ) : (
        groupByPeriod(visible).map((g) => (
          <div key={g.key} style={{ ...S.card, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 15, fontWeight: 900, color: T.text }}>
                {fmtBR(g.periodStart)} → {fmtBR(g.periodEnd)}
              </span>
              <span style={{ marginLeft: "auto", fontSize: 11, color: T.muted2 }}>
                {g.rows.length} interessado{g.rows.length !== 1 ? "s" : ""} na fila
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {g.rows.map((e: WaitlistEntry, idx: number) => {
                const cfg = STATUS_CFG[e.status];
                const active = e.status === "waiting" || e.status === "contacted";
                const busy = busyId === e.id;
                return (
                  <div key={e.id} style={{ ...S.row, display: "flex", alignItems: "center", gap: 12, padding: "9px 14px", flexWrap: "wrap" }}>
                    <span style={{
                      width: 24, height: 24, borderRadius: 8, background: T.gradSoft,
                      border: `1px solid ${T.g1Border}`, color: T.g1, fontSize: 11, fontWeight: 900,
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>
                      {idx + 1}
                    </span>
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {e.name}
                      </div>
                      <div style={{ fontSize: 11, color: T.muted, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        {e.guests ? <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><Users size={11} />{e.guests}</span> : null}
                        {e.phone && <span>{e.phone}</span>}
                        <span>desde {fmtBR(String(e.createdAt).slice(0, 10))}</span>
                      </div>
                    </div>
                    <span style={pillS(cfg.bg, cfg.fg, cfg.bd)}>{cfg.label}</span>
                    {e.phone && (
                      <a href={`https://wa.me/${e.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"
                        title="Avisar via WhatsApp"
                        style={{
                          padding: 7, borderRadius: 10, background: T.emeraldBg,
                          border: `1px solid ${T.emeraldBorder}`, color: T.emerald,
                          display: "flex", flexShrink: 0,
                        }}>
                        <Phone size={13} />
                      </a>
                    )}
                    {active && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                        {e.status === "waiting" && (
                          <button disabled={busy} onClick={() => setStatus(e, "contacted")}
                            title="Marcar como contatado"
                            style={{ ...smallActionBtn(T.blue, T.blueBg), opacity: busy ? 0.5 : 1 }}>
                            <PhoneCall size={12} /> Contatado
                          </button>
                        )}
                        <button disabled={busy} onClick={() => onConvert(e)}
                          title="Abrir a cotação pré-preenchida"
                          style={{ ...smallActionBtn(T.emerald, T.emeraldBg), opacity: busy ? 0.5 : 1 }}>
                          <Calculator size={12} /> Converter
                        </button>
                        <button disabled={busy} onClick={() => setStatus(e, "archived")}
                          title="Arquivar"
                          style={{
                            padding: 6, borderRadius: 8, background: "none", border: "none",
                            color: T.muted, cursor: "pointer", flexShrink: 0, opacity: busy ? 0.5 : 1,
                          }}>
                          {busy ? <Loader2 size={13} className="animate-spin" /> : <Archive size={13} />}
                        </button>
                      </div>
                    )}
                    {!active && (
                      <button disabled={busy} onClick={() => remove(e)}
                        title="Excluir"
                        style={{
                          padding: 6, borderRadius: 8, background: "none", border: "none",
                          color: T.muted, cursor: "pointer", flexShrink: 0, opacity: busy ? 0.5 : 1,
                        }}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

type PeriodGroup = { key: string; periodStart: string; periodEnd: string; rows: WaitlistEntry[] };

/** Agrupa por período (start+end), períodos mais próximos primeiro; dentro do
 *  grupo a ordem é de chegada (createdAt) — é a posição na fila. */
function groupByPeriod(entries: WaitlistEntry[]): PeriodGroup[] {
  const map = new Map<string, PeriodGroup>();
  for (const e of entries) {
    const key = `${e.periodStart}|${e.periodEnd}`;
    if (!map.has(key)) map.set(key, { key, periodStart: e.periodStart, periodEnd: e.periodEnd, rows: [] });
    map.get(key)!.rows.push(e);
  }
  // Array.from, não spread: o target do tsconfig não itera MapIterator.
  const groups = Array.from(map.values());
  for (const g of groups) g.rows.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  groups.sort((a, b) => a.periodStart.localeCompare(b.periodStart));
  return groups;
}
