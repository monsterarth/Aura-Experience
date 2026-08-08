// Alarmes do lead no drawer — lista + form inline. Visível TAMBÉM em lead
// fechado: cobrança e lembrete são pós-fechamento por natureza.
"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CrmAlarm, CrmAlarmKind, CrmLead } from "@/types/aura";
import { ALARM_KIND_CFG } from "./AlarmsQueue";
import { fmtBR, todayIso } from "./shared";

export function LeadAlarms({
  propertyId, lead, onChanged,
}: {
  propertyId: string;
  lead: CrmLead;
  /** Avisar a página — a fila e o contador da aba Alarmes ficam em dia. */
  onChanged?: () => void;
}) {
  const [alarms, setAlarms] = useState<CrmAlarm[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [kind, setKind] = useState<CrmAlarmKind>("follow_up");
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({
      propertyId, entityType: lead.entityType, entityId: lead.id,
    });
    const res = await fetch(`/api/admin/comercial/alarms?${qs}`).catch(() => null);
    if (!res?.ok) { setAlarms([]); return; }
    const data = await res.json();
    setAlarms(data.alarms || []);
  }, [propertyId, lead.entityType, lead.id]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!title.trim() || !dueAt) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/comercial/alarms", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId, entityType: lead.entityType, entityId: lead.id,
          entityLabel: lead.title, kind, title: title.trim(), dueAt,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error);
      setTitle(""); setDueAt(""); setShowForm(false);
      await load();
      onChanged?.();
      toast.success("Alarme criado.");
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Erro ao criar o alarme.");
    } finally {
      setSaving(false);
    }
  };

  const conclude = async (a: CrmAlarm) => {
    setBusyId(a.id);
    try {
      const res = await fetch("/api/admin/comercial/alarms", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, id: a.id, done: true }),
      });
      if (!res.ok) throw new Error();
      await load();
      onChanged?.();
      toast.success("Alarme concluído.");
    } catch {
      toast.error("Erro ao concluir o alarme.");
    } finally {
      setBusyId(null);
    }
  };

  const t = todayIso();

  return (
    <div className="p-5 border-b border-border space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Alarmes</p>
        <button onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline underline-offset-2">
          <Plus size={12} /> Novo alarme
        </button>
      </div>

      {showForm && (
        <div className="space-y-1.5 bg-secondary/50 rounded-xl p-3">
          <div className="grid grid-cols-2 gap-1.5">
            <select className="field-input" value={kind}
              onChange={(e) => setKind(e.target.value as CrmAlarmKind)}>
              {(Object.keys(ALARM_KIND_CFG) as CrmAlarmKind[]).map((k) => (
                <option key={k} value={k}>{ALARM_KIND_CFG[k].label}</option>
              ))}
            </select>
            <input type="date" className="field-input" value={dueAt}
              onChange={(e) => setDueAt(e.target.value)} />
          </div>
          <div className="flex gap-1.5">
            <input className="field-input flex-1" placeholder="Ex.: Cobrar 2ª parcela"
              value={title} onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()} />
            <Button size="sm" onClick={create} disabled={saving || !title.trim() || !dueAt}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : "Criar"}
            </Button>
          </div>
        </div>
      )}

      {alarms === null ? (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Loader2 size={12} className="animate-spin" /> Carregando…
        </p>
      ) : alarms.length === 0 && !showForm ? (
        <p className="text-xs text-muted-foreground">Nenhum alarme aberto para este lead.</p>
      ) : (
        alarms.map((a) => {
          const cfg = ALARM_KIND_CFG[a.kind] ?? ALARM_KIND_CFG.other;
          const Icon = cfg.icon;
          const overdue = a.dueAt < t;
          return (
            <div key={a.id} className="flex items-center gap-2 text-xs">
              <Icon size={13} className={overdue ? "text-red-500 shrink-0" : "text-muted-foreground shrink-0"} />
              <span className="text-foreground font-medium truncate">{a.title}</span>
              <span className={overdue ? "text-red-500 font-bold shrink-0" : "text-muted-foreground shrink-0"}>
                {fmtBR(a.dueAt)}{a.dueTime ? ` ${a.dueTime}` : ""}
              </span>
              <button disabled={busyId === a.id} onClick={() => conclude(a)}
                title="Concluir"
                className="ml-auto p-1 rounded-md text-emerald-600 hover:bg-emerald-500/15 transition-colors shrink-0 disabled:opacity-50">
                {busyId === a.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={13} />}
              </button>
            </div>
          );
        })
      )}
    </div>
  );
}
