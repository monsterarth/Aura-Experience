"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import { RoleSwitcher } from "@/components/auth/RoleSwitcher";
import { MinibarSheet } from "@/components/maid/MinibarSheet";
import { HousekeepingTaskManagerModal } from "@/components/admin/HousekeepingTaskManagerModal";
import { HousekeepingService } from "@/services/housekeeping-service";
import { CabinService } from "@/services/cabin-service";
import { StaffService } from "@/services/staff-service";
import { StructureService } from "@/services/structure-service";
import { StayService } from "@/services/stay-service";
import { HousekeepingTask, Cabin, Staff, Structure, MinibarItem, ConciergeItem } from "@/types/aura";
import { ConciergeService } from "@/services/concierge-service";
import { MaintenanceService } from "@/services/maintenance-service";
import { supabase } from "@/lib/supabase";
import { createClientBrowserAuto } from "@/lib/supabase-browser";
import { useRouter } from "next/navigation";
import { resolveEffectiveDaySchedule } from "@/lib/schedule-calculator";
import { ScrapWall } from "@/components/admin/profile/ScrapWall";

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
.gov-shell button:not([disabled]):active{opacity:.7;transform:scale(.97);}
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
  led: "#00d4ff",
  ledBg: "rgba(0,212,255,0.08)",
  ledBorder: "rgba(0,212,255,0.25)",
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
  | "undo" | "checkall" | "logout" | "arrow" | "settings" | "refresh" | "minus";

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
    minus: <line x1="5" y1="12" x2="19" y2="12" />,
  };
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round"
      style={n === "loader" ? { animation: "gov-spin 0.8s linear infinite" } : undefined}>
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
    turnover:            { label: "Faxina de Troca",        color: T.v1,   bg: "rgba(167,139,250,0.12)" },
    inspection_checkin:  { label: "Conf. de Entrada",       color: T.v1,   bg: "rgba(167,139,250,0.12)" },
    inspection_checkout: { label: "Conf. de Saída",         color: T.v1,   bg: "rgba(167,139,250,0.12)" },
    daily:               { label: "Arrumação",               color: T.blue, bg: T.blueBg },
    linen_change:        { label: "Arr. c/ Troca de Roupa", color: T.green, bg: T.greenBg },
    custom:              { label: "Personalizada",           color: T.amber, bg: T.amberBg },
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
  task, locationName, propertyId, actorId, actorName, onClose, onApprove, onReject, busy,
}: {
  task: HousekeepingTask;
  locationName: string;
  propertyId: string;
  actorId: string;
  actorName: string;
  onClose: () => void;
  onApprove: (obs: string, checklist: HousekeepingTask["checklist"]) => void;
  onReject: () => void;
  busy: boolean;
}) {
  const [obs, setObs] = useState("");
  const [checklist, setChecklist] = useState<HousekeepingTask["checklist"]>(task.checklist || []);
  const [showRep, setShowRep] = useState(false);
  const [repItems, setRepItems] = useState<ConciergeItem[]>([]);
  const [loadingRep, setLoadingRep] = useState(false);
  const [showMaint, setShowMaint] = useState(false);

  const toggleItem = (id: string) =>
    setChecklist(prev => prev.map(i => i.id === id ? { ...i, checked: !i.checked } : i));

  const openRep = async () => {
    setShowRep(true);
    if (repItems.length > 0) return;
    setLoadingRep(true);
    try { setRepItems(await ConciergeService.getConciergeItemsForMaid(propertyId)); }
    finally { setLoadingRep(false); }
  };

  const handleSendRep = async (entries: { itemId: string; qty: number }[]) => {
    await Promise.all(entries.map(({ itemId, qty }) =>
      ConciergeService.createRequest(
        { propertyId, stayId: task.stayId, cabinId: task.cabinId, itemId, quantity: qty, requestedBy: "maid", notes: "Solicitado pela governanta" },
        actorId, actorName
      )
    ));
  };

  const checkedCount = checklist.filter(i => i.checked).length;

  if (showRep) {
    return (
      <GovReplenishSheet
        locationName={locationName}
        repItems={repItems}
        loading={loadingRep}
        onClose={() => setShowRep(false)}
        onSend={handleSendRep}
      />
    );
  }

  if (showMaint) {
    return (
      <GovMaintenanceSheet
        locationName={locationName}
        task={task}
        propertyId={propertyId}
        actorId={actorId}
        actorName={actorName}
        onClose={() => setShowMaint(false)}
      />
    );
  }

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

        {/* Checklist interativo */}
        {checklist.length > 0 && (
          <div style={{ background: T.card2, border: `1px solid ${T.border}`, borderRadius: 16, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
              Checklist ({checkedCount}/{checklist.length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {checklist.map((item) => (
                <button
                  key={item.id}
                  onClick={() => toggleItem(item.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "8px 4px",
                    background: "transparent", border: "none", cursor: "pointer",
                    borderRadius: 10, textAlign: "left", width: "100%",
                  }}
                >
                  <div style={{
                    width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                    border: `1.5px solid ${item.checked ? T.green : T.border2}`,
                    background: item.checked ? T.greenBg : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all .15s",
                  }}>
                    {item.checked && <I n="check" s={11} c={T.green} />}
                  </div>
                  <span style={{
                    flex: 1, fontSize: 13, color: item.checked ? T.text : T.muted,
                    textDecoration: item.checked ? "none" : "line-through",
                    opacity: item.checked ? 1 : 0.55, transition: "all .15s",
                  }}>{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Ações rápidas: reposição + manutenção */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <button
            onClick={openRep}
            style={{
              flex: 1, padding: "13px 14px",
              background: T.card2, border: `1px solid ${T.border}`,
              borderRadius: 14, cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", gap: 8,
            }}
          >
            <I n="refresh" s={15} c={T.amber} />
            <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>Reposição</span>
          </button>
          <button
            onClick={() => setShowMaint(true)}
            style={{
              flex: 1, padding: "13px 14px",
              background: T.card2, border: `1px solid ${T.border}`,
              borderRadius: 14, cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", gap: 8,
            }}
          >
            <I n="settings" s={15} c={T.red} />
            <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>Manutenção</span>
          </button>
        </div>

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
          onClick={() => onApprove(obs, checklist)}
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

// ─── Gov Replenish Sheet ──────────────────────────────────────────────────────

function GovReplenishSheet({
  locationName, repItems, loading: loadingItems, onClose, onSend,
}: {
  locationName: string;
  repItems: ConciergeItem[];
  loading: boolean;
  onClose: () => void;
  onSend: (items: { itemId: string; qty: number }[]) => Promise<void>;
}) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  const adj = (id: string, d: number) =>
    setCart(p => { const n = { ...p }, v = Math.max(0, (p[id] ?? 0) + d); if (!v) delete n[id]; else n[id] = v; return n; });

  const count = Object.values(cart).reduce((a, b) => a + b, 0);

  const submit = async () => {
    setBusy(true);
    const entries = Object.entries(cart).filter(([, q]) => q > 0).map(([itemId, qty]) => ({ itemId, qty }));
    await onSend(entries);
    onClose();
    setBusy(false);
  };

  return (
    <Sheet onClose={onClose}>
      <div style={{ padding: "0 20px 14px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900 }}>{locationName}</div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 3 }}>Solicitar reposição</div>
        </div>
        <button onClick={onClose} style={{ background: T.glass2, border: `1px solid ${T.border}`, borderRadius: 10, padding: 8, cursor: "pointer", color: T.muted }}>
          <I n="x" s={15} />
        </button>
      </div>

      <div className="gov-sheet-body" style={{ padding: "0 16px" }}>
        {loadingItems ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
            <I n="loader" s={24} c={T.amber} w={2} />
          </div>
        ) : repItems.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", fontSize: 13, color: T.muted }}>
            Nenhum item de reposição configurado.<br />
            <span style={{ opacity: 0.6, fontSize: 11 }}>Configure em Catálogo Concierge → Disponível para Camareira.</span>
          </div>
        ) : (
          repItems.map(item => {
            const q = cart[item.id] ?? 0;
            return (
              <div key={item.id} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "12px",
                borderRadius: 14, borderBottom: `1px solid ${T.border}`,
                background: q > 0 ? "rgba(245,158,11,0.08)" : "transparent", transition: "background .15s",
              }}>
                <span style={{ flex: 1, fontSize: 14, fontWeight: q > 0 ? 700 : 400, color: q > 0 ? T.amber : T.text }}>{item.name}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button onClick={() => adj(item.id, -1)} disabled={!q} style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${T.border}`, background: T.glass2, cursor: q ? "pointer" : "not-allowed", opacity: q ? 1 : 0.3, display: "flex", alignItems: "center", justifyContent: "center", color: T.text }}>
                    <I n="minus" s={13} />
                  </button>
                  <span style={{ width: 18, textAlign: "center", fontWeight: 900, fontSize: 14 }}>{q}</span>
                  <button onClick={() => adj(item.id, 1)} style={{ width: 30, height: 30, borderRadius: 8, background: `linear-gradient(135deg,${T.amberBg},rgba(252,211,77,0.15))`, border: `1px solid ${T.amberBorder}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: T.amber }}>
                    <I n="plus" s={13} />
                  </button>
                </div>
              </div>
            );
          })
        )}
        <div style={{ height: 80 }} />
      </div>

      <div style={{ padding: "12px 16px", borderTop: `1px solid ${T.border}`, background: "#0d1020", flexShrink: 0 }}>
        <button
          disabled={!count || busy || loadingItems}
          onClick={submit}
          style={{
            width: "100%", padding: 16, background: T.greenG, color: "#021a17",
            fontFamily: "inherit", fontSize: 14, fontWeight: 800, letterSpacing: "0.03em", textTransform: "uppercase" as const,
            border: "none", borderRadius: 16, cursor: (!count || busy) ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            opacity: !count ? 0.4 : 1, boxShadow: "0 4px 20px rgba(45,212,191,0.3)",
          }}
        >
          <I n="send" s={17} /> Solicitar {count > 0 ? `(${count})` : ""}
        </button>
      </div>
    </Sheet>
  );
}

// ─── Gov Maintenance Sheet ────────────────────────────────────────────────────

function GovMaintenanceSheet({
  locationName, task, propertyId, actorId, actorName, onClose,
}: {
  locationName: string;
  task: HousekeepingTask;
  propertyId: string;
  actorId: string;
  actorName: string;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const PRIORITIES: { value: "low" | "medium" | "high" | "urgent"; label: string; color: string }[] = [
    { value: "low",    label: "Baixa",   color: T.muted },
    { value: "medium", label: "Média",   color: T.blue },
    { value: "high",   label: "Alta",    color: T.amber },
    { value: "urgent", label: "Urgente", color: T.red },
  ];

  const submit = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      await MaintenanceService.createTask(propertyId, {
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        cabinId: task.cabinId,
        structureId: task.structureId,
        customLocation: !task.cabinId && !task.structureId ? locationName : undefined,
        status: "pending",
        assignedTo: [],
        checklist: [],
        isRecurring: false,
      } as any, actorId, actorName);
      setSent(true);
    } catch {
      // mantém o formulário aberto para tentar novamente
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <Sheet onClose={onClose}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", gap: 16 }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: T.greenBg, border: `2px solid ${T.green}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <I n="check" s={24} c={T.green} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: T.text }}>Chamado aberto!</div>
          <div style={{ fontSize: 13, color: T.muted, textAlign: "center" }}>A equipe de manutenção foi notificada.</div>
          <button
            onClick={onClose}
            style={{ marginTop: 8, padding: "12px 32px", background: T.greenG, color: "#021a17", border: "none", borderRadius: 14, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 800 }}
          >
            Fechar
          </button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet onClose={onClose}>
      <div style={{ padding: "20px 20px 8px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: T.text }}>Chamado de Manutenção</span>
          <button onClick={onClose} style={{ background: T.glass2, border: `1px solid ${T.border}`, borderRadius: 10, padding: 8, cursor: "pointer", color: T.muted }}>
            <I n="x" s={16} />
          </button>
        </div>
        <p style={{ fontSize: 13, color: T.muted, marginTop: 6 }}>{locationName}</p>
      </div>

      <div className="gov-sheet-body" style={{ padding: "12px 20px 0" }}>
        {/* Título */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Problema *</div>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Ex: Torneira com vazamento, AC sem funcionar..."
            autoFocus
            style={{
              width: "100%", background: T.card2, border: `1px solid ${title ? T.border2 : T.border}`,
              borderRadius: 12, padding: "11px 14px", color: T.text, fontSize: 13,
              fontFamily: "inherit", outline: "none",
            }}
          />
        </div>

        {/* Descrição */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Detalhes (opcional)</div>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Descreva onde está o problema e o que observou..."
            rows={3}
            style={{
              width: "100%", background: T.card2, border: `1px solid ${T.border}`,
              borderRadius: 12, padding: "10px 14px", color: T.text, fontSize: 13,
              fontFamily: "inherit", resize: "none", outline: "none",
            }}
          />
        </div>

        {/* Prioridade */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Prioridade</div>
          <div style={{ display: "flex", gap: 8 }}>
            {PRIORITIES.map(p => (
              <button
                key={p.value}
                onClick={() => setPriority(p.value)}
                style={{
                  flex: 1, padding: "9px 4px", borderRadius: 12, cursor: "pointer",
                  fontFamily: "inherit", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em",
                  background: priority === p.value ? `${p.color}18` : T.card2,
                  border: `1.5px solid ${priority === p.value ? p.color : T.border}`,
                  color: priority === p.value ? p.color : T.muted,
                  transition: "all .15s",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ height: 8 }} />
      </div>

      <div style={{ padding: "12px 20px 24px", borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
        <button
          disabled={!title.trim() || busy}
          onClick={submit}
          style={{
            width: "100%", padding: "15px 0", background: T.greenG, color: "#021a17",
            border: "none", borderRadius: 16, cursor: (!title.trim() || busy) ? "not-allowed" : "pointer",
            fontFamily: "inherit", fontSize: 13, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            opacity: !title.trim() ? 0.4 : 1, boxShadow: "0 4px 20px rgba(45,212,191,0.28)",
          }}
        >
          {busy ? <I n="loader" s={16} c="#021a17" /> : <I n="send" s={16} c="#021a17" />}
          Abrir Chamado
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

// ─── Shared style for select/input fields ─────────────────────────────────────

const selectStyle = {
  width: "100%", background: T.card2, border: `1px solid ${T.border}`,
  borderRadius: 12, padding: "11px 14px", color: T.text, fontSize: 13,
  fontFamily: "inherit", outline: "none", appearance: "none" as const,
};

// ─── Location Picker (module-level to avoid keyboard-close bug on re-render) ──

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
              fontFamily: "inherit", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em",
              background: on ? T.vSoft : T.card2, border: `1px solid ${on ? T.vBorder : T.border}`,
              color: on ? T.v1 : T.muted,
            }}>{labels[v]}</button>
          );
        })}
      </div>
      {lt === "cabin" && (
        <select value={cid} onChange={e => setCid(e.target.value)} style={{ ...selectStyle, marginBottom: 16 }}>
          <option value="">Selecione a cabana</option>
          {cabins.map(c => <option key={c.id} value={c.id}>{c.name || `Cabana ${c.number}`}</option>)}
        </select>
      )}
      {lt === "structure" && (
        <select value={sid} onChange={e => setSid(e.target.value)} style={{ ...selectStyle, marginBottom: 16 }}>
          <option value="">Selecione a estrutura</option>
          {structures.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}
      {lt === "custom" && (
        <input value={cust} onChange={e => setCust(e.target.value)} placeholder="Descreva o local..."
          style={{ ...selectStyle, marginBottom: 16 }} />
      )}
    </>
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
  const [mode, setMode] = useState<"cleaning" | "maintenance">("cleaning");

  // ── Limpeza ──
  const [locType, setLocType] = useState<"cabin" | "structure" | "custom">("cabin");
  const [cabinId, setCabinId] = useState("");
  const [structureId, setStructureId] = useState("");
  const [customLocation, setCustomLocation] = useState("");
  const [taskType, setTaskType] = useState<"daily" | "turnover" | "linen_change" | "inspection_checkin" | "inspection_checkout" | "custom">("daily");
  const [assignedIds, setAssignedIds] = useState<string[]>([]);
  const [obs, setObs] = useState("");
  const [customChecklist, setCustomChecklist] = useState<{ id: string; label: string; checked: boolean }[]>([]);

  // ── Manutenção ──
  const [maintTitle, setMaintTitle] = useState("");
  const [maintDesc, setMaintDesc] = useState("");
  const [maintPriority, setMaintPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [maintLocType, setMaintLocType] = useState<"cabin" | "structure" | "custom">("cabin");
  const [maintCabinId, setMaintCabinId] = useState("");
  const [maintStructureId, setMaintStructureId] = useState("");
  const [maintCustomLocation, setMaintCustomLocation] = useState("");

  const [busy, setBusy] = useState(false);

  const toggleMaid = (id: string) =>
    setAssignedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const canSubmitCleaning = (locType === "cabin" && cabinId) ||
    (locType === "structure" && structureId) ||
    (locType === "custom" && customLocation.trim().length > 0);

  const canSubmitMaint = maintTitle.trim().length > 0 && (
    (maintLocType === "cabin" && maintCabinId) ||
    (maintLocType === "structure" && maintStructureId) ||
    (maintLocType === "custom" && maintCustomLocation.trim().length > 0)
  );

  const submitCleaning = async () => {
    if (!canSubmitCleaning || busy) return;
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
        checklist: taskType === "custom" ? customChecklist : [],
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

  const submitMaint = async () => {
    if (!canSubmitMaint || busy) return;
    setBusy(true);
    try {
      await MaintenanceService.createTask(propertyId, {
        title: maintTitle.trim(),
        description: maintDesc.trim() || undefined,
        priority: maintPriority,
        cabinId: maintLocType === "cabin" ? maintCabinId : undefined,
        structureId: maintLocType === "structure" ? maintStructureId : undefined,
        customLocation: maintLocType === "custom" ? maintCustomLocation.trim() : undefined,
        status: "pending",
        assignedTo: [],
        checklist: [],
        isRecurring: false,
      } as any, actorId, actorName);
      showToast("Chamado aberto!", T.green);
      onClose();
    } catch {
      showToast("Erro ao abrir chamado.", T.red);
    } finally {
      setBusy(false);
    }
  };

  const PRIORITIES: { value: "low" | "medium" | "high" | "urgent"; label: string; color: string }[] = [
    { value: "low",    label: "Baixa",   color: T.muted },
    { value: "medium", label: "Média",   color: T.blue },
    { value: "high",   label: "Alta",    color: T.amber },
    { value: "urgent", label: "Urgente", color: T.red },
  ];

  return (
    <Sheet onClose={onClose}>
      <div style={{ padding: "20px 20px 8px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: T.text }}>Nova Tarefa</span>
          <button onClick={onClose} style={{ background: T.glass2, border: `1px solid ${T.border}`, borderRadius: 10, padding: 8, cursor: "pointer", color: T.muted }}>
            <I n="x" s={16} />
          </button>
        </div>

        {/* Mode toggle */}
        <div style={{ display: "flex", gap: 8, marginTop: 14, background: T.card2, borderRadius: 14, padding: 4 }}>
          {(["cleaning", "maintenance"] as const).map(m => {
            const on = mode === m;
            return (
              <button key={m} onClick={() => setMode(m)} style={{
                flex: 1, padding: "9px 0", borderRadius: 10, cursor: "pointer",
                fontFamily: "inherit", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em",
                background: on ? (m === "maintenance" ? T.redBg : T.vSoft) : "transparent",
                border: `1px solid ${on ? (m === "maintenance" ? T.redBorder : T.vBorder) : "transparent"}`,
                color: on ? (m === "maintenance" ? T.red : T.v1) : T.muted,
                transition: "all .15s",
              }}>
                {m === "cleaning" ? "Limpeza" : "Manutenção"}
              </button>
            );
          })}
        </div>
      </div>

      <div className="gov-sheet-body" style={{ padding: "12px 20px 0" }}>
        {mode === "cleaning" ? (
          <>
            <Label>Tipo</Label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
              {([
                { value: "daily",               label: "Arrumação" },
                { value: "linen_change",         label: "Arr. c/ Troca" },
                { value: "turnover",             label: "Faxina de Troca" },
                { value: "inspection_checkin",   label: "Conf. Entrada" },
                { value: "inspection_checkout",  label: "Conf. Saída" },
                { value: "custom",               label: "Personalizada" },
              ] as const).map(({ value, label }) => {
                const on = taskType === value;
                return (
                  <button key={value} onClick={() => setTaskType(value)} style={{
                    padding: "10px 4px", borderRadius: 12, cursor: "pointer",
                    fontFamily: "inherit", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em",
                    background: on ? T.vSoft : T.card2, border: `1px solid ${on ? T.vBorder : T.border}`,
                    color: on ? T.v1 : T.muted, lineHeight: 1.3, textAlign: "center",
                  }}>{label}</button>
                );
              })}
            </div>

            <Label>Local</Label>
            <LocPicker lt={locType} setLt={setLocType} cid={cabinId} setCid={setCabinId}
              sid={structureId} setSid={setStructureId} cust={customLocation} setCust={setCustomLocation}
              cabins={cabins} structures={structures} />

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
                      }}>{m.fullName.split(" ")[0]}</button>
                    );
                  })}
                </div>
              </>
            )}

            {taskType === "custom" && (
              <>
                <Label>Procedimentos (opcional)</Label>
                <div style={{ marginBottom: 8 }}>
                  {customChecklist.map(item => (
                    <div key={item.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                      <input
                        value={item.label}
                        onChange={e => setCustomChecklist(prev => prev.map(i => i.id === item.id ? { ...i, label: e.target.value } : i))}
                        placeholder="Ex: Higienizar tapetes..."
                        style={{ ...selectStyle, flex: 1 }}
                      />
                      <button
                        type="button"
                        onClick={() => setCustomChecklist(prev => prev.filter(i => i.id !== item.id))}
                        style={{ padding: "10px 12px", background: T.redBg, border: `1px solid ${T.redBorder}`, borderRadius: 10, cursor: "pointer", color: T.red, flexShrink: 0 }}
                      >
                        <I n="x" s={14} c={T.red} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setCustomChecklist(prev => [...prev, { id: crypto.randomUUID(), label: "", checked: false }])}
                    style={{ width: "100%", padding: "10px 0", background: T.card2, border: `1px solid ${T.border}`, borderRadius: 12, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700, color: T.muted, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 8 }}
                  >
                    <I n="plus" s={14} c={T.muted} /> Adicionar Item
                  </button>
                </div>
              </>
            )}

            <Label>Observação (opcional)</Label>
            <textarea value={obs} onChange={e => setObs(e.target.value)} placeholder="Instruções especiais..." rows={2}
              style={{ width: "100%", background: T.card2, border: `1px solid ${T.border}`, borderRadius: 12, padding: "10px 14px", color: T.text, fontSize: 13, fontFamily: "inherit", resize: "none", outline: "none", marginBottom: 8 }} />
          </>
        ) : (
          <>
            <Label>Problema *</Label>
            <input value={maintTitle} onChange={e => setMaintTitle(e.target.value)}
              placeholder="Ex: Torneira com vazamento, AC sem funcionar..." autoFocus
              style={{ ...selectStyle, marginBottom: 16, border: `1px solid ${maintTitle ? T.border2 : T.border}` }} />

            <Label>Local</Label>
            <LocPicker lt={maintLocType} setLt={setMaintLocType} cid={maintCabinId} setCid={setMaintCabinId}
              sid={maintStructureId} setSid={setMaintStructureId} cust={maintCustomLocation} setCust={setMaintCustomLocation}
              cabins={cabins} structures={structures} />

            <Label>Detalhes (opcional)</Label>
            <textarea value={maintDesc} onChange={e => setMaintDesc(e.target.value)}
              placeholder="Descreva onde está o problema e o que observou..." rows={3}
              style={{ width: "100%", background: T.card2, border: `1px solid ${T.border}`, borderRadius: 12, padding: "10px 14px", color: T.text, fontSize: 13, fontFamily: "inherit", resize: "none", outline: "none", marginBottom: 16 }} />

            <Label>Prioridade</Label>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              {PRIORITIES.map(p => (
                <button key={p.value} onClick={() => setMaintPriority(p.value)} style={{
                  flex: 1, padding: "9px 4px", borderRadius: 12, cursor: "pointer",
                  fontFamily: "inherit", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em",
                  background: maintPriority === p.value ? `${p.color}18` : T.card2,
                  border: `1.5px solid ${maintPriority === p.value ? p.color : T.border}`,
                  color: maintPriority === p.value ? p.color : T.muted, transition: "all .15s",
                }}>{p.label}</button>
              ))}
            </div>
          </>
        )}
        <div style={{ height: 8 }} />
      </div>

      <div style={{ padding: "12px 20px 24px", borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
        {mode === "cleaning" ? (
          <button disabled={!canSubmitCleaning || busy} onClick={submitCleaning} style={{
            width: "100%", padding: 16, background: T.vGrad, color: "#fff",
            border: "none", borderRadius: 16, cursor: (!canSubmitCleaning || busy) ? "not-allowed" : "pointer",
            fontFamily: "inherit", fontSize: 14, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            opacity: (!canSubmitCleaning || busy) ? 0.4 : 1, boxShadow: "0 4px 20px rgba(124,58,237,0.35)",
          }}>
            {busy ? <I n="loader" s={16} /> : <I n="plus" s={16} />}
            Criar Tarefa
          </button>
        ) : (
          <button disabled={!canSubmitMaint || busy} onClick={submitMaint} style={{
            width: "100%", padding: 16, background: T.greenG, color: "#021a17",
            border: "none", borderRadius: 16, cursor: (!canSubmitMaint || busy) ? "not-allowed" : "pointer",
            fontFamily: "inherit", fontSize: 14, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            opacity: (!canSubmitMaint || busy) ? 0.4 : 1, boxShadow: "0 4px 20px rgba(45,212,191,0.28)",
          }}>
            {busy ? <I n="loader" s={16} c="#021a17" /> : <I n="send" s={16} c="#021a17" />}
            Abrir Chamado
          </button>
        )}
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
  task, locationName, maids, onConfer, onAssign, onCancel, onEdit,
}: {
  task: HousekeepingTask;
  locationName: string;
  maids: Staff[];
  onConfer?: () => void;
  onAssign?: () => void;
  onCancel?: () => void;
  onEdit?: () => void;
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
        {onEdit && (
          <button
            onClick={onEdit}
            style={{
              padding: "11px 12px", background: T.card2, color: T.muted,
              border: `1px solid ${T.border}`, borderRadius: 12, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <I n="settings" s={14} c={T.muted} />
          </button>
        )}
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

// ─── Profile Screen ───────────────────────────────────────────────────────────

function tenure(iso?: string | null): string | null {
  if (!iso) return null;
  const months = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24 * 30.44));
  if (months < 1) return "menos de 1 mês";
  if (months < 12) return `${months} ${months === 1 ? "mês" : "meses"}`;
  const y = Math.floor(months / 12), m = months % 12;
  return m > 0 ? `${y} ${y === 1 ? "ano" : "anos"} e ${m} ${m === 1 ? "mês" : "meses"}` : `${y} ${y === 1 ? "ano" : "anos"}`;
}

function ProfileScreen({ userData, onLogout }: { userData: any; onLogout: () => void }) {
  const name = userData?.fullName || "Governanta";
  const initials = name.split(" ").slice(0, 2).map((w: string) => w[0] ?? "").join("").toUpperCase();
  const photo: string | undefined = userData?.profilePictureUrl;
  const tenureStr = tenure(userData?.hireDate);
  const [todayShift, setTodayShift] = useState<string | null>(null);

  useEffect(() => {
    if (!userData?.id) return;
    const today = new Date();
    const from = today.toISOString().split("T")[0];
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
    <div className="gov-scroll" style={{ padding: "0 16px 24px" }}>
      <div style={{ padding: "20px 0 20px" }}>
        <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.3px", color: T.text }}>Meu Perfil</div>
      </div>

      <div style={{ position: "relative", borderRadius: 20, marginBottom: 16 }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: 20, padding: "1px", background: T.vGrad, WebkitMask: "linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0)", WebkitMaskComposite: "xor", maskComposite: "exclude", pointerEvents: "none" }} />
        <div style={{ background: "rgba(8,11,20,0.95)", borderRadius: 20, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 66, height: 66, borderRadius: 22, flexShrink: 0, border: `1px solid ${T.vBorder}`, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 900, background: "linear-gradient(135deg,rgba(167,139,250,0.25),rgba(124,58,237,0.25))" }}>
              {photo
                ? <img src={photo} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <span style={{ background: T.vGrad, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>{initials}</span>
              }
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: T.text }}>{name}</div>
              <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>Governança</div>
              {tenureStr && <div style={{ fontSize: 11, color: T.muted2, marginTop: 1 }}>Aqui há {tenureStr}</div>}
              <div style={{ marginTop: 5 }}>
                <span style={{ display: "inline-flex", alignItems: "center", fontSize: 10, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase" as const, padding: "3px 9px", borderRadius: 999, lineHeight: 1.5, color: T.green, background: T.greenBg, border: `1px solid ${T.greenBorder}` }}>Ativo</span>
              </div>
            </div>
          </div>
          {userData?.bio && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${T.border}`, fontSize: 13, color: T.muted, lineHeight: 1.5 }}>
              {userData.bio}
            </div>
          )}
        </div>
      </div>

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
                <I n="alert" s={14} c={T.green} />
              </div>
              <span style={{ fontSize: 13, color: T.text }}>{userData.phone}</span>
            </div>
          )}
        </div>
      )}

      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: T.muted, marginBottom: 10 }}>Turno hoje</div>
      <div style={{ background: T.glass, border: `1px solid ${T.border}`, borderRadius: 20, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: T.amberBg, border: `1px solid ${T.amberBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <I n="clock" s={18} c={T.amber} />
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14, color: T.text }}>{todayShift || "Sem escala definida"}</div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{todayLabel()}</div>
        </div>
      </div>

      {userData?.id && userData?.propertyId && (
        <div style={{ marginBottom: 20 }}>
          <ScrapWall profileStaffId={userData.id} isOwnProfile={true} propertyId={userData.propertyId} allowRecipientPicker={true} profileBasePath="/equipe" />
        </div>
      )}

      <button onClick={onLogout} style={{ width: "100%", padding: 15, background: T.redBg, color: T.red, fontFamily: "inherit", fontSize: 14, fontWeight: 700, letterSpacing: "0.02em", textTransform: "uppercase" as const, border: `1px solid ${T.redBorder}`, borderRadius: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <I n="logout" s={18} c={T.red} /> Sair do aplicativo
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type Screen = "dashboard" | "conference" | "all" | "profile";

export default function GovernantaPage() {
  const { userData, authConfirmed, tokenReady } = useAuth();
  const { currentProperty: property, loading: propLoading } = useProperty();
  const router = useRouter();

  const [tasks, setTasks] = useState<HousekeepingTask[]>([]);
  const [cabins, setCabins] = useState<Record<string, Cabin>>({});
  const [structures, setStructures] = useState<Record<string, Structure>>({});
  const [maids, setMaids] = useState<Staff[]>([]);
  const [allCabins, setAllCabins] = useState<Cabin[]>([]);
  const [allStructures, setAllStructures] = useState<Structure[]>([]);
  const [loading, setLoading] = useState(true);
  const [cabinStays, setCabinStays] = useState<Record<string, {
    guestName: string;
    checkIn: string;
    checkOut: string;
    status: string;
    expectedArrivalTime?: string | null;
  }>>({});

  const [screen, setScreen] = useState<Screen>("dashboard");

  const [minibarItems, setMinibarItems] = useState<MinibarItem[]>([]);
  const [govMiniTarget, setGovMiniTarget] = useState<HousekeepingTask | null>(null);

  // Sheets
  const [conferTask, setConferTask] = useState<HousekeepingTask | null>(null);
  const [assignTask, setAssignTask] = useState<HousekeepingTask | null>(null);
  const [editTask, setEditTask] = useState<HousekeepingTask | null>(null);
  const [cancelConfirmTask, setCancelConfirmTask] = useState<HousekeepingTask | null>(null);
  const [showNewTask, setShowNewTask] = useState(false);

  // Busy states
  const [conferBusy, setConferBusy] = useState(false);
  const [assignBusy, setAssignBusy] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);

  // Cabin history
  const [selectedCabin, setSelectedCabin] = useState<Cabin | null>(null);
  const [cabinHistory, setCabinHistory] = useState<HousekeepingTask[]>([]);
  const [cabinHistoryLoading, setCabinHistoryLoading] = useState(false);

  const openCabinHistory = useCallback(async (cabin: Cabin) => {
    setSelectedCabin(cabin);
    setCabinHistory([]);
    setCabinHistoryLoading(true);
    try {
      const { data } = await supabase
        .from("housekeeping_tasks")
        .select("*")
        .eq("cabinId", cabin.id)
        .eq("propertyId", cabin.propertyId)
        .order("createdAt", { ascending: false })
        .limit(40);
      setCabinHistory((data ?? []) as HousekeepingTask[]);
    } catch {
      // silently fail — history is optional
    } finally {
      setCabinHistoryLoading(false);
    }
  }, []);

  // Toast
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
    await fetch('/api/auth/signout', { method: 'POST' }).catch(() => {});
    window.location.href = '/admin/login';
  };

  // Load data
  useEffect(() => {
    if (!propLoading && !property) { setLoading(false); return; }
    // tokenReady (set apenas por INITIAL_SESSION/TOKEN_REFRESHED) garante token renovado.
    // Usar em vez de authConfirmed evita retorno vazio das queries quando o token
    // está expirado após idle — authConfirmed pode ser setado antes do refresh terminar.
    if (!property || !tokenReady) return;
    let unsub: () => void;

    const init = async () => {
      setLoading(true);
      try {
        // Timeout de 6s: se alguma das queries travar, libera o loading com dados parciais/vazios
        const withTimeout = <T,>(p: Promise<T>, fallback: T) =>
          Promise.race([p, new Promise<T>(resolve => setTimeout(() => resolve(fallback), 6000))]);

        const [cabinsData, staffData, structuresData, miniResult] = await Promise.all([
          withTimeout(CabinService.getCabinsByProperty(property.id), []),
          withTimeout(StaffService.getStaffByProperty(property.id), []),
          withTimeout(StructureService.getStructures(property.id), []),
          withTimeout(
            supabase.from("minibar_items").select("*").eq("propertyId", property.id).eq("active", true).order("order", { ascending: true }),
            { data: [] }
          ),
        ]);
        const { data: miniData } = miniResult as { data: any[] | null };
        setMinibarItems((miniData || []) as MinibarItem[]);

        const cabinsDict: Record<string, Cabin> = {};
        cabinsData.forEach(c => { cabinsDict[c.id] = c; });
        setCabins(cabinsDict);
        setAllCabins(cabinsData);

        // Load active/upcoming stays for occupancy info on cabin cards
        const todayStr = new Date().toISOString().split('T')[0];
        const { data: staysRaw } = await supabase
          .from('stays')
          .select('id, cabinId, checkIn, checkOut, status, expectedArrivalTime, guestId')
          .eq('propertyId', property.id)
          .in('status', ['active', 'pending', 'pre_checkin_done'])
          .not('cabinId', 'is', null)
          .gte('checkOut', todayStr);

        if (staysRaw && staysRaw.length > 0) {
          const guestIds = Array.from(new Set(staysRaw.map((s: any) => s.guestId).filter(Boolean))) as string[];
          const { data: guestsRaw } = await supabase
            .from('guests')
            .select('id, fullName')
            .in('id', guestIds);
          const guestMap: Record<string, string> = {};
          (guestsRaw ?? []).forEach((g: any) => { guestMap[g.id] = g.fullName; });

          const staysMap: Record<string, { guestName: string; checkIn: string; checkOut: string; status: string; expectedArrivalTime?: string | null }> = {};
          staysRaw.forEach((stay: any) => {
            if (stay.cabinId) {
              staysMap[stay.cabinId] = {
                guestName: guestMap[stay.guestId] ?? "",
                checkIn: stay.checkIn,
                checkOut: stay.checkOut,
                status: stay.status,
                expectedArrivalTime: stay.expectedArrivalTime ?? null,
              };
            }
          });
          setCabinStays(staysMap);
        }

        const structuresDict: Record<string, Structure> = {};
        structuresData.forEach(s => { structuresDict[s.id] = s; });
        setStructures(structuresDict);
        setAllStructures(structuresData);

        setMaids(staffData.filter(s => s.active && (s.role === "maid" || (s.secondaryRoles ?? []).includes("maid"))));

        unsub = HousekeepingService.listenToActiveTasks(property.id, setTasks);
      } catch {
        showToast("Erro ao carregar dados.", T.red);
      } finally {
        setLoading(false);
      }
    };

    init();
    return () => { if (unsub) unsub(); };
  }, [property, propLoading, showToast, tokenReady]);

  function getLocationName(task: HousekeepingTask): string {
    if (task.cabinId && cabins[task.cabinId]) {
      const c = cabins[task.cabinId];
      return c.name || `Cabana ${c.number}`;
    }
    if (task.structureId && structures[task.structureId]) return structures[task.structureId].name;
    return task.customLocation || "Local desconhecido";
  }

  // ── Actions ──────────────────────────────────────────────────────────────────

  const handleApprove = async (task: HousekeepingTask, obs: string, checklist: HousekeepingTask["checklist"]) => {
    if (!property) return;
    setConferBusy(true);
    try {
      // Persiste o checklist atualizado pela governanta antes de aprovar
      if (checklist.length > 0) {
        await supabase.from("housekeeping_tasks")
          .update({ checklist, updatedAt: new Date().toISOString() })
          .eq("id", task.id);
      }
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

  const handleCancel = (task: HousekeepingTask) => setCancelConfirmTask(task);

  const doCancel = async () => {
    if (!property || !cancelConfirmTask || cancelBusy) return;
    setCancelBusy(true);
    try {
      await HousekeepingService.updateTask(property.id, cancelConfirmTask.id, { status: "cancelled" }, userData?.id || "", userData?.fullName || "Governanta");
      showToast("Tarefa cancelada.", T.muted);
    } catch {
      showToast("Erro ao cancelar.", T.red);
    } finally {
      setCancelConfirmTask(null);
      setCancelBusy(false);
    }
  };

  const handleGovMiniSend = async (cart: Record<string, number>) => {
    const task = govMiniTarget;
    if (!task?.stayId || !property) return;
    try {
      await Promise.all(
        Object.entries(cart).filter(([, q]) => q > 0).map(([itemId, qty]) => {
          const item = minibarItems.find(m => m.id === itemId);
          if (!item) return Promise.resolve();
          return StayService.addFolioItemManual(
            property.id, task.stayId!,
            { description: item.name, quantity: qty, unitPrice: item.price, totalPrice: item.price * qty, category: "minibar", addedBy: userData?.id || "" },
            userData?.id || "", userData?.fullName || "Governanta",
          );
        })
      );
      showToast("Frigobar lançado!");
    } catch { showToast("Erro ao lançar frigobar.", T.red); throw new Error("folio_failed"); }
  };

  // ── Derived ───────────────────────────────────────────────────────────────────

  const checkoutTasks = tasks.filter(
    t => t.type === "turnover" && !t.cabinChecked &&
      (t.status === "pending" || t.status === "in_progress" || t.status === "waiting_conference")
  );
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
        <div style={{ width: 36, height: 36, borderRadius: "50%", border: `3px solid ${T.v1}`, borderTopColor: "transparent", animation: "gov-spin 0.8s linear infinite" }} />
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
      <div className="dark gov-shell" style={{
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

        {/* Role switcher — só aparece se o usuário tem acessos adicionais */}
        <RoleSwitcher />

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

          {/* Checkout conference section */}
          {screen === "dashboard" && checkoutTasks.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase", color: T.amber, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                <Pulse size={6} color={T.amber} /> Conferências de Checkout
              </div>
              {checkoutTasks.map(t => (
                <div key={t.id} style={{ background: T.amberBg, border: `1px solid ${T.amberBorder}`, borderRadius: 18, padding: 16, marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: T.amber }}>{getLocationName(t)}</div>
                    <div style={{ fontSize: 12, color: T.amber, opacity: 0.7, marginTop: 2 }}>Faxina de Troca · Verificar cabana</div>
                  </div>
                  <button
                    onClick={() => setGovMiniTarget(t)}
                    style={{ padding: "10px 18px", background: T.amber, color: "#1a0c00", fontFamily: "inherit", fontSize: 13, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", border: "none", borderRadius: 12, cursor: "pointer", flexShrink: 0, boxShadow: "0 2px 12px rgba(245,158,11,0.4)" }}
                  >
                    Conferir
                  </button>
                </div>
              ))}
            </div>
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
                      onEdit={() => setEditTask(t)}
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
                      onEdit={() => setEditTask(t)}
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
                        onEdit={() => setEditTask(t)}
                      />
                    ))}
                  </>
                )}
              </div>
              <div style={{ height: 100 }} />
            </>
          )}

          {/* Cabins view */}
          {screen === "all" && (
            <>
              <div style={{ paddingTop: 16 }}>
                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, paddingLeft: 2 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: T.muted }}>
                    Acomodações · {allCabins.length}
                  </span>
                </div>

                {allCabins.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "48px 24px" }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: T.muted }}>Sem acomodações</div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {allCabins
                      .slice()
                      .sort((a, b) => (a.number ?? "").localeCompare(b.number ?? "", "pt", { numeric: true }))
                      .map(cabin => {
                        const activeTasks = tasks.filter(t => t.cabinId === cabin.id && t.status !== "cancelled");
                        const priority = ["waiting_conference", "in_progress", "pending", "paused", "completed"];
                        const topTask = activeTasks.sort((a, b) => priority.indexOf(a.status) - priority.indexOf(b.status))[0];

                        const statusInfo = topTask ? {
                          waiting_conference: { label: "Conferência",  color: T.v1,    bg: "rgba(167,139,250,0.12)", border: T.vBorder },
                          in_progress:        { label: "Em serviço",   color: T.blue,  bg: T.blueBg,                border: T.blueBorder },
                          pending:            { label: "Pendente",     color: T.amber, bg: T.amberBg,               border: T.amberBorder },
                          paused:             { label: "Pausada",      color: T.muted, bg: T.glass2,                border: T.border },
                          completed:          { label: "Concluída",    color: T.green, bg: T.greenBg,               border: T.greenBorder },
                          skipped:            { label: "Pulada",       color: T.muted, bg: T.glass2,                border: T.border },
                          cancelled:          { label: "Cancelada",    color: T.red,   bg: T.redBg,                 border: T.redBorder },
                        }[topTask.status] ?? { label: "Pendente", color: T.amber, bg: T.amberBg, border: T.amberBorder }
                        : { label: "Limpa",          color: T.green, bg: T.greenBg,               border: T.greenBorder };

                        const assignedNames = topTask?.assignedTo
                          ?.map(id => maids.find(m => m.id === id)?.fullName.split(" ")[0])
                          .filter(Boolean).join(", ");

                        const typeLabels: Record<string, string> = {
                          turnover:            "Faxina de Troca",
                          daily:               "Arrumação",
                          linen_change:        "Troca de Roupa",
                          inspection_checkin:  "Conf. Entrada",
                          inspection_checkout: "Conf. Saída",
                          custom:              "Personalizada",
                        };

                        // Occupancy info
                        const occ = cabinStays[cabin.id];
                        const todayDate = new Date().toISOString().split('T')[0];
                        const checkOutDate = occ?.checkOut?.split('T')[0] ?? occ?.checkOut ?? "";
                        const checkInDate = occ?.checkIn?.split('T')[0] ?? occ?.checkIn ?? "";
                        const isCheckoutToday = checkOutDate === todayDate;
                        const isCheckinToday = checkInDate === todayDate;
                        const arrivalTimePassed = isCheckinToday && !!occ?.expectedArrivalTime && (() => {
                          const [h, m] = occ.expectedArrivalTime!.split(':').map(Number);
                          const now = new Date();
                          return now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m);
                        })();
                        const occLabel = occ
                          ? occ.status === 'active'
                            ? isCheckoutToday
                              ? { text: "Saindo hoje",      color: T.amber }
                              : { text: "Hospedado",        color: T.blue }
                            : isCheckinToday
                              ? arrivalTimePassed
                                ? { text: "Check-in atrasado", color: T.red }
                                : { text: "Check-in hoje",     color: T.green }
                              : { text: "Chegando",            color: T.muted }
                          : null;
                        const fmtDate = (d: string) => {
                          if (!d) return "";
                          const [y, m, day] = (d.split('T')[0]).split('-');
                          return `${day}/${m}/${y}`;
                        };
                        const arrivalStr = occ?.expectedArrivalTime
                          ? occ.expectedArrivalTime.slice(0, 5)
                          : fmtDate(checkInDate);

                        return (
                          <button
                            key={cabin.id}
                            onClick={() => openCabinHistory(cabin)}
                            style={{
                              width: "100%", textAlign: "left", cursor: "pointer", fontFamily: "inherit",
                              background: T.card2, border: `1px solid ${occ ? (isCheckoutToday ? T.amberBorder : isCheckinToday ? T.greenBorder : T.border) : T.border}`, borderRadius: 16,
                              padding: "14px 16px", display: "flex", alignItems: "center", gap: 14,
                              transition: "border-color .15s",
                            }}
                          >
                            {/* Status dot */}
                            <div style={{
                              width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
                              background: statusInfo.color,
                              boxShadow: topTask && ["in_progress", "waiting_conference"].includes(topTask.status)
                                ? `0 0 8px ${statusInfo.color}` : "none",
                            }} />

                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                <span style={{ fontSize: 14, fontWeight: 800, color: T.text }}>{cabin.name || `Cabana ${cabin.number}`}</span>
                                <span style={{
                                  fontSize: 10, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase",
                                  padding: "2px 7px", borderRadius: 999,
                                  color: statusInfo.color, background: statusInfo.bg, border: `1px solid ${statusInfo.border}`,
                                  flexShrink: 0,
                                }}>{statusInfo.label}</span>
                              </div>
                              {topTask && (
                                <div style={{ fontSize: 11, color: T.muted, marginTop: 3, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                  <span>{typeLabels[topTask.type] ?? topTask.type}</span>
                                  {assignedNames && <span>· {assignedNames}</span>}
                                </div>
                              )}
                              {occ && (
                                <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                  {occLabel && (
                                    <span style={{
                                      fontSize: 10, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase",
                                      padding: "2px 7px", borderRadius: 6,
                                      color: occLabel.color,
                                      background: occLabel.color === T.amber ? T.amberBg : occLabel.color === T.blue ? T.blueBg : occLabel.color === T.green ? T.greenBg : occLabel.color === T.red ? T.redBg : T.glass2,
                                    }}>{occLabel.text}</span>
                                  )}
                                  {occ.guestName && (
                                    <span style={{ fontSize: 12, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      {occ.guestName}
                                    </span>
                                  )}
                                  {occ.status === 'active' && checkOutDate && (
                                    <span style={{ fontSize: 11, color: T.muted, marginLeft: "auto" }}>
                                      saída {fmtDate(checkOutDate)}
                                    </span>
                                  )}
                                  {(occ.status === 'pending' || occ.status === 'pre_checkin_done') && (
                                    <span style={{ fontSize: 11, color: T.muted, marginLeft: "auto" }}>
                                      {isCheckinToday && occ.expectedArrivalTime
                                        ? `às ${arrivalStr}`
                                        : `entrada ${fmtDate(checkInDate)}`}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>

                            <I n="chevr" s={16} c={T.muted} />
                          </button>
                        );
                      })}
                  </div>
                )}
              </div>
              <div style={{ height: 100 }} />

              {/* Cabin history sheet */}
              {selectedCabin && (
                <Sheet onClose={() => setSelectedCabin(null)}>
                  <div style={{ padding: "16px 20px 8px", flexShrink: 0, display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 900, color: T.text }}>{selectedCabin.name || `Cabana ${selectedCabin.number}`}</div>
                      <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>Histórico de tarefas</div>
                    </div>
                    <button onClick={() => setSelectedCabin(null)} style={{ background: T.glass2, border: `1px solid ${T.border}`, borderRadius: 10, padding: 8, cursor: "pointer", color: T.muted }}>
                      <I n="x" s={16} />
                    </button>
                  </div>

                  <div className="gov-sheet-body" style={{ padding: "0 16px 24px" }}>
                    {cabinHistoryLoading ? (
                      <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
                        <div style={{ width: 28, height: 28, borderRadius: "50%", border: `2px solid ${T.vBorder}`, borderTopColor: T.v1, animation: "gov-spin 0.8s linear infinite" }} />
                      </div>
                    ) : cabinHistory.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "40px 0", color: T.muted }}>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>Sem histórico</div>
                        <div style={{ fontSize: 12, marginTop: 4 }}>Nenhuma tarefa encontrada para esta cabana.</div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 8 }}>
                        {cabinHistory.map(task => {
                          const typeLabels: Record<string, string> = {
                            turnover:            "Faxina de Troca",
                            daily:               "Arrumação",
                            linen_change:        "Troca de Roupa",
                            inspection_checkin:  "Conf. Entrada",
                            inspection_checkout: "Conf. Saída",
                            custom:              task.customLocation ? `Custom: ${task.customLocation}` : "Personalizada",
                          };
                          const statusMap: Record<string, { label: string; color: string }> = {
                            completed:          { label: "Concluída",   color: T.green },
                            waiting_conference: { label: "Conferência", color: T.v1 },
                            in_progress:        { label: "Em serviço",  color: T.blue },
                            pending:            { label: "Pendente",    color: T.amber },
                            paused:             { label: "Pausada",     color: T.muted },
                            skipped:            { label: "Pulada",      color: T.muted },
                            cancelled:          { label: "Cancelada",   color: T.red },
                          };
                          const st = statusMap[task.status] ?? { label: task.status, color: T.muted };
                          const assignedNames = (task.assignedTo ?? [])
                            .map(id => maids.find(m => m.id === id)?.fullName.split(" ")[0])
                            .filter(Boolean).join(", ");
                          const dateStr = task.createdAt
                            ? new Date(task.createdAt as string).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
                            : "";
                          const timeStr = task.finishedAt
                            ? `Concluída às ${new Date(task.finishedAt as string).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                            : task.startedAt
                            ? `Iniciada às ${new Date(task.startedAt as string).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                            : "";

                          return (
                            <div key={task.id} style={{
                              background: T.card2, border: `1px solid ${T.border}`, borderRadius: 14, padding: "12px 14px",
                            }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                                <span style={{ fontSize: 13, fontWeight: 800, color: T.text }}>{typeLabels[task.type] ?? task.type}</span>
                                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", padding: "2px 7px", borderRadius: 999, color: st.color, background: `${st.color}18`, border: `1px solid ${st.color}33`, flexShrink: 0 }}>{st.label}</span>
                              </div>
                              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                                {dateStr && <span style={{ fontSize: 11, color: T.muted }}>{dateStr}</span>}
                                {timeStr && <span style={{ fontSize: 11, color: T.muted }}>{timeStr}</span>}
                                {assignedNames && <span style={{ fontSize: 11, color: T.muted }}>· {assignedNames}</span>}
                              </div>
                              {task.observations && (
                                <div style={{ fontSize: 12, color: T.muted, marginTop: 6, fontStyle: "italic" }}>&quot;{task.observations}&quot;</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </Sheet>
              )}
            </>
          )}

          {/* Profile view */}
          {screen === "profile" && (
            <ProfileScreen userData={userData} onLogout={handleLogout} />
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
            { id: "profile" as Screen, icon: "user" as IName, label: "Perfil", badge: undefined as number | undefined },
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
        {conferTask && (() => {
          const augmented = { ...conferTask, stayId: conferTask.stayId || (conferTask.cabinId ? cabins[conferTask.cabinId]?.currentStayId : undefined) };
          return (
            <ConferSheet
              task={augmented}
              locationName={getLocationName(conferTask)}
              propertyId={property?.id || ""}
              actorId={userData?.id || ""}
              actorName={userData?.fullName || "Governanta"}
              onClose={() => setConferTask(null)}
              onApprove={(obs, checklist) => handleApprove(conferTask, obs, checklist)}
              onReject={() => handleReject(conferTask)}
              busy={conferBusy}
            />
          );
        })()}
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
        {govMiniTarget && (
          <MinibarSheet
            cabinName={getLocationName(govMiniTarget)}
            items={minibarItems}
            onClose={() => setGovMiniTarget(null)}
            onSend={handleGovMiniSend}
            keyLocation={govMiniTarget.keyLocation ?? "unknown"}
            stayId={govMiniTarget.stayId}
            propertyId={property.id}
            userId={userData?.id || ""}
            userName={userData?.fullName || "Governanta"}
            showToast={showToast}
            taskId={govMiniTarget.id}
            actorLabel="Governanta"
          />
        )}

        {/* ── Toast ───────────────────────────────────────────────────────────── */}
        {toast && <GovToast msg={toast.msg} color={toast.color} />}
      </div>

      {/* ── Cancel Confirm Modal ────────────────────────────────────────────── */}
      {cancelConfirmTask && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 24 }}>
          <div style={{ background: "#111827", border: `1px solid ${T.border2}`, borderRadius: 24, padding: 24, width: "100%", maxWidth: 340, boxShadow: "0 20px 60px rgba(0,0,0,0.7)" }}>
            <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 8, color: T.text }}>Remover esta tarefa?</div>
            <div style={{ fontSize: 13, color: T.muted, marginBottom: 20, lineHeight: 1.5 }}>
              A tarefa de limpeza será marcada como cancelada e removida do quadro.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setCancelConfirmTask(null)}
                style={{ flex: 1, padding: 14, background: T.glass, border: `1px solid ${T.border2}`, borderRadius: 14, cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 700, color: T.muted }}
              >
                Não, manter
              </button>
              <button
                onClick={doCancel}
                disabled={cancelBusy}
                style={{ flex: 1, padding: 14, background: T.redBg, color: T.red, fontFamily: "inherit", fontSize: 14, fontWeight: 800, border: `1px solid ${T.redBorder}`, borderRadius: 14, cursor: cancelBusy ? "wait" : "pointer", opacity: cancelBusy ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
              >
                {cancelBusy ? <I n="loader" s={16} c={T.red} /> : "Sim, remover"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Task Modal ─────────────────────────────────────────────────── */}
      <div className="dark">
        <HousekeepingTaskManagerModal
          isOpen={!!editTask}
          onClose={() => setEditTask(null)}
          propertyId={property.id}
          task={editTask}
          cabins={cabins}
          structures={structures}
          maids={maids}
        />
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
