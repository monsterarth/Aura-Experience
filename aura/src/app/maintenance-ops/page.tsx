"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import { MaintenanceService } from "@/services/maintenance-service";
import { CabinService } from "@/services/cabin-service";
import { StaffService } from "@/services/staff-service";
import { StructureService } from "@/services/structure-service";
import { MaintenanceTask, Cabin, Staff, Structure } from "@/types/aura";
import { postFieldAction } from "@/lib/field-api";
import { v4 as uuidv4 } from "uuid";

// ─── CSS ──────────────────────────────────────────────────────────────────────

const STYLE = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800;9..40,900&display=swap');
.mnt-shell *{box-sizing:border-box;}
.mnt-shell{font-family:'DM Sans',-apple-system,BlinkMacSystemFont,sans-serif;}
.mnt-scroll{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;}
.mnt-scroll::-webkit-scrollbar{display:none;}
.mnt-sheet-body{overflow-y:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;flex:1;}
.mnt-sheet-body::-webkit-scrollbar{display:none;}
@keyframes mnt-pulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.4;transform:scale(.8);}}
@keyframes mnt-fadein{from{opacity:0}to{opacity:1}}
@keyframes mnt-slideup{from{transform:translateY(100%)}to{transform:translateY(0)}}
@keyframes mnt-toast{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes mnt-spin{to{transform:rotate(360deg)}}
.mnt-shell button:not([disabled]):active{opacity:.7;transform:scale(.97);}
`;

// ─── Tokens ───────────────────────────────────────────────────────────────────

const T = {
  bg: "#080b0e",
  card: "#0c1015",
  card2: "rgba(255,255,255,0.04)",
  glass: "rgba(255,255,255,0.035)",
  glass2: "rgba(255,255,255,0.055)",
  border: "rgba(255,255,255,0.08)",
  border2: "rgba(255,255,255,0.13)",
  text: "#eef0f8",
  muted: "rgba(238,240,248,0.42)",
  muted2: "rgba(238,240,248,0.22)",
  // amber/orange accent for maintenance
  a1: "#f59e0b",
  a2: "#d97706",
  aGrad: "linear-gradient(135deg,#f59e0b 0%,#d97706 100%)",
  aSoft: "linear-gradient(135deg,rgba(245,158,11,0.15) 0%,rgba(217,119,6,0.12) 100%)",
  aBorder: "rgba(245,158,11,0.35)",
  green: "#2dd4bf",
  greenG: "linear-gradient(135deg,#059669,#2dd4bf)",
  greenBg: "rgba(45,212,191,0.1)",
  greenBorder: "rgba(45,212,191,0.25)",
  amber: "#f59e0b",
  amberBg: "rgba(245,158,11,0.1)",
  amberBorder: "rgba(245,158,11,0.28)",
  orange: "#fb923c",
  orangeBg: "rgba(251,146,60,0.1)",
  orangeBorder: "rgba(251,146,60,0.28)",
  blue: "#60a5fa",
  blueBg: "rgba(96,165,250,0.1)",
  blueBorder: "rgba(96,165,250,0.25)",
  red: "#f87171",
  redBg: "rgba(248,113,113,0.1)",
  redBorder: "rgba(248,113,113,0.25)",
};

// ─── Utils ────────────────────────────────────────────────────────────────────

function elapsed(iso?: string | null): string | null {
  if (!iso) return null;
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "agora";
  return m < 60 ? `${m}min` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}min` : ""}`;
}
function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}
function todayLabel() {
  return new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
}

// ─── Icons ────────────────────────────────────────────────────────────────────

type IName =
  | "home" | "list" | "check" | "x" | "chevr" | "chevl" | "plus" | "user"
  | "wrench" | "clock" | "alert" | "send" | "loader" | "assign" | "eye"
  | "undo" | "checkall" | "logout" | "arrow" | "settings" | "refresh" | "minus"
  | "priority" | "location" | "photo";

function I({ n, s = 20, c = "currentColor", w = 1.8 }: { n: IName; s?: number; c?: string; w?: number }) {
  const d: Record<IName, React.ReactNode> = {
    home: <><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" /><path d="M9 21V12h6v9" /></>,
    list: <><rect x="3" y="5" width="18" height="2" rx="1" /><rect x="3" y="11" width="18" height="2" rx="1" /><rect x="3" y="17" width="12" height="2" rx="1" /></>,
    check: <polyline points="20 6 9 17 4 12" />,
    x: <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
    chevr: <polyline points="9 18 15 12 9 6" />,
    chevl: <polyline points="15 18 9 12 15 6" />,
    plus: <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>,
    user: <><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
    wrench: <><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" /></>,
    clock: <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>,
    alert: <><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>,
    send: <><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></>,
    loader: <path d="M21 12a9 9 0 11-6.219-8.56" />,
    assign: <><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="23" y1="11" x2="17" y2="11" /><line x1="20" y1="8" x2="20" y2="14" /></>,
    eye: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>,
    undo: <><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 102.13-9.36L1 10" /></>,
    checkall: <><polyline points="17 1 21 5 13 13" /><polyline points="7 7 11 11 3 19" /></>,
    logout: <><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></>,
    arrow: <><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></>,
    refresh: <><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" /></>,
    minus: <line x1="5" y1="12" x2="19" y2="12" />,
    priority: <><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></>,
    location: <><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></>,
    photo: <><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></>,
  };
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round"
      style={n === "loader" ? { animation: "mnt-spin 0.8s linear infinite" } : undefined}>
      {d[n]}
    </svg>
  );
}

// ─── Pulse ────────────────────────────────────────────────────────────────────

function Pulse({ size = 8, color = T.green }: { size?: number; color?: string }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: color, boxShadow: `0 0 8px ${color}`, animation: "mnt-pulse 1.5s infinite", flexShrink: 0 }} />
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ msg, color }: { msg: string; color: string }) {
  return (
    <div style={{
      position: "absolute", bottom: 88, left: 16, right: 16,
      background: "#111827", color: T.text, border: `1px solid ${T.border2}`,
      borderRadius: 16, padding: "14px 16px", fontSize: 13, fontWeight: 600,
      display: "flex", alignItems: "center", gap: 10, zIndex: 300,
      animation: "mnt-toast .3s cubic-bezier(.32,.72,0,1)",
      boxShadow: "0 8px 32px rgba(0,0,0,.5)",
    }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, boxShadow: `0 0 8px ${color}`, flexShrink: 0 }} />
      <span>{msg}</span>
    </div>
  );
}

// ─── Sheet ────────────────────────────────────────────────────────────────────

function Sheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      style={{ position: "absolute", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.78)", display: "flex", flexDirection: "column", justifyContent: "flex-end", animation: "mnt-fadein .2s ease", backdropFilter: "blur(4px)" }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: "#0c1015", border: `1px solid ${T.border2}`, borderRadius: "28px 28px 0 0", borderBottom: "none", maxHeight: "92dvh", display: "flex", flexDirection: "column", animation: "mnt-slideup .28s cubic-bezier(.32,.72,0,1)" }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: T.border2, margin: "12px auto 4px", flexShrink: 0 }} />
        {children}
      </div>
    </div>
  );
}

// ─── Priority badge ───────────────────────────────────────────────────────────

function PriorityBadge({ priority }: { priority: MaintenanceTask["priority"] }) {
  const map = {
    low:    { label: "Baixa",   color: T.blue,   bg: T.blueBg,   border: T.blueBorder },
    medium: { label: "Média",   color: T.amber,  bg: T.amberBg,  border: T.amberBorder },
    high:   { label: "Alta",    color: T.orange, bg: T.orangeBg, border: T.orangeBorder },
    urgent: { label: "Urgente", color: T.red,    bg: T.redBg,    border: T.redBorder },
  };
  const s = map[priority] ?? map.medium;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", fontSize: 10, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", padding: "3px 8px", borderRadius: 999, lineHeight: 1.5, color: s.color, background: s.bg, border: `1px solid ${s.border}` }}>
      {s.label}
    </span>
  );
}

// ─── Field label ──────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{children}</div>;
}

const fieldStyle = {
  width: "100%", background: T.card2, border: `1px solid ${T.border}`,
  borderRadius: 12, padding: "11px 14px", color: T.text, fontSize: 13,
  fontFamily: "inherit", outline: "none", appearance: "none" as const,
};

// ─── Location picker ──────────────────────────────────────────────────────────

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
            <button key={v} onClick={() => setLt(v)} style={{ flex: 1, padding: "10px 0", borderRadius: 12, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", background: on ? T.aSoft : T.card2, border: `1px solid ${on ? T.aBorder : T.border}`, color: on ? T.a1 : T.muted }}>
              {labels[v]}
            </button>
          );
        })}
      </div>
      {lt === "cabin" && (
        <select value={cid} onChange={e => setCid(e.target.value)} style={{ ...fieldStyle, marginBottom: 16 }}>
          <option value="">Selecione a cabana</option>
          {cabins.map(c => <option key={c.id} value={c.id}>{c.name || `Cabana ${c.number}`}</option>)}
        </select>
      )}
      {lt === "structure" && (
        <select value={sid} onChange={e => setSid(e.target.value)} style={{ ...fieldStyle, marginBottom: 16 }}>
          <option value="">Selecione a estrutura</option>
          {structures.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}
      {lt === "custom" && (
        <input value={cust} onChange={e => setCust(e.target.value)} placeholder="Ex: Piscina, Gerador, Portaria..." style={{ ...fieldStyle, marginBottom: 16 }} />
      )}
    </>
  );
}

// ─── New Task Sheet ───────────────────────────────────────────────────────────

function NewTaskSheet({ cabins, structures, technicians, propertyId, onClose, showToast }: {
  cabins: Cabin[]; structures: Structure[]; technicians: Staff[];
  propertyId: string;
  onClose: () => void;
  showToast: (msg: string, color?: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<MaintenanceTask["priority"]>("medium");
  const [locType, setLocType] = useState<"cabin" | "structure" | "custom">("cabin");
  const [cabinId, setCabinId] = useState("");
  const [structureId, setStructureId] = useState("");
  const [customLocation, setCustomLocation] = useState("");
  const [assignedIds, setAssignedIds] = useState<string[]>([]);
  const [checklist, setChecklist] = useState<{ id: string; label: string; checked: boolean }[]>([]);
  const [checklistInput, setChecklistInput] = useState("");
  const [busy, setBusy] = useState(false);

  const PRIOS: { value: MaintenanceTask["priority"]; label: string; color: string }[] = [
    { value: "low",    label: "Baixa",   color: T.blue },
    { value: "medium", label: "Média",   color: T.amber },
    { value: "high",   label: "Alta",    color: T.orange },
    { value: "urgent", label: "Urgente", color: T.red },
  ];

  const canSubmit = title.trim().length > 0 && (
    (locType === "cabin" && cabinId) ||
    (locType === "structure" && structureId) ||
    (locType === "custom" && customLocation.trim().length > 0)
  );

  const toggleTech = (id: string) =>
    setAssignedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const addChecklistItem = () => {
    if (!checklistInput.trim()) return;
    setChecklist(prev => [...prev, { id: uuidv4(), label: checklistInput.trim(), checked: false }]);
    setChecklistInput("");
  };

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
          status: "pending",
          assignedTo: assignedIds,
          checklist,
          isRecurring: false,
        },
      });
      if (!r.ok) { showToast(r.error || "Erro ao criar tarefa.", T.red); return; }
      showToast("Tarefa criada!", T.green);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet onClose={onClose}>
      <div style={{ padding: "20px 20px 8px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 16, fontWeight: 800, color: T.text }}>Nova Ordem de Serviço</span>
        <button onClick={onClose} style={{ background: T.glass2, border: `1px solid ${T.border}`, borderRadius: 10, padding: 8, cursor: "pointer", color: T.muted }}>
          <I n="x" s={16} />
        </button>
      </div>

      <div className="mnt-sheet-body" style={{ padding: "12px 20px 0" }}>
        <Label>Problema / Título *</Label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Torneira com vazamento, AC sem funcionar..."
          style={{ ...fieldStyle, marginBottom: 16, border: `1px solid ${title ? T.border2 : T.border}` }} autoFocus />

        <Label>Local</Label>
        <LocPicker lt={locType} setLt={setLocType} cid={cabinId} setCid={setCabinId}
          sid={structureId} setSid={setStructureId} cust={customLocation} setCust={setCustomLocation}
          cabins={cabins} structures={structures} />

        <Label>Prioridade</Label>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {PRIOS.map(p => (
            <button key={p.value} onClick={() => setPriority(p.value)} style={{
              flex: 1, padding: "9px 4px", borderRadius: 12, cursor: "pointer",
              fontFamily: "inherit", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em",
              background: priority === p.value ? `${p.color}18` : T.card2,
              border: `1.5px solid ${priority === p.value ? p.color : T.border}`,
              color: priority === p.value ? p.color : T.muted, transition: "all .15s",
            }}>{p.label}</button>
          ))}
        </div>

        <Label>Descrição (opcional)</Label>
        <textarea value={description} onChange={e => setDescription(e.target.value)}
          placeholder="Descreva onde está o problema e o que observou..." rows={2}
          style={{ ...fieldStyle, resize: "none", marginBottom: 16 }} />

        <Label>Checklist de Verificação (opcional)</Label>
        <div style={{ marginBottom: 8 }}>
          {checklist.map(item => (
            <div key={item.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
              <span style={{ flex: 1, fontSize: 13, color: T.text, background: T.card2, border: `1px solid ${T.border}`, borderRadius: 10, padding: "8px 12px" }}>{item.label}</span>
              <button onClick={() => setChecklist(prev => prev.filter(i => i.id !== item.id))} style={{ padding: "8px 10px", background: T.redBg, border: `1px solid ${T.redBorder}`, borderRadius: 10, cursor: "pointer", color: T.red, flexShrink: 0 }}>
                <I n="x" s={13} c={T.red} />
              </button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8 }}>
            <input value={checklistInput} onChange={e => setChecklistInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addChecklistItem(); } }}
              placeholder="Adicionar item..." style={{ ...fieldStyle, flex: 1 }} />
            <button onClick={addChecklistItem} style={{ padding: "11px 14px", background: T.card2, border: `1px solid ${T.border}`, borderRadius: 12, cursor: "pointer", color: T.muted }}>
              <I n="plus" s={14} />
            </button>
          </div>
        </div>

        {technicians.length > 0 && (
          <>
            <div style={{ marginTop: 12 }}><Label>Atribuir Técnico (opcional)</Label></div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
              {technicians.map(t => {
                const on = assignedIds.includes(t.id);
                return (
                  <button key={t.id} onClick={() => toggleTech(t.id)} style={{
                    padding: "7px 12px", borderRadius: 10, cursor: "pointer",
                    fontFamily: "inherit", fontSize: 12, fontWeight: 700,
                    background: on ? T.aSoft : T.card2, border: `1px solid ${on ? T.aBorder : T.border}`,
                    color: on ? T.a1 : T.muted,
                  }}>{t.fullName.split(" ")[0]}</button>
                );
              })}
            </div>
          </>
        )}
        <div style={{ height: 16 }} />
      </div>

      <div style={{ padding: "12px 20px 24px", borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
        <button disabled={!canSubmit || busy} onClick={submit} style={{
          width: "100%", padding: 16, background: T.aGrad, color: "#1a0900",
          border: "none", borderRadius: 16, cursor: (!canSubmit || busy) ? "not-allowed" : "pointer",
          fontFamily: "inherit", fontSize: 14, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          opacity: !canSubmit ? 0.4 : 1, boxShadow: "0 4px 20px rgba(245,158,11,0.3)",
        }}>
          {busy ? <I n="loader" s={16} c="#1a0900" /> : <I n="plus" s={16} c="#1a0900" />}
          Criar OS
        </button>
      </div>
    </Sheet>
  );
}

// ─── Confer Sheet (approve / reject) ─────────────────────────────────────────

function ConferSheet({ task, locationName, onClose, onApprove, onReject, busy }: {
  task: MaintenanceTask; locationName: string;
  onClose: () => void;
  onApprove: (notes: string) => void;
  onReject: () => void;
  busy: boolean;
}) {
  const [notes, setNotes] = useState("");

  return (
    <Sheet onClose={onClose}>
      <div style={{ padding: "20px 20px 8px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: T.text }}>Validação da OS</span>
          <button onClick={onClose} style={{ background: T.glass2, border: `1px solid ${T.border}`, borderRadius: 10, padding: 8, cursor: "pointer", color: T.muted }}>
            <I n="x" s={16} />
          </button>
        </div>
        <p style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>{locationName}</p>
      </div>

      <div className="mnt-sheet-body" style={{ padding: "12px 20px 0" }}>
        {/* Task info */}
        <div style={{ background: T.card2, border: `1px solid ${T.border}`, borderRadius: 16, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <PriorityBadge priority={task.priority} />
            {task.finishedAt && <span style={{ fontSize: 11, color: T.muted }}>Concluído há {elapsed(task.finishedAt)}</span>}
          </div>
          <div style={{ fontSize: 18, fontWeight: 900, color: T.text }}>{task.title}</div>
          {task.description && <div style={{ fontSize: 13, color: T.muted, marginTop: 6 }}>{task.description}</div>}
        </div>

        {/* Completion data from technician */}
        {task.completion && (
          <div style={{ background: T.card2, border: `1px solid ${T.border}`, borderRadius: 16, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Relatório do Técnico</div>
            <div style={{ display: "flex", gap: 8, marginBottom: task.completion.notes ? 10 : 0 }}>
              <div style={{ padding: "6px 12px", borderRadius: 10, fontSize: 12, fontWeight: 700, textTransform: "uppercase", background: task.completion.resolved ? T.greenBg : T.redBg, border: `1px solid ${task.completion.resolved ? T.greenBorder : T.redBorder}`, color: task.completion.resolved ? T.green : T.red }}>
                {task.completion.resolved ? "Resolvido" : "Não resolvido"}
              </div>
              {task.completion.needsCleaning && (
                <div style={{ padding: "6px 12px", borderRadius: 10, fontSize: 12, fontWeight: 700, textTransform: "uppercase", background: T.amberBg, border: `1px solid ${T.amberBorder}`, color: T.amber }}>
                  Limpeza necessária
                </div>
              )}
            </div>
            {task.completion.notes && <div style={{ fontSize: 13, color: T.text, marginTop: 8 }}>{task.completion.notes}</div>}
            {task.completion.photoUrl && (
              <img src={task.completion.photoUrl} alt="Foto de conclusão" style={{ width: "100%", borderRadius: 12, marginTop: 10, objectFit: "cover", maxHeight: 180 }} />
            )}
          </div>
        )}

        {/* Checklist */}
        {task.checklist?.length > 0 && (
          <div style={{ background: T.card2, border: `1px solid ${T.border}`, borderRadius: 16, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
              Checklist ({task.checklist.filter(i => i.checked).length}/{task.checklist.length})
            </div>
            {task.checklist.map(item => (
              <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: `1px solid ${T.border}` }}>
                <div style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${item.checked ? T.green : T.border2}`, background: item.checked ? T.greenBg : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {item.checked && <I n="check" s={10} c={T.green} />}
                </div>
                <span style={{ fontSize: 13, color: item.checked ? T.text : T.muted, textDecoration: item.checked ? "none" : "line-through" }}>{item.label}</span>
              </div>
            ))}
          </div>
        )}

        <Label>Observação (opcional)</Label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ex: Peça substituída, problema recorrente..." rows={2}
          style={{ ...fieldStyle, resize: "none", marginBottom: 8 }} />
        <div style={{ height: 8 }} />
      </div>

      <div style={{ padding: "12px 20px 24px", borderTop: `1px solid ${T.border}`, display: "flex", gap: 10, flexShrink: 0 }}>
        <button disabled={busy} onClick={onReject} style={{
          flex: 1, padding: "15px 0", background: T.redBg, color: T.red,
          border: `1px solid ${T.redBorder}`, borderRadius: 16, cursor: busy ? "not-allowed" : "pointer",
          fontFamily: "inherit", fontSize: 13, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: busy ? 0.5 : 1,
        }}>
          <I n="undo" s={15} c={T.red} /> Reprovar
        </button>
        <button disabled={busy} onClick={() => onApprove(notes)} style={{
          flex: 1.5, padding: "15px 0", background: T.greenG, color: "#021a17",
          border: "none", borderRadius: 16, cursor: busy ? "not-allowed" : "pointer",
          fontFamily: "inherit", fontSize: 13, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: busy ? 0.5 : 1,
          boxShadow: "0 4px 20px rgba(45,212,191,0.28)",
        }}>
          {busy ? <I n="loader" s={16} c="#021a17" /> : <I n="check" s={16} c="#021a17" />}
          Aprovar OS
        </button>
      </div>
    </Sheet>
  );
}

// ─── Assign Sheet ─────────────────────────────────────────────────────────────

function AssignSheet({ task, locationName, technicians, onClose, onAssign, busy }: {
  task: MaintenanceTask; locationName: string; technicians: Staff[];
  onClose: () => void;
  onAssign: (ids: string[]) => Promise<void>;
  busy: boolean;
}) {
  const current = Array.isArray(task.assignedTo) ? task.assignedTo : [];
  const [selected, setSelected] = useState<Set<string>>(new Set(current));

  const toggle = (id: string) => setSelected(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  return (
    <Sheet onClose={onClose}>
      <div style={{ padding: "20px 20px 8px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <span style={{ fontSize: 16, fontWeight: 800, color: T.text }}>Atribuir Técnico</span>
          <p style={{ fontSize: 13, color: T.muted, marginTop: 2 }}>{locationName}</p>
        </div>
        <button onClick={onClose} style={{ background: T.glass2, border: `1px solid ${T.border}`, borderRadius: 10, padding: 8, cursor: "pointer", color: T.muted }}>
          <I n="x" s={16} />
        </button>
      </div>

      <div className="mnt-sheet-body" style={{ padding: "12px 20px 0" }}>
        {technicians.length === 0 ? (
          <p style={{ color: T.muted, fontSize: 13, textAlign: "center", padding: 24 }}>Nenhum técnico ativo cadastrado.</p>
        ) : technicians.map(tech => {
          const on = selected.has(tech.id);
          return (
            <button key={tech.id} onClick={() => toggle(tech.id)} style={{
              width: "100%", display: "flex", alignItems: "center", gap: 12,
              padding: "14px 16px", borderRadius: 14, marginBottom: 8,
              background: on ? T.aSoft : T.card2, border: `1px solid ${on ? T.aBorder : T.border}`,
              cursor: "pointer", textAlign: "left",
            }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: on ? T.aGrad : T.glass2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: on ? "#1a0900" : T.muted, flexShrink: 0 }}>
                {tech.fullName.charAt(0)}
              </div>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: T.text }}>{tech.fullName}</span>
              <div style={{ width: 22, height: 22, borderRadius: 7, border: `2px solid ${on ? T.a1 : T.border2}`, background: on ? T.aSoft : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {on && <I n="check" s={12} c={T.a1} />}
              </div>
            </button>
          );
        })}
        <div style={{ height: 8 }} />
      </div>

      <div style={{ padding: "12px 20px 24px", borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
        <button disabled={busy || selected.size === 0} onClick={() => onAssign(Array.from(selected))} style={{
          width: "100%", padding: 16, background: T.aGrad, color: "#1a0900",
          border: "none", borderRadius: 16, cursor: (busy || selected.size === 0) ? "not-allowed" : "pointer",
          fontFamily: "inherit", fontSize: 14, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          opacity: (busy || selected.size === 0) ? 0.4 : 1, boxShadow: "0 4px 20px rgba(245,158,11,0.3)",
        }}>
          {busy ? <I n="loader" s={16} c="#1a0900" /> : <I n="send" s={16} c="#1a0900" />}
          Confirmar {selected.size > 0 ? `(${selected.size})` : ""}
        </button>
      </div>
    </Sheet>
  );
}

// ─── Task Card ────────────────────────────────────────────────────────────────

function TaskCard({ task, locationName, technicians, onConfer, onAssign }: {
  task: MaintenanceTask; locationName: string; technicians: Staff[];
  onConfer?: () => void;
  onAssign?: () => void;
}) {
  const isConference = task.status === "waiting_conference";
  const techNames = (Array.isArray(task.assignedTo) ? task.assignedTo : [])
    .map(id => technicians.find(t => t.id === id)?.fullName.split(" ")[0])
    .filter(Boolean).join(", ");

  return (
    <div style={{
      background: isConference ? "rgba(245,158,11,0.07)" : T.card2,
      border: `1px solid ${isConference ? T.aBorder : T.border}`,
      borderRadius: 18, padding: 16, marginBottom: 10,
      boxShadow: isConference ? "0 0 20px rgba(245,158,11,0.1)" : "none",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
            <PriorityBadge priority={task.priority} />
            {(task.recurrenceSourceId) && (
              <span style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", padding: "2px 7px", borderRadius: 999, background: T.blueBg, color: T.blue, border: `1px solid ${T.blueBorder}` }}>Auto</span>
            )}
          </div>
          <div style={{ fontSize: 17, fontWeight: 900, color: T.text, lineHeight: 1.2 }}>{task.title}</div>
          <div style={{ fontSize: 12, color: T.a1, fontWeight: 700, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
            <I n="location" s={11} c={T.a1} /> {locationName}
          </div>
        </div>
        {isConference && (
          <div style={{ background: T.aSoft, borderRadius: 10, padding: "6px 8px", flexShrink: 0 }}>
            <Pulse size={8} color={T.a1} />
          </div>
        )}
      </div>

      {task.description && (
        <div style={{ fontSize: 12, color: T.muted, marginBottom: 10, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any, overflow: "hidden" }}>
          {task.description}
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
        {techNames && (
          <span style={{ fontSize: 12, color: T.muted, display: "flex", alignItems: "center", gap: 4 }}>
            <I n="user" s={12} c={T.muted} /> {techNames}
          </span>
        )}
        {task.startedAt && (
          <span style={{ fontSize: 12, color: T.muted, display: "flex", alignItems: "center", gap: 4 }}>
            <I n="clock" s={12} c={T.muted} /> {elapsed(task.startedAt)}
          </span>
        )}
        {isConference && task.finishedAt && (
          <span style={{ fontSize: 12, color: T.amber, display: "flex", alignItems: "center", gap: 4 }}>
            <I n="alert" s={12} c={T.amber} /> Aguardando há {elapsed(task.finishedAt)}
          </span>
        )}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        {isConference && onConfer && (
          <button onClick={onConfer} style={{
            flex: 1, padding: "11px 0", background: T.aGrad, color: "#1a0900",
            border: "none", borderRadius: 12, cursor: "pointer",
            fontFamily: "inherit", fontSize: 12, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            boxShadow: "0 3px 14px rgba(245,158,11,0.35)",
          }}>
            <I n="eye" s={13} c="#1a0900" /> Validar OS
          </button>
        )}
        {!isConference && onAssign && (
          <button onClick={onAssign} style={{
            flex: 1, padding: "11px 0", background: T.card2, color: T.muted,
            border: `1px solid ${T.border}`, borderRadius: 12, cursor: "pointer",
            fontFamily: "inherit", fontSize: 12, fontWeight: 700, textTransform: "uppercase",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}>
            <I n="assign" s={13} /> {techNames ? "Reatribuir" : "Atribuir"}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Profile Screen ───────────────────────────────────────────────────────────

function ProfileScreen({ userData, onLogout }: { userData: any; onLogout: () => void }) {
  const name = userData?.fullName || "Coordenador";
  const initials = name.split(" ").slice(0, 2).map((w: string) => w[0] ?? "").join("").toUpperCase();
  const photo: string | undefined = userData?.profilePictureUrl;

  return (
    <div className="mnt-scroll" style={{ padding: "0 16px 24px" }}>
      <div style={{ padding: "20px 0 20px" }}>
        <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.3px", color: T.text }}>Meu Perfil</div>
      </div>

      <div style={{ position: "relative", borderRadius: 20, marginBottom: 16 }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: 20, padding: "1px", background: T.aGrad, WebkitMask: "linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0)", WebkitMaskComposite: "xor", maskComposite: "exclude", pointerEvents: "none" }} />
        <div style={{ background: "rgba(8,11,14,0.95)", borderRadius: 20, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 66, height: 66, borderRadius: 22, flexShrink: 0, border: `1px solid ${T.aBorder}`, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 900, background: "linear-gradient(135deg,rgba(245,158,11,0.25),rgba(217,119,6,0.25))" }}>
              {photo
                ? <img src={photo} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <span style={{ background: T.aGrad, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>{initials}</span>
              }
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: T.text }}>{name}</div>
              <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>Coordenador de Manutenção</div>
              <div style={{ marginTop: 5 }}>
                <span style={{ display: "inline-flex", alignItems: "center", fontSize: 10, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase" as const, padding: "3px 9px", borderRadius: 999, lineHeight: 1.5, color: T.green, background: T.greenBg, border: `1px solid ${T.greenBorder}` }}>Ativo</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <button onClick={onLogout} style={{ width: "100%", padding: 15, background: T.redBg, color: T.red, fontFamily: "inherit", fontSize: 14, fontWeight: 700, letterSpacing: "0.02em", textTransform: "uppercase" as const, border: `1px solid ${T.redBorder}`, borderRadius: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <I n="logout" s={18} c={T.red} /> Sair do aplicativo
      </button>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

type Screen = "dashboard" | "tasks" | "profile";

export default function ManutencaoPage() {
  const { userData, authConfirmed } = useAuth();
  const { currentProperty: property, loading: propLoading } = useProperty();

  const [tasks, setTasks] = useState<MaintenanceTask[]>([]);
  const [cabins, setCabins] = useState<Record<string, Cabin>>({});
  const [structures, setStructures] = useState<Record<string, Structure>>({});
  const [technicians, setTechnicians] = useState<Staff[]>([]);
  const [allCabins, setAllCabins] = useState<Cabin[]>([]);
  const [allStructures, setAllStructures] = useState<Structure[]>([]);
  const [loading, setLoading] = useState(true);

  const [screen, setScreen] = useState<Screen>("dashboard");

  const [showNewTask, setShowNewTask] = useState(false);
  const [conferTask, setConferTask] = useState<MaintenanceTask | null>(null);
  const [assignTask, setAssignTask] = useState<MaintenanceTask | null>(null);

  const [conferBusy, setConferBusy] = useState(false);
  const [assignBusy, setAssignBusy] = useState(false);

  const [toast, setToast] = useState<{ msg: string; color: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutRef = useRef(false);

  const showToast = useCallback((msg: string, color = T.green) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, color });
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, []);

  const handleLogout = async () => {
    if (logoutRef.current) return;
    logoutRef.current = true;
    showToast("Saindo...");
    await fetch("/api/auth/signout", { method: "POST" }).catch(() => {});
    window.location.href = "/admin/login";
  };

  // ── Load ──────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!propLoading && !property) { setLoading(false); return; }
    if (!property || !authConfirmed) return;
    let unsub: () => void;

    const init = async () => {
      setLoading(true);
      try {
        const [cabinsData, staffData, structuresData] = await Promise.all([
          CabinService.getCabinsByProperty(property.id),
          StaffService.getStaffByProperty(property.id),
          StructureService.getStructures(property.id),
        ]);

        const cabinsDict: Record<string, Cabin> = {};
        cabinsData.forEach(c => { cabinsDict[c.id] = c; });
        setCabins(cabinsDict);
        setAllCabins(cabinsData);

        const structuresDict: Record<string, Structure> = {};
        structuresData.forEach(s => { structuresDict[s.id] = s; });
        setStructures(structuresDict);
        setAllStructures(structuresData);

        const techs = staffData.filter(s => s.active && (s.role === "maintenance" || s.role === "technician" || (s.secondaryRoles ?? []).includes("technician")));
        setTechnicians(techs);

        unsub = MaintenanceService.listenToActiveTasks(property.id, setTasks);
      } catch {
        showToast("Erro ao carregar dados.", T.red);
      } finally {
        setLoading(false);
      }
    };

    init();
    return () => { if (unsub) unsub(); };
  }, [property, propLoading, showToast, authConfirmed]);

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function getLocationName(task: MaintenanceTask): string {
    if (task.cabinId && cabins[task.cabinId]) return cabins[task.cabinId].name || `Cabana`;
    if (task.structureId && structures[task.structureId]) return structures[task.structureId].name;
    return task.customLocation || "Local";
  }

  // ── Actions ───────────────────────────────────────────────────────────────────

  const handleApprove = async (task: MaintenanceTask, notes: string) => {
    if (!property) return;
    setConferBusy(true);
    try {
      // notes cru — o default ("Aprovado") é responsabilidade da rota, uma fonte só.
      const r = await postFieldAction('/api/field/maintenance-tasks', { action: 'confirm', taskId: task.id, notes });
      if (!r.ok) { showToast(r.error || "Erro ao aprovar.", T.red); return; }
      showToast("OS aprovada!", T.green);
      setConferTask(null);
    } finally {
      setConferBusy(false);
    }
  };

  const handleReject = async (task: MaintenanceTask) => {
    if (!property) return;
    setConferBusy(true);
    try {
      const r = await postFieldAction('/api/field/maintenance-tasks', { action: 'reject', taskId: task.id });
      if (!r.ok) { showToast(r.error || "Erro ao reprovar.", T.red); return; }
      showToast("Enviada para retrabalho.", T.amber);
      setConferTask(null);
    } finally {
      setConferBusy(false);
    }
  };

  const handleAssign = async (task: MaintenanceTask, techIds: string[]) => {
    if (!property) return;
    setAssignBusy(true);
    try {
      const r = await postFieldAction('/api/field/maintenance-tasks', { action: 'assign', taskId: task.id, techIds });
      if (!r.ok) { showToast(r.error || "Erro ao atribuir.", T.red); return; }
      showToast("Técnico atribuído!", T.green);
      setAssignTask(null);
    } finally {
      setAssignBusy(false);
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────────

  const activeTasks = tasks.filter(t => t.status !== "completed" && t.status !== "cancelled");
  const conferenceTasks = activeTasks.filter(t => t.status === "waiting_conference");
  const inProgressTasks = activeTasks.filter(t => t.status === "in_progress");
  const pendingTasks = activeTasks.filter(t => t.status === "pending" || t.status === "paused");
  const urgentTasks = activeTasks.filter(t => t.priority === "urgent" || t.priority === "high");
  const completedToday = tasks.filter(t => {
    if (t.status !== "completed") return false;
    const d = t.finishedAt || t.updatedAt;
    if (!d) return false;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return new Date(d) >= today;
  });

  // ── Guards ────────────────────────────────────────────────────────────────────

  const isLoadingScreen = propLoading || loading;
  const [showEscape, setShowEscape] = useState(false);
  useEffect(() => {
    if (!isLoadingScreen) { setShowEscape(false); return; }
    const t = setTimeout(() => setShowEscape(true), 15000);
    return () => clearTimeout(t);
  }, [isLoadingScreen]);

  if (isLoadingScreen) {
    return (
      <div style={{ height: "100dvh", background: T.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>
        <style>{`@keyframes mnt-spin{to{transform:rotate(360deg)}}`}</style>
        <div style={{ width: 36, height: 36, borderRadius: "50%", border: `3px solid rgba(245,158,11,0.25)`, borderTopColor: T.a1, animation: "mnt-spin 0.8s linear infinite" }} />
        {showEscape && (
          <button onClick={() => { fetch("/api/auth/signout", { method: "POST" }).catch(() => {}).finally(() => { window.location.href = "/admin/login"; }); }}
            style={{ marginTop: 8, padding: "12px 28px", background: T.redBg, color: T.red, border: `1px solid ${T.redBorder}`, borderRadius: 14, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            Sair
          </button>
        )}
      </div>
    );
  }

  if (!property) {
    return (
      <div style={{ height: "100dvh", background: T.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 32, fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>
        <p style={{ color: T.muted, fontSize: 14, textAlign: "center" }}>Nenhuma propriedade selecionada. Acesse o painel admin para configurar.</p>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{STYLE}</style>
      <div className="dark mnt-shell" style={{ height: "100dvh", background: T.bg, color: T.text, display: "flex", flexDirection: "column", position: "relative", overflow: "hidden", maxWidth: 480, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ padding: "52px 20px 16px", background: `linear-gradient(180deg,${T.card} 0%,${T.bg} 100%)`, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 13, color: T.muted, fontWeight: 500 }}>{greeting()},</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: T.text, lineHeight: 1.1 }}>
                {userData?.fullName?.split(" ")[0] || "Coordenador"}
              </div>
              <div style={{ fontSize: 11, color: T.muted, marginTop: 2, textTransform: "capitalize" }}>{todayLabel()}</div>
            </div>
            <button
              onClick={() => setShowNewTask(true)}
              style={{ width: 44, height: 44, borderRadius: 14, background: T.aGrad, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 3px 14px rgba(245,158,11,0.4)" }}
            >
              <I n="plus" s={20} c="#1a0900" />
            </button>
          </div>

          {/* Stats */}
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            {[
              { label: "Validação",    value: conferenceTasks.length, color: T.a1,     bg: T.aSoft,     pulse: conferenceTasks.length > 0 },
              { label: "Em Serviço",   value: inProgressTasks.length,  color: T.blue,   bg: T.blueBg,   pulse: false },
              { label: "Pendentes",    value: pendingTasks.length,     color: T.muted,  bg: T.glass2,   pulse: false },
              { label: "Concluídas",   value: completedToday.length,   color: T.green,  bg: T.greenBg,  pulse: false },
            ].map(s => (
              <div key={s.label} style={{ flex: 1, background: s.bg, border: `1px solid ${s.color}33`, borderRadius: 14, padding: "10px 6px", textAlign: "center" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 3, marginBottom: 2 }}>
                  {s.pulse && <Pulse size={6} color={s.color} />}
                  <span style={{ fontSize: 22, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</span>
                </div>
                <div style={{ fontSize: 9, fontWeight: 700, color: s.color, textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.8 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="mnt-scroll" style={{ flex: 1, padding: "0 16px" }}>

          {/* Dashboard screen */}
          {screen === "dashboard" && (
            <>
              {/* Conference banner */}
              {conferenceTasks.length > 0 && (
                <button onClick={() => setScreen("tasks")} style={{
                  width: "100%", marginTop: 16, padding: "16px 18px",
                  background: `linear-gradient(135deg,rgba(245,158,11,0.18),rgba(217,119,6,0.12))`,
                  border: `1.5px solid ${T.aBorder}`, borderRadius: 18, cursor: "pointer", textAlign: "left",
                  display: "flex", alignItems: "center", gap: 12, boxShadow: "0 4px 24px rgba(245,158,11,0.18)",
                }}>
                  <div style={{ background: T.aGrad, borderRadius: 12, padding: 10, flexShrink: 0 }}>
                    <I n="wrench" s={20} c="#1a0900" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>
                      {conferenceTasks.length} OS aguardando validação
                    </div>
                    <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>Toque para revisar e aprovar</div>
                  </div>
                  <I n="chevr" s={18} c={T.a1} />
                </button>
              )}

              {/* Urgent tasks */}
              {urgentTasks.filter(t => t.status !== "waiting_conference").length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase", color: T.red, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                    <Pulse size={6} color={T.red} /> Urgentes / Alta Prioridade
                  </div>
                  {urgentTasks.filter(t => t.status !== "waiting_conference").slice(0, 3).map(t => (
                    <div key={t.id} style={{ background: t.priority === "urgent" ? T.redBg : T.orangeBg, border: `1px solid ${t.priority === "urgent" ? T.redBorder : T.orangeBorder}`, borderRadius: 14, padding: "12px 16px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
                      <I n="alert" s={16} c={t.priority === "urgent" ? T.red : T.orange} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                        <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{getLocationName(t)}</div>
                      </div>
                      <button onClick={() => setAssignTask(t)} style={{ padding: "7px 12px", background: "transparent", border: `1px solid ${t.priority === "urgent" ? T.redBorder : T.orangeBorder}`, borderRadius: 10, cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: t.priority === "urgent" ? T.red : T.orange, flexShrink: 0 }}>
                        Atribuir
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* In progress summary */}
              {inProgressTasks.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase", color: T.blue, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                    <Pulse size={6} color={T.blue} /> Em Execução
                  </div>
                  {inProgressTasks.slice(0, 3).map(t => (
                    <div key={t.id} style={{ background: T.blueBg, border: `1px solid ${T.blueBorder}`, borderRadius: 14, padding: "12px 16px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
                      <I n="wrench" s={15} c={T.blue} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                        <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{getLocationName(t)} {t.startedAt ? `· iniciado há ${elapsed(t.startedAt)}` : ""}</div>
                      </div>
                    </div>
                  ))}
                  {inProgressTasks.length > 3 && (
                    <button onClick={() => setScreen("tasks")} style={{ width: "100%", padding: "10px 0", background: "transparent", border: `1px solid ${T.border}`, borderRadius: 12, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700, color: T.muted, textTransform: "uppercase" }}>
                      Ver todas ({inProgressTasks.length})
                    </button>
                  )}
                </div>
              )}

              {activeTasks.length === 0 && (
                <div style={{ marginTop: 48, textAlign: "center" }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>🔧</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: T.text }}>Tudo em dia!</div>
                  <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>Nenhuma OS ativa no momento.</div>
                </div>
              )}

              <div style={{ height: 24 }} />
            </>
          )}

          {/* Tasks screen */}
          {screen === "tasks" && (
            <>
              {/* Validation */}
              {conferenceTasks.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase", color: T.a1, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                    <Pulse size={6} color={T.a1} /> Aguardando Validação ({conferenceTasks.length})
                  </div>
                  {conferenceTasks.map(t => (
                    <TaskCard key={t.id} task={t} locationName={getLocationName(t)} technicians={technicians}
                      onConfer={() => setConferTask(t)} />
                  ))}
                </div>
              )}

              {/* In progress */}
              {inProgressTasks.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase", color: T.blue, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                    <Pulse size={6} color={T.blue} /> Em Execução ({inProgressTasks.length})
                  </div>
                  {inProgressTasks.map(t => (
                    <TaskCard key={t.id} task={t} locationName={getLocationName(t)} technicians={technicians}
                      onAssign={() => setAssignTask(t)} />
                  ))}
                </div>
              )}

              {/* Pending */}
              {pendingTasks.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase", color: T.muted, marginBottom: 10 }}>
                    Pendentes ({pendingTasks.length})
                  </div>
                  {pendingTasks.map(t => (
                    <TaskCard key={t.id} task={t} locationName={getLocationName(t)} technicians={technicians}
                      onAssign={() => setAssignTask(t)} />
                  ))}
                </div>
              )}

              {activeTasks.length === 0 && (
                <div style={{ marginTop: 48, textAlign: "center" }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: T.muted }}>Nenhuma OS ativa.</div>
                </div>
              )}

              <div style={{ height: 24 }} />
            </>
          )}

          {/* Profile screen */}
          {screen === "profile" && (
            <ProfileScreen userData={userData} onLogout={handleLogout} />
          )}
        </div>

        {/* Bottom nav */}
        <div style={{ display: "flex", borderTop: `1px solid ${T.border}`, background: T.card, flexShrink: 0, paddingBottom: "env(safe-area-inset-bottom)" }}>
          {([
            { key: "dashboard", icon: "home" as IName,  label: "Início" },
            { key: "tasks",     icon: "list" as IName,  label: "Ordens" },
            { key: "profile",   icon: "user" as IName,  label: "Perfil" },
          ] as const).map(tab => {
            const on = screen === tab.key;
            const badge = tab.key === "tasks" && conferenceTasks.length > 0 ? conferenceTasks.length : 0;
            return (
              <button key={tab.key} onClick={() => setScreen(tab.key)} style={{
                flex: 1, padding: "12px 0 10px", background: "transparent", border: "none",
                cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, position: "relative",
              }}>
                <div style={{ position: "relative" }}>
                  <I n={tab.icon} s={22} c={on ? T.a1 : T.muted} w={on ? 2.2 : 1.8} />
                  {badge > 0 && (
                    <div style={{ position: "absolute", top: -4, right: -6, width: 16, height: 16, borderRadius: "50%", background: T.red, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 900, color: "#fff" }}>{badge}</div>
                  )}
                </div>
                <span style={{ fontSize: 10, fontWeight: on ? 800 : 600, color: on ? T.a1 : T.muted, letterSpacing: "0.04em", textTransform: "uppercase" }}>{tab.label}</span>
                {on && <div style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", width: 20, height: 2, borderRadius: 1, background: T.a1 }} />}
              </button>
            );
          })}
        </div>

        {/* Sheets */}
        {showNewTask && (
          <NewTaskSheet
            cabins={allCabins} structures={allStructures} technicians={technicians}
            propertyId={property.id}
            onClose={() => setShowNewTask(false)} showToast={showToast}
          />
        )}
        {conferTask && (
          <ConferSheet
            task={conferTask} locationName={getLocationName(conferTask)}
            onClose={() => setConferTask(null)}
            onApprove={(notes) => handleApprove(conferTask, notes)}
            onReject={() => handleReject(conferTask)}
            busy={conferBusy}
          />
        )}
        {assignTask && (
          <AssignSheet
            task={assignTask} locationName={getLocationName(assignTask)} technicians={technicians}
            onClose={() => setAssignTask(null)}
            onAssign={(ids) => handleAssign(assignTask, ids)}
            busy={assignBusy}
          />
        )}

        {/* Toast */}
        {toast && <Toast msg={toast.msg} color={toast.color} />}
      </div>
    </>
  );
}
