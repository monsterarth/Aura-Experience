"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import { HousekeepingService } from "@/services/housekeeping-service";
import { CabinService } from "@/services/cabin-service";
import { StaffService } from "@/services/staff-service";
import { StructureService } from "@/services/structure-service";
import { HousekeepingTask, Cabin, Staff, Structure } from "@/types/aura";
import { supabase } from "@/lib/supabase";
import { createClientBrowser } from "@/lib/supabase-browser";
import { useRouter } from "next/navigation";

// ─── CSS ──────────────────────────────────────────────────────────────────────

const STYLE = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800;9..40,900&display=swap');
.gov-shell *{box-sizing:border-box;}
.gov-shell{font-family:'DM Sans',-apple-system,BlinkMacSystemFont,sans-serif;}
.gov-scroll{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;}
.gov-scroll::-webkit-scrollbar{display:none;}
.gov-sheet-body{overflow-y:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;flex:1;}
.gov-sheet-body::-webkit-scrollbar{display:none;}
@keyframes gov-pulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.4;transform:scale(.8);}}
@keyframes gov-fadein{from{opacity:0}to{opacity:1}}
@keyframes gov-slideup{from{transform:translateY(100%)}to{transform:translateY(0)}}
@keyframes gov-toast{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes gov-spin{to{transform:rotate(360deg)}}
`;

// ─── Tokens ───────────────────────────────────────────────────────────────────

const T = {
  bg: "#080b14",
  card: "#0d1120",
  card2: "rgba(255,255,255,0.04)",
  glass: "rgba(255,255,255,0.035)",
  glass2: "rgba(255,255,255,0.055)",
  border: "rgba(255,255,255,0.08)",
  border2: "rgba(255,255,255,0.13)",
  text: "#eef0f8",
  muted: "rgba(238,240,248,0.42)",
  muted2: "rgba(238,240,248,0.22)",
  // violet accent for governanta
  v1: "#a78bfa",
  v2: "#7c3aed",
  vGrad: "linear-gradient(135deg,#a78bfa 0%,#7c3aed 100%)",
  vSoft: "linear-gradient(135deg,rgba(167,139,250,0.15) 0%,rgba(124,58,237,0.15) 100%)",
  vBorder: "rgba(167,139,250,0.35)",
  green: "#2dd4bf",
  greenG: "linear-gradient(135deg,#059669,#2dd4bf)",
  greenBg: "rgba(45,212,191,0.1)",
  greenBorder: "rgba(45,212,191,0.25)",
  amber: "#f59e0b",
  amberBg: "rgba(245,158,11,0.1)",
  amberBorder: "rgba(245,158,11,0.28)",
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

// ─── Tiny icon set ────────────────────────────────────────────────────────────

type IName =
  | "home" | "list" | "check" | "x" | "chevr" | "chevl" | "plus" | "user"
  | "sparkles" | "clock" | "alert" | "send" | "loader" | "assign" | "eye"
  | "undo" | "checkall" | "logout" | "arrow" | "settings" | "refresh";

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
    sparkles: <><path d="M12 3l1.5 3.5L17 8l-3.5 1.5L12 13l-1.5-3.5L7 8l3.5-1.5L12 3z" /><path d="M5 17l.8 1.8L7.5 19.5l-1.7.7L5 22l-.8-1.7L2.5 19.5l1.7-.7L5 17z" /></>,
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
  };
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round">
      {d[n]}
    </svg>
  );
}

// ─── Pulse dot ────────────────────────────────────────────────────────────────

function Pulse({ size = 8, color = T.green }: { size?: number; color?: string }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: color, boxShadow: `0 0 8px ${color}`,
      animation: "gov-pulse 1.5s infinite", flexShrink: 0,
    }} />
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function GovToast({ msg, color }: { msg: string; color: string }) {
  return (
    <div style={{
      position: "absolute", bottom: 88, left: 16, right: 16,
      background: "#111827", color: T.text, border: `1px solid ${T.border2}`,
      borderRadius: 16, padding: "14px 16px", fontSize: 13, fontWeight: 600,
      display: "flex", alignItems: "center", gap: 10, zIndex: 300,
      animation: "gov-toast .3s cubic-bezier(.32,.72,0,1)",
      boxShadow: "0 8px 32px rgba(0,0,0,.5)",
    }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, boxShadow: `0 0 8px ${color}`, flexShrink: 0 }} />
      <span>{msg}</span>
    </div>
  );
}

// ─── Bottom Sheet ─────────────────────────────────────────────────────────────

function Sheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "absolute", inset: 0, zIndex: 50,
        background: "rgba(0,0,0,0.78)",
        display: "flex", flexDirection: "column", justifyContent: "flex-end",
        animation: "gov-fadein .2s ease", backdropFilter: "blur(4px)",
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: "#0c1122", border: `1px solid ${T.border2}`,
        borderRadius: "28px 28px 0 0", borderBottom: "none",
        maxHeight: "92dvh", display: "flex", flexDirection: "column",
        animation: "gov-slideup .28s cubic-bezier(.32,.72,0,1)",
      }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: T.border2, margin: "12px auto 4px", flexShrink: 0 }} />
        {children}
      </div>
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: HousekeepingTask["status"] }) {
  const map: Record<string, { label: string; color: string; bg: string; border: string }> = {
    pending:            { label: "Pendente",    color: T.amber,  bg: T.amberBg,  border: T.amberBorder },
    in_progress:        { label: "Em serviço",  color: T.blue,   bg: T.blueBg,   border: T.blueBorder },
    waiting_conference: { label: "Conferência", color: T.v1,     bg: "rgba(167,139,250,0.12)", border: T.vBorder },
    completed:          { label: "Concluído",   color: T.green,  bg: T.greenBg,  border: T.greenBorder },
    paused:             { label: "Pausado",     color: T.muted,  bg: T.glass2,   border: T.border },
    skipped:            { label: "Pulado",      color: T.muted,  bg: T.glass2,   border: T.border },
    cancelled:          { label: "Cancelado",   color: T.red,    bg: T.redBg,    border: T.redBorder },
  };
  const s = map[status] ?? map.pending;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      fontSize: 10, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase",
      padding: "3px 8px", borderRadius: 999, lineHeight: 1.5,
      color: s.color, background: s.bg, border: `1px solid ${s.border}`,
    }}>{s.label}</span>
  );
}

// ─── Type badge ───────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: HousekeepingTask["type"] }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    turnover: { label: "Turnover", color: T.v1, bg: "rgba(167,139,250,0.12)" },
    daily:    { label: "Diária",   color: T.blue, bg: T.blueBg },
    custom:   { label: "Custom",   color: T.amber, bg: T.amberBg },
  };
  const s = map[type] ?? map.custom;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase",
      padding: "2px 7px", borderRadius: 6, color: s.color, background: s.bg,
    }}>{s.label}</span>
  );
}

// ─── Confirm Sheet ────────────────────────────────────────────────────────────

function ConferSheet({
  task, locationName, onClose, onApprove, onReject, busy,
}: {
  task: HousekeepingTask;
  locationName: string;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
  busy: boolean;
}) {
  const [obs, setObs] = useState("");

  return (
    <Sheet onClose={onClose}>
      <div style={{ padding: "20px 20px 8px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: T.text }}>Conferência de Qualidade</span>
          <button onClick={onClose} style={{ background: T.glass2, border: `1px solid ${T.border}`, borderRadius: 10, padding: 8, cursor: "pointer", color: T.muted }}>
            <I n="x" s={16} />
          </button>
        </div>
        <p style={{ fontSize: 13, color: T.muted, marginTop: 6 }}>
          Revise a acomodação e aprove ou devolva para repasse.
        </p>
      </div>

      <div className="gov-sheet-body" style={{ padding: "12px 20px 0" }}>
        {/* Location */}
        <div style={{ background: T.card2, border: `1px solid ${T.border}`, borderRadius: 16, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Acomodação</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: T.text }}>{locationName}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <TypeBadge type={task.type} />
            {task.finishedAt && (
              <span style={{ fontSize: 11, color: T.muted }}>
                Concluído há {elapsed(task.finishedAt)}
              </span>
            )}
          </div>
        </div>

        {/* Checklist summary */}
        {task.checklist?.length > 0 && (
          <div style={{ background: T.card2, border: `1px solid ${T.border}`, borderRadius: 16, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
              Checklist ({task.checklist.filter((i: any) => i.checked).length}/{task.checklist.length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {task.checklist.slice(0, 8).map((item: any) => (
                <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: item.checked ? T.green : T.muted }}>
                  <div style={{ width: 16, height: 16, borderRadius: 5, border: `1.5px solid ${item.checked ? T.green : T.border2}`, background: item.checked ? T.greenBg : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {item.checked && <I n="check" s={10} c={T.green} />}
                  </div>
                  <span style={{ flex: 1, textDecoration: item.checked ? "none" : "line-through", opacity: item.checked ? 1 : 0.5 }}>{item.label}</span>
                </div>
              ))}
              {task.checklist.length > 8 && (
                <span style={{ fontSize: 11, color: T.muted }}>+{task.checklist.length - 8} itens</span>
              )}
            </div>
          </div>
        )}

        {/* Observations from maid */}
        {task.observations && (
          <div style={{ background: T.amberBg, border: `1px solid ${T.amberBorder}`, borderRadius: 14, padding: 14, marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.amber, textTransform: "uppercase", marginBottom: 4 }}>Obs. da Camareira</div>
            <div style={{ fontSize: 13, color: T.text }}>{task.observations}</div>
          </div>
        )}

        {/* Gov obs */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
            Observação (opcional)
          </div>
          <textarea
            value={obs}
            onChange={e => setObs(e.target.value)}
            placeholder="Ex: perfeita, faltou uma toalha..."
            rows={2}
            style={{
              width: "100%", background: T.card2, border: `1px solid ${T.border}`,
              borderRadius: 12, padding: "10px 14px", color: T.text, fontSize: 13,
              fontFamily: "inherit", resize: "none", outline: "none",
            }}
          />
        </div>

        <div style={{ height: 8 }} />
      </div>

      {/* Actions */}
      <div style={{ padding: "12px 20px 24px", display: "flex", gap: 10, borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
        <button
          disabled={busy}
          onClick={onReject}
          style={{
            flex: 1, padding: "15px 0", background: T.redBg, color: T.red,
            border: `1px solid ${T.redBorder}`, borderRadius: 16, cursor: busy ? "not-allowed" : "pointer",
            fontFamily: "inherit", fontSize: 13, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: busy ? 0.5 : 1,
          }}
        >
          <I n="undo" s={15} c={T.red} /> Reprovar
        </button>
        <button
          disabled={busy}
          onClick={onApprove}
          style={{
            flex: 1.5, padding: "15px 0", background: T.greenG, color: "#021a17",
            border: "none", borderRadius: 16, cursor: busy ? "not-allowed" : "pointer",
            fontFamily: "inherit", fontSize: 13, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: busy ? 0.5 : 1,
            boxShadow: "0 4px 20px rgba(45,212,191,0.28)",
          }}
        >
          {busy ? <I n="loader" s={16} c="#021a17" /> : <I n="check" s={16} c="#021a17" />}
          Liberar Cabana
        </button>
      </div>
    </Sheet>
  );
}

// ─── Assign Sheet ─────────────────────────────────────────────────────────────

function AssignSheet({
  task, locationName, maids, onClose, onAssign, busy,
}: {
  task: HousekeepingTask;
  locationName: string;
  maids: Staff[];
  onClose: () => void;
  onAssign: (maidIds: string[]) => Promise<void>;
  busy: boolean;
}) {
  const current = Array.isArray(task.assignedTo) ? task.assignedTo : [];
  const [selected, setSelected] = useState<Set<string>>(new Set(current));

  const toggle = (id: string) => setSelected(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  return (
    <Sheet onClose={onClose}>
      <div style={{ padding: "20px 20px 8px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: T.text }}>Atribuir Camareira</span>
          <button onClick={onClose} style={{ background: T.glass2, border: `1px solid ${T.border}`, borderRadius: 10, padding: 8, cursor: "pointer", color: T.muted }}>
            <I n="x" s={16} />
          </button>
        </div>
        <p style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>{locationName}</p>
      </div>

      <div className="gov-sheet-body" style={{ padding: "12px 20px 0" }}>
        {maids.length === 0 ? (
          <p style={{ color: T.muted, fontSize: 13, textAlign: "center", padding: 24 }}>Nenhuma camareira ativa cadastrada.</p>
        ) : (
          maids.map(maid => {
            const on = selected.has(maid.id);
            return (
              <button
                key={maid.id}
                onClick={() => toggle(maid.id)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 12,
                  padding: "14px 16px", borderRadius: 14, marginBottom: 8,
                  background: on ? "rgba(167,139,250,0.12)" : T.card2,
                  border: `1px solid ${on ? T.vBorder : T.border}`,
                  cursor: "pointer", textAlign: "left",
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: "50%",
                  background: on ? T.vGrad : T.glass2,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, fontWeight: 800, color: on ? "#fff" : T.muted, flexShrink: 0,
                }}>
                  {maid.fullName.charAt(0)}
                </div>
                <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: T.text }}>{maid.fullName}</span>
                <div style={{
                  width: 22, height: 22, borderRadius: 7,
                  border: `2px solid ${on ? T.v1 : T.border2}`,
                  background: on ? "rgba(167,139,250,0.2)" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {on && <I n="check" s={12} c={T.v1} />}
                </div>
              </button>
            );
          })
        )}
        <div style={{ height: 8 }} />
      </div>

      <div style={{ padding: "12px 20px 24px", borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
        <button
          disabled={busy || selected.size === 0}
          onClick={() => onAssign(Array.from(selected))}
          style={{
            width: "100%", padding: 16, background: T.vGrad, color: "#fff",
            border: "none", borderRadius: 16, cursor: (busy || selected.size === 0) ? "not-allowed" : "pointer",
            fontFamily: "inherit", fontSize: 14, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            opacity: (busy || selected.size === 0) ? 0.4 : 1,
            boxShadow: "0 4px 20px rgba(124,58,237,0.35)",
          }}
        >
          {busy ? <I n="loader" s={16} /> : <I n="send" s={16} />}
          Confirmar {selected.size > 0 ? `(${selected.size})` : ""}
        </button>
      </div>
    </Sheet>
  );
}

// ─── New Task Sheet ────────────────────────────────────────────────────────────

function NewTaskSheet({
  cabins, structures, maids, propertyId, actorId, actorName, onClose, onCreated, showToast,
}: {
  cabins: Cabin[];
  structures: Structure[];
  maids: Staff[];
  propertyId: string;
  actorId: string;
  actorName: string;
  onClose: () => void;
  onCreated: () => void;
  showToast: (msg: string, color?: string) => void;
}) {
  const [locType, setLocType] = useState<"cabin" | "structure" | "custom">("cabin");
  const [cabinId, setCabinId] = useState("");
  const [structureId, setStructureId] = useState("");
  const [customLocation, setCustomLocation] = useState("");
  const [taskType, setTaskType] = useState<"daily" | "turnover" | "custom">("daily");
  const [assignedIds, setAssignedIds] = useState<string[]>([]);
  const [obs, setObs] = useState("");
  const [busy, setBusy] = useState(false);

  const toggleMaid = (id: string) => {
    setAssignedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const canSubmit = (locType === "cabin" && cabinId) ||
    (locType === "structure" && structureId) ||
    (locType === "custom" && customLocation.trim().length > 0);

  const submit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    try {
      await HousekeepingService.createTask(propertyId, {
        type: taskType,
        status: "pending",
        cabinId: locType === "cabin" ? cabinId : undefined,
        structureId: locType === "structure" ? structureId : undefined,
        customLocation: locType === "custom" ? customLocation.trim() : undefined,
        assignedTo: assignedIds,
        observations: obs || undefined,
        checklist: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, actorId, actorName);
      showToast("Tarefa criada!", T.green);
      onCreated();
      onClose();
    } catch {
      showToast("Erro ao criar tarefa.", T.red);
    } finally {
      setBusy(false);
    }
  };

  const selectStyle = {
    width: "100%", background: T.card2, border: `1px solid ${T.border}`,
    borderRadius: 12, padding: "11px 14px", color: T.text, fontSize: 13,
    fontFamily: "inherit", outline: "none", appearance: "none" as const,
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

      <div className="gov-sheet-body" style={{ padding: "12px 20px 0" }}>
        {/* Type */}
        <Label>Tipo</Label>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {(["daily", "turnover", "custom"] as const).map(t => {
            const labels = { daily: "Diária", turnover: "Turnover", custom: "Custom" };
            const on = taskType === t;
            return (
              <button key={t} onClick={() => setTaskType(t)} style={{
                flex: 1, padding: "10px 0", borderRadius: 12, cursor: "pointer",
                fontFamily: "inherit", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em",
                background: on ? T.vSoft : T.card2,
                border: `1px solid ${on ? T.vBorder : T.border}`,
                color: on ? T.v1 : T.muted,
              }}>
                {labels[t]}
              </button>
            );
          })}
        </div>

        {/* Location type */}
        <Label>Local</Label>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {(["cabin", "structure", "custom"] as const).map(lt => {
            const labels = { cabin: "Cabana", structure: "Estrutura", custom: "Outro" };
            const on = locType === lt;
            return (
              <button key={lt} onClick={() => setLocType(lt)} style={{
                flex: 1, padding: "10px 0", borderRadius: 12, cursor: "pointer",
                fontFamily: "inherit", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em",
                background: on ? T.vSoft : T.card2,
                border: `1px solid ${on ? T.vBorder : T.border}`,
                color: on ? T.v1 : T.muted,
              }}>
                {labels[lt]}
              </button>
            );
          })}
        </div>

        {locType === "cabin" && (
          <select value={cabinId} onChange={e => setCabinId(e.target.value)} style={{ ...selectStyle, marginBottom: 16 }}>
            <option value="">Selecione a cabana</option>
            {cabins.map(c => <option key={c.id} value={c.id}>{c.name || `Cabana ${c.number}`}</option>)}
          </select>
        )}
        {locType === "structure" && (
          <select value={structureId} onChange={e => setStructureId(e.target.value)} style={{ ...selectStyle, marginBottom: 16 }}>
            <option value="">Selecione a estrutura</option>
            {structures.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        {locType === "custom" && (
          <input
            value={customLocation}
            onChange={e => setCustomLocation(e.target.value)}
            placeholder="Descreva o local..."
            style={{ ...selectStyle, marginBottom: 16 }}
          />
        )}

        {/* Assign maids */}
        {maids.length > 0 && (
          <>
            <Label>Atribuir (opcional)</Label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
              {maids.map(m => {
                const on = assignedIds.includes(m.id);
                return (
                  <button key={m.id} onClick={() => toggleMaid(m.id)} style={{
                    padding: "7px 12px", borderRadius: 10, cursor: "pointer",
                    fontFamily: "inherit", fontSize: 12, fontWeight: 700,
                    background: on ? "rgba(167,139,250,0.15)" : T.card2,
                    border: `1px solid ${on ? T.vBorder : T.border}`,
                    color: on ? T.v1 : T.muted,
                  }}>
                    {m.fullName.split(" ")[0]}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Observations */}
        <Label>Observação (opcional)</Label>
        <textarea
          value={obs}
          onChange={e => setObs(e.target.value)}
          placeholder="Instruções especiais..."
          rows={2}
          style={{
            width: "100%", background: T.card2, border: `1px solid ${T.border}`,
            borderRadius: 12, padding: "10px 14px", color: T.text, fontSize: 13,
            fontFamily: "inherit", resize: "none", outline: "none", marginBottom: 8,
          }}
        />
        <div style={{ height: 8 }} />
      </div>

      <div style={{ padding: "12px 20px 24px", borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
        <button
          disabled={!canSubmit || busy}
          onClick={submit}
          style={{
            width: "100%", padding: 16, background: T.vGrad, color: "#fff",
            border: "none", borderRadius: 16, cursor: (!canSubmit || busy) ? "not-allowed" : "pointer",
            fontFamily: "inherit", fontSize: 14, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            opacity: (!canSubmit || busy) ? 0.4 : 1,
            boxShadow: "0 4px 20px rgba(124,58,237,0.35)",
          }}
        >
          {busy ? <I n="loader" s={16} /> : <I n="plus" s={16} />}
          Criar Tarefa
        </button>
      </div>
    </Sheet>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
      {children}
    </div>
  );
}

// ─── Task Card ────────────────────────────────────────────────────────────────

function TaskCard({
  task, locationName, maids, onConfer, onAssign, onCancel,
}: {
  task: HousekeepingTask;
  locationName: string;
  maids: Staff[];
  onConfer?: () => void;
  onAssign?: () => void;
  onCancel?: () => void;
}) {
  const assignedArray = Array.isArray(task.assignedTo) ? task.assignedTo : [];
  const assignedNames = assignedArray.length > 0
    ? assignedArray.map(id => maids.find(m => m.id === id)?.fullName.split(" ")[0]).filter(Boolean).join(", ")
    : null;

  const isConference = task.status === "waiting_conference";

  return (
    <div style={{
      background: isConference ? "rgba(167,139,250,0.07)" : T.card2,
      border: `1px solid ${isConference ? T.vBorder : T.border}`,
      borderRadius: 18, padding: 16, marginBottom: 10,
      boxShadow: isConference ? "0 0 20px rgba(167,139,250,0.1)" : "none",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900, color: T.text, lineHeight: 1.1 }}>{locationName}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
            <TypeBadge type={task.type} />
            <StatusBadge status={task.status} />
          </div>
        </div>
        {isConference && (
          <div style={{ background: "rgba(167,139,250,0.15)", borderRadius: 10, padding: "6px 8px", flexShrink: 0 }}>
            <Pulse size={8} color={T.v1} />
          </div>
        )}
      </div>

      {/* Meta */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
        {assignedNames && (
          <span style={{ fontSize: 12, color: T.muted, display: "flex", alignItems: "center", gap: 4 }}>
            <I n="user" s={12} c={T.muted} /> {assignedNames}
          </span>
        )}
        {task.startedAt && (
          <span style={{ fontSize: 12, color: T.muted, display: "flex", alignItems: "center", gap: 4 }}>
            <I n="clock" s={12} c={T.muted} /> {elapsed(task.startedAt)}
          </span>
        )}
        {task.finishedAt && task.status === "waiting_conference" && (
          <span style={{ fontSize: 12, color: T.amber, display: "flex", alignItems: "center", gap: 4 }}>
            <I n="alert" s={12} c={T.amber} /> Aguardando há {elapsed(task.finishedAt)}
          </span>
        )}
      </div>

      {/* Observations */}
      {task.observations && task.status === "waiting_conference" && (
        <div style={{ background: T.amberBg, border: `1px solid ${T.amberBorder}`, borderRadius: 10, padding: "8px 12px", marginBottom: 12, fontSize: 12, color: T.text }}>
          {task.observations}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 8 }}>
        {isConference && onConfer && (
          <button
            onClick={onConfer}
            style={{
              flex: 1, padding: "11px 0", background: T.vGrad, color: "#fff",
              border: "none", borderRadius: 12, cursor: "pointer",
              fontFamily: "inherit", fontSize: 12, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              boxShadow: "0 3px 14px rgba(124,58,237,0.35)",
            }}
          >
            <I n="eye" s={13} /> Conferir
          </button>
        )}
        {!isConference && onAssign && (
          <button
            onClick={onAssign}
            style={{
              flex: 1, padding: "11px 0", background: T.card2, color: T.muted,
              border: `1px solid ${T.border}`, borderRadius: 12, cursor: "pointer",
              fontFamily: "inherit", fontSize: 12, fontWeight: 700, textTransform: "uppercase",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}
          >
            <I n="assign" s={13} /> Atribuir
          </button>
        )}
        {onCancel && (
          <button
            onClick={onCancel}
            style={{
              padding: "11px 12px", background: T.redBg, color: T.red,
              border: `1px solid ${T.redBorder}`, borderRadius: 12, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <I n="x" s={14} c={T.red} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type Screen = "dashboard" | "conference" | "all";

export default function GovernantaPage() {
  const { userData } = useAuth();
  const { currentProperty: property, loading: propLoading } = useProperty();
  const router = useRouter();

  const [tasks, setTasks] = useState<HousekeepingTask[]>([]);
  const [cabins, setCabins] = useState<Record<string, Cabin>>({});
  const [structures, setStructures] = useState<Record<string, Structure>>({});
  const [maids, setMaids] = useState<Staff[]>([]);
  const [allCabins, setAllCabins] = useState<Cabin[]>([]);
  const [allStructures, setAllStructures] = useState<Structure[]>([]);
  const [loading, setLoading] = useState(true);

  const [screen, setScreen] = useState<Screen>("dashboard");

  // Sheets
  const [conferTask, setConferTask] = useState<HousekeepingTask | null>(null);
  const [assignTask, setAssignTask] = useState<HousekeepingTask | null>(null);
  const [showNewTask, setShowNewTask] = useState(false);

  // Busy states
  const [conferBusy, setConferBusy] = useState(false);
  const [assignBusy, setAssignBusy] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ msg: string; color: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string, color = T.green) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, color });
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, []);

  // Load data
  useEffect(() => {
    if (!property) return;
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

        setMaids(staffData.filter(s => s.role === "maid" && s.active));

        unsub = HousekeepingService.listenToActiveTasks(property.id, setTasks);
      } catch {
        showToast("Erro ao carregar dados.", T.red);
      } finally {
        setLoading(false);
      }
    };

    init();
    return () => { if (unsub) unsub(); };
  }, [property, showToast]);

  function getLocationName(task: HousekeepingTask): string {
    if (task.cabinId && cabins[task.cabinId]) {
      const c = cabins[task.cabinId];
      return c.name || `Cabana ${c.number}`;
    }
    if (task.structureId && structures[task.structureId]) return structures[task.structureId].name;
    return task.customLocation || "Local desconhecido";
  }

  // ── Actions ──────────────────────────────────────────────────────────────────

  const handleApprove = async (task: HousekeepingTask, obs: string) => {
    if (!property) return;
    setConferBusy(true);
    try {
      await HousekeepingService.confirmTaskQuality(
        property.id, task.id, obs || "Aprovado", userData?.id || "", userData?.fullName || "Governanta"
      );
      showToast("Cabana liberada!", T.green);
      setConferTask(null);
    } catch {
      showToast("Erro ao liberar.", T.red);
    } finally {
      setConferBusy(false);
    }
  };

  const handleReject = async (task: HousekeepingTask) => {
    if (!property) return;
    setConferBusy(true);
    try {
      await HousekeepingService.rollbackTaskStatus(
        property.id, task.id, "Reprovado na conferência", userData?.id || "", userData?.fullName || "Governanta"
      );
      showToast("Enviado para repasse.", T.amber);
      setConferTask(null);
    } catch {
      showToast("Erro ao reprovar.", T.red);
    } finally {
      setConferBusy(false);
    }
  };

  const handleAssign = async (task: HousekeepingTask, maidIds: string[]) => {
    if (!property) return;
    setAssignBusy(true);
    try {
      await HousekeepingService.assignTask(property.id, task.id, maidIds, userData?.id || "", userData?.fullName || "Governanta");
      showToast("Atribuído com sucesso!", T.green);
      setAssignTask(null);
    } catch {
      showToast("Erro ao atribuir.", T.red);
    } finally {
      setAssignBusy(false);
    }
  };

  const handleCancel = async (task: HousekeepingTask) => {
    if (!property) return;
    if (!confirm("Cancelar esta tarefa?")) return;
    try {
      await HousekeepingService.updateTask(property.id, task.id, { status: "cancelled" }, userData?.id || "", userData?.fullName || "Governanta");
      showToast("Tarefa cancelada.", T.muted);
    } catch {
      showToast("Erro ao cancelar.", T.red);
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────────

  const conferenceTasks = tasks.filter(t => t.status === "waiting_conference");
  const pendingTasks    = tasks.filter(t => t.status === "pending" || t.status === "paused");
  const inProgressTasks = tasks.filter(t => t.status === "in_progress");
  const completedToday  = tasks.filter(t => {
    if (t.status !== "completed") return false;
    const d = t.finishedAt || t.updatedAt;
    if (!d) return false;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return new Date(d) >= today;
  });

  // ── Guards ────────────────────────────────────────────────────────────────────

  if (propLoading || loading) {
    return (
      <div style={{ height: "100dvh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", border: `3px solid ${T.v1}`, borderTopColor: "transparent", animation: "gov-spin 0.8s linear infinite" }} />
      </div>
    );
  }

  if (!property) {
    return (
      <div style={{ height: "100dvh", background: T.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 32 }}>
        <I n="alert" s={32} c={T.amber} />
        <p style={{ color: T.muted, fontSize: 14, textAlign: "center" }}>
          Nenhuma propriedade selecionada. Acesse o painel admin para configurar.
        </p>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const allActiveTasks = tasks.filter(t => t.status !== "completed" && t.status !== "cancelled");

  return (
    <>
      <style>{STYLE}</style>
      <div className="gov-shell" style={{
        height: "100dvh", background: T.bg, color: T.text,
        display: "flex", flexDirection: "column", position: "relative", overflow: "hidden",
        maxWidth: 480, margin: "0 auto",
      }}>

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div style={{
          padding: "52px 20px 16px",
          background: `linear-gradient(180deg,${T.card} 0%,${T.bg} 100%)`,
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 13, color: T.muted, fontWeight: 500 }}>{greeting()},</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: T.text, lineHeight: 1.1 }}>
                {userData?.fullName?.split(" ")[0] || "Governanta"}
              </div>
              <div style={{ fontSize: 11, color: T.muted, marginTop: 2, textTransform: "capitalize" }}>{todayLabel()}</div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setShowNewTask(true)}
                style={{
                  width: 40, height: 40, borderRadius: 12,
                  background: T.vGrad, border: "none",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: "0 3px 14px rgba(124,58,237,0.4)",
                }}
              >
                <I n="plus" s={18} c="#fff" />
              </button>
              <button
                onClick={async () => { await createClientBrowser().auth.signOut(); router.push("/admin/login"); }}
                style={{
                  width: 40, height: 40, borderRadius: 12,
                  background: T.glass2, border: `1px solid ${T.border}`,
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <I n="logout" s={17} c={T.muted} />
              </button>
            </div>
          </div>

          {/* Stats strip */}
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            {[
              { label: "Conferência", value: conferenceTasks.length, color: T.v1, bg: "rgba(167,139,250,0.12)", pulse: conferenceTasks.length > 0 },
              { label: "Em Serviço",  value: inProgressTasks.length, color: T.blue,  bg: T.blueBg, pulse: false },
              { label: "Pendentes",   value: pendingTasks.length,    color: T.amber, bg: T.amberBg, pulse: false },
              { label: "Concluídas",  value: completedToday.length,  color: T.green, bg: T.greenBg, pulse: false },
            ].map(s => (
              <div key={s.label} style={{
                flex: 1, background: s.bg, border: `1px solid ${s.color}33`,
                borderRadius: 14, padding: "10px 8px", textAlign: "center",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginBottom: 2 }}>
                  {s.pulse && <Pulse size={6} color={s.color} />}
                  <span style={{ fontSize: 22, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</span>
                </div>
                <div style={{ fontSize: 9, fontWeight: 700, color: s.color, textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.8 }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Content ─────────────────────────────────────────────────────────── */}
        <div className="gov-scroll" style={{ flex: 1, padding: "0 16px" }}>

          {/* Conference priority banner */}
          {screen === "dashboard" && conferenceTasks.length > 0 && (
            <button
              onClick={() => setScreen("conference")}
              style={{
                width: "100%", marginTop: 16, padding: "16px 18px",
                background: "linear-gradient(135deg,rgba(167,139,250,0.18),rgba(124,58,237,0.12))",
                border: `1.5px solid ${T.vBorder}`,
                borderRadius: 18, cursor: "pointer", textAlign: "left",
                display: "flex", alignItems: "center", gap: 12,
                boxShadow: "0 4px 24px rgba(124,58,237,0.2)",
              }}
            >
              <div style={{ background: T.vGrad, borderRadius: 12, padding: 10, flexShrink: 0 }}>
                <I n="sparkles" s={20} c="#fff" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>
                  {conferenceTasks.length} cabana{conferenceTasks.length > 1 ? "s" : ""} aguardando conferência
                </div>
                <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>Toque para revisar e liberar</div>
              </div>
              <I n="chevr" s={18} c={T.v1} />
            </button>
          )}

          {/* Dashboard view */}
          {screen === "dashboard" && (
            <>
              {/* In progress section */}
              {inProgressTasks.length > 0 && (
                <Section title="Em Serviço Agora" color={T.blue} count={inProgressTasks.length}>
                  {inProgressTasks.map(t => (
                    <TaskCard key={t.id} task={t} locationName={getLocationName(t)} maids={maids}
                      onAssign={() => setAssignTask(t)}
                      onCancel={() => handleCancel(t)}
                    />
                  ))}
                </Section>
              )}

              {/* Pending section */}
              {pendingTasks.length > 0 && (
                <Section title="Pendentes" color={T.amber} count={pendingTasks.length}>
                  {pendingTasks.map(t => (
                    <TaskCard key={t.id} task={t} locationName={getLocationName(t)} maids={maids}
                      onAssign={() => setAssignTask(t)}
                      onCancel={() => handleCancel(t)}
                    />
                  ))}
                </Section>
              )}

              {allActiveTasks.length === 0 && conferenceTasks.length === 0 && (
                <div style={{ textAlign: "center", padding: "48px 24px" }}>
                  <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.3 }}>✨</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: T.muted }}>Tudo em dia!</div>
                  <div style={{ fontSize: 13, color: T.muted2, marginTop: 4 }}>Nenhuma tarefa ativa no momento.</div>
                </div>
              )}

              <div style={{ height: 100 }} />
            </>
          )}

          {/* Conference view */}
          {screen === "conference" && (
            <>
              <div style={{ paddingTop: 16 }}>
                {conferenceTasks.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "48px 24px" }}>
                    <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.3 }}>✅</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: T.muted }}>Tudo conferido!</div>
                  </div>
                ) : (
                  <>
                    {/* Batch release */}
                    {conferenceTasks.length > 1 && (
                      <BatchReleaseButton count={conferenceTasks.length} tasks={conferenceTasks}
                        propertyId={property.id} actorId={userData?.id || ""} actorName={userData?.fullName || "Governanta"}
                        showToast={showToast}
                      />
                    )}
                    {conferenceTasks.map(t => (
                      <TaskCard key={t.id} task={t} locationName={getLocationName(t)} maids={maids}
                        onConfer={() => setConferTask(t)}
                      />
                    ))}
                  </>
                )}
              </div>
              <div style={{ height: 100 }} />
            </>
          )}

          {/* All tasks view */}
          {screen === "all" && (
            <>
              <div style={{ paddingTop: 16 }}>
                {tasks.filter(t => t.status !== "cancelled").length === 0 ? (
                  <div style={{ textAlign: "center", padding: "48px 24px" }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: T.muted }}>Sem tarefas</div>
                  </div>
                ) : (
                  (["waiting_conference", "in_progress", "pending", "paused", "completed"] as const).map(status => {
                    const filtered = tasks.filter(t => t.status === status);
                    if (filtered.length === 0) return null;
                    const labels: Record<string, string> = {
                      waiting_conference: "Aguardando Conferência",
                      in_progress: "Em Serviço",
                      pending: "Pendentes",
                      paused: "Pausadas",
                      completed: "Concluídas",
                    };
                    return (
                      <Section key={status} title={labels[status]} color={T.muted} count={filtered.length}>
                        {filtered.map(t => (
                          <TaskCard key={t.id} task={t} locationName={getLocationName(t)} maids={maids}
                            onConfer={status === "waiting_conference" ? () => setConferTask(t) : undefined}
                            onAssign={status !== "waiting_conference" && status !== "completed" ? () => setAssignTask(t) : undefined}
                          />
                        ))}
                      </Section>
                    );
                  })
                )}
              </div>
              <div style={{ height: 100 }} />
            </>
          )}
        </div>

        {/* ── Bottom nav ──────────────────────────────────────────────────────── */}
        <div style={{
          flexShrink: 0, borderTop: `1px solid ${T.border}`,
          background: T.card,
          display: "flex", paddingBottom: "env(safe-area-inset-bottom,0px)",
        }}>
          {([
            { id: "dashboard" as Screen, icon: "home" as IName, label: "Início", badge: undefined as number | undefined },
            { id: "conference" as Screen, icon: "sparkles" as IName, label: "Conferir", badge: conferenceTasks.length as number | undefined },
            { id: "all" as Screen, icon: "list" as IName, label: "Todas", badge: undefined as number | undefined },
          ]).map(tab => {
            const active = screen === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setScreen(tab.id)}
                style={{
                  flex: 1, padding: "12px 8px 10px",
                  background: "transparent", border: "none", cursor: "pointer",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                  position: "relative",
                }}
              >
                <div style={{
                  position: "relative",
                  background: active ? "rgba(167,139,250,0.15)" : "transparent",
                  borderRadius: 10, padding: "6px 16px",
                }}>
                  <I n={tab.icon} s={20} c={active ? T.v1 : T.muted} w={active ? 2.2 : 1.7} />
                  {tab.badge != null && tab.badge > 0 && (
                    <div style={{
                      position: "absolute", top: 2, right: 8,
                      width: 16, height: 16, borderRadius: "50%",
                      background: T.vGrad, fontSize: 9, fontWeight: 900, color: "#fff",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>{tab.badge}</div>
                  )}
                </div>
                <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, color: active ? T.v1 : T.muted }}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Sheets ──────────────────────────────────────────────────────────── */}
        {conferTask && (
          <ConferSheet
            task={conferTask}
            locationName={getLocationName(conferTask)}
            onClose={() => setConferTask(null)}
            onApprove={() => handleApprove(conferTask, "")}
            onReject={() => handleReject(conferTask)}
            busy={conferBusy}
          />
        )}
        {assignTask && (
          <AssignSheet
            task={assignTask}
            locationName={getLocationName(assignTask)}
            maids={maids}
            onClose={() => setAssignTask(null)}
            onAssign={(ids) => handleAssign(assignTask, ids)}
            busy={assignBusy}
          />
        )}
        {showNewTask && (
          <NewTaskSheet
            cabins={allCabins}
            structures={allStructures}
            maids={maids}
            propertyId={property.id}
            actorId={userData?.id || ""}
            actorName={userData?.fullName || "Governanta"}
            onClose={() => setShowNewTask(false)}
            onCreated={() => {}}
            showToast={showToast}
          />
        )}

        {/* ── Toast ───────────────────────────────────────────────────────────── */}
        {toast && <GovToast msg={toast.msg} color={toast.color} />}
      </div>
    </>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, color, count, children }: { title: string; color: string; count: number; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color, textTransform: "uppercase", letterSpacing: "0.07em" }}>{title}</span>
        <div style={{ flex: 1, height: 1, background: T.border }} />
        <span style={{ fontSize: 11, fontWeight: 800, color, background: `${color}18`, border: `1px solid ${color}33`, padding: "1px 8px", borderRadius: 999 }}>{count}</span>
      </div>
      {children}
    </div>
  );
}

// ─── Batch Release Button ─────────────────────────────────────────────────────

function BatchReleaseButton({
  count, tasks, propertyId, actorId, actorName, showToast,
}: {
  count: number;
  tasks: HousekeepingTask[];
  propertyId: string;
  actorId: string;
  actorName: string;
  showToast: (msg: string, color?: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  const releaseAll = async () => {
    if (!confirm(`Liberar todas as ${count} cabanas de uma vez?`)) return;
    setBusy(true);
    try {
      await Promise.all(
        tasks.map(t => HousekeepingService.confirmTaskQuality(propertyId, t.id, "Liberado em lote", actorId, actorName))
      );
      showToast(`${count} cabana${count > 1 ? "s" : ""} liberada${count > 1 ? "s" : ""}!`, T.green);
    } catch {
      showToast("Erro ao liberar em lote.", T.red);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      disabled={busy}
      onClick={releaseAll}
      style={{
        width: "100%", padding: "14px 18px", marginBottom: 12,
        background: T.greenG, color: "#021a17",
        border: "none", borderRadius: 16, cursor: busy ? "not-allowed" : "pointer",
        fontFamily: "inherit", fontSize: 13, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        opacity: busy ? 0.5 : 1, boxShadow: "0 4px 20px rgba(45,212,191,0.28)",
      }}
    >
      {busy
        ? <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid #021a17", borderTopColor: "transparent", animation: "gov-spin .8s linear infinite" }} />
        : <I n="checkall" s={16} c="#021a17" />
      }
      Liberar Todas ({count})
    </button>
  );
}
