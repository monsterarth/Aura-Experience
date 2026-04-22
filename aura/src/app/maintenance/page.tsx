"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import { MaintenanceService } from "@/services/maintenance-service";
import { CabinService } from "@/services/cabin-service";
import { StructureService } from "@/services/structure-service";
import { MaintenanceCompletionModal } from "@/components/admin/maintenance/MaintenanceCompletionModal";
import { MaintenanceTask, Cabin, Structure } from "@/types/aura";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

// ─── Design tokens (same as /maid) ───────────────────────────────────────────

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
  ledGlow: "rgba(0,212,255,0.5)",
  amber: "#f59e0b",
  amberBg: "rgba(245,158,11,0.1)",
  amberBorder: "rgba(245,158,11,0.28)",
  blue: "#60a5fa",
  blueBg: "rgba(96,165,250,0.1)",
  blueBorder: "rgba(96,165,250,0.25)",
  red: "#f87171",
  redBg: "rgba(248,113,113,0.1)",
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

type IName = "home"|"wrench"|"user"|"check"|"arrow"|"x"|"info"|"logout"|"sun"|"clock"|"play"|"alert"|"photo"|"list"|"chevr"|"loader";

function I({ n, s = 20, c = "currentColor", w = 1.8 }: { n: IName; s?: number; c?: string; w?: number }) {
  const d: Record<IName, React.ReactNode> = {
    home: <><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/><path d="M9 21V12h6v9"/></>,
    wrench: <><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></>,
    user: <><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
    check: <polyline points="20 6 9 17 4 12"/>,
    arrow: <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>,
    x: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    info: <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>,
    logout: <><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>,
    sun: <><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/></>,
    clock: <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    play: <><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></>,
    alert: <><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>,
    photo: <><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></>,
    list: <><rect x="3" y="5" width="18" height="2" rx="1"/><rect x="3" y="11" width="18" height="2" rx="1"/><rect x="3" y="17" width="12" height="2" rx="1"/></>,
    chevr: <polyline points="9 18 15 12 9 6"/>,
    loader: <path d="M21 12a9 9 0 11-6.219-8.56"/>,
  };
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round">
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
  return null;
}

function todayLabel() {
  return new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
}

// ─── Task Detail Sheet ────────────────────────────────────────────────────────

function TaskSheet({
  task, cabins, structures, onClose, onStart, onFinish, propertyId,
}: {
  task: MaintenanceTask;
  cabins: Record<string, Cabin>;
  structures: Record<string, Structure>;
  onClose: () => void;
  onStart: (id: string) => void;
  onFinish: (task: MaintenanceTask) => void;
  propertyId: string;
}) {
  const [checklist, setChecklist] = useState(task.checklist || []);
  const [savingItem, setSavingItem] = useState<string | null>(null);

  const done = checklist.filter(c => c.checked).length;
  const pct = Math.round(done / Math.max(checklist.length, 1) * 100);
  const C = 2 * Math.PI * 22;
  const loc = locationName(task, cabins, structures);

  const toggleItem = async (id: string) => {
    const updated = checklist.map(c => c.id === id ? { ...c, checked: !c.checked } : c);
    setChecklist(updated);
    setSavingItem(id);
    try {
      await supabase.from("maintenance_tasks").update({ checklist: updated, updatedAt: new Date().toISOString() }).eq("id", task.id);
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

        {/* Progress + priority */}
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
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: T.muted, marginBottom: 10 }}>
              Checklist
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
              {checklist.map(item => (
                <div
                  key={item.id}
                  onClick={() => toggleItem(item.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 14, padding: 14, borderRadius: 14,
                    border: `1px solid ${item.checked ? T.greenBorder : T.border}`,
                    background: item.checked ? T.greenBg : T.glass,
                    cursor: "pointer", transition: "all .15s", userSelect: "none",
                    opacity: savingItem === item.id ? 0.6 : 1,
                  }}
                >
                  <div style={{
                    width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                    border: `2px solid ${item.checked ? T.green : "rgba(255,255,255,0.15)"}`,
                    background: item.checked ? T.green : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center", transition: "all .15s",
                  }}>
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
          <button
            onClick={() => { onStart(task.id); onClose(); }}
            style={{ width: "100%", padding: 16, background: T.grad, color: "#fff", fontFamily: "inherit", fontSize: 14, fontWeight: 800, letterSpacing: "0.03em", textTransform: "uppercase" as const, border: "none", borderRadius: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 4px 20px rgba(155,109,255,0.35)" }}
          >
            <I n="play" s={17} /> Iniciar Manutenção
          </button>
        )}
        {task.status === "in_progress" && (
          <button
            onClick={() => { onFinish(task); onClose(); }}
            style={{ width: "100%", padding: 16, background: T.greenG, color: "#021a17", fontFamily: "inherit", fontSize: 14, fontWeight: 800, letterSpacing: "0.03em", textTransform: "uppercase" as const, border: "none", borderRadius: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 4px 20px rgba(45,212,191,0.3)" }}
          >
            <I n="check" s={17} w={2.5} /> Finalizar Tarefa
          </button>
        )}
        {task.status === "waiting_conference" && (
          <div style={{ padding: "14px 16px", background: T.orangeBg, border: `1px solid ${T.orangeBorder}`, borderRadius: 16, textAlign: "center", color: T.orange, fontWeight: 700, fontSize: 13 }}>
            Aguardando validação do supervisor
          </div>
        )}
      </div>
    </Sheet>
  );
}

// ─── Home screen ──────────────────────────────────────────────────────────────

function HomeScreen({ tasks, userName, onNav }: {
  tasks: MaintenanceTask[];
  userName: string;
  onNav: (tab: Tab) => void;
}) {
  const urgent = tasks.filter(t => t.priority === "urgent" || t.priority === "high");
  const inProg = tasks.filter(t => t.status === "in_progress");
  const pending = tasks.filter(t => t.status === "pending");

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
          {tasks.length === 0 ? "Nenhuma tarefa pendente." : `${inProg.length} em andamento · ${pending.length} pendente(s)`}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 24 }}>
        {[
          { label: "Urgentes", val: urgent.length, color: T.red, bg: T.redBg, border: "rgba(248,113,113,0.25)" },
          { label: "Andamento", val: inProg.length, color: T.g1, bg: "rgba(155,109,255,0.1)", border: "rgba(155,109,255,0.25)" },
          { label: "Pendentes", val: pending.length, color: T.amber, bg: T.amberBg, border: T.amberBorder },
        ].map(s => (
          <GBorder key={s.label} style={{ flex: 1 }}>
            <div style={{ background: "rgba(10,12,22,0.9)", borderRadius: 20, padding: "16px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 30, fontWeight: 900, color: s.color, textShadow: `0 0 20px ${s.color}55` }}>{s.val}</div>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: T.muted, marginTop: 4 }}>{s.label}</div>
            </div>
          </GBorder>
        ))}
      </div>

      {/* Active task banner */}
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
            <button
              onClick={() => onNav("tasks")}
              style={{ marginTop: 12, padding: "10px 18px", background: T.greenBg, border: `1px solid ${T.greenBorder}`, borderRadius: 12, color: T.green, fontFamily: "inherit", fontWeight: 700, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
            >
              Ver detalhes <I n="arrow" s={14} c={T.green} />
            </button>
          </div>
        </GBorder>
      )}

      {/* Urgent alerts */}
      {urgent.length > 0 && (
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
}: {
  tasks: MaintenanceTask[];
  cabins: Record<string, Cabin>;
  structures: Record<string, Structure>;
  onStart: (id: string) => void;
  onFinish: (task: MaintenanceTask) => void;
  showToast: (m: string, c?: string) => void;
  propertyId: string;
  userId: string;
}) {
  const [detail, setDetail] = useState<string | null>(null);
  const fullTask = detail ? tasks.find(t => t.id === detail) ?? null : null;

  const inProg = tasks.filter(t => t.status === "in_progress");
  const pending = tasks.filter(t => t.status === "pending" || t.status === "paused");
  const waiting = tasks.filter(t => t.status === "waiting_conference");

  const TaskCard = ({ task }: { task: MaintenanceTask }) => {
    const loc = locationName(task, cabins, structures);
    const isPaused = task.status === "paused";
    return (
      <div
        onClick={() => setDetail(task.id)}
        style={{
          marginBottom: 12, borderRadius: 20, overflow: "hidden", cursor: "pointer",
          border: `1px solid ${isPaused ? T.amberBorder : T.border}`,
          background: isPaused ? T.amberBg : T.glass,
          transition: "border-color .15s",
        }}
      >
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
            </div>
            <I n="chevr" s={18} c={T.muted} />
          </div>

          {/* action row */}
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
            {task.status === "pending" && (
              <button
                onClick={e => { e.stopPropagation(); onStart(task.id); }}
                style={{ width: "100%", padding: "13px 16px", background: T.grad, color: "#fff", fontFamily: "inherit", fontSize: 13, fontWeight: 800, textTransform: "uppercase" as const, border: "none", borderRadius: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 4px 16px rgba(155,109,255,0.3)" }}
              >
                <I n="play" s={16} /> Iniciar
              </button>
            )}
            {(task.status === "in_progress" || task.status === "paused") && (
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={e => { e.stopPropagation(); onFinish(task); }}
                  style={{ flex: 1, padding: "13px 16px", background: T.greenG, color: "#021a17", fontFamily: "inherit", fontSize: 13, fontWeight: 800, textTransform: "uppercase" as const, border: "none", borderRadius: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                >
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
              <div style={{ padding: "12px 14px", background: T.orangeBg, border: `1px solid ${T.orangeBorder}`, borderRadius: 14, fontSize: 12, fontWeight: 700, color: T.orange, display: "flex", alignItems: "center", gap: 6 }}>
                <I n="alert" s={14} c={T.orange} /> Aguardando validação
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="mx-scroll" style={{ padding: "0 16px 20px" }}>
        <div style={{ padding: "10px 0 20px" }}>
          <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.3px" }}>Minhas Tarefas</div>
          <div style={{ fontSize: 13, color: T.muted, marginTop: 5 }}>{tasks.length} atribuída(s)</div>
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
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: T.orange, marginBottom: 10 }}>Aguardando validação</div>
            {waiting.map(t => <TaskCard key={t.id} task={t} />)}
          </div>
        )}

        {tasks.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: 48 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 12 }}>Tudo resolvido!</div>
            <div style={{ fontSize: 13, color: T.muted, marginTop: 6 }}>Nenhuma tarefa atribuída.</div>
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
        />
      )}
    </>
  );
}

// ─── Profile screen ───────────────────────────────────────────────────────────

function ProfileScreen({ userData, showToast, onLogout }: { userData: any; showToast: (m: string, c?: string) => void; onLogout: () => void }) {
  const name = userData?.fullName || "Técnico";
  const initials = name.split(" ").slice(0, 2).map((w: string) => w[0] ?? "").join("").toUpperCase();
  const role = userData?.role === "maintenance" ? "Gestor de Manutenção" : "Técnico";

  return (
    <div className="mx-scroll" style={{ padding: "0 16px 24px" }}>
      <div style={{ padding: "10px 0 20px" }}>
        <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.3px" }}>Meu Perfil</div>
      </div>

      <GBorder style={{ marginBottom: 16 }}>
        <div style={{ background: "rgba(10,12,22,0.95)", borderRadius: 20, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 66, height: 66, borderRadius: 22, flexShrink: 0, background: "linear-gradient(135deg,rgba(155,109,255,0.25),rgba(78,201,212,0.25))", border: "1px solid rgba(155,109,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 900 }}>
              <span style={{ background: T.grad, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>{initials}</span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 20, fontWeight: 900 }}>{name}</div>
              <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>{role}</div>
              <Pill color={T.green} bg={T.greenBg} border={T.greenBorder}>Ativo</Pill>
            </div>
          </div>
        </div>
      </GBorder>

      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: T.muted, marginBottom: 10 }}>Turno hoje</div>
      <div style={{ background: T.glass, border: `1px solid ${T.border}`, borderRadius: 20, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: T.amberBg, border: `1px solid ${T.amberBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <I n="sun" s={18} c={T.amber} />
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14 }}>Plantão</div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{todayLabel()}</div>
        </div>
      </div>

      <button onClick={onLogout} style={{ width: "100%", padding: 15, background: T.glass2, color: T.red, fontFamily: "inherit", fontSize: 14, fontWeight: 700, letterSpacing: "0.02em", textTransform: "uppercase" as const, border: `1px solid ${T.redBg}`, borderRadius: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <I n="logout" s={18} c={T.red} /> Sair do aplicativo
      </button>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

type Tab = "home" | "tasks" | "profile";

export default function MaintenancePage() {
  const { userData } = useAuth();
  const { currentProperty: property } = useProperty();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("home");
  const [tasks, setTasks] = useState<MaintenanceTask[]>([]);
  const [cabins, setCabins] = useState<Record<string, Cabin>>({});
  const [structures, setStructures] = useState<Record<string, Structure>>({});
  const [loading, setLoading] = useState(true);
  const [toast, setToastState] = useState<{ msg: string; color: string } | null>(null);
  const [completionTask, setCompletionTask] = useState<MaintenanceTask | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string, color = T.green) => {
    setToastState({ msg, color });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastState(null), 2600);
  }, []);

  useEffect(() => {
    if (!property) return;
    let unsub: (() => void) | undefined;

    const init = async () => {
      setLoading(true);
      try {
        const [cabinsData, structuresData] = await Promise.all([
          CabinService.getCabinsByProperty(property.id),
          StructureService.getStructures(property.id),
        ]);
        const cabinMap: Record<string, Cabin> = {};
        cabinsData.forEach(c => { cabinMap[c.id] = c; });
        setCabins(cabinMap);
        const structureMap: Record<string, Structure> = {};
        structuresData.forEach(s => { structureMap[s.id] = s; });
        setStructures(structureMap);

        unsub = MaintenanceService.listenToActiveTasks(property.id, allTasks => {
          const myId = userData?.id;
          const isManager = userData?.role === "maintenance";
          // Technicians see only their tasks; managers see all
          const visible = isManager
            ? allTasks.filter(t => t.status !== "completed" && t.status !== "cancelled")
            : allTasks.filter(t =>
                t.status !== "completed" && t.status !== "cancelled" &&
                (!t.assignedTo || t.assignedTo.length === 0 || (myId && t.assignedTo.includes(myId)))
              );
          setTasks(visible);
        });
      } finally {
        setLoading(false);
      }
    };

    init();
    return () => unsub?.();
  }, [property, userData?.id, userData?.role]);

  const handleStart = useCallback(async (taskId: string) => {
    if (!property || !userData) return;
    try {
      await MaintenanceService.startTask(property.id, taskId, userData.id, userData.fullName);
      showToast("Manutenção iniciada!");
    } catch { showToast("Erro ao iniciar tarefa.", T.red); }
  }, [property, userData, showToast]);

  const handleLogout = async () => {
    showToast("Saindo...");
    await supabase.auth.signOut();
    router.push("/admin/login");
  };

  const navItems: { id: Tab; label: string; icon: IName; badge: number }[] = [
    { id: "home", label: "Início", icon: "home", badge: 0 },
    { id: "tasks", label: "Tarefas", icon: "wrench", badge: tasks.filter(t => t.status === "pending" || t.status === "in_progress").length },
    { id: "profile", label: "Perfil", icon: "user", badge: 0 },
  ];

  if (loading) {
    return (
      <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: T.bg, color: T.text, flexDirection: "column", gap: 16, fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <div style={{ width: 40, height: 40, borderRadius: "50%", border: `3px solid rgba(155,109,255,0.3)`, borderTopColor: T.g1, animation: "spin 1s linear infinite" }} />
        <div style={{ fontSize: 13, opacity: 0.6 }}>Carregando...</div>
      </div>
    );
  }

  return (
    <>
      <style>{STYLE}</style>
      <div className="mx-shell" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100dvh", background: T.bg }}>
        <div style={{ width: "100%", maxWidth: 430, height: "100dvh", background: T.bg, color: T.text, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>

          <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0, background: "radial-gradient(ellipse 280px 220px at 10% 5%,rgba(155,109,255,0.12) 0%,transparent 70%),radial-gradient(ellipse 200px 160px at 90% 80%,rgba(78,201,212,0.09) 0%,transparent 70%)" }} />

          <div style={{ padding: "14px 20px 12px", borderBottom: `1px solid ${T.border}`, background: "rgba(6,8,15,0.9)", backdropFilter: "blur(20px)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, position: "relative", zIndex: 10 }}>
            <span style={{ fontSize: 16, fontWeight: 900, letterSpacing: ".1em", textTransform: "uppercase" }}>
              <span style={{ background: T.grad, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>aaura</span>
              <span style={{ fontSize: 11, color: T.muted, fontWeight: 600, marginLeft: 8, textTransform: "none", letterSpacing: 0 }}>Manutenção</span>
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: T.led, boxShadow: `0 0 10px ${T.ledGlow}` }} />
              <span style={{ fontSize: 11, color: T.muted, fontWeight: 600 }}>Tempo real</span>
            </div>
          </div>

          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", position: "relative", zIndex: 1 }}>
            {tab === "home" && <HomeScreen tasks={tasks} userName={userData?.fullName ?? "Técnico"} onNav={setTab} />}
            {tab === "tasks" && (
              <TasksScreen
                tasks={tasks} cabins={cabins} structures={structures}
                onStart={handleStart} onFinish={setCompletionTask}
                showToast={showToast} propertyId={property?.id ?? ""} userId={userData?.id ?? ""}
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
        </div>
      </div>

      {/* MaintenanceCompletionModal rendered outside the constrained div so it can cover full screen */}
      {completionTask && property && (
        <MaintenanceCompletionModal
          isOpen={!!completionTask}
          onClose={() => setCompletionTask(null)}
          propertyId={property.id}
          task={completionTask}
          cabins={cabins}
          structures={structures}
        />
      )}
    </>
  );
}
