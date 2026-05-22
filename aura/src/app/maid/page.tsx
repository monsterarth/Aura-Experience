"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import { RoleSwitcher } from "@/components/auth/RoleSwitcher";
import { Sheet } from "@/components/maid/MinibarSheet";
import { HousekeepingService } from "@/services/housekeeping-service";
import { CabinService } from "@/services/cabin-service";
import { ConciergeService } from "@/services/concierge-service";
import { StaffService } from "@/services/staff-service";
import { supabase } from "@/lib/supabase";
import { HousekeepingTask, Cabin, ConciergeItem, ConciergeRequest, Staff } from "@/types/aura";
import { getTaskLabel } from "@/lib/task-ui";
import { resolveEffectiveDaySchedule } from "@/lib/schedule-calculator";
import { ScrapWall } from "@/components/admin/profile/ScrapWall";

type EnrichedTask = HousekeepingTask & { cabinName?: string };
import { useRouter } from "next/navigation";

// ─── CSS injected once ────────────────────────────────────────────────────────

const STYLE = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800;9..40,900&display=swap');
.maid-shell*{box-sizing:border-box;}
.maid-shell{font-family:'DM Sans',-apple-system,BlinkMacSystemFont,sans-serif;}
.maid-scroll{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;}
.maid-scroll::-webkit-scrollbar{display:none;}
.maid-sheet-body{overflow-y:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;flex:1;}
.maid-sheet-body::-webkit-scrollbar{display:none;}
@keyframes maid-pulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.4;transform:scale(.8);}}
@keyframes maid-fadein{from{opacity:0}to{opacity:1}}
@keyframes maid-slideup{from{transform:translateY(100%)}to{transform:translateY(0)}}
@keyframes maid-toast{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes maid-spin{to{transform:rotate(360deg)}}
`;

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
  ledGlow: "rgba(0,212,255,0.5)",
  ledBg: "rgba(0,212,255,0.08)",
  ledBorder: "rgba(0,212,255,0.25)",
  amber: "#f59e0b",
  amberBg: "rgba(245,158,11,0.1)",
  amberBorder: "rgba(245,158,11,0.28)",
  blue: "#60a5fa",
  blueBg: "rgba(96,165,250,0.1)",
  blueBorder: "rgba(96,165,250,0.25)",
  red: "#f87171",
  redBg: "rgba(248,113,113,0.1)",
};

// ─── Utils ────────────────────────────────────────────────────────────────────

function elapsed(iso?: string | null, totalPausedSec = 0): string | null {
  if (!iso) return null;
  const m = Math.floor((Date.now() - new Date(iso).getTime() - totalPausedSec * 1000) / 60000);
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

// ─── GBorder ──────────────────────────────────────────────────────────────────

function GBorder({ children, style = {}, r = 20 }: { children: React.ReactNode; style?: React.CSSProperties; r?: number }) {
  return (
    <div style={{ position: "relative", borderRadius: r, ...style }}>
      <div style={{
        position: "absolute", inset: 0, borderRadius: r, padding: "1px",
        background: T.gradBorder,
        WebkitMask: "linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0)",
        WebkitMaskComposite: "xor", maskComposite: "exclude", pointerEvents: "none",
      }} />
      {children}
    </div>
  );
}

// ─── Pill ─────────────────────────────────────────────────────────────────────

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

// ─── Pulse ────────────────────────────────────────────────────────────────────

function Pulse({ size = 8 }: { size?: number }) {
  return <div style={{ width: size, height: size, borderRadius: "50%", background: T.led, boxShadow: `0 0 8px ${T.ledGlow}`, animation: "maid-pulse 1.5s infinite", flexShrink: 0 }} />;
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ msg, color }: { msg: string; color: string }) {
  return (
    <div style={{
      position: "absolute", bottom: 88, left: 16, right: 16,
      background: "#111827", color: T.text, border: `1px solid ${T.border2}`,
      borderRadius: 16, padding: "14px 16px", fontSize: 13, fontWeight: 600,
      display: "flex", alignItems: "center", gap: 10, zIndex: 200,
      animation: "maid-toast .3s cubic-bezier(.32,.72,0,1)",
      boxShadow: "0 8px 32px rgba(0,0,0,.5)",
    }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, boxShadow: `0 0 8px ${color}`, flexShrink: 0 }} />
      <span>{msg}</span>
    </div>
  );
}

// ─── Icon component (subset) ─────────────────────────────────────────────────

type IName = "home"|"coffee"|"sparkles"|"user"|"key"|"check"|"arrow"|"plus"|"minus"|"x"|"pkg"|"info"|"send"|"logout"|"edit"|"sun"|"clock"|"list"|"chevr"|"loader"|"camera"|"inbox"|"search"|"users"|"cal"|"smile"|"msg";

function I({ n, s = 20, c = "currentColor", w = 1.8 }: { n: IName; s?: number; c?: string; w?: number }) {
  const d: Record<IName, React.ReactNode> = {
    home: <><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/><path d="M9 21V12h6v9"/></>,
    coffee: <><path d="M18 8h1a4 4 0 010 8h-1"/><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></>,
    sparkles: <><path d="M12 3l1.5 3.5L17 8l-3.5 1.5L12 13l-1.5-3.5L7 8l3.5-1.5L12 3z"/><path d="M5 17l.8 1.8L7.5 19.5l-1.7.7L5 22l-.8-1.7L2.5 19.5l1.7-.7L5 17z"/></>,
    user: <><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
    key: <><circle cx="7.5" cy="15.5" r="5.5"/><path d="M21 2l-9.6 9.6M15.5 7.5l3 3L21 8l-3-3"/></>,
    check: <polyline points="20 6 9 17 4 12"/>,
    arrow: <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>,
    plus: <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    minus: <line x1="5" y1="12" x2="19" y2="12"/>,
    x: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    pkg: <><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></>,
    info: <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>,
    send: <><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>,
    logout: <><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>,
    edit: <><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></>,
    sun: <><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/></>,
    clock: <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    list: <><rect x="3" y="5" width="18" height="2" rx="1"/><rect x="3" y="11" width="18" height="2" rx="1"/><rect x="3" y="17" width="12" height="2" rx="1"/></>,
    chevr: <polyline points="9 18 15 12 9 6"/>,
    loader: <><path d="M21 12a9 9 0 11-6.219-8.56"/></>,
    camera: <><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></>,
    inbox: <><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></>,
    search: <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
    users: <><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></>,
    cal: <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
    smile: <><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></>,
    msg: <><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></>,
  };
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round">
      {d[n]}
    </svg>
  );
}


// ─── Replenish Sheet ──────────────────────────────────────────────────────────

function ReplenishSheet({
  cabinName, maidItems, loading: loadingItems, onClose, onSend,
}: {
  cabinName: string;
  maidItems: ConciergeItem[];
  loading: boolean;
  onClose: () => void;
  onSend: (items: { itemId: string; qty: number }[]) => Promise<void>;
}) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [activeGroup, setActiveGroup] = useState<string | null>(null);

  const adj = (id: string, d: number) =>
    setCart(p => { const n = { ...p }, v = Math.max(0, (p[id] ?? 0) + d); if (!v) delete n[id]; else n[id] = v; return n; });

  const count = Object.values(cart).reduce((a, b) => a + b, 0);

  const submit = async () => {
    setBusy(true);
    const entries = Object.entries(cart).filter(([, q]) => q > 0).map(([itemId, qty]) => ({ itemId, qty }));
    await onSend(entries);
    onClose();
  };

  // Build ordered group list from items
  const groups = React.useMemo(() => {
    const seen = new Map<string, { id: string; name: string; icon?: string; color?: string; order?: number }>();
    for (const item of maidItems) {
      if (item.group && !seen.has(item.group.id)) seen.set(item.group.id, item.group);
    }
    return Array.from(seen.values()).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [maidItems]);

  const filtered = React.useMemo(() => {
    let items = maidItems;
    if (activeGroup) items = items.filter(i => i.groupId === activeGroup);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(i => i.name.toLowerCase().includes(q));
    }
    return items;
  }, [maidItems, activeGroup, search]);

  return (
    <Sheet onClose={onClose}>
      {/* Header */}
      <div style={{ padding: "4px 16px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900 }}>{cabinName}</div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 3 }}>Solicitar reposição</div>
        </div>
        <button onClick={onClose} style={{ background: T.glass2, border: `1px solid ${T.border2}`, borderRadius: 12, padding: "10px 12px", cursor: "pointer", color: T.text, display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700 }}>
          <I n="x" s={15} /> Fechar
        </button>
      </div>

      {/* Search + group filters */}
      {!loadingItems && maidItems.length > 0 && (
        <div style={{ padding: "0 16px 12px", flexShrink: 0 }}>
          {/* Search */}
          <div style={{ position: "relative", marginBottom: 10 }}>
            <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: T.muted }}>
              <I n="search" s={15} />
            </div>
            <input
              type="text"
              placeholder="Buscar item..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: "100%", padding: "10px 12px 10px 36px",
                background: T.glass2, border: `1px solid ${T.border2}`,
                borderRadius: 12, color: T.text, fontSize: 14, fontFamily: "inherit",
                outline: "none", boxSizing: "border-box",
              }}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: T.muted, padding: 4 }}
              >
                <I n="x" s={13} />
              </button>
            )}
          </div>

          {/* Group chips */}
          {groups.length > 0 && (
            <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2, scrollbarWidth: "none" }}>
              <button
                onClick={() => setActiveGroup(null)}
                style={{
                  flexShrink: 0, padding: "6px 14px", borderRadius: 999, fontSize: 12, fontWeight: 700,
                  border: `1px solid ${activeGroup === null ? T.g1 : T.border}`,
                  background: activeGroup === null ? "rgba(155,109,255,0.18)" : T.glass,
                  color: activeGroup === null ? T.g1 : T.muted,
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                Todos
              </button>
              {groups.map(g => {
                const active = activeGroup === g.id;
                const emoji = g.icon && !g.icon.startsWith("http") ? g.icon : undefined;
                const groupColor = g.color ?? T.g1;
                return (
                  <button
                    key={g.id}
                    onClick={() => setActiveGroup(active ? null : g.id)}
                    style={{
                      flexShrink: 0, padding: "6px 14px", borderRadius: 999, fontSize: 12, fontWeight: 700,
                      border: `1px solid ${active ? groupColor : T.border}`,
                      background: active ? `${groupColor}25` : T.glass,
                      color: active ? groupColor : T.muted,
                      cursor: "pointer", fontFamily: "inherit",
                      display: "flex", alignItems: "center", gap: 5,
                    }}
                  >
                    {emoji && <span style={{ fontSize: 13 }}>{emoji}</span>}
                    {g.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="maid-sheet-body" style={{ padding: "0 16px" }}>
        {loadingItems ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
            <I n="loader" s={24} c={T.amber} w={2} />
          </div>
        ) : maidItems.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", fontSize: 13, color: T.muted }}>
            Nenhum item de reposição configurado.<br />
            <span style={{ opacity: 0.6, fontSize: 11 }}>Configure em Catálogo Concierge → Disponível para Camareira.</span>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", fontSize: 13, color: T.muted }}>
            Nenhum item encontrado.
          </div>
        ) : (
          filtered.map(item => {
            const q = cart[item.id] ?? 0;
            const emoji = item.image_url?.startsWith("emoji:") ? item.image_url.slice(6) : undefined;
            return (
              <div key={item.id} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "11px 12px",
                borderRadius: 14, borderBottom: `1px solid ${T.border}`,
                background: q > 0 ? "rgba(245,158,11,0.08)" : "transparent", transition: "background .15s",
              }}>
                {emoji && <span style={{ fontSize: 18, flexShrink: 0 }}>{emoji}</span>}
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

// ─── Task Detail Sheet ────────────────────────────────────────────────────────

type ChecklistItem = { id: string; label: string; checked: boolean; source?: "global" | "cabin" | "stay" };

function TaskSheet({
  task, onClose, onToggle, showToast,
  propertyId, userId, userName, onChecklistLoaded,
}: {
  task: EnrichedTask;
  onClose: () => void;
  onToggle: (taskId: string, itemId: string) => void;
  showToast: (msg: string, color?: string) => void;
  propertyId: string;
  userId: string;
  userName: string;
  onChecklistLoaded: (taskId: string, checklist: ChecklistItem[]) => void;
}) {
  const [showRep, setShowRep] = useState(false);
  const [maidItems, setMaidItems] = useState<ConciergeItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [loadingChecklist, setLoadingChecklist] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [upgrading, setUpgrading] = useState(false);

  useEffect(() => {
    if (task.checklist.length > 0) return;
    let cancelled = false;

    const loadChecklist = async () => {
      setLoadingChecklist(true);
      try {
        const items: ChecklistItem[] = [];

        const templates = await HousekeepingService.getChecklistTemplates(propertyId);
        const tpl = templates.find((t: any) => t.type === task.type);
        if (tpl?.items) {
          items.push(...tpl.items.map((i: any) => ({ id: i.id, label: i.label, checked: false, source: "global" as const })));
        }

        if (task.cabinId) {
          const { data: cabinData } = await supabase.from("cabins").select("housekeepingItems").eq("id", task.cabinId).single();
          if (cabinData?.housekeepingItems?.length) {
            items.push(...cabinData.housekeepingItems.map((i: any) => ({ id: i.id, label: i.label, checked: false, source: "cabin" as const })));
          }
        }

        if (task.stayId && !task.stayId.includes("MOCK")) {
          const { data: stayData } = await supabase.from("stays").select("housekeepingItems").eq("id", task.stayId).single();
          if (stayData?.housekeepingItems?.length) {
            items.push(...stayData.housekeepingItems.map((i: any) => ({ id: i.id, label: i.label, checked: false, source: "stay" as const })));
          }
        }

        if (items.length === 0) {
          items.push({ id: "default", label: "Limpeza padrão concluída", checked: false, source: "global" });
        }

        if (!cancelled) {
          await supabase.from("housekeeping_tasks").update({ checklist: items, updatedAt: new Date().toISOString() }).eq("id", task.id);
          onChecklistLoaded(task.id, items);
        }
      } finally {
        if (!cancelled) setLoadingChecklist(false);
      }
    };

    loadChecklist();
    return () => { cancelled = true; };
  }, [task.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const openRep = async () => {
    setShowRep(true);
    if (maidItems.length > 0) return;
    setLoadingItems(true);
    try { setMaidItems(await ConciergeService.getConciergeItemsForMaid(propertyId)); }
    finally { setLoadingItems(false); }
  };

  const handleFinish = async () => {
    setFinishing(true);
    try {
      await HousekeepingService.finishTask(propertyId, task.id, task.checklist, "", userId, userName);
      onClose();
    } catch (e: any) {
      if (e?.message === "CHECKLIST_INCOMPLETE") showToast("Marque ao menos um item antes de finalizar.", T.amber);
      else showToast("Erro ao finalizar.", T.red);
    } finally {
      setFinishing(false);
      setShowConfirm(false);
    }
  };

  const handlePause = async () => {
    setPausing(true);
    try {
      await HousekeepingService.pauseTask(propertyId, task.id, userId, userName);
      onClose();
    } catch { showToast("Erro ao pausar tarefa.", T.red); }
    finally { setPausing(false); }
  };

  const handleSendRep = async (entries: { itemId: string; qty: number }[]) => {
    try {
      await Promise.all(entries.map(({ itemId, qty }) =>
        ConciergeService.createRequest(
          { propertyId, stayId: task.stayId, cabinId: task.cabinId, itemId, quantity: qty, requestedBy: "maid", notes: "Solicitado pela camareira" },
          userId, userName
        )
      ));
      showToast(`${entries.length} solicitação(ões) enviada(s)!`);
    } catch { showToast("Erro ao enviar solicitação.", T.red); }
  };

  const handleUpgrade = async () => {
    setUpgrading(true);
    try {
      await HousekeepingService.upgradeToLinenChange(propertyId, task.id, userId, userName);
      showToast("Convertido para Troca de Roupa!");
      onClose();
    } catch { showToast("Erro ao converter tarefa.", T.red); }
    finally { setUpgrading(false); }
  };

  const done = task.checklist.filter(c => c.checked).length;
  const pct = Math.round(done / Math.max(task.checklist.length, 1) * 100);
  const C = 2 * Math.PI * 22;

  return (
    <>
      <Sheet onClose={onClose}>
        <div style={{ padding: "0 20px 14px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{task.cabinName || "Cabana"}</div>
              <div style={{ fontSize: 12, color: T.muted, marginTop: 3 }}>
                {getTaskLabel(task.type)}
              </div>
            </div>
            <button onClick={onClose} style={{ background: T.glass2, border: `1px solid ${T.border}`, borderRadius: 10, padding: 8, cursor: "pointer", color: T.muted }}>
              <I n="x" s={15} />
            </button>
          </div>

          {/* Progress ring + key */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14, background: T.glass, borderRadius: 16, padding: "12px 14px", border: `1px solid ${T.border}` }}>
            <div style={{ position: "relative", width: 52, height: 52, flexShrink: 0 }}>
              <svg width="52" height="52" viewBox="0 0 52 52" style={{ transform: "rotate(-90deg)" }}>
                <circle cx="26" cy="26" r="22" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="4" />
                <circle cx="26" cy="26" r="22" fill="none"
                  stroke={pct === 100 ? T.green : "url(#pg-ring)"}
                  strokeWidth="4" strokeDasharray={C}
                  strokeDashoffset={C * (1 - pct / 100)} strokeLinecap="round" />
                <defs>
                  <linearGradient id="pg-ring" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor={T.g1} /><stop offset="100%" stopColor={T.g2} />
                  </linearGradient>
                </defs>
              </svg>
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900, color: pct === 100 ? T.green : T.text }}>{pct}%</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{done}/{task.checklist.length} itens</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
                <Pill
                  color={task.keyLocation === "reception" ? T.green : T.amber}
                  bg={task.keyLocation === "reception" ? T.greenBg : T.amberBg}
                  border={task.keyLocation === "reception" ? T.greenBorder : T.amberBorder}
                >
                  <I n="key" s={9} />
                  {task.keyLocation === "reception" ? "Chave: Recepção" : task.keyLocation === "cabin" ? "Chave: Cabana" : "Verificar chave"}
                </Pill>
                {task.status === "in_progress" && task.startedAt && (
                  <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: T.green }}>
                    <I n="clock" s={11} c={T.green} /> {elapsed(task.startedAt as string, task.totalPausedDuration)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {task.observations && (
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", background: T.amberBg, border: `1px solid ${T.amberBorder}`, borderRadius: 14, padding: "12px 14px", marginBottom: 12 }}>
              <I n="info" s={15} c={T.amber} />
              <span style={{ fontSize: 13, color: T.amber, fontWeight: 600 }}>{task.observations}</span>
            </div>
          )}
        </div>

        <div className="maid-sheet-body" style={{ padding: "0 16px" }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: T.muted, marginBottom: 10 }}>
            Checklist de limpeza
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
            {loadingChecklist ? (
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "32px 0", gap: 10, color: T.muted }}>
                <I n="loader" s={20} c={T.g1} w={2} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>Carregando checklist...</span>
              </div>
            ) : task.checklist.map(item => {
              const src = (item as ChecklistItem).source;
              return (
                <div
                  key={item.id}
                  onClick={() => onToggle(task.id, item.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 14, padding: 14, borderRadius: 14,
                    border: `1px solid ${item.checked ? T.greenBorder : T.border}`,
                    background: item.checked ? T.greenBg : T.glass,
                    cursor: "pointer", transition: "all .15s", userSelect: "none",
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
                  {src === "cabin" && (
                    <span style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", background: "rgba(245,158,11,0.12)", color: T.amber, padding: "2px 6px", borderRadius: 6, letterSpacing: "0.06em" }}>Cabana</span>
                  )}
                  {src === "stay" && (
                    <span style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", background: "rgba(96,165,250,0.12)", color: T.blue, padding: "2px 6px", borderRadius: 6, letterSpacing: "0.06em" }}>Hóspede</span>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ height: 16 }} />
        </div>

        {/* Fixed footer */}
        <div style={{ padding: "12px 16px", borderTop: `1px solid ${T.border}`, background: "#0d1020", flexShrink: 0 }}>
          {(task.type === "daily" || task.type === "linen_change") && task.status !== "completed" && task.status !== "waiting_conference" && (
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <button onClick={openRep} style={{ flex: "0 0 auto", padding: "11px 14px", background: T.glass, border: `1px solid ${T.amberBorder}`, borderRadius: 14, cursor: "pointer", color: T.amber, display: "flex", alignItems: "center", gap: 7, fontFamily: "inherit", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" as const }}>
                <I n="pkg" s={15} c={T.amber} />
                Reposição
              </button>
              {task.type === "daily" && (
                <button
                  onClick={handleUpgrade}
                  disabled={upgrading}
                  style={{ flex: 1, padding: "11px 14px", background: "rgba(45,212,191,0.1)", border: `1px solid rgba(45,212,191,0.3)`, borderRadius: 14, cursor: upgrading ? "wait" : "pointer", color: T.green, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, fontFamily: "inherit", fontSize: 12, fontWeight: 800, textTransform: "uppercase" as const, opacity: upgrading ? 0.5 : 1 }}
                >
                  <I n="sun" s={15} c={T.green} />
                  Troca de Roupa
                </button>
              )}
            </div>
          )}
          {!(task.type === "daily" || task.type === "linen_change") && task.status !== "completed" && task.status !== "waiting_conference" && (
            <div style={{ marginBottom: 8 }}>
              <button onClick={openRep} style={{ padding: "11px 14px", background: T.glass, border: `1px solid ${T.amberBorder}`, borderRadius: 14, cursor: "pointer", color: T.amber, display: "flex", alignItems: "center", gap: 7, fontFamily: "inherit", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" as const }}>
                <I n="pkg" s={15} c={T.amber} />
                Reposição
              </button>
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            {task.status === "in_progress" && (
              <button
                onClick={handlePause}
                disabled={pausing}
                style={{ flex: "0 0 auto", padding: "14px 16px", background: T.glass, border: `1px solid ${T.amberBorder}`, borderRadius: 16, cursor: pausing ? "wait" : "pointer", color: T.amber, display: "flex", alignItems: "center", gap: 7, fontFamily: "inherit", fontSize: 13, fontWeight: 700, opacity: pausing ? 0.5 : 1 }}
              >
                {pausing ? <I n="loader" s={16} c={T.amber} w={2} /> : <I n="clock" s={16} c={T.amber} />}
                Pausar
              </button>
            )}
            <button
              onClick={() => setShowConfirm(true)}
              style={{ flex: 1, padding: 14, background: T.greenG, color: "#021a17", fontFamily: "inherit", fontSize: 14, fontWeight: 800, letterSpacing: "0.03em", textTransform: "uppercase" as const, border: "none", borderRadius: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 4px 20px rgba(45,212,191,0.3)" }}
            >
              <I n="check" s={17} c="#021a17" w={2.5} /> Finalizar
            </button>
          </div>
        </div>
      </Sheet>

      {/* Confirm modal */}
      {showConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 24 }}>
          <div style={{ background: "#111827", border: `1px solid ${T.border2}`, borderRadius: 24, padding: 24, width: "100%", maxWidth: 340, boxShadow: "0 20px 60px rgba(0,0,0,0.7)" }}>
            <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 6 }}>Finalizar esta faxina?</div>
            <div style={{ fontSize: 13, color: T.muted, marginBottom: 20 }}>
              {task.checklist.filter(c => c.checked).length}/{task.checklist.length} itens concluídos
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowConfirm(false)} style={{ flex: 1, padding: 14, background: T.glass, border: `1px solid ${T.border}`, borderRadius: 14, cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 700, color: T.muted }}>
                Cancelar
              </button>
              <button onClick={handleFinish} disabled={finishing} style={{ flex: 1, padding: 14, background: T.greenG, color: "#021a17", fontFamily: "inherit", fontSize: 14, fontWeight: 800, border: "none", borderRadius: 14, cursor: finishing ? "wait" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                {finishing ? <I n="loader" s={17} c="#021a17" w={2} /> : <><I n="check" s={17} c="#021a17" w={2.5} /> Confirmar</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRep && (
        <ReplenishSheet
          cabinName={task.cabinName || "Cabana"}
          maidItems={maidItems}
          loading={loadingItems}
          onClose={() => setShowRep(false)}
          onSend={handleSendRep}
        />
      )}
    </>
  );
}

// ─── Home screen ──────────────────────────────────────────────────────────────

function HomeScreen({
  tasks, cabins, onNav, userName,
}: {
  tasks: EnrichedTask[];
  cabins: Record<string, Cabin>;
  onNav: (t: "home" | "tasks" | "profile") => void;
  userName: string;
}) {
  const inProg = tasks.filter(t => t.status === "in_progress");
  const all = Object.values(cabins);

  return (
    <div className="maid-scroll" style={{ padding: "0 16px 20px" }}>
      <div style={{ padding: "10px 0 20px" }}>
        <div style={{ fontSize: 13, color: T.muted, fontWeight: 500, marginBottom: 4 }}>{greeting()},</div>
        <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: "-0.5px", lineHeight: 1.1 }}>
          <span style={{ background: T.grad, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            {userName.split(" ")[0]}
          </span>
          {" "}👋
        </div>
        <div style={{ fontSize: 12, color: T.muted, marginTop: 6 }}>{todayLabel()}</div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8, marginBottom: 20 }}>
        {[
          { label: "Ocupadas", val: all.filter(c => c.status === "occupied").length, color: T.blue, bg: T.blueBg, border: T.blueBorder },
          { label: "Livres", val: all.filter(c => c.status === "available").length, color: T.green, bg: T.greenBg, border: T.greenBorder },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 18, padding: "14px 10px", textAlign: "center" }}>
            <div style={{ fontSize: 34, fontWeight: 900, color: s.color, lineHeight: 1, textShadow: `0 0 24px ${s.color}55` }}>{s.val}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: s.color, marginTop: 5, opacity: 0.75, textTransform: "uppercase" as const, letterSpacing: ".05em" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Active task */}
      {inProg.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: T.muted, marginBottom: 10 }}>Em andamento agora</div>
          {inProg.map(t => {
            const done = t.checklist.filter(c => c.checked).length;
            const pct = Math.round(done / Math.max(t.checklist.length, 1) * 100);
            return (
              <GBorder key={t.id} style={{ marginBottom: 8 }}>
                <button onClick={() => onNav("tasks")} style={{ width: "100%", textAlign: "left", border: "none", cursor: "pointer", background: "rgba(155,109,255,0.07)", borderRadius: 20, padding: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <Pulse />
                    <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: ".06em", color: T.green }}>Limpando agora</span>
                    {t.startedAt && <span style={{ marginLeft: "auto", fontSize: 12, color: T.green, fontWeight: 700 }}>{elapsed(t.startedAt as string, t.totalPausedDuration)}</span>}
                  </div>
                  <div style={{ fontSize: 26, fontWeight: 900, marginBottom: 4 }}>{t.cabinName || "Cabana"}</div>
                  <div style={{ fontSize: 12, color: T.muted, marginBottom: 10 }}>{done}/{t.checklist.length} itens</div>
                  <div style={{ height: 6, borderRadius: 6, background: "rgba(255,255,255,0.07)" }}>
                    <div style={{ height: "100%", borderRadius: 6, background: T.grad, width: `${pct}%`, transition: "width .4s ease" }} />
                  </div>
                </button>
              </GBorder>
            );
          })}
        </div>
      )}

      {/* My tasks list */}
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: T.muted, marginBottom: 10 }}>Minhas faxinas de hoje</div>
      {tasks.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: T.muted }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Nenhuma faxina atribuída</div>
        </div>
      ) : tasks.map(t => (
        <button key={t.id} onClick={() => onNav("tasks")} style={{ width: "100%", textAlign: "left", cursor: "pointer", background: T.glass, border: `1px solid ${T.border}`, borderRadius: 16, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", flexShrink: 0, background: t.status === "in_progress" ? T.led : t.status === "waiting_conference" ? T.amber : T.border2, boxShadow: t.status === "in_progress" ? `0 0 8px ${T.ledGlow}` : "none" }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{t.cabinName || "Cabana"}</div>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 1 }}>{getTaskLabel(t.type)}</div>
          </div>
          <Pill
            color={t.status === "in_progress" ? T.green : t.status === "waiting_conference" ? T.amber : T.muted}
            bg={t.status === "in_progress" ? T.greenBg : t.status === "waiting_conference" ? T.amberBg : "rgba(255,255,255,0.06)"}
            border={t.status === "in_progress" ? T.greenBorder : t.status === "waiting_conference" ? T.amberBorder : T.border}
          >
            {t.status === "in_progress" ? "Ativa" : t.status === "waiting_conference" ? "Aguarda" : "Pendente"}
          </Pill>
        </button>
      ))}
    </div>
  );
}

// ─── Faxinas screen ───────────────────────────────────────────────────────────

function FaxinasScreen({
  tasks, onStart, showToast, onToggle,
  propertyId, userId, userName, onChecklistLoaded, repRequests,
}: {
  tasks: EnrichedTask[];
  onStart: (id: string) => void;
  showToast: (m: string, c?: string) => void;
  onToggle: (tid: string, cid: string) => void;
  propertyId: string; userId: string; userName: string;
  onChecklistLoaded: (taskId: string, checklist: ChecklistItem[]) => void;
  repRequests: ConciergeRequest[];
}) {
  const [detail, setDetail] = useState<string | null>(null);

  const inProg = tasks.filter(t => t.status === "in_progress");
  const pending = tasks.filter(t => t.status === "pending");
  const waiting = tasks.filter(t => t.status === "waiting_conference");
  const fullTask = detail ? tasks.find(t => t.id === detail) ?? null : null;

  return (
    <>
      <div className="maid-scroll" style={{ padding: "0 16px 20px" }}>
        <div style={{ padding: "10px 0 20px" }}>
          <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.3px" }}>Minhas Faxinas</div>
          <div style={{ fontSize: 13, color: T.muted, marginTop: 5 }}>{tasks.length} atribuída(s) hoje</div>
        </div>

        {/* In progress */}
        {inProg.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: T.muted, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
              <Pulse size={6} /> Em andamento
            </div>
            {inProg.map(t => {
              const done = t.checklist.filter(c => c.checked).length;
              const pct = Math.round(done / Math.max(t.checklist.length, 1) * 100);
              const taskReps = repRequests
                .filter(r => r.cabinId === t.cabinId)
                .sort((a, b) => (a.status === 'in_progress' ? -1 : 1) - (b.status === 'in_progress' ? -1 : 1));
              return (
                <GBorder key={t.id} style={{ marginBottom: 10 }}>
                  <div style={{ background: "rgba(45,212,191,0.05)", borderRadius: 20, padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 26, fontWeight: 900, color: T.green, textShadow: "0 0 24px rgba(45,212,191,0.4)" }}>{t.cabinName || "Cabana"}</div>
                        <div style={{ fontSize: 12, color: T.green, opacity: 0.65, marginTop: 2 }}>{getTaskLabel(t.type)}</div>
                      </div>
                      <div style={{ textAlign: "right" as const }}>
                        <div style={{ fontSize: 13, fontWeight: 900, color: T.green }}>{elapsed(t.startedAt as string, t.totalPausedDuration)}</div>
                        <div style={{ fontSize: 11, color: T.green, opacity: 0.6, marginTop: 2 }}>{done}/{t.checklist.length} ✓</div>
                      </div>
                    </div>
                    <div style={{ height: 6, borderRadius: 6, background: "rgba(255,255,255,0.07)", marginBottom: taskReps.length > 0 ? 12 : 14 }}>
                      <div style={{ height: "100%", borderRadius: 6, background: T.greenG, width: `${pct}%`, transition: "width .4s ease" }} />
                    </div>
                    {taskReps.length > 0 && (
                      <div style={{ borderTop: `1px solid rgba(255,255,255,0.07)`, paddingTop: 10, marginBottom: 12 }}>
                        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase" as const, color: T.muted, marginBottom: 7, display: "flex", alignItems: "center", gap: 5 }}>
                          <I n="pkg" s={11} c={T.muted} /> Reposição
                        </div>
                        {taskReps.map(r => {
                          const isOnWay = r.status === 'in_progress';
                          const color = isOnWay ? T.blue : T.amber;
                          const bg = isOnWay ? T.blueBg : T.amberBg;
                          const border = isOnWay ? T.blueBorder : T.amberBorder;
                          const itemLabel = r.item?.name ?? "Item";
                          const statusLabel = isOnWay ? `${r.assignedName ?? 'Houseman'} a caminho` : "Aguardando houseman...";
                          return (
                            <div key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "6px 10px", borderRadius: 10, background: bg, border: `1px solid ${border}`, marginBottom: 5 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                                <I n={isOnWay ? "arrow" : "clock"} s={12} c={color} />
                                <span style={{ fontSize: 12, fontWeight: 700, color, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {itemLabel} ×{r.quantity}
                                </span>
                              </div>
                              <span style={{ fontSize: 11, color, opacity: 0.85, whiteSpace: "nowrap", flexShrink: 0 }}>{statusLabel}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
                      <button onClick={() => setDetail(t.id)} style={{ padding: 16, background: T.greenG, color: "#021a17", fontFamily: "inherit", fontSize: 14, fontWeight: 800, letterSpacing: "0.03em", textTransform: "uppercase" as const, border: "none", borderRadius: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 4px 20px rgba(45,212,191,0.3)" }}>
                        <I n="list" s={17} /> Ver Checklist
                      </button>
                    </div>
                  </div>
                </GBorder>
              );
            })}
          </div>
        )}

        {/* Pending */}
        {pending.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: T.muted, marginBottom: 10 }}>Para fazer</div>
            {pending.map(t => (
              <div key={t.id} style={{ background: T.glass, border: `1px solid ${T.border}`, borderRadius: 20, marginBottom: 10, padding: 16 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 900 }}>{t.cabinName || "Cabana"}</div>
                    <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{getTaskLabel(t.type)}</div>
                  </div>
                  <Pill
                    color={t.keyLocation === "reception" ? T.green : T.muted}
                    bg={t.keyLocation === "reception" ? T.greenBg : "rgba(255,255,255,0.06)"}
                    border={t.keyLocation === "reception" ? T.greenBorder : T.border}
                  >
                    <I n="key" s={9} />
                    {t.keyLocation === "reception" ? "Recepção" : "Cabana"}
                  </Pill>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 4, marginBottom: t.observations ? 10 : 14 }}>
                  {t.checklist.slice(0, 3).map(c => (
                    <span key={c.id} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: T.glass3, color: T.muted, border: `1px solid ${T.border}` }}>{c.label}</span>
                  ))}
                  {t.checklist.length > 3 && <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: T.glass3, color: T.muted, border: `1px solid ${T.border}` }}>+{t.checklist.length - 3} itens</span>}
                </div>
                {t.observations && (
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: T.amberBg, border: `1px solid ${T.amberBorder}`, borderRadius: 12, padding: "10px 12px", marginBottom: 14 }}>
                    <I n="info" s={14} c={T.amber} />
                    <span style={{ fontSize: 13, color: T.amber, lineHeight: 1.45, fontWeight: 600 }}>{t.observations}</span>
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
                  <button onClick={() => onStart(t.id)} style={{ padding: 16, background: T.grad, color: "#fff", fontFamily: "inherit", fontSize: 14, fontWeight: 800, letterSpacing: "0.03em", textTransform: "uppercase" as const, border: "none", borderRadius: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 4px 20px rgba(155,109,255,0.35)" }}>
                    {t.startedAt ? "Retomar" : "Iniciar"} <I n="arrow" s={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Waiting */}
        {waiting.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: T.amber, marginBottom: 10 }}>Aguardando governanta</div>
            {waiting.map(t => (
              <div key={t.id} style={{ background: T.glass, border: `1px solid ${T.border}`, borderRadius: 16, marginBottom: 10, padding: "14px 16px", opacity: 0.7, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: T.amber }}>{t.cabinName || "Cabana"}</div>
                  <div style={{ fontSize: 12, color: T.amber, opacity: 0.7, marginTop: 2 }}>Aguardando aprovação</div>
                </div>
                <I n="check" s={28} c={T.amber} />
              </div>
            ))}
          </div>
        )}

        {tasks.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: 48 }}>✨</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 12 }}>Quadro limpo!</div>
            <div style={{ fontSize: 13, color: T.muted, marginTop: 6 }}>Nenhuma faxina pendente.</div>
          </div>
        )}
      </div>

      {fullTask && (
        <TaskSheet
          task={fullTask} onClose={() => setDetail(null)} onToggle={onToggle}
          showToast={showToast} propertyId={propertyId} userId={userId} userName={userName}
          onChecklistLoaded={onChecklistLoaded}
        />
      )}
    </>
  );
}

// ─── Role metadata ────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  governance: "#c084fc", reception: "#2dd4bf", maid: "#4ec9d4",
  technician: "#f59e0b", houseman: "#a3e635", manager: "#9b6dff",
  super_admin: "#9b6dff", admin: "#9b6dff", marketing: "#f472b6",
  porter: "#60a5fa", kitchen: "#fb923c", waiter: "#34d399",
};

const ROLE_LABELS: Record<string, string> = {
  governance: "Governança", reception: "Recepção", maid: "Camareira",
  technician: "Manutenção", houseman: "Houseman", manager: "Gerente",
  super_admin: "Super Admin", admin: "Admin", marketing: "Marketing",
  porter: "Porteiro", kitchen: "Cozinha", waiter: "Garçom",
};

// ─── Profile screen ───────────────────────────────────────────────────────────

function tenure(iso?: string | null): string | null {
  if (!iso) return null;
  const months = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24 * 30.44));
  if (months < 1) return "menos de 1 mês";
  if (months < 12) return `${months} ${months === 1 ? "mês" : "meses"}`;
  const y = Math.floor(months / 12), m = months % 12;
  return m > 0 ? `${y} ${y === 1 ? "ano" : "anos"} e ${m} ${m === 1 ? "mês" : "meses"}` : `${y} ${y === 1 ? "ano" : "anos"}`;
}

type WeekDay = { dow: string; date: number; month: number; work: boolean; time?: string; today: boolean };

function getWeekDays(today: Date): WeekDay[] {
  const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon...
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));
  const DOW_LABELS = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"];
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return {
      dow: DOW_LABELS[i],
      date: d.getDate(),
      month: d.getMonth(),
      work: false,
      today: d.toDateString() === today.toDateString(),
    };
  });
}

function ProfileScreen({
  userData, showToast, onLogout, propertyId,
}: {
  userData: any;
  showToast: (m: string, c?: string) => void;
  onLogout: () => void;
  propertyId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(userData?.fullName || "Camareira");
  const [todayShift, setTodayShift] = useState<string | null>(null);
  const [weekDays, setWeekDays] = useState<WeekDay[]>([]);
  const [teamMembers, setTeamMembers] = useState<Staff[]>([]);
  const initials = name.split(" ").slice(0, 2).map((w: string) => w[0] ?? "").join("").toUpperCase();
  const photo: string | undefined = userData?.profilePictureUrl;
  const tenureStr = tenure(userData?.hireDate);

  useEffect(() => {
    if (!userData?.id) return;
    const today = new Date();
    const from = today.toISOString().split('T')[0];
    // Compute week range for overrides
    const dayOfWeek = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const weekFrom = monday.toISOString().split('T')[0];
    const weekTo = sunday.toISOString().split('T')[0];

    Promise.all([
      fetch(`/api/admin/staff/schedules?staffId=${userData.id}`).then(r => r.json()),
      fetch(`/api/admin/staff/schedule-overrides?staffId=${userData.id}&from=${weekFrom}&to=${weekTo}`).then(r => r.json()),
      fetch(`/api/admin/staff/schedule-checkpoints?staffId=${userData.id}`).then(r => r.json()),
    ]).then(([schedules, overrides, checkpoints]) => {
      const sch = Array.isArray(schedules) ? schedules : [];
      const ov = Array.isArray(overrides) ? overrides : [];
      const cp = Array.isArray(checkpoints) ? checkpoints : [];

      // Today's shift
      const todayResult = resolveEffectiveDaySchedule(userData, sch, ov, today, cp);
      if (!todayResult.isWork) { setTodayShift("Folga"); }
      else if (todayResult.startTime) setTodayShift(`${todayResult.startTime} às ${todayResult.endTime ?? ""}`);

      // Weekly grid
      const days = getWeekDays(today).map(d => {
        const dayDate = new Date(today.getFullYear(), d.month, d.date);
        const result = resolveEffectiveDaySchedule(userData, sch, ov, dayDate, cp);
        return { ...d, work: result.isWork, time: result.startTime ?? undefined };
      });
      setWeekDays(days);
    }).catch(() => {});
  }, [userData?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!propertyId) return;
    StaffService.getStaffByProperty(propertyId)
      .then(staff => setTeamMembers(staff.filter(s => s.active)))
      .catch(() => {});
  }, [propertyId]);

  return (
    <div className="maid-scroll" style={{ padding: "0 16px 24px" }}>
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
              {editing ? (
                <input value={name} onChange={e => setName(e.target.value)} style={{ background: T.glass2, border: `1px solid ${T.border2}`, borderRadius: 10, padding: "8px 12px", color: T.text, fontSize: 17, fontWeight: 800, fontFamily: "inherit", width: "100%" }} />
              ) : (
                <div style={{ fontSize: 20, fontWeight: 900 }}>{name}</div>
              )}
              <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>Camareira</div>
              {tenureStr && <div style={{ fontSize: 11, color: T.muted2, marginTop: 1 }}>Aqui há {tenureStr}</div>}
              <div style={{ marginTop: 5 }}><Pill color={T.green} bg={T.greenBg} border={T.greenBorder}>Ativa hoje</Pill></div>
            </div>
            <button onClick={() => { if (editing) showToast("Perfil salvo!"); setEditing(e => !e); }} style={{ background: T.glass2, border: `1px solid ${T.border}`, borderRadius: 12, padding: 10, cursor: "pointer", color: T.muted }}>
              <I n={editing ? "check" : "edit"} s={17} c={editing ? T.green : T.muted} />
            </button>
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

      {/* Minha Semana — weekly schedule grid */}
      {weekDays.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: T.muted, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <I n="cal" s={13} c={T.muted} /> Minha Semana
          </div>
          <div style={{ background: T.glass, border: `1px solid ${T.border}`, borderRadius: 20, padding: "14px 12px", marginBottom: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
              {weekDays.map((d, i) => (
                <div key={i} style={{
                  borderRadius: 12,
                  border: d.today ? `1.5px solid rgba(155,109,255,0.55)` : `1px solid ${T.border}`,
                  background: d.today ? T.gradSoft : d.work ? "rgba(78,201,212,0.05)" : T.glass,
                  padding: "8px 2px 6px",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                  position: "relative", minHeight: 74,
                }}>
                  {d.today && (
                    <div style={{ position: "absolute", top: -1, left: "50%", transform: "translateX(-50%)", width: 18, height: 3, borderRadius: 999, background: T.grad }} />
                  )}
                  <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.08em", color: d.today ? T.g1 : T.muted }}>{d.dow}</span>
                  <span style={{ fontSize: 15, fontWeight: 900, lineHeight: 1, color: d.today ? T.g1 : T.text }}>{d.date}</span>
                  {d.work ? (
                    <>
                      <div style={{ width: 18, height: 3, borderRadius: 999, background: T.grad, marginTop: 2 }} />
                      {d.time && <span style={{ fontSize: 9, fontWeight: 700, color: T.g2, marginTop: 1 }}>{d.time}</span>}
                    </>
                  ) : (
                    <span style={{ fontSize: 9, fontWeight: 600, color: T.muted, marginTop: 6 }}>folga</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Equipe — team grid */}
      {teamMembers.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: T.muted, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <I n="users" s={13} c={T.muted} /> Equipe · {teamMembers.length} colegas
          </div>
          <div style={{ background: T.glass, border: `1px solid ${T.border}`, borderRadius: 20, padding: "14px 12px", marginBottom: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {teamMembers.map(m => {
                const roleColor = ROLE_COLORS[m.role] ?? T.g2;
                const roleLabel = ROLE_LABELS[m.role] ?? m.role;
                const initials = m.fullName.split(" ").slice(0, 2).map(w => w[0] ?? "").join("").toUpperCase();
                return (
                  <div key={m.id} style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "10px",
                    background: T.glass2, border: `1px solid ${T.border}`, borderRadius: 14,
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 12, flexShrink: 0,
                      background: `${roleColor}18`, border: `1px solid ${roleColor}35`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, fontWeight: 900, color: roleColor,
                      overflow: "hidden",
                    }}>
                      {m.profilePictureUrl
                        ? <img src={m.profilePictureUrl} alt={m.fullName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : initials}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, lineHeight: 1.1, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                        {m.fullName.split(" ")[0]}
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 700, marginTop: 3, color: roleColor, letterSpacing: "0.02em" }}>{roleLabel}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {userData?.id && userData?.propertyId && (
        <div style={{ marginBottom: 20 }}>
          <ScrapWall profileStaffId={userData.id} isOwnProfile={true} propertyId={userData.propertyId} />
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

export default function MaidPage() {
  const { userData, loading: authLoading, userDataReady } = useAuth();
  const { currentProperty: property, loading: propertyLoading } = useProperty();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("home");
  const [tasks, setTasks] = useState<EnrichedTask[]>([]);
  const [cabins, setCabins] = useState<Record<string, Cabin>>({});
  const [dataLoading, setDataLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; color: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [repRequests, setRepRequests] = useState<ConciergeRequest[]>([]);
  const [pauseConfirm, setPauseConfirm] = useState<{ currentTaskId: string; newTaskId: string } | null>(null);

  const showToast = useCallback((msg: string, color = T.green) => {
    setToast({ msg, color });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  // Auth guard: redirect to login when auth resolved and no user
  useEffect(() => {
    if (authLoading || !userDataReady) return;
    if (!userData) {
      router.replace("/admin/login");
    }
  }, [authLoading, userDataReady, userData, router]);

  // Se o bootstrap terminou mas não há property, libera o loading
  useEffect(() => {
    if (!authLoading && userDataReady && !propertyLoading && !property) {
      setDataLoading(false);
    }
  }, [authLoading, userDataReady, propertyLoading, property]);

  useEffect(() => {
    if (!property) return;

    let unsubscribe: (() => void) | undefined;

    const init = async () => {
      setDataLoading(true);
      try {
        const cabinsData = await CabinService.getCabinsByProperty(property.id);
        const cabinMap: Record<string, Cabin> = {};
        cabinsData.forEach(c => { cabinMap[c.id] = c; });
        setCabins(cabinMap);

        unsubscribe = HousekeepingService.listenToActiveTasks(property.id, allTasks => {
          const myId = userData?.id;
          const myTasks = (userData?.role === "maid" && myId)
            ? allTasks.filter(t => t.assignedTo?.includes(myId) && t.status !== "completed" && t.status !== "cancelled")
            : allTasks.filter(t => t.status !== "completed" && t.status !== "cancelled");

          const enriched: EnrichedTask[] = myTasks.map(t => ({
            ...t,
            cabinName: t.cabinId ? (cabinMap[t.cabinId]?.name ?? t.cabinId) : (t.customLocation ?? "Tarefa"),
          }));
          setTasks(enriched);
        });
      } catch {
        showToast("Erro ao carregar dados.", T.red);
      } finally {
        setDataLoading(false);
      }
    };

    init();
    return () => unsubscribe?.();
  }, [property, userData?.id, userData?.role, showToast]);

  useEffect(() => {
    if (!property?.id) return;
    return ConciergeService.listenToPendingRequests(property.id, setRepRequests, 'maid');
  }, [property?.id]);

  const handleStart = useCallback(async (taskId: string) => {
    if (!property || !userData) return;
    const activeTask = tasks.find(t => t.status === "in_progress");
    if (activeTask && activeTask.id !== taskId) {
      setPauseConfirm({ currentTaskId: activeTask.id, newTaskId: taskId });
      return;
    }
    try {
      const task = tasks.find(t => t.id === taskId);
      if (task?.startedAt) {
        await HousekeepingService.resumeTask(property.id, taskId, userData.id, userData.fullName);
        showToast("Limpeza retomada! Cronômetro continuando.");
      } else {
        await HousekeepingService.startTask(property.id, taskId, userData.id, userData.fullName);
        showToast("Limpeza iniciada! Cronômetro rodando.");
      }
    } catch { showToast("Erro ao iniciar tarefa.", T.red); }
  }, [property, userData, tasks, showToast]);

  const handlePauseAndStart = useCallback(async () => {
    if (!pauseConfirm || !property || !userData) return;
    try {
      await HousekeepingService.pauseTask(property.id, pauseConfirm.currentTaskId, userData.id, userData.fullName);
      const newTask = tasks.find(t => t.id === pauseConfirm.newTaskId);
      if (newTask?.startedAt) {
        await HousekeepingService.resumeTask(property.id, pauseConfirm.newTaskId, userData.id, userData.fullName);
      } else {
        await HousekeepingService.startTask(property.id, pauseConfirm.newTaskId, userData.id, userData.fullName);
      }
      showToast("Tarefa anterior pausada. Nova limpeza iniciada!");
    } catch { showToast("Erro ao trocar tarefa.", T.red); }
    finally { setPauseConfirm(null); }
  }, [pauseConfirm, property, userData, tasks, showToast]);

  const handleToggle = useCallback(async (taskId: string, itemId: string) => {
    // Optimistic
    setTasks(prev => prev.map(t =>
      t.id !== taskId ? t : { ...t, checklist: t.checklist.map(c => c.id === itemId ? { ...c, checked: !c.checked } : c) }
    ));
    try {
      const task = tasks.find(t => t.id === taskId);
      if (!task) return;
      const updated = task.checklist.map(c => c.id === itemId ? { ...c, checked: !c.checked } : c);
      await supabase.from("housekeeping_tasks").update({ checklist: updated, updatedAt: new Date().toISOString() }).eq("id", taskId);
      showToast("Item salvo!");
    } catch {
      // Rollback
      setTasks(prev => prev.map(t =>
        t.id !== taskId ? t : { ...t, checklist: t.checklist.map(c => c.id === itemId ? { ...c, checked: !c.checked } : c) }
      ));
      showToast("Erro ao salvar item.", T.red);
    }
  }, [tasks, showToast]);

  const handleChecklistLoaded = useCallback((taskId: string, checklist: ChecklistItem[]) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, checklist } : t));
  }, []);

  const handleLogout = async () => {
    showToast("Saindo...");
    await supabase.auth.signOut();
    router.push("/admin/login");
  };

  const navItems: { id: Tab; label: string; icon: IName; badge: number }[] = [
    { id: "home", label: "Início", icon: "home", badge: 0 },
    { id: "tasks", label: "Faxinas", icon: "sparkles", badge: tasks.filter(t => t.status === "pending" || t.status === "in_progress").length },
    { id: "profile", label: "Equipe", icon: "users", badge: 0 },
  ];

  const isBootstrapping = authLoading || !userDataReady || propertyLoading;
  const loading = isBootstrapping || dataLoading;

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
            onClick={handleLogout}
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

      <div className="maid-shell" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100dvh", background: T.bg }}>
        <div style={{ width: "100%", maxWidth: 430, height: "100dvh", background: T.bg, color: T.text, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>

          {/* Ambient orbs */}
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0, background: "radial-gradient(ellipse 280px 220px at 10% 5%,rgba(155,109,255,0.12) 0%,transparent 70%),radial-gradient(ellipse 200px 160px at 90% 80%,rgba(78,201,212,0.09) 0%,transparent 70%)" }} />

          {/* Screens — top bar e RoleSwitcher ficam dentro para que sheets absolutas os cubram */}
          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", position: "relative", zIndex: 1 }}>
            {/* Top bar */}
            <div style={{ padding: "14px 20px 12px", borderBottom: `1px solid ${T.border}`, background: "rgba(6,8,15,0.9)", backdropFilter: "blur(20px)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
              <span style={{ fontSize: 16, fontWeight: 900, letterSpacing: ".1em", textTransform: "uppercase" }}>
                <span style={{ background: T.grad, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>aaura</span>
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: T.led, boxShadow: `0 0 10px ${T.ledGlow}` }} />
                <span style={{ fontSize: 11, color: T.muted, fontWeight: 600 }}>Tempo real</span>
              </div>
            </div>
            <RoleSwitcher />
            {tab === "home" && <HomeScreen tasks={tasks} cabins={cabins} onNav={setTab} userName={userData?.fullName ?? "Camareira"} />}
            {tab === "tasks" && <FaxinasScreen tasks={tasks} onStart={handleStart} showToast={showToast} onToggle={handleToggle} propertyId={property?.id ?? ""} userId={userData?.id ?? ""} userName={userData?.fullName ?? "Camareira"} onChecklistLoaded={handleChecklistLoaded} repRequests={repRequests} />}
            {tab === "profile" && <ProfileScreen userData={userData} showToast={showToast} onLogout={handleLogout} propertyId={property?.id ?? ""} />}
          </div>

          {/* Pause confirm modal */}
          {pauseConfirm && (
            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 24 }}>
              <div style={{ background: "#111827", border: `1px solid ${T.border2}`, borderRadius: 24, padding: 24, width: "100%", maxWidth: 340, boxShadow: "0 20px 60px rgba(0,0,0,0.7)" }}>
                <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 8, color: T.text }}>Você já tem uma faxina ativa</div>
                <div style={{ fontSize: 13, color: T.muted, marginBottom: 20, lineHeight: 1.5 }}>
                  Deseja pausar a faxina atual e iniciar esta? O cronômetro será pausado e retomará de onde parou.
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    onClick={() => setPauseConfirm(null)}
                    style={{ flex: 1, padding: 14, background: T.glass, border: `1px solid ${T.border2}`, borderRadius: 14, cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 700, color: T.muted }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handlePauseAndStart}
                    style={{ flex: 1, padding: 14, background: T.greenG, color: "#021a17", fontFamily: "inherit", fontSize: 14, fontWeight: 800, border: "none", borderRadius: 14, cursor: "pointer" }}
                  >
                    Pausar e iniciar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Toast */}
          {toast && <Toast msg={toast.msg} color={toast.color} />}

          {/* Bottom nav */}
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
    </>
  );
}
