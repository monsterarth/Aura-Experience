// Lista de espera para períodos — aba da página Comercial · Reservas.
// Simples de propósito: nome + contato + período. "Converter" abre a
// calculadora pré-preenchida (?waitlistId=) e a entrada só vira 'converted'
// quando o orçamento é salvo lá.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Archive, CalendarDays, Calculator, Check, Loader2, Phone, PhoneCall, Plus,
  Trash2, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WaitlistEntry, WaitlistStatus } from "@/types/aura";
import { fmtBR } from "./shared";

const STATUS_CFG: Record<WaitlistStatus, { label: string; cls: string }> = {
  waiting:   { label: "Aguardando", cls: "bg-amber-500/15 text-amber-600" },
  contacted: { label: "Contatado",  cls: "bg-sky-500/15 text-sky-600" },
  converted: { label: "Convertido", cls: "bg-emerald-500/15 text-emerald-600" },
  archived:  { label: "Arquivado",  cls: "bg-secondary text-muted-foreground" },
};

const EMPTY_FORM = { name: "", phone: "", email: "", periodStart: "", periodEnd: "", guests: "" };

export function WaitlistTab({
  propertyId, entries, onChanged,
}: {
  propertyId: string;
  entries: WaitlistEntry[];
  onChanged: () => Promise<void> | void;
}) {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY_FORM);
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
    if (!confirm(`Excluir ${entry.name} da lista de espera?`)) return;
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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Button size="sm" variant={showForm ? "outline" : "default"} onClick={() => setShowForm((v) => !v)}>
          <Plus size={14} className="mr-1" /> {showForm ? "Fechar" : "Adicionar à espera"}
        </Button>
        {closedCount > 0 && (
          <button onClick={() => setShowClosed((v) => !v)}
            className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground">
            {showClosed ? "ocultar" : "mostrar"} convertidas/arquivadas ({closedCount})
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-card border border-border rounded-2xl p-4 grid grid-cols-2 md:grid-cols-6 gap-2">
          <div className="col-span-2">
            <label className="field-label">Nome *</label>
            <input className="field-input" value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="field-label">Telefone</label>
            <input className="field-input" inputMode="tel" placeholder="Só dígitos" value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, "") }))} />
          </div>
          <div>
            <label className="field-label">E-mail</label>
            <input className="field-input" type="email" value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <label className="field-label">De *</label>
            <input className="field-input" type="date" value={form.periodStart}
              onChange={(e) => setForm((f) => ({ ...f, periodStart: e.target.value }))} />
          </div>
          <div>
            <label className="field-label">Até *</label>
            <input className="field-input" type="date" value={form.periodEnd}
              onChange={(e) => setForm((f) => ({ ...f, periodEnd: e.target.value }))} />
          </div>
          <div>
            <label className="field-label">Pessoas</label>
            <input className="field-input" type="number" min={1} value={form.guests}
              onChange={(e) => setForm((f) => ({ ...f, guests: e.target.value }))} />
          </div>
          <div className="col-span-2 md:col-span-5 flex items-end justify-end">
            <Button size="sm" onClick={create} disabled={saving}>
              {saving ? <Loader2 size={13} className="mr-1 animate-spin" /> : <Check size={13} className="mr-1" />}
              Registrar
            </Button>
          </div>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <CalendarDays size={28} className="opacity-40" />
          <p className="text-sm">Ninguém aguardando período — registre interessados aqui.</p>
        </div>
      ) : (
        // Agrupada por PERÍODO (UI do projeto de design): cada data concorrida
        // vira um card com a fila numerada por ordem de chegada.
        groupByPeriod(visible).map((g) => (
          <div key={g.key} className="bg-card border border-border rounded-2xl p-4 space-y-2.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-[15px] font-black text-foreground">
                {fmtBR(g.periodStart)} → {fmtBR(g.periodEnd)}
              </span>
              <span className="ml-auto text-[11px] text-muted-foreground/70">
                {g.rows.length} interessado{g.rows.length !== 1 ? "s" : ""} na fila
              </span>
            </div>
            {g.rows.map((e: WaitlistEntry, idx: number) => {
              const cfg = STATUS_CFG[e.status];
              const active = e.status === "waiting" || e.status === "contacted";
              const busy = busyId === e.id;
              return (
                <div key={e.id} className="flex items-center gap-3 bg-secondary/60 border border-border rounded-xl px-3.5 py-2.5 flex-wrap">
                  <span className="w-6 h-6 rounded-lg bg-primary/10 border border-primary/25 text-primary text-[11px] font-black flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-[160px]">
                    <p className="font-semibold text-sm text-foreground truncate">{e.name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                      {e.guests ? <span><Users size={11} className="inline mr-0.5" />{e.guests}</span> : null}
                      {e.phone && <span>{e.phone}</span>}
                      <span>desde {fmtBR(String(e.createdAt).slice(0, 10))}</span>
                    </p>
                  </div>
                  <span className={cn("text-[9px] font-black uppercase tracking-wider rounded-full px-2 py-0.5 shrink-0", cfg.cls)}>
                    {cfg.label}
                  </span>
                  {e.phone && (
                    <a href={`https://wa.me/${e.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"
                      title="Avisar via WhatsApp"
                      className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-500 hover:bg-emerald-500/20 transition-colors shrink-0">
                      <Phone size={13} />
                    </a>
                  )}
                  {active && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      {e.status === "waiting" && (
                        <button disabled={busy} onClick={() => setStatus(e, "contacted")}
                          title="Marcar como contatado"
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-600 bg-sky-500/15 rounded-lg px-2 py-1.5 hover:bg-sky-500/25 transition-colors disabled:opacity-50">
                          <PhoneCall size={12} /> Contatado
                        </button>
                      )}
                      <button disabled={busy} onClick={() => router.push(`/admin/tarifario?waitlistId=${e.id}`)}
                        title="Abrir a calculadora pré-preenchida"
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-500/15 rounded-lg px-2 py-1.5 hover:bg-emerald-500/25 transition-colors disabled:opacity-50">
                        <Calculator size={12} /> Converter
                      </button>
                      <button disabled={busy} onClick={() => setStatus(e, "archived")}
                        title="Arquivar"
                        className="p-1.5 rounded-lg text-muted-foreground hover:bg-secondary transition-colors disabled:opacity-50">
                        {busy ? <Loader2 size={13} className="animate-spin" /> : <Archive size={13} />}
                      </button>
                    </div>
                  )}
                  {!active && (
                    <button disabled={busy} onClick={() => remove(e)}
                      title="Excluir"
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors shrink-0 disabled:opacity-50">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              );
            })}
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
