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
        visible.map((e) => {
          const cfg = STATUS_CFG[e.status];
          const active = e.status === "waiting" || e.status === "contacted";
          const busy = busyId === e.id;
          return (
            <div key={e.id} className="flex items-center gap-3 bg-card border border-border rounded-2xl px-4 py-3 flex-wrap">
              <div className="flex-1 min-w-[180px]">
                <p className="font-semibold text-sm text-foreground truncate">{e.name}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                  <span><CalendarDays size={11} className="inline mr-0.5" />{fmtBR(e.periodStart)} → {fmtBR(e.periodEnd)}</span>
                  {e.guests ? <span><Users size={11} className="inline mr-0.5" />{e.guests}</span> : null}
                  {e.phone && <span><Phone size={11} className="inline mr-0.5" />{e.phone}</span>}
                </p>
              </div>
              <span className={cn("text-[9px] font-black uppercase tracking-wider rounded-full px-2 py-0.5 shrink-0", cfg.cls)}>
                {cfg.label}
              </span>
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
        })
      )}
    </div>
  );
}
