"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import { ConciergeService } from "@/services/concierge-service";
import { ConciergeRequest } from "@/types/aura";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

// ─── Design tokens ────────────────────────────────────────────────────────────

const T = {
  bg: "#06080f",
  glass: "rgba(255,255,255,0.035)",
  glass2: "rgba(255,255,255,0.055)",
  border: "rgba(255,255,255,0.08)",
  border2: "rgba(255,255,255,0.13)",
  text: "#eef0f8",
  muted: "rgba(238,240,248,0.42)",
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
.hm-shell*{box-sizing:border-box;}
.hm-shell{font-family:'DM Sans',-apple-system,BlinkMacSystemFont,sans-serif;}
.hm-scroll{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;}
.hm-scroll::-webkit-scrollbar{display:none;}
@keyframes hm-pulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.4;transform:scale(.8);}}
@keyframes hm-fadein{from{opacity:0}to{opacity:1}}
@keyframes hm-toast{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes hm-ring{0%{transform:rotate(0deg) scale(1);}10%{transform:rotate(-15deg) scale(1.1);}20%{transform:rotate(15deg) scale(1.1);}30%{transform:rotate(-10deg);}40%{transform:rotate(10deg);}50%,100%{transform:rotate(0deg) scale(1);}}
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
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", padding: "3px 9px", borderRadius: 999, lineHeight: 1.5, color, background: bg, border: `1px solid ${border}` }}>
      {children}
    </span>
  );
}

function Pulse({ size = 8 }: { size?: number }) {
  return <div style={{ width: size, height: size, borderRadius: "50%", background: T.led, boxShadow: `0 0 8px ${T.ledGlow}`, animation: "hm-pulse 1.5s infinite", flexShrink: 0 }} />;
}

function Toast({ msg, color }: { msg: string; color: string }) {
  return (
    <div style={{ position: "absolute", bottom: 88, left: 16, right: 16, background: "#111827", color: T.text, border: `1px solid ${T.border2}`, borderRadius: 16, padding: "14px 16px", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 10, zIndex: 200, animation: "hm-toast .3s cubic-bezier(.32,.72,0,1)", boxShadow: "0 8px 32px rgba(0,0,0,.5)" }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, boxShadow: `0 0 8px ${color}`, flexShrink: 0 }} />
      <span>{msg}</span>
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

type IName = "home"|"pkg"|"user"|"check"|"x"|"logout"|"sun"|"clock"|"bell"|"arrow"|"wrench"|"chevr";

function I({ n, s = 20, c = "currentColor", w = 1.8 }: { n: IName; s?: number; c?: string; w?: number }) {
  const d: Record<IName, React.ReactNode> = {
    home: <><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/><path d="M9 21V12h6v9"/></>,
    pkg: <><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></>,
    user: <><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
    check: <polyline points="20 6 9 17 4 12"/>,
    x: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    logout: <><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>,
    sun: <><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/></>,
    clock: <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    bell: <><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></>,
    arrow: <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>,
    wrench: <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>,
    chevr: <polyline points="9 18 15 12 9 6"/>,
  };
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round">
      {d[n]}
    </svg>
  );
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function timeElapsed(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  return `${Math.floor(diff / 3600)}h`;
}

function todayLabel() {
  return new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
}

// ─── Request Card ─────────────────────────────────────────────────────────────

function RequestCard({
  req, userId, onAssign, onDeliver, loading,
}: {
  req: ConciergeRequest;
  userId: string;
  onAssign: (id: string) => void;
  onDeliver: (id: string) => void;
  loading: boolean;
}) {
  const isPending = req.status === "pending";
  const isInProgress = req.status === "in_progress";
  const isMine = req.assignedTo === userId;
  const fromMaid = req.requestedBy === "maid";

  const accentColor = isPending ? T.orange : T.blue;
  const accentBg = isPending ? T.orangeBg : T.blueBg;
  const accentBorder = isPending ? T.orangeBorder : T.blueBorder;

  return (
    <div style={{
      borderRadius: 20, border: `2px solid ${accentBorder}`, background: accentBg,
      padding: 16, marginBottom: 12, animation: "hm-fadein .2s ease",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <I n={fromMaid ? "wrench" : "user"} s={11} c={accentColor} />
            <span style={{ fontSize: 12, fontWeight: 900, color: accentColor, letterSpacing: "0.04em" }}>
              {req.cabinName || "—"}
            </span>
            <span style={{ fontSize: 10, fontWeight: 700, background: accentBg, border: `1px solid ${accentBorder}`, color: accentColor, padding: "1px 6px", borderRadius: 999 }}>
              {fromMaid ? "Camareira" : "Hóspede"}
            </span>
          </div>
          <div style={{ fontSize: 20, fontWeight: 900, color: T.text, lineHeight: 1.2 }}>
            {req.quantity}× {req.item?.name || req.itemId}
          </div>
          {req.notes && req.notes !== "Solicitado pela camareira" && (
            <div style={{ fontSize: 12, color: T.muted, marginTop: 4, fontStyle: "italic" }}>&ldquo;{req.notes}&rdquo;</div>
          )}
          {isInProgress && req.assignedName && (
            <div style={{ fontSize: 11, color: T.blue, marginTop: 6, display: "flex", alignItems: "center", gap: 4 }}>
              <I n="user" s={11} c={T.blue} />
              {isMine ? "Você assumiu" : `Assumido por ${req.assignedName}`}
            </div>
          )}
        </div>
        <div style={{ fontSize: 11, color: T.muted, display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <I n="clock" s={11} c={T.muted} />
          {timeElapsed(req.createdAt as string)}
        </div>
      </div>

      {isPending && (
        <button
          onClick={() => onAssign(req.id)}
          disabled={loading}
          style={{
            width: "100%", padding: "14px 16px", background: "transparent", border: `2px solid ${T.orange}`,
            borderRadius: 14, color: T.orange, fontFamily: "inherit", fontSize: 13, fontWeight: 800,
            textTransform: "uppercase" as const, letterSpacing: "0.04em", cursor: loading ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: loading ? 0.5 : 1,
          }}
        >
          {loading
            ? <><div style={{ width: 14, height: 14, border: `2px solid ${T.orange}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} />Assumindo...</>
            : <><I n="user" s={16} c={T.orange} w={2.5} /> Assumir Pedido</>
          }
        </button>
      )}

      {isInProgress && (
        <button
          onClick={() => onDeliver(req.id)}
          disabled={loading}
          style={{
            width: "100%", padding: "14px 16px", background: T.greenG, border: "none",
            borderRadius: 14, color: "#021a17", fontFamily: "inherit", fontSize: 13, fontWeight: 800,
            textTransform: "uppercase" as const, letterSpacing: "0.04em", cursor: loading ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: loading ? 0.5 : 1,
            boxShadow: "0 4px 20px rgba(45,212,191,0.3)",
          }}
        >
          {loading
            ? <><div style={{ width: 14, height: 14, border: "2px solid #021a17", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} />Confirmando...</>
            : <><I n="check" s={16} c="#021a17" w={2.5} /> Confirmar Entrega</>
          }
        </button>
      )}
    </div>
  );
}

// ─── Requests screen ──────────────────────────────────────────────────────────

function RequestsScreen({
  requests, done, userId, onAssign, onDeliver, actionLoading,
}: {
  requests: ConciergeRequest[];
  done: ConciergeRequest[];
  userId: string;
  onAssign: (id: string) => void;
  onDeliver: (id: string) => void;
  actionLoading: Record<string, boolean>;
}) {
  const pending = requests.filter(r => r.status === "pending");
  const inProgress = requests.filter(r => r.status === "in_progress");

  return (
    <div className="hm-scroll" style={{ padding: "0 16px 24px" }}>
      <div style={{ padding: "10px 0 20px" }}>
        <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.3px" }}>Pedidos</div>
        <div style={{ fontSize: 13, color: T.muted, marginTop: 5 }}>
          {pending.length > 0
            ? `${pending.length} novo${pending.length !== 1 ? "s" : ""} · ${inProgress.length} em andamento`
            : inProgress.length > 0
            ? `${inProgress.length} em andamento`
            : "Nenhum pedido ativo"}
        </div>
      </div>

      {pending.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: T.orange, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: T.orange, animation: "hm-pulse 1.5s infinite" }} />
            Novos pedidos
          </div>
          {pending.map(r => (
            <RequestCard key={r.id} req={r} userId={userId} onAssign={onAssign} onDeliver={onDeliver} loading={!!actionLoading[r.id]} />
          ))}
        </div>
      )}

      {inProgress.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: T.blue, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <Pulse size={6} />
            Em andamento
          </div>
          {inProgress.map(r => (
            <RequestCard key={r.id} req={r} userId={userId} onAssign={onAssign} onDeliver={onDeliver} loading={!!actionLoading[r.id]} />
          ))}
        </div>
      )}

      {requests.length === 0 && done.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 0", color: T.muted }}>
          <div style={{ width: 64, height: 64, borderRadius: 20, background: T.greenBg, border: `1px solid ${T.greenBorder}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <I n="check" s={32} c={T.green} w={2.5} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>Tudo entregue!</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>Pedidos de hóspedes e camareiras aparecem aqui.</div>
        </div>
      )}

      {done.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: T.muted, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <I n="check" s={11} c={T.green} w={2.5} /> Entregues esta sessão
          </div>
          {done.map(r => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 14px", background: T.glass, border: `1px solid ${T.border}`, borderRadius: 14, marginBottom: 8, opacity: 0.7 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{r.quantity}× {r.item?.name || r.itemId}</div>
                <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{r.cabinName || "—"}</div>
              </div>
              <Pill color={T.green} bg={T.greenBg} border={T.greenBorder}>Entregue</Pill>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Home screen ──────────────────────────────────────────────────────────────

function HomeScreen({ requests, done, userName, onNav }: {
  requests: ConciergeRequest[];
  done: ConciergeRequest[];
  userName: string;
  onNav: (tab: Tab) => void;
}) {
  const pending = requests.filter(r => r.status === "pending");
  const inProg = requests.filter(r => r.status === "in_progress");

  return (
    <div className="hm-scroll" style={{ padding: "0 16px 24px" }}>
      <div style={{ padding: "18px 0 24px" }}>
        <div style={{ fontSize: 13, color: T.muted, fontWeight: 600, marginBottom: 4 }}>{todayLabel()}</div>
        <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.3px" }}>Olá, {userName.split(" ")[0]}</div>
        <div style={{ fontSize: 14, color: T.muted, marginTop: 4 }}>
          {requests.length === 0 ? "Nenhum pedido ativo." : `${pending.length} novo${pending.length !== 1 ? "s" : ""} · ${inProg.length} em andamento`}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 24 }}>
        {[
          { label: "Novos", val: pending.length, color: T.orange, bg: T.orangeBg, border: T.orangeBorder },
          { label: "Andamento", val: inProg.length, color: T.blue, bg: T.blueBg, border: T.blueBorder },
          { label: "Entregues", val: done.length, color: T.green, bg: T.greenBg, border: T.greenBorder },
        ].map(s => (
          <GBorder key={s.label} style={{ flex: 1 }}>
            <div style={{ background: "rgba(10,12,22,0.9)", borderRadius: 20, padding: "16px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 30, fontWeight: 900, color: s.color, textShadow: `0 0 20px ${s.color}55` }}>{s.val}</div>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: T.muted, marginTop: 4 }}>{s.label}</div>
            </div>
          </GBorder>
        ))}
      </div>

      {/* Pending alert */}
      {pending.length > 0 && (
        <GBorder style={{ marginBottom: 16 }}>
          <div style={{ background: T.orangeBg, borderRadius: 20, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: T.orange, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: T.orange, animation: "hm-pulse 1.5s infinite" }} />
              {pending.length} pedido{pending.length !== 1 ? "s" : ""} aguardando
            </div>
            {pending.slice(0, 2).map(r => (
              <div key={r.id} style={{ fontSize: 14, fontWeight: 700, color: T.orange, marginBottom: 4 }}>
                {r.quantity}× {r.item?.name || r.itemId} — {r.cabinName}
              </div>
            ))}
            {pending.length > 2 && <div style={{ fontSize: 12, color: T.orange, opacity: 0.7 }}>+{pending.length - 2} outros</div>}
            <button
              onClick={() => onNav("requests")}
              style={{ marginTop: 12, padding: "10px 18px", background: T.orangeBg, border: `1px solid ${T.orangeBorder}`, borderRadius: 12, color: T.orange, fontFamily: "inherit", fontWeight: 700, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
            >
              Ver pedidos <I n="arrow" s={14} c={T.orange} />
            </button>
          </div>
        </GBorder>
      )}

      {requests.length === 0 && done.length === 0 && (
        <div style={{ textAlign: "center", padding: "48px 0", color: T.muted }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>Tudo em dia!</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>Nenhum pedido de hóspedes ou camareiras.</div>
        </div>
      )}
    </div>
  );
}

// ─── Profile screen ───────────────────────────────────────────────────────────

function ProfileScreen({ userData, onLogout }: { userData: any; onLogout: () => void }) {
  const name = userData?.fullName || "Mensageiro";
  const initials = name.split(" ").slice(0, 2).map((w: string) => w[0] ?? "").join("").toUpperCase();

  return (
    <div className="hm-scroll" style={{ padding: "0 16px 24px" }}>
      <div style={{ padding: "10px 0 20px" }}>
        <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.3px" }}>Meu Perfil</div>
      </div>

      <GBorder style={{ marginBottom: 16 }}>
        <div style={{ background: "rgba(10,12,22,0.95)", borderRadius: 20, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 66, height: 66, borderRadius: 22, flexShrink: 0, background: "linear-gradient(135deg,rgba(155,109,255,0.25),rgba(78,201,212,0.25))", border: "1px solid rgba(155,109,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 900 }}>
              <span style={{ background: T.grad, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>{initials}</span>
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 900 }}>{name}</div>
              <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>Mensageiro · Houseman</div>
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

      <button onClick={onLogout} style={{ width: "100%", padding: 15, background: "rgba(248,113,113,0.08)", color: T.red, fontFamily: "inherit", fontSize: 14, fontWeight: 700, letterSpacing: "0.02em", textTransform: "uppercase" as const, border: `1px solid rgba(248,113,113,0.2)`, borderRadius: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <I n="logout" s={18} c={T.red} /> Sair do aplicativo
      </button>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

type Tab = "home" | "requests" | "profile";

export default function HousemanPage() {
  const { userData } = useAuth();
  const { currentProperty: property } = useProperty();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("home");
  const [requests, setRequests] = useState<ConciergeRequest[]>([]);
  const [done, setDone] = useState<ConciergeRequest[]>([]);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [toast, setToastState] = useState<{ msg: string; color: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevCountRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const showToast = useCallback((msg: string, color = T.green) => {
    setToastState({ msg, color });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastState(null), 2600);
  }, []);

  useEffect(() => {
    if (!property) return;
    const unsub = ConciergeService.listenToPendingRequests(property.id, setRequests);
    return unsub;
  }, [property]);

  // Audio bell on new pending request
  useEffect(() => {
    const pendingCount = requests.filter(r => r.status === "pending").length;
    if (pendingCount > prevCountRef.current) {
      try {
        if (!audioRef.current) audioRef.current = new Audio("/notification.mp3");
        audioRef.current.play().catch(() => {});
      } catch { /* ignore */ }
    }
    prevCountRef.current = pendingCount;
  }, [requests]);

  const handleAssign = useCallback(async (reqId: string) => {
    if (!property || !userData) return;
    setActionLoading(p => ({ ...p, [reqId]: true }));
    try {
      await ConciergeService.assignRequest(property.id, reqId, userData.id, userData.fullName);
      showToast("Pedido assumido!");
    } catch { showToast("Erro ao assumir pedido.", T.red); }
    finally { setActionLoading(p => ({ ...p, [reqId]: false })); }
  }, [property, userData, showToast]);

  const handleDeliver = useCallback(async (reqId: string) => {
    if (!property || !userData) return;
    setActionLoading(p => ({ ...p, [reqId]: true }));
    try {
      const req = requests.find(r => r.id === reqId);
      await ConciergeService.deliverRequest(property.id, reqId, userData.id, userData.fullName);
      if (req) setDone(prev => [{ ...req, status: "delivered" } as ConciergeRequest, ...prev]);
      showToast("Entrega confirmada!");
    } catch { showToast("Erro ao confirmar entrega.", T.red); }
    finally { setActionLoading(p => ({ ...p, [reqId]: false })); }
  }, [property, userData, requests, showToast]);

  const handleLogout = async () => {
    showToast("Saindo...");
    await supabase.auth.signOut();
    router.push("/admin/login");
  };

  const pendingCount = requests.filter(r => r.status === "pending").length;

  const navItems: { id: Tab; label: string; icon: IName; badge: number }[] = [
    { id: "home", label: "Início", icon: "home", badge: 0 },
    { id: "requests", label: "Pedidos", icon: "pkg", badge: pendingCount },
    { id: "profile", label: "Perfil", icon: "user", badge: 0 },
  ];

  return (
    <>
      <style>{STYLE}</style>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <div className="hm-shell" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100dvh", background: T.bg }}>
        <div style={{ width: "100%", maxWidth: 430, height: "100dvh", background: T.bg, color: T.text, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>

          <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0, background: "radial-gradient(ellipse 280px 220px at 10% 5%,rgba(155,109,255,0.12) 0%,transparent 70%),radial-gradient(ellipse 200px 160px at 90% 80%,rgba(78,201,212,0.09) 0%,transparent 70%)" }} />

          <div style={{ padding: "14px 20px 12px", borderBottom: `1px solid ${T.border}`, background: "rgba(6,8,15,0.9)", backdropFilter: "blur(20px)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, position: "relative", zIndex: 10 }}>
            <span style={{ fontSize: 16, fontWeight: 900, letterSpacing: ".1em", textTransform: "uppercase" }}>
              <span style={{ background: T.grad, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>aaura</span>
              <span style={{ fontSize: 11, color: T.muted, fontWeight: 600, marginLeft: 8, textTransform: "none", letterSpacing: 0 }}>Mensageiro</span>
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {pendingCount > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, background: T.orangeBg, border: `1px solid ${T.orangeBorder}`, borderRadius: 999, padding: "3px 10px" }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: T.orange, animation: "hm-pulse 1.5s infinite" }} />
                  <span style={{ fontSize: 11, color: T.orange, fontWeight: 800 }}>{pendingCount} novo{pendingCount !== 1 ? "s" : ""}</span>
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: T.led, boxShadow: `0 0 10px ${T.ledGlow}` }} />
                <span style={{ fontSize: 11, color: T.muted, fontWeight: 600 }}>Tempo real</span>
              </div>
            </div>
          </div>

          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", position: "relative", zIndex: 1 }}>
            {tab === "home" && <HomeScreen requests={requests} done={done} userName={userData?.fullName ?? "Mensageiro"} onNav={setTab} />}
            {tab === "requests" && <RequestsScreen requests={requests} done={done} userId={userData?.id ?? ""} onAssign={handleAssign} onDeliver={handleDeliver} actionLoading={actionLoading} />}
            {tab === "profile" && <ProfileScreen userData={userData} onLogout={handleLogout} />}
          </div>

          {toast && <Toast msg={toast.msg} color={toast.color} />}

          <nav style={{ background: "rgba(255,255,255,0.035)", borderTop: `1px solid ${T.border}`, backdropFilter: "blur(20px)", display: "grid", gridTemplateColumns: "repeat(3,1fr)", paddingBottom: "env(safe-area-inset-bottom,8px)", flexShrink: 0, position: "relative", zIndex: 10 }}>
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
