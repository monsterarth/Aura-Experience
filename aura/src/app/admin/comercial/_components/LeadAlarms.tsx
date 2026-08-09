// Alarmes do lead no drawer — lista + form inline. Visível TAMBÉM em lead
// fechado: cobrança e lembrete são pós-fechamento por natureza.
"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { T } from "@/lib/admin-tokens";
import { CrmAlarm, CrmAlarmKind, CrmLead } from "@/types/aura";
import { ALARM_KIND_CFG } from "./AlarmsQueue";
import { S, fmtBR, todayIso } from "./shared";

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
    // Guard de reentrada: Enter repetido durante o POST criava alarme em dobro.
    if (saving || !title.trim() || !dueAt) return;
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
    <div style={{ padding: 20, borderBottom: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: ".15em", textTransform: "uppercase", color: T.muted, margin: 0 }}>
          Alarmes
        </p>
        <button onClick={() => setShowForm((v) => !v)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 4, background: "none",
            border: "none", cursor: "pointer", fontFamily: "inherit",
            fontSize: 11, fontWeight: 800, color: T.g1,
          }}>
          <Plus size={12} /> Novo alarme
        </button>
      </div>

      {showForm && (
        <div style={{ background: T.glass, borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <select style={{ ...S.input, background: T.card }} value={kind}
              onChange={(e) => setKind(e.target.value as CrmAlarmKind)}>
              {(Object.keys(ALARM_KIND_CFG) as CrmAlarmKind[]).map((k) => (
                <option key={k} value={k}>{ALARM_KIND_CFG[k].label}</option>
              ))}
            </select>
            <input type="date" style={S.input} value={dueAt}
              onChange={(e) => setDueAt(e.target.value)} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input style={{ ...S.input, flex: 1 }} placeholder="Ex.: Cobrar 2ª parcela"
              value={title} onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()} />
            <button onClick={create} disabled={saving || !title.trim() || !dueAt}
              style={{
                ...S.gradBtn, padding: "8px 14px",
                opacity: saving || !title.trim() || !dueAt ? 0.6 : 1,
              }}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : "Criar"}
            </button>
          </div>
        </div>
      )}

      {alarms === null ? (
        <p style={{ fontSize: 12, color: T.muted, display: "flex", alignItems: "center", gap: 6, margin: 0 }}>
          <Loader2 size={12} className="animate-spin" /> Carregando…
        </p>
      ) : alarms.length === 0 && !showForm ? (
        <p style={{ fontSize: 12, color: T.muted, margin: 0 }}>Nenhum alarme aberto para este lead.</p>
      ) : (
        alarms.map((a) => {
          const cfg = ALARM_KIND_CFG[a.kind] ?? ALARM_KIND_CFG.other;
          const Icon = cfg.icon;
          const overdue = a.dueAt < t;
          return (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
              <Icon size={13} color={overdue ? T.red : T.muted} style={{ flexShrink: 0 }} />
              <span style={{ color: T.text, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {a.title}
              </span>
              <span style={{ color: overdue ? T.red : T.muted, fontWeight: overdue ? 800 : 500, flexShrink: 0 }}>
                {fmtBR(a.dueAt)}{a.dueTime ? ` ${a.dueTime}` : ""}
              </span>
              <button disabled={busyId === a.id} onClick={() => conclude(a)}
                title="Concluir"
                style={{
                  marginLeft: "auto", padding: 5, borderRadius: 8, border: "none",
                  background: T.emeraldBg, color: T.emerald, cursor: "pointer",
                  display: "flex", flexShrink: 0, opacity: busyId === a.id ? 0.5 : 1,
                }}>
                {busyId === a.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={13} />}
              </button>
            </div>
          );
        })
      )}
    </div>
  );
}
