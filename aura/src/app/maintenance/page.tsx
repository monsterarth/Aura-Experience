"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import { MaintenanceService } from "@/services/maintenance-service";
import { MaintenanceCompletionModal } from "@/components/admin/maintenance/MaintenanceCompletionModal";
import { MaintenanceTask, Cabin, Structure, Staff } from "@/types/aura";
import { useRouter } from "next/navigation";
import { postFieldAction } from "@/lib/field-api";
import { resolveEffectiveDaySchedule } from "@/lib/schedule-calculator";
import { ScrapWall } from "@/components/admin/profile/ScrapWall";

// ─── Design tokens ────────────────────────────────────────────────────────────

const T = {
  bg: "#06080f",
  glass: "rgba(255,255,255,0.035)",
  glass2: "rgba(255,255,255,0.055)",
  glass3: "rgba(255,255,255,0.08)",
  border: "rgba(255,255,255,0.08)",
  border2: "rgba(255,255,255,0.13)",
  text: "#eef0f8",
  muted: "rgba(238,240,248,0.42)",
  muted2: "rgba(238,240,248,0.22)",
  g1: "#9b6dff",
  g2: "#4ec9d4",
  grad: "linear-gradient(135deg,#9b6dff 0%,#4ec9d4 100%)",
  gradSoft: "linear-gradient(135deg,rgba(155,109,255,0.18) 0%,rgba(78,201,212,0.18) 100%)",
  gradBorder: "linear-gradient(135deg,rgba(155,109,255,0.45),rgba(78,201,212,0.45))",
  green: "#2dd4bf",
  greenG: "linear-gradient(135deg,#059669,#2dd4bf)",
  greenBg: "rgba(45,212,191,0.1)",
  greenBorder: "rgba(45,212,191,0.25)",
  led: "#00d4ff",
  ledBg: "rgba(0,212,255,0.08)",
  ledBorder: "rgba(0,212,255,0.25)",
  ledGlow: "rgba(0,212,255,0.5)",
  amber: "#f59e0b",
  amberBg: "rgba(245,158,11,0.1)",
  amberBorder: "rgba(245,158,11,0.28)",
  blue: "#60a5fa",
  blueBg: "rgba(96,165,250,0.1)",
  blueBorder: "rgba(96,165,250,0.25)",
  red: "#f87171",
  redBg: "rgba(248,113,113,0.1)",
  redBorder: "rgba(248,113,113,0.28)",
  orange: "#fb923c",
  orangeBg: "rgba(251,146,60,0.1)",
  orangeBorder: "rgba(251,146,60,0.28)",
};

const STYLE = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800;9..40,900&display=swap');
.mx-shell*{box-sizing:border-box;}
.mx-shell{font-family:'DM Sans',-apple-system,BlinkMacSystemFont,sans-serif;}
.mx-scroll{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;}
.mx-scroll::-webkit-scrollbar{display:none;}
@keyframes mx-pulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.4;transform:scale(.8);}}
@keyframes mx-fadein{from{opacity:0}to{opacity:1}}
@keyframes mx-slideup{from{transform:translateY(100%)}to{transform:translateY(0)}}
@keyframes mx-toast{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes mx-spin{to{transform:rotate(360deg)}}
`;

// ─── Primitives ───────────────────────────────────────────────────────────────

function GBorder({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ position: "relative", borderRadius: 20, ...style }}>
      <div style={{
        position: "absolute", inset: 0, borderRadius: 20, padding: "1px",
        background: T.gradBorder,
        WebkitMask: "linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0)",
        WebkitMaskComposite: "xor", maskComposite: "exclude", pointerEvents: "none",
      }} />
      {children}
    </div>
  );
}

function Pill({ children, color, bg, border }: { children: React.ReactNode; color: string; bg: string; border: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 10, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase",
      padding: "3px 9px", borderRadius: 999, lineHeight: 1.5,
      color, background: bg, border: `1px solid ${border}`,
    }}>{children}</span>
  );
}

function Pulse({ size = 8 }: { size?: number }) {
  return <div style={{ width: size, height: size, borderRadius: "50%", background: T.led, boxShadow: `0 0 8px ${T.ledGlow}`, animation: "mx-pulse 1.5s infinite", flexShrink: 0 }} />;
}

function Toast({ msg, color }: { msg: string; color: string }) {
  return (
    <div style={{
      position: "absolute", bottom: 88, left: 16, right: 16,
      background: "#111827", color: T.text, border: `1px solid ${T.border2}`,
      borderRadius: 16, padding: "14px 16px", fontSize: 13, fontWeight: 600,
      display: "flex", alignItems: "center", gap: 10, zIndex: 200,
      animation: "mx-toast .3s cubic-bezier(.32,.72,0,1)",
      boxShadow: "0 8px 32px rgba(0,0,0,.5)",
    }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, boxShadow: `0 0 8px ${color}`, flexShrink: 0 }} />
      <span>{msg}</span>
    </div>
  );
}

function Sheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      style={{ position: "absolute", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.75)", display: "flex", flexDirection: "column", justifyContent: "flex-end", animation: "mx-fadein .2s ease", backdropFilter: "blur(4px)" }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: "#0d1020", border: `1px solid ${T.border2}`, borderRadius: "28px 28px 0 0", borderBottom: "none", maxHeight: "92dvh", display: "flex", flexDirection: "column", animation: "mx-slideup .28s cubic-bezier(.32,.72,0,1)" }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: T.border2, margin: "12px auto 4px", flexShrink: 0 }} />
        {children}
      </div>
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

type IName = "home"|"wrench"|"user"|"check"|"arrow"|"x"|"info"|"logout"|"sun"|"clock"|"play"|"alert"|"photo"|"list"|"chevr"|"loader"|"send"|"plus"|"assign"|"undo"|"minus";

function I({ n, s = 20, c = "currentColor", w = 1.8 }: { n: IName; s?: number; c?: string; w?: number }) {
  const d: Record<IName, React.ReactNode> = {
    home:   <><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/><path d="M9 21V12h6v9"/></>,
    wrench: <><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></>,
    user:   <><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
    check:  <polyline points="20 6 9 17 4 12"/>,
    arrow:  <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>,
    x:      <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    info:   <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>,
    logout: <><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>,
    sun:    <><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/></>,
    clock:  <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    play:   <><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></>,
    alert:  <><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>,
    photo:  <><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></>,
    list:   <><rect x="3" y="5" width="18" height="2" rx="1"/><rect x="3" y="11" width="18" height="2" rx="1"/><rect x="3" y="17" width="12" height="2" rx="1"/></>,
    chevr:  <polyline points="9 18 15 12 9 6"/>,
    loader: <path d="M21 12a9 9 0 11-6.219-8.56"/>,
    send:   <><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>,
    plus:   <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    assign: <><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="23" y1="11" x2="17" y2="11"/><line x1="20" y1="8" x2="20" y2="14"/></>,
    undo:   <><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></>,
    minus:  <line x1="5" y1="12" x2="19" y2="12"/>,
  };
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round"
      style={n === "loader" ? { animation: "mx-spin 0.8s linear infinite" } : undefined}>
      {d[n]}
    </svg>
  );
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function elapsed(iso?: string | null): string | null {
  if (!iso) return null;
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "agora";
  return m < 60 ? `${m}min` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}min` : ""}`;
}

function priorityLabel(p: string) {
  return p === "urgent" ? "Urgente" : p === "high" ? "Alta" : p === "medium" ? "Média" : "Baixa";
}
function priorityColor(p: string) {
  return p === "urgent" ? T.red : p === "high" ? T.orange : p === "medium" ? T.amber : T.blue;
}
function priorityBg(p: string) {
  return p === "urgent" ? T.redBg : p === "high" ? T.orangeBg : p === "medium" ? T.amberBg : T.blueBg;
}
function priorityBorder(p: string) {
  return p === "urgent" ? "rgba(248,113,113,0.3)" : p === "high" ? T.orangeBorder : p === "medium" ? T.amberBorder : T.blueBorder;
}

function locationName(task: MaintenanceTask, cabins: Record<string, Cabin>, structures: Record<string, Structure>) {
  if (task.cabinId && cabins[task.cabinId]) return cabins[task.cabinId].name;
  if (task.structureId && structures[task.structureId]) return structures[task.structureId].name;
  if ((task as any).customLocation) return (task as any).customLocation as string;
  return null;
}

function todayLabel() {
  return new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
}

// ─── Form helpers ─────────────────────────────────────────────────────────────

function FLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 6 }}>
      {children}
    </div>
  );
}

const fInput: React.CSSProperties = {
  width: "100%", background: T.glass2, border: `1px solid ${T.border}`,
  borderRadius: 12, padding: "11px 14px", color: T.text, fontSize: 13,
  fontFamily: "inherit", outline: "none",
};

function LocPicker({ lt, setLt, cid, setCid, sid, setSid, cust, setCust, cabins, structures }: {
  lt: "cabin" | "structure" | "custom"; setLt: (v: "cabin" | "structure" | "custom") => void;
  cid: string; setCid: (v: string) => void;
  sid: string; setSid: (v: string) => void;
  cust: string; setCust: (v: string) => void;
  cabins: Cabin[]; structures: Structure[];
}) {
  return (
    <>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {(["cabin", "structure", "custom"] as const).map(v => {
          const labels = { cabin: "Cabana", structure: "Estrutura", custom: "Outro" };
          const on = lt === v;
          return (
            <button key={v} onClick={() => setLt(v)} style={{
              flex: 1, padding: "10px 0", borderRadius: 12, cursor: "pointer",
              fontFamily: "inherit", fontSize: 12, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.04em",
              background: on ? T.gradSoft : T.glass, border: `1px solid ${on ? "rgba(155,109,255,0.4)" : T.border}`,
              color: on ? T.g1 : T.muted,
            }}>{labels[v]}</button>
          );
        })}
      </div>
      {lt === "cabin" && (
        <select value={cid} onChange={e => setCid(e.target.value)} style={{ ...fInput, marginBottom: 16 } as React.CSSProperties}>
          <option value="">Selecione a cabana</option>
          {cabins.map(c => <option key={c.id} value={c.id}>{c.name || `Cabana ${(c as any).number}`}</option>)}
        </select>
      )}
      {lt === "structure" && (
        <select value={sid} onChange={e => setSid(e.target.value)} style={{ ...fInput, marginBottom: 16 } as React.CSSProperties}>
          <option value="">Selecione a estrutura</option>
          {structures.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}
      {lt === "custom" && (
        <input value={cust} onChange={e => setCust(e.target.value)} placeholder="Descreva o local..."
          style={{ ...fInput, marginBottom: 16 }} />
      )}
    </>
  );
}

// ─── New Task Sheet (coordinator only) ────────────────────────────────────────

function NewMaintTaskSheet({
  cabins, structures, staff, propertyId, onClose, onCreated, showToast,
}: {
  cabins: Record<string, Cabin>;
  structures: Record<string, Structure>;
  staff: Staff[];
  propertyId: string;
  onClose: () => void;
  onCreated: () => void;
  showToast: (m: string, c?: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [locType, setLocType] = useState<"cabin" | "structure" | "custom">("cabin");
  const [cabinId, setCabinId] = useState("");
  const [structureId, setStructureId] = useState("");
  const [customLocation, setCustomLocation] = useState("");
  const [assignedIds, setAssignedIds] = useState<string[]>([]);
  const [checklist, setChecklist] = useState<{ id: string; label: string; checked: boolean }[]>([]);
  const [busy, setBusy] = useState(false);

  const techs = staff.filter(s => s.role === "maintenance" || s.role === "technician");
  const cabinsArr = Object.values(cabins);
  const structuresArr = Object.values(structures);

  const toggleTech = (id: string) =>
    setAssignedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const canSubmit = title.trim().length > 0 && (
    (locType === "cabin" && cabinId) ||
    (locType === "structure" && structureId) ||
    (locType === "custom" && customLocation.trim().length > 0)
  );

  const PRIORITIES: { value: "low" | "medium" | "high" | "urgent"; label: string; color: string }[] = [
    { value: "low",    label: "Baixa",   color: T.blue },
    { value: "medium", label: "Média",   color: T.amber },
    { value: "high",   label: "Alta",    color: T.orange },
    { value: "urgent", label: "Urgente", color: T.red },
  ];

  const submit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    try {
      const r = await postFieldAction('/api/field/maintenance-tasks', {
        action: 'create',
        propertyId,
        task: {
          title: title.trim(),
          description: description.trim() || undefined,
          priority,
          cabinId: locType === "cabin" ? cabinId : undefined,
          structureId: locType === "structure" ? structureId : undefined,
          customLocation: locType === "custom" ? customLocation.trim() : undefined,
          assignedTo: assignedIds,
          checklist,
          status: "pending",
          isRecurring: false,
        },
      });
      if (!r.ok) { showToast(r.error || "Erro ao criar tarefa.", T.red); return; }
      showToast("Tarefa criada!", T.green);
      onCreated();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet onClose={onClose}>
      <div style={{ padding: "20px 20px 8px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: T.text }}>Nova Tarefa</span>
          <button onClick={onClose} style={{ background: T.glass2, border: `1px solid ${T.border}`, borderRadius: 10, padding: 8, cursor: "pointer", color: T.muted }}>
            <I n="x" s={16} />
          </button>
        </div>
      </div>

      <div className="mx-scroll" style={{ padding: "12px 20px 0" }}>
        <FLabel>Título *</FLabel>
        <input value={title} onChange={e => setTitle(e.target.value)}
          placeholder="Ex: Trocar lâmpada, Consertar torneira..."
          autoFocus
          style={{ ...fInput, marginBottom: 16, border: `1px solid ${title ? T.border2 : T.border}` }} />

        <FLabel>Prioridade</FLabel>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {PRIORITIES.map(p => (
            <button key={p.value} onClick={() => setPriority(p.value)} style={{
              flex: 1, padding: "9px 4px", borderRadius: 12, cursor: "pointer",
              fontFamily: "inherit", fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.04em",
              background: priority === p.value ? `${p.color}18` : T.glass,
              border: `1.5px solid ${priority === p.value ? p.color : T.border}`,
              color: priority === p.value ? p.color : T.muted, transition: "all .15s",
            }}>{p.label}</button>
          ))}
        </div>

        <FLabel>Local</FLabel>
        <LocPicker lt={locType} setLt={setLocType} cid={cabinId} setCid={setCabinId}
          sid={structureId} setSid={setStructureId} cust={customLocation} setCust={setCustomLocation}
          cabins={cabinsArr} structures={structuresArr} />

        <FLabel>Descrição (opcional)</FLabel>
        <textarea value={description} onChange={e => setDescription(e.target.value)}
          placeholder="Detalhes sobre o problema..." rows={2}
          style={{ width: "100%", background: T.glass2, border: `1px solid ${T.border}`, borderRadius: 12, padding: "10px 14px", color: T.text, fontSize: 13, fontFamily: "inherit", resize: "none" as const, outline: "none", marginBottom: 16 }} />

        {techs.length > 0 && (
          <>
            <FLabel>Atribuir (opcional)</FLabel>
            <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 8, marginBottom: 16 }}>
              {techs.map(t => {
                const on = assignedIds.includes(t.id);
                return (
                  <button key={t.id} onClick={() => toggleTech(t.id)} style={{
                    padding: "7px 12px", borderRadius: 10, cursor: "pointer",
                    fontFamily: "inherit", fontSize: 12, fontWeight: 700,
                    background: on ? T.gradSoft : T.glass, border: `1px solid ${on ? "rgba(155,109,255,0.4)" : T.border}`,
                    color: on ? T.g1 : T.muted,
                  }}>{t.fullName.split(" ")[0]}</button>
                );
              })}
            </div>
          </>
        )}

        <FLabel>Etapas (opcional)</FLabel>
        <div style={{ marginBottom: 8 }}>
          {checklist.map(item => (
            <div key={item.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <input value={item.label}
                onChange={e => setChecklist(prev => prev.map(i => i.id === item.id ? { ...i, label: e.target.value } : i))}
                placeholder="Ex: Verificar conexões..." style={{ ...fInput, flex: 1 }} />
              <button type="button" onClick={() => setChecklist(prev => prev.filter(i => i.id !== item.id))}
                style={{ padding: "10px 12px", background: T.redBg, border: `1px solid ${T.redBorder}`, borderRadius: 10, cursor: "pointer", color: T.red, flexShrink: 0 }}>
                <I n="x" s={14} c={T.red} />
              </button>
            </div>
          ))}
          <button type="button"
            onClick={() => setChecklist(prev => [...prev, { id: crypto.randomUUID(), label: "", checked: false }])}
            style={{ width: "100%", padding: "10px 0", background: T.glass, border: `1px solid ${T.border}`, borderRadius: 12, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700, color: T.muted, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 8 }}>
            <I n="plus" s={14} c={T.muted} /> Adicionar Etapa
          </button>
        </div>
        <div style={{ height: 8 }} />
      </div>

      <div style={{ padding: "12px 20px 24px", borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
        <button disabled={!canSubmit || busy} onClick={submit} style={{
          width: "100%", padding: 16, background: T.grad, color: "#fff",
          border: "none", borderRadius: 16, cursor: (!canSubmit || busy) ? "not-allowed" : "pointer",
          fontFamily: "inherit", fontSize: 14, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase" as const,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          opacity: (!canSubmit || busy) ? 0.4 : 1, boxShadow: "0 4px 20px rgba(155,109,255,0.35)",
        }}>
          {busy ? <I n="loader" s={16} /> : <I n="plus" s={16} />}
          Criar Tarefa
        </button>
      </div>
    </Sheet>
  );
}

// ─── Assign Tech Sheet (coordinator only) ─────────────────────────────────────

function AssignTechSheet({
  task, staff, onClose, onAssign, busy,
}: {
  task: MaintenanceTask;
  staff: Staff[];
  onClose: () => void;
  onAssign: (techIds: string[]) => Promise<void>;
  busy: boolean;
}) {
  const current = Array.isArray(task.assignedTo) ? task.assignedTo : [];
  const [selected, setSelected] = useState<Set<string>>(new Set(current));
  const techs = staff.filter(s => s.role === "maintenance" || s.role === "technician");

  const toggle = (id: string) => setSelected(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  return (
    <Sheet onClose={onClose}>
      <div style={{ padding: "20px 20px 8px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: T.text }}>Atribuir Técnico</span>
          <button onClick={onClose} style={{ background: T.glass2, border: `1px solid ${T.border}`, borderRadius: 10, padding: 8, cursor: "pointer", color: T.muted }}>
            <I n="x" s={16} />
          </button>
        </div>
        <p style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>{task.title}</p>
      </div>

      <div className="mx-scroll" style={{ padding: "12px 20px 0" }}>
        {techs.length === 0 ? (
          <p style={{ color: T.muted, fontSize: 13, textAlign: "center", padding: 24 }}>Nenhum técnico cadastrado.</p>
        ) : (
          techs.map(tech => {
            const on = selected.has(tech.id);
            return (
              <button key={tech.id} onClick={() => toggle(tech.id)} style={{
                width: "100%", display: "flex", alignItems: "center", gap: 12,
                padding: "14px 16px", borderRadius: 14, marginBottom: 8,
                background: on ? T.gradSoft : T.glass, border: `1px solid ${on ? "rgba(155,109,255,0.4)" : T.border}`,
                cursor: "pointer", textAlign: "left" as const,
              }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: on ? T.grad : T.glass2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: on ? "#fff" : T.muted, flexShrink: 0 }}>
                  {tech.fullName.charAt(0)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{tech.fullName}</div>
                  <div style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>{tech.role === "maintenance" ? "Coordenador" : "Técnico"}</div>
                </div>
                <div style={{ width: 22, height: 22, borderRadius: 7, border: `2px solid ${on ? T.g1 : T.border2}`, background: on ? "rgba(155,109,255,0.2)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {on && <I n="check" s={12} c={T.g1} />}
                </div>
              </button>
            );
          })
        )}
        <div style={{ height: 8 }} />
      </div>

      <div style={{ padding: "12px 20px 24px", borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
        <button disabled={busy || selected.size === 0} onClick={() => onAssign(Array.from(selected))} style={{
          width: "100%", padding: 16, background: T.grad, color: "#fff",
          border: "none", borderRadius: 16, cursor: (busy || selected.size === 0) ? "not-allowed" : "pointer",
          fontFamily: "inherit", fontSize: 14, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase" as const,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          opacity: (busy || selected.size === 0) ? 0.4 : 1, boxShadow: "0 4px 20px rgba(155,109,255,0.35)",
        }}>
          {busy ? <I n="loader" s={16} /> : <I n="send" s={16} />}
          Confirmar {selected.size > 0 ? `(${selected.size})` : ""}
        </button>
      </div>
    </Sheet>
  );
}

// ─── Validate Sheet (coordinator only) ────────────────────────────────────────

function ValidateSheet({
  task, cabins, structures, onClose, onApprove, onReject, busy,
}: {
  task: MaintenanceTask;
  cabins: Record<string, Cabin>;
  structures: Record<string, Structure>;
  onClose: () => void;
  onApprove: (notes: string) => void;
  onReject: (reason: string) => void;
  busy: boolean;
}) {
  const [notes, setNotes] = useState("");
  const loc = locationName(task, cabins, structures);
  const checksDone = (task.checklist || []).filter(c => c.checked).length;
  const checksTotal = (task.checklist || []).length;

  return (
    <Sheet onClose={onClose}>
      <div style={{ padding: "20px 20px 8px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: T.text }}>Validar Execução</span>
          <button onClick={onClose} style={{ background: T.glass2, border: `1px solid ${T.border}`, borderRadius: 10, padding: 8, cursor: "pointer", color: T.muted }}>
            <I n="x" s={16} />
          </button>
        </div>
        <p style={{ fontSize: 13, color: T.muted, marginTop: 6 }}>Revise e aprove ou devolva para repasse.</p>
      </div>

      <div className="mx-scroll" style={{ padding: "12px 20px 0" }}>
        <div style={{ background: T.glass, border: `1px solid ${T.border}`, borderRadius: 16, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: T.text, marginBottom: 8 }}>{task.title}</div>
          {loc && <div style={{ fontSize: 12, color: T.g2, marginBottom: 8 }}>📍 {loc}</div>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
            <Pill color={priorityColor(task.priority)} bg={priorityBg(task.priority)} border={priorityBorder(task.priority)}>
              {priorityLabel(task.priority)}
            </Pill>
            {checksTotal > 0 && (
              <Pill color={checksDone === checksTotal ? T.green : T.amber}
                bg={checksDone === checksTotal ? T.greenBg : T.amberBg}
                border={checksDone === checksTotal ? T.greenBorder : T.amberBorder}>
                {checksDone}/{checksTotal} etapas
              </Pill>
            )}
          </div>
        </div>

        {task.description && (
          <div style={{ background: T.glass, border: `1px solid ${T.border}`, borderRadius: 14, padding: "12px 14px", marginBottom: 16, fontSize: 13, color: T.muted, lineHeight: 1.6 }}>
            {task.description}
          </div>
        )}

        {(task.checklist || []).length > 0 && (
          <div style={{ background: T.glass, border: `1px solid ${T.border}`, borderRadius: 16, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 10 }}>Checklist</div>
            {(task.checklist || []).map(item => (
              <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: `1px solid ${T.border}` }}>
                <div style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, border: `1.5px solid ${item.checked ? T.green : T.border2}`, background: item.checked ? T.greenBg : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {item.checked && <I n="check" s={11} c={T.green} />}
                </div>
                <span style={{ flex: 1, fontSize: 13, color: item.checked ? T.text : T.muted, textDecoration: item.checked ? "none" : "line-through", opacity: item.checked ? 1 : 0.55 }}>{item.label}</span>
              </div>
            ))}
          </div>
        )}

        {(task as any).completionNotes && (
          <div style={{ background: T.amberBg, border: `1px solid ${T.amberBorder}`, borderRadius: 14, padding: 14, marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.amber, textTransform: "uppercase" as const, marginBottom: 4 }}>Obs. do Técnico</div>
            <div style={{ fontSize: 13, color: T.text }}>{(task as any).completionNotes}</div>
          </div>
        )}

        <FLabel>Observação (opcional)</FLabel>
        <textarea value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Ex: aprovado, ajuste pendente na torneira..." rows={2}
          style={{ width: "100%", background: T.glass2, border: `1px solid ${T.border}`, borderRadius: 12, padding: "10px 14px", color: T.text, fontSize: 13, fontFamily: "inherit", resize: "none" as const, outline: "none", marginBottom: 16 }} />
        <div style={{ height: 8 }} />
      </div>

      <div style={{ padding: "12px 20px 24px", display: "flex", gap: 10, borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
        <button disabled={busy} onClick={() => onReject(notes || "Reprovado pelo coordenador")} style={{
          flex: 1, padding: "15px 0", background: T.redBg, color: T.red,
          border: `1px solid ${T.redBorder}`, borderRadius: 16, cursor: busy ? "not-allowed" : "pointer",
          fontFamily: "inherit", fontSize: 13, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase" as const,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: busy ? 0.5 : 1,
        }}>
          <I n="undo" s={15} c={T.red} /> Reprovar
        </button>
        <button disabled={busy} onClick={() => onApprove(notes)} style={{
          flex: 1.5, padding: "15px 0", background: T.greenG, color: "#021a17",
          border: "none", borderRadius: 16, cursor: busy ? "not-allowed" : "pointer",
          fontFamily: "inherit", fontSize: 13, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase" as const,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: busy ? 0.5 : 1,
          boxShadow: "0 4px 20px rgba(45,212,191,0.28)",
        }}>
          {busy ? <I n="loader" s={16} c="#021a17" /> : <I n="check" s={16} c="#021a17" w={2.5} />}
          Aprovar
        </button>
      </div>
    </Sheet>
  );
}

// ─── Task Detail Sheet ────────────────────────────────────────────────────────

function TaskSheet({
  task, cabins, structures, onClose, onStart, onFinish, propertyId, isManager, onValidate,
}: {
  task: MaintenanceTask;
  cabins: Record<string, Cabin>;
  structures: Record<string, Structure>;
  onClose: () => void;
  onStart: (id: string) => void;
  onFinish: (task: MaintenanceTask) => void;
  propertyId: string;
  isManager: boolean;
  onValidate: (task: MaintenanceTask) => void;
}) {
  const [checklist, setChecklist] = useState(task.checklist || []);
  const [savingItem, setSavingItem] = useState<string | null>(null);

  const done = checklist.filter(c => c.checked).length;
  const pct = Math.round(done / Math.max(checklist.length, 1) * 100);
  const C = 2 * Math.PI * 22;
  const loc = locationName(task, cabins, structures);

  const toggleItem = async (id: string) => {
    const previous = checklist;
    const updated = checklist.map(c => c.id === id ? { ...c, checked: !c.checked } : c);
    setChecklist(updated); // otimista — revertido abaixo se o save falhar
    setSavingItem(id);
    try {
      const r = await postFieldAction('/api/field/maintenance-tasks', {
        action: 'update', taskId: task.id, updates: { checklist: updated },
      });
      if (!r.ok) setChecklist(previous); // sessão expirada/erro: não deixa o ✓ mentir
    } finally {
      setSavingItem(null);
    }
  };

  return (
    <Sheet onClose={onClose}>
      <div style={{ padding: "0 20px 14px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.2 }}>{task.title}</div>
            {loc && <div style={{ fontSize: 12, color: T.muted, marginTop: 3 }}>📍 {loc}</div>}
          </div>
          <button onClick={onClose} style={{ background: T.glass2, border: `1px solid ${T.border}`, borderRadius: 10, padding: 8, cursor: "pointer", color: T.muted, flexShrink: 0 }}>
            <I n="x" s={15} />
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14, background: T.glass, borderRadius: 16, padding: "12px 14px", border: `1px solid ${T.border}` }}>
          <div style={{ position: "relative", width: 52, height: 52, flexShrink: 0 }}>
            <svg width="52" height="52" viewBox="0 0 52 52" style={{ transform: "rotate(-90deg)" }}>
              <circle cx="26" cy="26" r="22" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="4" />
              <circle cx="26" cy="26" r="22" fill="none"
                stroke={pct === 100 ? T.green : "url(#mx-ring)"}
                strokeWidth="4" strokeDasharray={C}
                strokeDashoffset={C * (1 - pct / 100)} strokeLinecap="round" />
              <defs><linearGradient id="mx-ring" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={T.g1} /><stop offset="100%" stopColor={T.g2} />
              </linearGradient></defs>
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900, color: pct === 100 ? T.green : T.text }}>{pct}%</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{done}/{checklist.length} subitens</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
              <Pill color={priorityColor(task.priority)} bg={priorityBg(task.priority)} border={priorityBorder(task.priority)}>
                {priorityLabel(task.priority)}
              </Pill>
              {task.status === "in_progress" && task.startedAt && (
                <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: T.green }}>
                  <I n="clock" s={11} c={T.green} /> {elapsed(task.startedAt as string)}
                </span>
              )}
            </div>
          </div>
        </div>

        {task.description && (
          <div style={{ background: T.glass, border: `1px solid ${T.border}`, borderRadius: 14, padding: "12px 14px", marginBottom: 14, fontSize: 13, color: T.muted, lineHeight: 1.6 }}>
            {task.description}
          </div>
        )}
      </div>

      <div className="mx-scroll" style={{ padding: "0 16px" }}>
        {checklist.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: T.muted, marginBottom: 10 }}>Checklist</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
              {checklist.map(item => (
                <div key={item.id} onClick={() => toggleItem(item.id)} style={{
                  display: "flex", alignItems: "center", gap: 14, padding: 14, borderRadius: 14,
                  border: `1px solid ${item.checked ? T.greenBorder : T.border}`,
                  background: item.checked ? T.greenBg : T.glass,
                  cursor: "pointer", transition: "all .15s", userSelect: "none",
                  opacity: savingItem === item.id ? 0.6 : 1,
                }}>
                  <div style={{ width: 26, height: 26, borderRadius: "50%", flexShrink: 0, border: `2px solid ${item.checked ? T.green : "rgba(255,255,255,0.15)"}`, background: item.checked ? T.green : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "all .15s" }}>
                    {item.checked && <I n="check" s={12} c="white" w={3} />}
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 600, flex: 1, textDecoration: item.checked ? "line-through" : "none", opacity: item.checked ? 0.45 : 1, color: item.checked ? T.green : T.text }}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
        <div style={{ height: 16 }} />
      </div>

      <div style={{ padding: "12px 16px", borderTop: `1px solid ${T.border}`, background: "#0d1020", flexShrink: 0 }}>
        {task.status === "pending" && (
          <button onClick={() => { onStart(task.id); onClose(); }}
            style={{ width: "100%", padding: 16, background: T.grad, color: "#fff", fontFamily: "inherit", fontSize: 14, fontWeight: 800, letterSpacing: "0.03em", textTransform: "uppercase" as const, border: "none", borderRadius: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 4px 20px rgba(155,109,255,0.35)" }}>
            <I n="play" s={17} /> Iniciar Manutenção
          </button>
        )}
        {task.status === "in_progress" && (
          <button onClick={() => { onFinish(task); onClose(); }}
            style={{ width: "100%", padding: 16, background: T.greenG, color: "#021a17", fontFamily: "inherit", fontSize: 14, fontWeight: 800, letterSpacing: "0.03em", textTransform: "uppercase" as const, border: "none", borderRadius: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 4px 20px rgba(45,212,191,0.3)" }}>
            <I n="check" s={17} w={2.5} /> Finalizar Tarefa
          </button>
        )}
        {task.status === "waiting_conference" && !isManager && (
          <div style={{ padding: "14px 16px", background: T.orangeBg, border: `1px solid ${T.orangeBorder}`, borderRadius: 16, textAlign: "center", color: T.orange, fontWeight: 700, fontSize: 13 }}>
            Aguardando validação do coordenador
          </div>
        )}
        {task.status === "waiting_conference" && isManager && (
          <button onClick={() => { onValidate(task); onClose(); }}
            style={{ width: "100%", padding: 16, background: T.greenG, color: "#021a17", fontFamily: "inherit", fontSize: 14, fontWeight: 800, letterSpacing: "0.03em", textTransform: "uppercase" as const, border: "none", borderRadius: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 4px 20px rgba(45,212,191,0.3)" }}>
            <I n="check" s={17} w={2.5} /> Validar Execução
          </button>
        )}
      </div>
    </Sheet>
  );
}

// ─── Home screen ──────────────────────────────────────────────────────────────

function HomeScreen({ tasks, userName, onNav, isManager }: {
  tasks: MaintenanceTask[];
  userName: string;
  onNav: (tab: Tab) => void;
  isManager: boolean;
}) {
  const urgent  = tasks.filter(t => t.priority === "urgent" || t.priority === "high");
  const inProg  = tasks.filter(t => t.status === "in_progress");
  const pending = tasks.filter(t => t.status === "pending");
  const waiting = tasks.filter(t => t.status === "waiting_conference");

  const stats = isManager ? [
    { label: "Pendentes",  val: pending.length, color: T.amber,  bg: T.amberBg,  border: T.amberBorder },
    { label: "Andamento",  val: inProg.length,  color: T.g1,     bg: "rgba(155,109,255,0.1)", border: "rgba(155,109,255,0.25)" },
    { label: "Validações", val: waiting.length, color: T.orange, bg: T.orangeBg, border: T.orangeBorder },
  ] : [
    { label: "Urgentes",  val: urgent.length,  color: T.red,   bg: T.redBg,   border: "rgba(248,113,113,0.25)" },
    { label: "Andamento", val: inProg.length,  color: T.g1,    bg: "rgba(155,109,255,0.1)", border: "rgba(155,109,255,0.25)" },
    { label: "Pendentes", val: pending.length, color: T.amber, bg: T.amberBg, border: T.amberBorder },
  ];

  return (
    <div className="mx-scroll" style={{ padding: "0 16px 24px" }}>
      <div style={{ padding: "18px 0 24px" }}>
        <div style={{ fontSize: 13, color: T.muted, fontWeight: 600, marginBottom: 4 }}>
          {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
        </div>
        <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.3px" }}>
          Olá, {userName.split(" ")[0]}
        </div>
        <div style={{ fontSize: 14, color: T.muted, marginTop: 4 }}>
          {isManager
            ? `${tasks.length} tarefa(s) ativas · ${waiting.length} aguardando validação`
            : tasks.length === 0 ? "Nenhuma tarefa pendente." : `${inProg.length} em andamento · ${pending.length} pendente(s)`
          }
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 24 }}>
        {stats.map(s => (
          <GBorder key={s.label} style={{ flex: 1 }}>
            <div style={{ background: "rgba(10,12,22,0.9)", borderRadius: 20, padding: "16px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 30, fontWeight: 900, color: s.color, textShadow: `0 0 20px ${s.color}55` }}>{s.val}</div>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" as const, color: T.muted, marginTop: 4 }}>{s.label}</div>
            </div>
          </GBorder>
        ))}
      </div>

      {inProg.length > 0 && (
        <GBorder style={{ marginBottom: 16 }}>
          <div style={{ background: "rgba(45,212,191,0.05)", borderRadius: 20, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: T.green, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: T.green, animation: "mx-pulse 1.5s infinite" }} />
              Em andamento agora
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, color: T.green }}>{inProg[0].title}</div>
            {inProg[0].startedAt && (
              <div style={{ fontSize: 12, color: T.green, opacity: 0.7, marginTop: 4 }}>
                Iniciado há {elapsed(inProg[0].startedAt as string)}
              </div>
            )}
            <button onClick={() => onNav("tasks")} style={{ marginTop: 12, padding: "10px 18px", background: T.greenBg, border: `1px solid ${T.greenBorder}`, borderRadius: 12, color: T.green, fontFamily: "inherit", fontWeight: 700, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              Ver detalhes <I n="arrow" s={14} c={T.green} />
            </button>
          </div>
        </GBorder>
      )}

      {isManager && waiting.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: T.orange, marginBottom: 10 }}>
            Aguardando sua validação
          </div>
          {waiting.slice(0, 3).map(t => (
            <div key={t.id} onClick={() => onNav("tasks")} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: T.orangeBg, border: `1px solid ${T.orangeBorder}`, borderRadius: 14, marginBottom: 8, cursor: "pointer" }}>
              <I n="alert" s={16} c={T.orange} />
              <span style={{ fontSize: 13, fontWeight: 700, flex: 1, color: T.orange }}>{t.title}</span>
              <I n="chevr" s={14} c={T.orange} />
            </div>
          ))}
        </div>
      )}

      {!isManager && urgent.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: T.red, marginBottom: 10 }}>Atenção urgente</div>
          {urgent.slice(0, 2).map(t => (
            <div key={t.id} onClick={() => onNav("tasks")} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: T.redBg, border: `1px solid rgba(248,113,113,0.3)`, borderRadius: 14, marginBottom: 8, cursor: "pointer" }}>
              <I n="alert" s={16} c={T.red} />
              <span style={{ fontSize: 13, fontWeight: 700, flex: 1, color: T.red }}>{t.title}</span>
              <I n="chevr" s={14} c={T.red} />
            </div>
          ))}
        </div>
      )}

      {tasks.length === 0 && (
        <div style={{ textAlign: "center", padding: "48px 0", color: T.muted }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔧</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Tudo em dia!</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>Nenhuma tarefa de manutenção.</div>
        </div>
      )}
    </div>
  );
}

// ─── Tasks screen ─────────────────────────────────────────────────────────────

function TasksScreen({
  tasks, cabins, structures, onStart, onFinish, showToast, propertyId, userId,
  isManager, staff, onNewTask, onAssign, onValidate,
}: {
  tasks: MaintenanceTask[];
  cabins: Record<string, Cabin>;
  structures: Record<string, Structure>;
  onStart: (id: string) => void;
  onFinish: (task: MaintenanceTask) => void;
  showToast: (m: string, c?: string) => void;
  propertyId: string;
  userId: string;
  isManager: boolean;
  staff: Staff[];
  onNewTask: () => void;
  onAssign: (task: MaintenanceTask) => void;
  onValidate: (task: MaintenanceTask) => void;
}) {
  const [detail, setDetail] = useState<string | null>(null);
  const fullTask = detail ? tasks.find(t => t.id === detail) ?? null : null;

  const inProg   = tasks.filter(t => t.status === "in_progress");
  const pending  = tasks.filter(t => t.status === "pending" || t.status === "paused");
  const waiting  = tasks.filter(t => t.status === "waiting_conference");

  const TaskCard = ({ task }: { task: MaintenanceTask }) => {
    const loc = locationName(task, cabins, structures);
    const isPaused = task.status === "paused";
    const assignedNames = Array.isArray(task.assignedTo) && task.assignedTo.length > 0
      ? task.assignedTo.map(id => staff.find(s => s.id === id)?.fullName.split(" ")[0]).filter(Boolean).join(", ")
      : null;

    return (
      <div onClick={() => setDetail(task.id)} style={{
        marginBottom: 12, borderRadius: 20, overflow: "hidden", cursor: "pointer",
        border: `1px solid ${isPaused ? T.amberBorder : T.border}`,
        background: isPaused ? T.amberBg : T.glass,
        transition: "border-color .15s",
      }}>
        <div style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const, marginBottom: 6 }}>
                <Pill color={priorityColor(task.priority)} bg={priorityBg(task.priority)} border={priorityBorder(task.priority)}>
                  {priorityLabel(task.priority)}
                </Pill>
                {task.isRecurring && (
                  <Pill color={T.blue} bg={T.blueBg} border={T.blueBorder}>Recorrente</Pill>
                )}
              </div>
              <div style={{ fontSize: 18, fontWeight: 900, lineHeight: 1.2 }}>{task.title}</div>
              {task.description && <div style={{ fontSize: 12, color: T.muted, marginTop: 4, lineHeight: 1.5 }}>{task.description}</div>}
              {loc && <div style={{ fontSize: 11, fontWeight: 700, color: T.g2, marginTop: 6 }}>📍 {loc}</div>}
              {isManager && assignedNames && (
                <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>👤 {assignedNames}</div>
              )}
            </div>
            <I n="chevr" s={18} c={T.muted} />
          </div>

          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
            {task.status === "pending" && (
              <div style={{ display: "flex", gap: 8 }}>
                {isManager && (
                  <button onClick={e => { e.stopPropagation(); onAssign(task); }} style={{
                    flex: 1, padding: "13px 8px", background: T.gradSoft, color: T.g1,
                    border: `1px solid rgba(155,109,255,0.4)`, borderRadius: 14, cursor: "pointer",
                    fontFamily: "inherit", fontSize: 12, fontWeight: 800, textTransform: "uppercase" as const,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  }}>
                    <I n="assign" s={14} c={T.g1} /> Atribuir
                  </button>
                )}
                <button onClick={e => { e.stopPropagation(); onStart(task.id); }} style={{
                  flex: 1, padding: "13px 16px", background: T.grad, color: "#fff",
                  fontFamily: "inherit", fontSize: 13, fontWeight: 800, textTransform: "uppercase" as const,
                  border: "none", borderRadius: 14, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  boxShadow: "0 4px 16px rgba(155,109,255,0.3)",
                }}>
                  <I n="play" s={16} /> Iniciar
                </button>
              </div>
            )}
            {(task.status === "in_progress" || task.status === "paused") && (
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={e => { e.stopPropagation(); onFinish(task); }} style={{
                  flex: 1, padding: "13px 16px", background: T.greenG, color: "#021a17",
                  fontFamily: "inherit", fontSize: 13, fontWeight: 800, textTransform: "uppercase" as const,
                  border: "none", borderRadius: 14, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}>
                  <I n="check" s={16} w={2.5} /> Finalizar
                </button>
                {task.startedAt && (
                  <div style={{ padding: "13px 14px", background: T.greenBg, border: `1px solid ${T.greenBorder}`, borderRadius: 14, fontSize: 12, fontWeight: 700, color: T.green, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" as const }}>
                    <I n="clock" s={13} c={T.green} /> {elapsed(task.startedAt as string)}
                  </div>
                )}
              </div>
            )}
            {task.status === "waiting_conference" && (
              isManager ? (
                <button onClick={e => { e.stopPropagation(); onValidate(task); }} style={{
                  width: "100%", padding: "13px 16px", background: T.greenG, color: "#021a17",
                  fontFamily: "inherit", fontSize: 13, fontWeight: 800, textTransform: "uppercase" as const,
                  border: "none", borderRadius: 14, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  boxShadow: "0 4px 16px rgba(45,212,191,0.3)",
                }}>
                  <I n="check" s={16} w={2.5} c="#021a17" /> Validar
                </button>
              ) : (
                <div style={{ padding: "12px 14px", background: T.orangeBg, border: `1px solid ${T.orangeBorder}`, borderRadius: 14, fontSize: 12, fontWeight: 700, color: T.orange, display: "flex", alignItems: "center", gap: 6 }}>
                  <I n="alert" s={14} c={T.orange} /> Aguardando validação
                </div>
              )
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="mx-scroll" style={{ padding: "0 16px 20px" }}>
        <div style={{ padding: "10px 0 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.3px" }}>
              {isManager ? "Todas as Tarefas" : "Minhas Tarefas"}
            </div>
            <div style={{ fontSize: 13, color: T.muted, marginTop: 5 }}>
              {isManager ? `${tasks.length} tarefa(s)` : `${tasks.length} atribuída(s)`}
            </div>
          </div>
          {isManager && (
            <button onClick={onNewTask} style={{
              width: 44, height: 44, borderRadius: 14, background: T.grad, border: "none",
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
              boxShadow: "0 4px 16px rgba(155,109,255,0.35)", flexShrink: 0,
            }}>
              <I n="plus" s={20} c="#fff" />
            </button>
          )}
        </div>

        {inProg.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: T.green, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
              <Pulse size={6} /> Em andamento
            </div>
            {inProg.map(t => <TaskCard key={t.id} task={t} />)}
          </div>
        )}

        {pending.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: T.muted, marginBottom: 10 }}>Pendentes</div>
            {pending.map(t => <TaskCard key={t.id} task={t} />)}
          </div>
        )}

        {waiting.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: T.orange, marginBottom: 10 }}>
              {isManager ? "Aguardando validação" : "Aguardando validação"}
            </div>
            {waiting.map(t => <TaskCard key={t.id} task={t} />)}
          </div>
        )}

        {tasks.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: 48 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 12 }}>Tudo resolvido!</div>
            <div style={{ fontSize: 13, color: T.muted, marginTop: 6 }}>
              {isManager ? "Nenhuma tarefa ativa." : "Nenhuma tarefa atribuída."}
            </div>
          </div>
        )}
      </div>

      {fullTask && (
        <TaskSheet
          task={fullTask}
          cabins={cabins}
          structures={structures}
          onClose={() => setDetail(null)}
          onStart={onStart}
          onFinish={onFinish}
          propertyId={propertyId}
          isManager={isManager}
          onValidate={onValidate}
        />
      )}
    </>
  );
}

// ─── Profile screen ───────────────────────────────────────────────────────────

function tenure(iso?: string | null): string | null {
  if (!iso) return null;
  const months = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24 * 30.44));
  if (months < 1) return "menos de 1 mês";
  if (months < 12) return `${months} ${months === 1 ? "mês" : "meses"}`;
  const y = Math.floor(months / 12), m = months % 12;
  return m > 0 ? `${y} ${y === 1 ? "ano" : "anos"} e ${m} ${m === 1 ? "mês" : "meses"}` : `${y} ${y === 1 ? "ano" : "anos"}`;
}

function ProfileScreen({ userData, showToast, onLogout }: { userData: any; showToast: (m: string, c?: string) => void; onLogout: () => void }) {
  const name = userData?.fullName || "Técnico";
  const initials = name.split(" ").slice(0, 2).map((w: string) => w[0] ?? "").join("").toUpperCase();
  const role = userData?.role === "maintenance" ? "Coordenador de Manutenção" : "Técnico de Manutenção";
  const photo: string | undefined = userData?.profilePictureUrl;
  const tenureStr = tenure(userData?.hireDate);
  const [todayShift, setTodayShift] = useState<string | null>(null);

  useEffect(() => {
    if (!userData?.id) return;
    const today = new Date();
    const from = today.toISOString().split('T')[0];
    Promise.all([
      fetch(`/api/admin/staff/schedules?staffId=${userData.id}`).then(r => r.json()),
      fetch(`/api/admin/staff/schedule-overrides?staffId=${userData.id}&from=${from}&to=${from}`).then(r => r.json()),
      fetch(`/api/admin/staff/schedule-checkpoints?staffId=${userData.id}`).then(r => r.json()),
    ]).then(([schedules, overrides, checkpoints]) => {
      const result = resolveEffectiveDaySchedule(
        userData,
        Array.isArray(schedules) ? schedules : [],
        Array.isArray(overrides) ? overrides : [],
        today,
        Array.isArray(checkpoints) ? checkpoints : []
      );
      if (!result.isWork) { setTodayShift("Folga"); return; }
      if (result.startTime) setTodayShift(`${result.startTime} às ${result.endTime ?? ""}`);
    }).catch(() => {});
  }, [userData?.id]);

  return (
    <div className="mx-scroll" style={{ padding: "0 16px 24px" }}>
      <div style={{ padding: "10px 0 20px" }}>
        <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.3px" }}>Meu Perfil</div>
      </div>

      <GBorder style={{ marginBottom: 16 }}>
        <div style={{ background: "rgba(10,12,22,0.95)", borderRadius: 20, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 66, height: 66, borderRadius: 22, flexShrink: 0, border: "1px solid rgba(155,109,255,0.3)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 900, background: "linear-gradient(135deg,rgba(155,109,255,0.25),rgba(78,201,212,0.25))" }}>
              {photo
                ? <img src={photo} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <span style={{ background: T.grad, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>{initials}</span>
              }
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 20, fontWeight: 900 }}>{name}</div>
              <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{role}</div>
              {tenureStr && <div style={{ fontSize: 11, color: T.muted2, marginTop: 1 }}>Aqui há {tenureStr}</div>}
              <div style={{ marginTop: 5 }}><Pill color={T.green} bg={T.greenBg} border={T.greenBorder}>Ativo</Pill></div>
            </div>
          </div>
          {userData?.bio && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${T.border}`, fontSize: 13, color: T.muted, lineHeight: 1.5 }}>
              {userData.bio}
            </div>
          )}
        </div>
      </GBorder>

      {(userData?.email || userData?.phone) && (
        <div style={{ background: T.glass, border: `1px solid ${T.border}`, borderRadius: 20, padding: "14px 16px", marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: T.muted, marginBottom: 10 }}>Contato</div>
          {userData.email && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: userData.phone ? 8 : 0 }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: T.ledBg, border: `1px solid ${T.ledBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <I n="send" s={14} c={T.led} />
              </div>
              <span style={{ fontSize: 13, color: T.text }}>{userData.email}</span>
            </div>
          )}
          {userData.phone && (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: T.greenBg, border: `1px solid ${T.greenBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <I n="info" s={14} c={T.green} />
              </div>
              <span style={{ fontSize: 13, color: T.text }}>{userData.phone}</span>
            </div>
          )}
        </div>
      )}

      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: T.muted, marginBottom: 10 }}>Turno hoje</div>
      <div style={{ background: T.glass, border: `1px solid ${T.border}`, borderRadius: 20, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: T.amberBg, border: `1px solid ${T.amberBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <I n="sun" s={18} c={T.amber} />
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14 }}>{todayShift || "Sem escala definida"}</div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{todayLabel()}</div>
        </div>
      </div>

      {userData?.id && userData?.propertyId && (
        <div style={{ marginBottom: 20 }}>
          <ScrapWall profileStaffId={userData.id} isOwnProfile={true} propertyId={userData.propertyId} allowRecipientPicker={true} profileBasePath="/equipe" />
        </div>
      )}

      <button onClick={onLogout} style={{ width: "100%", padding: 15, background: T.glass2, color: T.red, fontFamily: "inherit", fontSize: 14, fontWeight: 700, letterSpacing: "0.02em", textTransform: "uppercase" as const, border: `1px solid ${T.redBg}`, borderRadius: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <I n="logout" s={18} c={T.red} /> Sair do aplicativo
      </button>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

type Tab = "home" | "tasks" | "profile";

export default function MaintenancePage() {
  const { userData, loading: authLoading, userDataReady } = useAuth();
  const { currentProperty: property, loading: propertyLoading } = useProperty();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("home");
  const [tasks, setTasks] = useState<MaintenanceTask[]>([]);
  const [cabins, setCabins] = useState<Record<string, Cabin>>({});
  const [structures, setStructures] = useState<Record<string, Structure>>({});
  const [staff, setStaff] = useState<Staff[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [toast, setToastState] = useState<{ msg: string; color: string } | null>(null);
  const [completionTask, setCompletionTask] = useState<MaintenanceTask | null>(null);

  // Coordinator-only sheets
  const [showNewTask, setShowNewTask] = useState(false);
  const [assigningTask, setAssigningTask] = useState<MaintenanceTask | null>(null);
  const [validatingTask, setValidatingTask] = useState<MaintenanceTask | null>(null);
  const [assignBusy, setAssignBusy] = useState(false);
  const [validateBusy, setValidateBusy] = useState(false);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isManager = userData?.role === "maintenance";

  const showToast = useCallback((msg: string, color = T.green) => {
    setToastState({ msg, color });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastState(null), 2600);
  }, []);

  useEffect(() => {
    if (authLoading || !userDataReady) return;
    if (!userData) { router.replace("/admin/login"); }
  }, [authLoading, userDataReady, userData, router]);

  useEffect(() => {
    if (!propertyLoading && !property) { setDataLoading(false); return; }
    if (!property) return;
    let unsub: (() => void) | undefined;

    const init = async () => {
      setDataLoading(true);
      try {
        // Leituras via rotas de campo (service-role). Pelo client do browser, o lock frio do
        // refresh mobile devolvia [] → cabana/estrutura sem nome ("Local desconhecido") e, sem
        // timeout, o loader podia pendurar. Timeout de 6s espelha a app da camareira.
        const pid = encodeURIComponent(property.id);
        const withTimeout = <R,>(p: Promise<R>, fallback: R) =>
          Promise.race([p, new Promise<R>(resolve => setTimeout(() => resolve(fallback), 6000))]);
        const [cabinsData, structuresData, staffData] = await Promise.all([
          withTimeout(
            fetch(`/api/field/cabins?propertyId=${pid}`, { cache: 'no-store' })
              .then(r => r.ok ? (r.json() as Promise<Cabin[]>) : ([] as Cabin[]))
              .catch(() => [] as Cabin[]),
            [] as Cabin[]
          ),
          withTimeout(
            fetch(`/api/field/structures?propertyId=${pid}`, { cache: 'no-store' })
              .then(r => r.ok ? (r.json() as Promise<Structure[]>) : ([] as Structure[]))
              .catch(() => [] as Structure[]),
            [] as Structure[]
          ),
          withTimeout(
            fetch(`/api/field/staff?propertyId=${pid}`, { cache: 'no-store' })
              .then(r => r.ok ? (r.json() as Promise<Staff[]>) : ([] as Staff[]))
              .catch(() => [] as Staff[]),
            [] as Staff[]
          ),
        ]);
        const cabinMap: Record<string, Cabin> = {};
        cabinsData.forEach(c => { cabinMap[c.id] = c; });
        setCabins(cabinMap);
        const structureMap: Record<string, Structure> = {};
        structuresData.forEach(s => { structureMap[s.id] = s; });
        setStructures(structureMap);
        setStaff(staffData.filter(s => s.role === "maintenance" || s.role === "technician"));

        const myId = userData?.id;
        const manager = userData?.role === "maintenance";
        unsub = MaintenanceService.listenToActiveTasks(property.id, allTasks => {
          const visible = manager
            ? allTasks.filter(t => t.status !== "completed" && t.status !== "cancelled")
            : allTasks.filter(t =>
                t.status !== "completed" && t.status !== "cancelled" &&
                (!t.assignedTo || t.assignedTo.length === 0 || (myId && t.assignedTo.includes(myId)))
              );
          setTasks(visible);
        });
      } finally {
        setDataLoading(false);
      }
    };

    init();
    return () => unsub?.();
  }, [property, propertyLoading, userData?.id, userData?.role]);

  const handleStart = useCallback(async (taskId: string) => {
    const r = await postFieldAction('/api/field/maintenance-tasks', { action: 'start', taskId });
    if (!r.ok) { showToast(r.error || "Erro ao iniciar tarefa.", T.red); return; }
    showToast("Manutenção iniciada!");
  }, [showToast]);

  const handleAssign = useCallback(async (techIds: string[]) => {
    if (!assigningTask) return;
    setAssignBusy(true);
    try {
      const r = await postFieldAction('/api/field/maintenance-tasks', { action: 'assign', taskId: assigningTask.id, techIds });
      if (!r.ok) { showToast(r.error || "Erro ao atribuir.", T.red); return; }
      showToast("Técnico atribuído!");
      setAssigningTask(null);
    } finally { setAssignBusy(false); }
  }, [assigningTask, showToast]);

  const handleValidateApprove = useCallback(async (notes: string) => {
    if (!validatingTask) return;
    setValidateBusy(true);
    try {
      const r = await postFieldAction('/api/field/maintenance-tasks', { action: 'confirm', taskId: validatingTask.id, notes });
      if (!r.ok) { showToast(r.error || "Erro ao aprovar.", T.red); return; }
      showToast("Tarefa aprovada!", T.green);
      setValidatingTask(null);
    } finally { setValidateBusy(false); }
  }, [validatingTask, showToast]);

  const handleValidateReject = useCallback(async (reason: string) => {
    if (!validatingTask) return;
    setValidateBusy(true);
    try {
      const r = await postFieldAction('/api/field/maintenance-tasks', { action: 'reject', taskId: validatingTask.id, notes: reason });
      if (!r.ok) { showToast(r.error || "Erro ao reprovar.", T.red); return; }
      showToast("Tarefa devolvida para repasse.", T.amber);
      setValidatingTask(null);
    } finally { setValidateBusy(false); }
  }, [validatingTask, showToast]);

  const handleLogout = () => {
    showToast("Saindo...");
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 4000);
    fetch('/api/auth/signout', { method: 'POST', signal: ctrl.signal })
      .catch(() => {})
      .finally(() => { window.location.href = '/admin/login'; });
  };

  const navItems: { id: Tab; label: string; icon: IName; badge: number }[] = [
    { id: "home",    label: "Início",  icon: "home",   badge: 0 },
    { id: "tasks",   label: "Tarefas", icon: "wrench", badge: tasks.filter(t => t.status === "pending" || t.status === "in_progress").length },
    { id: "profile", label: "Perfil",  icon: "user",   badge: 0 },
  ];

  const loading = authLoading || !userDataReady || propertyLoading || dataLoading;

  const [showEscape, setShowEscape] = useState(false);
  useEffect(() => {
    if (!loading) { setShowEscape(false); return; }
    const t = setTimeout(() => setShowEscape(true), 15000);
    return () => clearTimeout(t);
  }, [loading]);

  if (loading) {
    return (
      <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: T.bg, color: T.text, flexDirection: "column", gap: 16, fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <div style={{ width: 40, height: 40, borderRadius: "50%", border: `3px solid rgba(155,109,255,0.3)`, borderTopColor: T.g1, animation: "spin 1s linear infinite" }} />
        <div style={{ fontSize: 13, opacity: 0.6 }}>Carregando...</div>
        {showEscape && (
          <button
            onClick={() => {
              const ctrl = new AbortController();
              setTimeout(() => ctrl.abort(), 3000);
              fetch('/api/auth/signout', { method: 'POST', signal: ctrl.signal })
                .catch(() => {})
                .finally(() => { window.location.href = '/admin/login'; });
            }}
            style={{ marginTop: 8, padding: "12px 28px", background: "rgba(248,113,113,0.1)", color: "#f87171", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 14, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
          >
            Sair
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      <style>{STYLE}</style>
      <div className="dark mx-shell" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100dvh", background: T.bg }}>
        <div style={{ width: "100%", maxWidth: 430, height: "100dvh", background: T.bg, color: T.text, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>

          <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0, background: "radial-gradient(ellipse 280px 220px at 10% 5%,rgba(155,109,255,0.12) 0%,transparent 70%),radial-gradient(ellipse 200px 160px at 90% 80%,rgba(78,201,212,0.09) 0%,transparent 70%)" }} />

          <div style={{ padding: "14px 20px 12px", borderBottom: `1px solid ${T.border}`, background: "rgba(6,8,15,0.9)", backdropFilter: "blur(20px)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, position: "relative", zIndex: 10 }}>
            <span style={{ fontSize: 16, fontWeight: 900, letterSpacing: ".1em", textTransform: "uppercase" }}>
              <span style={{ background: T.grad, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>aaura</span>
              <span style={{ fontSize: 11, color: T.muted, fontWeight: 600, marginLeft: 8, textTransform: "none", letterSpacing: 0 }}>
                {isManager ? "Coordenação" : "Manutenção"}
              </span>
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: T.led, boxShadow: `0 0 10px ${T.ledGlow}` }} />
              <span style={{ fontSize: 11, color: T.muted, fontWeight: 600 }}>Tempo real</span>
            </div>
          </div>

          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", position: "relative", zIndex: 1 }}>
            {tab === "home" && <HomeScreen tasks={tasks} userName={userData?.fullName ?? "Técnico"} onNav={setTab} isManager={isManager} />}
            {tab === "tasks" && (
              <TasksScreen
                tasks={tasks} cabins={cabins} structures={structures}
                onStart={handleStart} onFinish={setCompletionTask}
                showToast={showToast} propertyId={property?.id ?? ""} userId={userData?.id ?? ""}
                isManager={isManager} staff={staff}
                onNewTask={() => setShowNewTask(true)}
                onAssign={setAssigningTask}
                onValidate={setValidatingTask}
              />
            )}
            {tab === "profile" && <ProfileScreen userData={userData} showToast={showToast} onLogout={handleLogout} />}
          </div>

          {toast && <Toast msg={toast.msg} color={toast.color} />}

          <nav style={{ background: T.glass2, borderTop: `1px solid ${T.border}`, backdropFilter: "blur(20px)", display: "grid", gridTemplateColumns: "repeat(3,1fr)", paddingBottom: "env(safe-area-inset-bottom,8px)", flexShrink: 0, position: "relative", zIndex: 10 }}>
            {navItems.map(n => (
              <button key={n.id} onClick={() => setTab(n.id)} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, padding: "10px 4px 8px", border: "none", background: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 10, fontWeight: 700, letterSpacing: "0.03em", textTransform: "uppercase", color: tab === n.id ? T.g1 : T.muted, transition: "color .2s" }}>
                <div style={{ position: "relative", padding: tab === n.id ? "6px" : 0, background: tab === n.id ? T.gradSoft : "none", borderRadius: tab === n.id ? 12 : 0, border: tab === n.id ? "1px solid rgba(155,109,255,0.3)" : "none" }}>
                  <I n={n.icon} s={22} w={tab === n.id ? 2.5 : 1.7} />
                  {n.badge > 0 && (
                    <span style={{ position: "absolute", top: tab === n.id ? -2 : -6, right: tab === n.id ? -2 : -8, background: T.grad, color: "#fff", borderRadius: 999, fontSize: 9, fontWeight: 900, minWidth: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px", boxShadow: "0 2px 8px rgba(155,109,255,.5)" }}>
                      {n.badge}
                    </span>
                  )}
                </div>
                {n.label}
              </button>
            ))}
          </nav>

          {/* Coordinator sheets — rendered inside the constrained div so z-index works */}
          {showNewTask && property && userData && (
            <NewMaintTaskSheet
              cabins={cabins} structures={structures} staff={staff}
              propertyId={property.id}
              onClose={() => setShowNewTask(false)}
              onCreated={() => {}}
              showToast={showToast}
            />
          )}
          {assigningTask && property && userData && (
            <AssignTechSheet
              task={assigningTask} staff={staff}
              onClose={() => setAssigningTask(null)}
              onAssign={handleAssign} busy={assignBusy}
            />
          )}
          {validatingTask && property && userData && (
            <ValidateSheet
              task={validatingTask} cabins={cabins} structures={structures}
              onClose={() => setValidatingTask(null)}
              onApprove={handleValidateApprove}
              onReject={handleValidateReject}
              busy={validateBusy}
            />
          )}
        </div>
      </div>

      {completionTask && property && (
        <MaintenanceCompletionModal
          isOpen={!!completionTask}
          onClose={() => setCompletionTask(null)}
          task={completionTask}
          cabins={cabins}
          structures={structures}
        />
      )}
    </>
  );
}
