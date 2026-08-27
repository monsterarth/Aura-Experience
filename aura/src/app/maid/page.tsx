"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import { RoleSwitcher } from "@/components/auth/RoleSwitcher";
import { Sheet } from "@/components/maid/MinibarSheet";
import { useCloseGuard } from "@/lib/use-discard-guard";
import { HousekeepingService } from "@/services/housekeeping-service";
import { CabinService } from "@/services/cabin-service";
import { RestockService } from "@/services/restock-service";
import { StaffService } from "@/services/staff-service";
import { supabase } from "@/lib/supabase";
import { postFieldAction } from "@/lib/field-api";
import { HousekeepingTask, Cabin, RestockCatalogItem, RestockRequest, Staff, Structure } from "@/types/aura";
import { getTaskLabel } from "@/lib/task-ui";
import { resolveEffectiveDaySchedule } from "@/lib/schedule-calculator";
import { ScrapWall } from "@/components/admin/profile/ScrapWall";
import { MaintenanceReportButton } from "@/components/field/MaintenanceReportSheet";

type EnrichedTask = HousekeepingTask & { cabinName?: string };
import { useRouter } from "next/navigation";

// ─── CSS injected once ────────────────────────────────────────────────────────

const STYLE = `
.maid-shell*{box-sizing:border-box;}
.maid-shell{font-family:var(--font-dm-sans),'DM Sans',-apple-system,BlinkMacSystemFont,sans-serif;}
.maid-scroll{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;}
.maid-scroll::-webkit-scrollbar{display:none;}
.maid-sheet-body{overflow-y:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;flex:1;}
.maid-sheet-body::-webkit-scrollbar{display:none;}
@keyframes maid-pulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.4;transform:scale(.8);}}
@keyframes maid-fadein{from{opacity:0}to{opacity:1}}
@keyframes maid-slideup{from{transform:translateY(100%)}to{transform:translateY(0)}}
@keyframes maid-toast{from{transform:translateY(-16px);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes maid-spin{to{transform:rotate(360deg)}}
@keyframes maid-nudge{0%,100%{transform:translateX(0)}25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}
@keyframes maid-pop{from{transform:scale(.92);opacity:0}to{transform:scale(1);opacity:1}}
.maid-shell button{touch-action:manipulation;-webkit-tap-highlight-color:transparent;}
.maid-shell button:not([disabled]):active{opacity:.7;transform:scale(.97);}
.maid-shell button[disabled]{pointer-events:none;}
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
  rose: "#fb7185",
  roseBg: "rgba(251,113,133,0.09)",
  roseBorder: "rgba(251,113,133,0.32)",
  roseG: "linear-gradient(135deg,#f43f5e,#fb7185)",
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

// Espelha a regra de finishTask no serviço — usado só para a atualização otimista decidir se
// a faxina vai para "Aguardando governanta" (conferência) ou conclui direto. O servidor
// permanece a fonte da verdade; o realtime reconcilia logo depois.
function requiresConferenceClient(t: { type: string; needsConference?: boolean }): boolean {
  return ["turnover", "inspection_checkin", "inspection_checkout"].includes(t.type) ||
    (t.type === "custom" && t.needsConference === true);
}

// ─── Salvaguardas de toque ────────────────────────────────────────────────────
// Contexto (26/08/2026): três faxinas foram puladas sem ninguém querer. A causa é o "clique
// fantasma": os botões críticos agem no `pointerdown`, então o diálogo fecha ANTES do `click`
// que o mesmo toque ainda vai emitir. Como React processa o pointerdown de forma síncrona, o
// que estiver na tela no instante seguinte recebe esse click órfão — e as duas confirmações
// de "pular" eram caixas centralizadas do mesmo tamanho, com o botão de confirmar a ~12px de
// distância uma da outra. Um toque só atravessava as duas.
// (preventDefault no pointerdown NÃO cancela o click: a spec de Pointer Events mantém
//  click/auxclick/contextmenu, e `touch-action:manipulation` ainda tira o atraso de 300ms.)

const ARM_MS = 450;

/** Deixa um diálogo inerte nos primeiros ms de vida — o click órfão do toque anterior morre aqui. */
function useArmed(open: boolean, ms = ARM_MS) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!open) { setArmed(false); return; }
    setArmed(false);
    const t = setTimeout(() => setArmed(true), ms);
    return () => clearTimeout(t);
  }, [open, ms]);
  return armed;
}

/** Escudo transparente: some sozinho e engole qualquer toque que chegue enquanto está de pé. */
function TapShield({ z = 400 }: { z?: number }) {
  return (
    <div
      style={{ position: "absolute", inset: 0, zIndex: z, background: "transparent" }}
      onPointerDown={e => { e.preventDefault(); e.stopPropagation(); }}
      onClick={e => { e.preventDefault(); e.stopPropagation(); }}
    />
  );
}

/**
 * Escudo com prazo — usado quando uma sheet fecha no pointerdown e a lista atrás dela fica
 * exposta exatamente sob o dedo (o footer "Pausar" mora em cima dos botões dos cartões).
 */
function useTapShield(ms = ARM_MS) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!on) return;
    const t = setTimeout(() => setOn(false), ms);
    return () => clearTimeout(t);
  }, [on, ms]);
  return { shield: on, raiseShield: useCallback(() => setOn(true), []) };
}

/**
 * Confirmação por pressão contínua. Nenhum clique fantasma, nenhum esbarrão e nenhum toque
 * distraído sustenta 1,6s de dedo parado — e a barra que enche dá o retorno visual que quem
 * não lê o rótulo entende na hora.
 */
const HOLD_TONES = {
  // Tirar a faxina da lista: vermelho, gordo, 1,6s.
  danger: { fg: T.rose, bg: T.roseBg, border: `2px solid ${T.roseBorder}`, fill: T.roseG, hint: T.rose },
  // Trazer de volta: sem preenchimento, borda fina, texto apagado — a barra que enche usa o
  // gradiente da casa (roxo/azul = a faxina volta). Discreto de propósito: é um botão que fica
  // o dia todo na tela e não pode disputar atenção nem convidar o polegar.
  quiet: { fg: "rgba(238,240,248,0.66)", bg: "transparent", border: `1px solid ${T.border2}`, fill: "linear-gradient(135deg,rgba(155,109,255,.62),rgba(78,201,212,.62))", hint: T.g2 },
} as const;

const HOLD_SIZES = {
  lg: { pad: "17px 14px", fs: 15, r: 18, ic: 19, gap: 9, weight: 900 as const, upper: true },
  sm: { pad: "12px 14px", fs: 13, r: 14, ic: 16, gap: 7, weight: 800 as const, upper: false },
} as const;

function HoldConfirm({
  label, holdingLabel, icon, ms = 1600, disabled, busy, onComplete,
  tone = "danger", size = "lg", hint = "always",
}: {
  label: string;
  holdingLabel: string;
  icon: IName;
  ms?: number;
  disabled?: boolean;
  busy?: boolean;
  onComplete: () => void;
  tone?: keyof typeof HOLD_TONES;
  size?: keyof typeof HOLD_SIZES;
  /** "always" ensina o gesto; "nudge" fica calado até alguém tocar achando que bastava um toque. */
  hint?: "always" | "nudge";
}) {
  const [pct, setPct] = useState(0);
  // Contador (e não booleano) para a dica reanimar a cada tentativa frustrada.
  const [nudgeSeq, setNudgeSeq] = useState(0);
  const raf = useRef<number | null>(null);
  const pctRef = useRef(0);
  const doneRef = useRef(false);
  const tk = HOLD_TONES[tone];
  const sz = HOLD_SIZES[size];

  const stop = useCallback(() => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  const begin = (e: React.PointerEvent) => {
    e.preventDefault();
    if (disabled || busy || doneRef.current || raf.current !== null) return;
    const t0 = performance.now();
    const tick = () => {
      const p = Math.min(1, (performance.now() - t0) / ms);
      pctRef.current = p;
      setPct(p);
      if (p >= 1) {
        doneRef.current = true;
        stop();
        if (navigator.vibrate) navigator.vibrate(40);
        onComplete();
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };

  const abort = () => {
    if (doneRef.current || raf.current === null) return;
    stop();
    // Soltou no meio do caminho: quase sempre é alguém que tocou achando que bastava um toque.
    setNudgeSeq(n => n + 1);
    pctRef.current = 0;
    setPct(0);
  };

  const holding = pct > 0;
  const ink = pct > 0.5 ? "#fff" : tk.fg;
  const showHint = hint === "always" || nudgeSeq > 0;
  return (
    <div>
      <button
        onPointerDown={begin}
        onPointerUp={abort}
        onPointerLeave={abort}
        onPointerCancel={abort}
        onContextMenu={e => e.preventDefault()}
        disabled={disabled || busy}
        style={{
          position: "relative", overflow: "hidden", width: "100%", padding: sz.pad,
          background: tk.bg, border: tk.border, borderRadius: sz.r,
          color: tk.fg, fontFamily: "inherit", fontSize: sz.fs, fontWeight: sz.weight,
          letterSpacing: sz.upper ? "0.03em" : "0.01em",
          textTransform: sz.upper ? ("uppercase" as const) : ("none" as const),
          cursor: "pointer", userSelect: "none", WebkitUserSelect: "none",
          opacity: disabled ? 0.35 : 1, touchAction: "none",
        }}
      >
        {/* Barra que enche por baixo do rótulo */}
        <div style={{
          position: "absolute", inset: 0, width: `${pct * 100}%`,
          background: tk.fill, opacity: 0.85, transition: holding ? "none" : "width .2s ease",
        }} />
        <span style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", gap: sz.gap, color: ink }}>
          {busy ? <I n="loader" s={sz.ic} c={ink} w={2} /> : <I n={icon} s={sz.ic} c={ink} w={2.2} />}
          {holding ? holdingLabel : label}
        </span>
      </button>
      {showHint && (
        <div
          key={nudgeSeq}
          style={{
            marginTop: size === "lg" ? 8 : 6, textAlign: "center" as const,
            fontSize: size === "lg" ? 12 : 11, fontWeight: 800,
            color: nudgeSeq > 0 ? tk.hint : T.muted,
            animation: nudgeSeq > 0 ? "maid-nudge .5s ease 2" : undefined,
          }}
        >
          {nudgeSeq > 0 ? "☝ Segure o botão até encher" : "Segure o botão para confirmar"}
        </div>
      )}
    </div>
  );
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
      position: "absolute", top: 70, left: 16, right: 16,
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

type IName = "home"|"coffee"|"sparkles"|"user"|"key"|"check"|"arrow"|"plus"|"minus"|"x"|"pkg"|"info"|"send"|"logout"|"edit"|"sun"|"clock"|"list"|"chevr"|"loader"|"camera"|"inbox"|"search"|"users"|"cal"|"smile"|"msg"|"pause"|"dnd"|"undo";

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
    // "pause" (duas barras) e "dnd" (plaquinha de porta) existem para que PAUSAR e NÃO LIMPAR
    // nunca mais compartilhem o mesmo desenho — a camareira semi-alfabetizada lê o ícone,
    // não a palavra, e "Pausar"/"Pular" eram indistinguíveis (mesmo âmbar, mesmo tamanho).
    pause: <><rect x="6" y="4" width="4" height="16" rx="1.5"/><rect x="14" y="4" width="4" height="16" rx="1.5"/></>,
    dnd: <><path d="M8.5 2h7a2 2 0 012 2v16a2 2 0 01-2 2h-7a2 2 0 01-2-2V4a2 2 0 012-2z"/><circle cx="12" cy="6" r="1.6"/><line x1="9.5" y1="12" x2="14.5" y2="12"/><line x1="9.5" y1="16" x2="14.5" y2="16"/></>,
    undo: <><polyline points="3 8 3 14 9 14"/><path d="M21 16a9 9 0 00-9-9 9 9 0 00-6.7 3L3 12.5"/></>,
  };
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round"
      style={n === "loader" ? { animation: "maid-spin 0.8s linear infinite" } : undefined}>
      {d[n]}
    </svg>
  );
}


// ─── Replenish Sheet ──────────────────────────────────────────────────────────

function ReplenishSheet({
  cabinName, catalog, loading: loadingItems, onClose, onSend,
}: {
  cabinName: string;
  catalog: RestockCatalogItem[];
  loading: boolean;
  onClose: () => void;
  onSend: (items: { productId: string; quantity: number }[]) => Promise<void>;
}) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const { requestClose } = useCloseGuard(onClose, {
    dirty: Object.values(cart).some(q => q > 0),
    message: "Sair sem enviar? Os itens marcados serão descartados.",
  });
  const [activeGroup, setActiveGroup] = useState<string | null>(null);

  const adj = (id: string, d: number) =>
    setCart(p => { const n = { ...p }, v = Math.max(0, (p[id] ?? 0) + d); if (!v) delete n[id]; else n[id] = v; return n; });

  const count = Object.values(cart).reduce((a, b) => a + b, 0);

  const submit = async () => {
    setBusy(true);
    const entries = Object.entries(cart).filter(([, q]) => q > 0).map(([productId, quantity]) => ({ productId, quantity }));
    await onSend(entries);
    onClose();
  };

  // Grupos = categorias do ESTOQUE (o catálogo de reposição aponta produtos, não itens de Concierge)
  const groups = React.useMemo(() => {
    const seen = new Map<string, { id: string; name: string; icon?: string; order?: number }>();
    for (const item of catalog) {
      const id = item.categoryId ?? "sem-categoria";
      if (!seen.has(id)) seen.set(id, { id, name: item.categoryName ?? "Outros", icon: item.categoryIcon, order: item.categoryOrder });
    }
    return Array.from(seen.values()).sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  }, [catalog]);

  const filtered = React.useMemo(() => {
    let items = catalog;
    if (activeGroup) items = items.filter(i => (i.categoryId ?? "sem-categoria") === activeGroup);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(i => i.name.toLowerCase().includes(q));
    }
    return items;
  }, [catalog, activeGroup, search]);

  return (
    <Sheet onClose={requestClose}>
      {/* Header */}
      <div style={{ padding: "4px 16px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900 }}>{cabinName}</div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 3 }}>Solicitar reposição</div>
        </div>
        <button onClick={requestClose} style={{ background: T.glass2, border: `1px solid ${T.border2}`, borderRadius: 12, padding: "10px 12px", cursor: "pointer", color: T.text, display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700 }}>
          <I n="x" s={15} /> Fechar
        </button>
      </div>

      {/* Search + group filters */}
      {!loadingItems && catalog.length > 0 && (
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
                const groupColor = T.g1;
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
        ) : catalog.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", fontSize: 13, color: T.muted }}>
            Nenhum item de reposição configurado.<br />
            <span style={{ opacity: 0.6, fontSize: 11 }}>Configure em Estoque → Produtos → &quot;Solicitável pela camareira&quot;.</span>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", fontSize: 13, color: T.muted }}>
            Nenhum item encontrado.
          </div>
        ) : (
          filtered.map(item => {
            const q = cart[item.productId] ?? 0;
            const soldOut = item.availability === "out";
            const emoji = item.categoryIcon && !item.categoryIcon.startsWith("http") ? item.categoryIcon : undefined;
            return (
              <div key={item.productId} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "11px 12px",
                borderRadius: 14, borderBottom: `1px solid ${T.border}`,
                background: q > 0 ? "rgba(245,158,11,0.08)" : "transparent", transition: "background .15s",
                opacity: soldOut ? 0.55 : 1,
              }}>
                {emoji && <span style={{ fontSize: 18, flexShrink: 0 }}>{emoji}</span>}
                <span style={{ flex: 1, fontSize: 14, fontWeight: q > 0 ? 700 : 400, color: q > 0 ? T.amber : T.text }}>{item.name}</span>
                {soldOut && <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase" as const, color: "#f87171", flexShrink: 0 }}>Esgotado</span>}
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button onClick={() => adj(item.productId, -1)} disabled={!q} style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${T.border}`, background: T.glass2, cursor: q ? "pointer" : "not-allowed", opacity: q ? 1 : 0.3, display: "flex", alignItems: "center", justifyContent: "center", color: T.text }}>
                    <I n="minus" s={13} />
                  </button>
                  <span style={{ width: 18, textAlign: "center", fontWeight: 900, fontSize: 14 }}>{q}</span>
                  <button onClick={() => adj(item.productId, 1)} disabled={soldOut} style={{ width: 30, height: 30, borderRadius: 8, background: `linear-gradient(135deg,${T.amberBg},rgba(252,211,77,0.15))`, border: `1px solid ${T.amberBorder}`, cursor: soldOut ? "not-allowed" : "pointer", opacity: soldOut ? 0.3 : 1, display: "flex", alignItems: "center", justifyContent: "center", color: T.amber }}>
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
  onFinish, onPause, onUpgrade,
}: {
  task: EnrichedTask;
  onClose: () => void;
  onToggle: (taskId: string, itemId: string) => void;
  showToast: (msg: string, color?: string) => void;
  propertyId: string;
  userId: string;
  userName: string;
  onChecklistLoaded: (taskId: string, checklist: ChecklistItem[]) => void;
  onFinish: (taskId: string, checklist: ChecklistItem[]) => void;
  onPause: (taskId: string) => void;
  onUpgrade: (taskId: string) => void;
}) {
  const [showRep, setShowRep] = useState(false);
  const [catalog, setCatalog] = useState<RestockCatalogItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [loadingChecklist, setLoadingChecklist] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const pausingRef = useRef(false);
  const upgradingRef = useRef(false);
  const finishingRef = useRef(false);
  const confirmArmed = useArmed(showConfirm);

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
    if (catalog.length > 0) return;
    setLoadingItems(true);
    try {
      // Catálogo via rota field (leitura pelo browser trava no lock frio).
      const r = await fetch(`/api/field/restock-requests?catalog=1&propertyId=${encodeURIComponent(propertyId)}`, { cache: "no-store" });
      if (r.ok) setCatalog(await r.json());
    } catch { /* mantém vazio; a sheet mostra o empty-state */ }
    finally { setLoadingItems(false); }
  };

  const handleFinish = () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setFinishing(true);
    setShowConfirm(false);
    // Otimista no pai (move/remove o cartão) + escrita server-side em background. A sheet
    // fecha na hora; erro/rollback e checklist incompleto são tratados em onFinish.
    onFinish(task.id, task.checklist);
    onClose();
  };

  const handlePause = () => {
    if (pausingRef.current) return;
    pausingRef.current = true;
    setPausing(true);
    onPause(task.id);
    onClose();
  };

  const handleSendRep = async (entries: { productId: string; quantity: number }[]) => {
    // Um POST só para o lote inteiro; item em falta em todo lugar volta 422
    // com "Item em falta — informe o gestor: ..." e NADA é gravado.
    const res = await postFieldAction("/api/field/restock-requests", {
      action: "create", propertyId, cabinId: task.cabinId ?? null, items: entries,
    });
    if (res.ok) showToast(`${entries.length} solicitação(ões) enviada(s)!`);
    else showToast(res.error ?? "Erro ao enviar solicitação.", T.red);
  };

  const handleUpgrade = () => {
    if (upgradingRef.current) return;
    upgradingRef.current = true;
    setUpgrading(true);
    onUpgrade(task.id);
    onClose();
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
                  onPointerDown={(e) => { e.preventDefault(); handleUpgrade(); }}
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
                onPointerDown={(e) => { e.preventDefault(); handlePause(); }}
                disabled={pausing || finishing}
                style={{ flex: "0 0 auto", padding: "14px 16px", background: T.glass, border: `1px solid ${T.amberBorder}`, borderRadius: 16, cursor: pausing ? "wait" : "pointer", color: T.amber, display: "flex", alignItems: "center", gap: 7, fontFamily: "inherit", fontSize: 13, fontWeight: 700, opacity: pausing ? 0.5 : 1 }}
              >
                {pausing ? <I n="loader" s={16} c={T.amber} w={2} /> : <I n="pause" s={16} c={T.amber} w={2} />}
                Pausar
              </button>
            )}
            <button
              onPointerDown={(e) => { e.preventDefault(); if (!finishing && !pausing) { if (task.checklist.length > 0 && !task.checklist.some(c => c.checked)) { showToast("Marque ao menos um item antes de finalizar.", T.amber); return; } setShowConfirm(true); } }}
              disabled={finishing || pausing}
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
          {!confirmArmed && <TapShield z={310} />}
          <div style={{ background: "#111827", border: `1px solid ${T.border2}`, borderRadius: 24, padding: 24, width: "100%", maxWidth: 340, boxShadow: "0 20px 60px rgba(0,0,0,0.7)" }}>
            <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 6 }}>Finalizar esta faxina?</div>
            <div style={{ fontSize: 13, color: T.muted, marginBottom: 20 }}>
              {task.checklist.filter(c => c.checked).length}/{task.checklist.length} itens concluídos
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowConfirm(false)} style={{ flex: 1, padding: 14, background: T.glass, border: `1px solid ${T.border}`, borderRadius: 14, cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 700, color: T.muted }}>
                Cancelar
              </button>
              <button onPointerDown={(e) => { e.preventDefault(); handleFinish(); }} disabled={finishing} style={{ flex: 1, padding: 14, background: T.greenG, color: "#021a17", fontFamily: "inherit", fontSize: 14, fontWeight: 800, border: "none", borderRadius: 14, cursor: finishing ? "wait" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                {finishing ? <I n="loader" s={17} c="#021a17" w={2} /> : <><I n="check" s={17} c="#021a17" w={2.5} /> Confirmar</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRep && (
        <ReplenishSheet
          cabinName={task.cabinName || "Cabana"}
          catalog={catalog}
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
  tasks, skippedTasks, onStart, onSkip, onUnskip, showToast, onToggle,
  propertyId, userId, userName, onChecklistLoaded, repRequests,
  startingTaskId, unskippingId, onFinish, onPause, onUpgrade, onConfer,
  loadFailed, onReload,
}: {
  tasks: EnrichedTask[];
  /** Puladas de hoje — ficam visíveis num quadro à parte só para poderem voltar. */
  skippedTasks: EnrichedTask[];
  onStart: (id: string) => void;
  onSkip: (id: string) => void;
  onUnskip: (id: string) => void;
  showToast: (m: string, c?: string) => void;
  onToggle: (tid: string, cid: string) => void;
  propertyId: string; userId: string; userName: string;
  onChecklistLoaded: (taskId: string, checklist: ChecklistItem[]) => void;
  repRequests: RestockRequest[];
  startingTaskId: string | null;
  unskippingId: string | null;
  onFinish: (taskId: string, checklist: ChecklistItem[]) => void;
  onPause: (taskId: string) => void;
  onUpgrade: (taskId: string) => void;
  /** Só quem acumula o cargo de governanta recebe: leva à conferência (app da governanta). */
  onConfer?: () => void;
  /** Quadro vazio por ERRO na primeira carga — muda o estado vazio e oferece retentativa. */
  loadFailed: boolean;
  onReload: () => void;
}) {
  const [detail, setDetail] = useState<string | null>(null);
  const [confirmStart, setConfirmStart] = useState<string | null>(null);
  const { shield, raiseShield } = useTapShield();

  const inProg = tasks.filter(t => t.status === "in_progress");
  const pending = tasks.filter(t => t.status === "pending");
  const waiting = tasks.filter(t => t.status === "waiting_conference");
  const fullTask = detail ? tasks.find(t => t.id === detail) ?? null : null;
  const confirmTask = confirmStart ? tasks.find(t => t.id === confirmStart) ?? null : null;
  const startArmed = useArmed(!!confirmTask);

  // A sheet fecha no pointerdown; o escudo cobre a lista até o click órfão passar.
  const closeDetail = useCallback(() => { setDetail(null); raiseShield(); }, [raiseShield]);

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
                          const itemLabel = r.productName ?? "Item";
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

        {/* Awaiting checkout — bloqueadas */}
        {tasks.filter(t => t.status === "awaiting_checkout").length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: T.muted, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
              <I n="clock" s={11} c={T.muted} /> Aguardando checkout
            </div>
            {tasks.filter(t => t.status === "awaiting_checkout").map(t => (
              <div key={t.id} style={{ background: T.glass, border: `1px solid ${T.border}`, borderRadius: 20, marginBottom: 10, padding: 16, opacity: 0.65 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 900 }}>{t.cabinName || "Cabana"}</div>
                    <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{getTaskLabel(t.type)}</div>
                  </div>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <div style={{ fontSize: 12, color: T.muted, padding: "8px 12px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}` }}>
                  Aguardando o hóspede fazer checkout para iniciar
                </div>
              </div>
            ))}
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
                {/* Ação principal sozinha na linha. "Não limpar" saiu daqui de propósito: era um
                    botão âmbar pequeno à esquerda de um botão grande — exatamente o desenho do
                    "Pausar" do checklist. Agora vive embaixo, em outra cor, com outro ícone e
                    outra forma (tracejado), para não ser confundido nem acertado de raspão. */}
                <button
                  onPointerDown={(e) => { e.preventDefault(); if (!startingTaskId) setConfirmStart(t.id); }}
                  disabled={startingTaskId !== null}
                  style={{ width: "100%", padding: 16, background: T.grad, color: "#fff", fontFamily: "inherit", fontSize: 15, fontWeight: 800, letterSpacing: "0.03em", textTransform: "uppercase" as const, border: "none", borderRadius: 16, cursor: startingTaskId ? "wait" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 4px 20px rgba(155,109,255,0.35)", opacity: startingTaskId ? 0.7 : 1 }}
                >
                  {startingTaskId === t.id ? <><I n="loader" s={18} c="#fff" w={2} /> Iniciando...</> : <>{t.startedAt ? "Retomar" : "Iniciar"} <I n="arrow" s={18} /></>}
                </button>
                <button
                  onPointerDown={(e) => { e.preventDefault(); if (!startingTaskId) onSkip(t.id); }}
                  disabled={startingTaskId !== null}
                  style={{ width: "100%", marginTop: 10, padding: "11px 14px", background: "transparent", border: `1px dashed ${T.roseBorder}`, color: T.rose, fontFamily: "inherit", fontSize: 12, fontWeight: 800, letterSpacing: "0.02em", borderRadius: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, opacity: startingTaskId ? 0.4 : 0.85 }}
                >
                  <I n="dnd" s={15} c={T.rose} /> Hóspede não quer limpeza
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Waiting */}
        {waiting.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: T.amber, marginBottom: 10 }}>Aguardando governanta</div>
            {/* Card inerte para quem é só camareira (o ✓ antigo parecia botão de aprovar e não
                fazia nada — ver histórico "camareira tentava liberar a própria faxina daqui").
                Quem acumula o cargo de governanta ganha atalho para a conferência. */}
            {waiting.map(t => onConfer ? (
              <button
                key={t.id}
                onClick={onConfer}
                style={{ width: "100%", textAlign: "left", cursor: "pointer", background: T.glass, border: `1px solid ${T.amberBorder}`, borderRadius: 16, marginBottom: 10, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, fontFamily: "inherit" }}
              >
                <div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: T.amber }}>{t.cabinName || "Cabana"}</div>
                  <div style={{ fontSize: 12, color: T.amber, opacity: 0.7, marginTop: 2 }}>Toque para conferir e liberar</div>
                </div>
                <I n="chevr" s={22} c={T.amber} />
              </button>
            ) : (
              <div key={t.id} style={{ background: T.glass, border: `1px solid ${T.border}`, borderRadius: 16, marginBottom: 10, padding: "14px 16px", opacity: 0.7, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: T.amber }}>{t.cabinName || "Cabana"}</div>
                  <div style={{ fontSize: 12, color: T.amber, opacity: 0.7, marginTop: 2 }}>Aguardando aprovação</div>
                </div>
                <I n="clock" s={24} c={T.amber} />
              </div>
            ))}
          </div>
        )}

        {/* Não limpar hoje — a rede de segurança. A faxina pulada some do quadro, então antes
            dela existir aqui um toque errado só voltava atrás por telefone com o gestor. */}
        {skippedTasks.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: T.rose, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
              <I n="dnd" s={12} c={T.rose} /> Não limpar hoje
            </div>
            {skippedTasks.map(t => (
              <div key={t.id} style={{ background: T.roseBg, border: `1px dashed ${T.roseBorder}`, borderRadius: 18, marginBottom: 10, padding: "14px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 21, fontWeight: 900, color: T.rose, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{t.cabinName || "Cabana"}</div>
                    <div style={{ fontSize: 12, color: T.rose, opacity: 0.7, marginTop: 2 }}>{getTaskLabel(t.type)}</div>
                  </div>
                  <I n="dnd" s={26} c={T.rose} />
                </div>
                {/* Também por pressão: se voltar fosse um toque, o hóspede que pediu para não
                    limpar viraria uma faxina de volta na lista por esbarrão — o mesmo erro na
                    direção contrária. Menos tempo (0,9s) porque desfazer é menos grave, e sem
                    peso visual: este cartão fica o dia todo na tela. */}
                <HoldConfirm
                  label="Desfazer"
                  holdingLabel="Segure..."
                  icon="undo"
                  ms={900}
                  tone="quiet"
                  size="sm"
                  hint="nudge"
                  disabled={unskippingId !== null && unskippingId !== t.id}
                  busy={unskippingId === t.id}
                  onComplete={() => onUnskip(t.id)}
                />
              </div>
            ))}
          </div>
        )}

        {/* "Quadro limpo!" só pode aparecer quando o quadro REALMENTE chegou vazio. Se a busca
            falhou, o vazio é erro — e afirmar que não há faxina manda a camareira embora de uma
            cabana que precisa de limpeza (relato de 27/08: "os serviços da Renata sumiram"). */}
        {tasks.length === 0 && skippedTasks.length === 0 && (loadFailed ? (
          <div style={{ textAlign: "center", padding: "44px 8px" }}>
            <div style={{
              width: 68, height: 68, borderRadius: 24, margin: "0 auto 16px", background: T.amberBg,
              border: `2px solid ${T.amberBorder}`, display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <I n="info" s={34} c={T.amber} />
            </div>
            <div style={{ fontSize: 18, fontWeight: 900 }}>Não consegui carregar</div>
            <div style={{ fontSize: 14, color: T.muted, marginTop: 8, lineHeight: 1.5, maxWidth: 280, marginInline: "auto" }}>
              Suas faxinas <b style={{ color: T.text }}>continuam salvas</b> — é só a internet deste
              aparelho. Toque para tentar de novo.
            </div>
            <button
              onClick={onReload}
              style={{
                marginTop: 20, padding: "16px 28px", background: T.grad, color: "#fff", border: "none",
                borderRadius: 16, cursor: "pointer", fontFamily: "inherit", fontSize: 15, fontWeight: 900,
                letterSpacing: "0.03em", textTransform: "uppercase" as const,
                display: "inline-flex", alignItems: "center", gap: 9,
              }}
            >
              <I n="undo" s={19} c="#fff" w={2.3} /> Tentar de novo
            </button>
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: 48 }}>✨</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 12 }}>Quadro limpo!</div>
            <div style={{ fontSize: 13, color: T.muted, marginTop: 6 }}>Nenhuma faxina pendente.</div>
          </div>
        ))}
      </div>

      {fullTask && (
        <TaskSheet
          task={fullTask} onClose={closeDetail} onToggle={onToggle}
          showToast={showToast} propertyId={propertyId} userId={userId} userName={userName}
          onChecklistLoaded={onChecklistLoaded}
          onFinish={onFinish} onPause={onPause} onUpgrade={onUpgrade}
        />
      )}

      {/* Confirmação de início — evita iniciar por toque acidental ao rolar a lista */}
      {confirmTask && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 24 }}>
          {!startArmed && <TapShield z={310} />}
          <div style={{ background: "#111827", border: `1px solid ${T.border2}`, borderRadius: 24, padding: 24, width: "100%", maxWidth: 340, boxShadow: "0 20px 60px rgba(0,0,0,0.7)" }}>
            <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 6 }}>
              {confirmTask.startedAt ? "Retomar esta faxina?" : "Iniciar esta faxina?"}
            </div>
            <div style={{ fontSize: 13, color: T.muted, marginBottom: 20 }}>
              {confirmTask.cabinName || "Cabana"} · {getTaskLabel(confirmTask.type)}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmStart(null)} style={{ flex: 1, padding: 14, background: T.glass, border: `1px solid ${T.border}`, borderRadius: 14, cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 700, color: T.muted }}>
                Cancelar
              </button>
              <button
                onPointerDown={(e) => { e.preventDefault(); const id = confirmStart; setConfirmStart(null); if (id && !startingTaskId) onStart(id); }}
                disabled={startingTaskId !== null}
                style={{ flex: 1, padding: 14, background: T.grad, color: "#fff", fontFamily: "inherit", fontSize: 14, fontWeight: 800, border: "none", borderRadius: 14, cursor: startingTaskId ? "wait" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: startingTaskId ? 0.7 : 1 }}
              >
                <I n="check" s={17} c="#fff" w={2.5} /> {confirmTask.startedAt ? "Retomar" : "Iniciar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Escudo pós-fechamento da sheet: o footer "Pausar"/"Finalizar" age no pointerdown e
          some na hora, deixando os botões dos cartões expostos bem debaixo do dedo. Sem isto
          o click órfão do mesmo toque cai na lista. */}
      {shield && <TapShield z={290} />}
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
  const router = useRouter();
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
                  <div key={m.id} onClick={() => router.push(`/equipe/${m.id}`)} style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "10px",
                    background: T.glass2, border: `1px solid ${T.border}`, borderRadius: 14,
                    cursor: "pointer",
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
          <ScrapWall profileStaffId={userData.id} isOwnProfile={true} propertyId={userData.propertyId} allowRecipientPicker={true} profileBasePath="/equipe" />
        </div>
      )}

      <MaintenanceReportButton />

      <button onClick={onLogout} style={{ width: "100%", padding: 15, background: T.glass2, color: T.red, fontFamily: "inherit", fontSize: 14, fontWeight: 700, letterSpacing: "0.02em", textTransform: "uppercase" as const, border: `1px solid ${T.redBg}`, borderRadius: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <I n="logout" s={18} c={T.red} /> Sair do aplicativo
      </button>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

type Tab = "home" | "tasks" | "profile";

export default function MaidPage() {
  const { userData, loading: authLoading, userDataReady, authConfirmed } = useAuth();
  const { currentProperty: property, loading: propertyLoading } = useProperty();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("home");
  const [tasks, setTasks] = useState<EnrichedTask[]>([]);
  const [skippedTasks, setSkippedTasks] = useState<EnrichedTask[]>([]);
  // Primeira carga falhou: o quadro está vazio por ERRO, não por falta de trabalho.
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadSeq, setReloadSeq] = useState(0);
  // `dataLoading` virava false no finally do init, mas as TAREFAS ainda estavam a caminho
  // (listenToActiveTasks busca fora do await). A tela liberava com a lista vazia e piscava
  // "Quadro limpo!" para quem tinha faxina. O quadro só conta como carregado quando a
  // primeira resposta chega — ou quando desiste.
  const [tasksReady, setTasksReady] = useState(false);
  const tasksReadyRef = useRef(false);
  const firstLoadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cabins, setCabins] = useState<Record<string, Cabin>>({});
  const [dataLoading, setDataLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; color: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [repRequests, setRepRequests] = useState<RestockRequest[]>([]);
  const [pauseConfirm, setPauseConfirm] = useState<{ currentTaskId: string; newTaskId: string } | null>(null);
  const startingRef = useRef(false);
  const [startingTaskId, setStartingTaskId] = useState<string | null>(null);
  const [pauseStartBusy, setPauseStartBusy] = useState(false);
  const [skipConfirmTaskId, setSkipConfirmTaskId] = useState<string | null>(null);
  const [skipBusy, setSkipBusy] = useState(false);
  const [undoSkip, setUndoSkip] = useState<{ id: string; name: string } | null>(null);
  const [unskippingId, setUnskippingId] = useState<string | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutRef = useRef(false);

  // Camareira que também é governanta: as faxinas dela próprias ficam em "Aguardando
  // governanta" aqui, e a conferência mora no app da governanta — sem este atalho ela
  // ficava tocando no card (inerte) achando que o sistema não deixava liberar as suas.
  // Mesma regra do RoleGuard/RoleSwitcher: cargo primário OU secundário.
  const canConfer = !!userData && ["governance", "super_admin", "admin", "manager"].some(
    r => userData.role === r || (userData.secondaryRoles ?? []).includes(r as typeof userData.role)
  );

  const showToast = useCallback((msg: string, color = T.green) => {
    setToast({ msg, color });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  // Mutação de tarefa via rota de servidor: 1 round-trip a partir do dispositivo (o servidor
  // faz update + cabana + auditoria/push com service-role, rápido e confiável). keepalive
  // garante a entrega mesmo se a camareira bloquear o celular logo após o toque.
  const postAction = useCallback(async (action: string, taskId: string, extra?: Record<string, unknown>) => {
    const res = await fetch('/api/field/housekeeping-tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, taskId, ...extra }),
      keepalive: true,
    });
    if (!res.ok) {
      const code = await res.json().then((b: { error?: string }) => b?.error).catch(() => null);
      throw new Error(code || 'REQUEST_FAILED');
    }
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
      // Sem propriedade o init nunca roda — sem isto o spinner ficaria eterno agora que o
      // carregamento espera a primeira resposta das tarefas.
      tasksReadyRef.current = true;
      setTasksReady(true);
    }
  }, [authLoading, userDataReady, propertyLoading, property]);

  useEffect(() => {
    // authConfirmed (garantido em ~1,5s pelo safety-timeout do AuthContext) destrava o
    // carregamento de forma confiável. As tarefas são lidas via rota de servidor
    // (/api/field/housekeeping-tasks), que usa a sessão validada/renovada pelo middleware —
    // não dependemos mais do tokenReady, cujo evento INITIAL_SESSION podia nunca chegar no
    // refresh mobile (lock travado), causando loop infinito de carregamento.
    if (!property || !authConfirmed) return;

    let unsubscribe: (() => void) | undefined;

    const markTasksReady = () => {
      tasksReadyRef.current = true;
      setTasksReady(true);
      if (firstLoadTimer.current) { clearTimeout(firstLoadTimer.current); firstLoadTimer.current = null; }
    };

    const init = async () => {
      setDataLoading(true);
      setLoadFailed(false);
      tasksReadyRef.current = false;
      setTasksReady(false);
      // Teto: se a primeira busca nunca voltar, não deixa a camareira presa no spinner —
      // assume falha e mostra o estado com "Tentar de novo".
      if (firstLoadTimer.current) clearTimeout(firstLoadTimer.current);
      firstLoadTimer.current = setTimeout(() => {
        if (!tasksReadyRef.current) { setLoadFailed(true); markTasksReady(); }
      }, 12000);
      try {
        // Timeout de 6s: evita que uma query lenta trave a tela de loading
        const withTimeout = <R,>(p: Promise<R>, fallback: R) =>
          Promise.race([p, new Promise<R>(resolve => setTimeout(() => resolve(fallback), 6000))]);
        const [cabinsData, structuresData] = await Promise.all([
          withTimeout(
            fetch(`/api/field/cabins?propertyId=${encodeURIComponent(property.id)}`, { cache: 'no-store' })
              .then(r => r.ok ? (r.json() as Promise<Cabin[]>) : ([] as Cabin[]))
              .catch(() => [] as Cabin[]),
            [] as Cabin[]
          ),
          withTimeout(
            // Estruturas via rota de campo (service-role). Lendo pelo client do browser, o lock
            // frio do refresh mobile devolvia [] → faxina de estrutura mostrava o UUID cru.
            fetch(`/api/field/structures?propertyId=${encodeURIComponent(property.id)}`, { cache: 'no-store' })
              .then(r => r.ok ? (r.json() as Promise<Structure[]>) : ([] as Structure[]))
              .catch(() => [] as Structure[]),
            [] as Structure[]
          ),
        ]);
        const cabinMap: Record<string, Cabin> = {};
        cabinsData.forEach(c => { cabinMap[c.id] = c; });
        setCabins(cabinMap);

        const structureMap: Record<string, Structure> = {};
        structuresData.forEach(s => { structureMap[s.id] = s; });

        // Resolve o nome do local da tarefa: cabana → estrutura (+ unidade) → local avulso.
        const resolveLocationName = (t: HousekeepingTask): string => {
          if (t.cabinId) return cabinMap[t.cabinId]?.name ?? t.cabinId;
          if (t.structureId) {
            const s = structureMap[t.structureId];
            const base = s?.name ?? t.structureId;
            const unit = t.unitId ? s?.units?.find(u => u.id === t.unitId)?.name : undefined;
            return unit ? `${base} — ${unit}` : base;
          }
          return t.customLocation ?? "Tarefa";
        };

        unsubscribe = HousekeepingService.listenToActiveTasks(property.id, allTasks => {
          const myId = userData?.id;
          // Fora do quadro da camareira: concluída/cancelada e a pausada pelo DND do hóspede
          // ('paused'). Nenhuma delas tem ação possível aqui — se ficarem na lista viram cartão
          // fantasma (contam em "N atribuída(s) hoje" e aparecem como "Pendente" no Início, sem
          // nada em PARA FAZER). Governanta e admin continuam vendo as puladas em "Não Realizadas".
          const isOffBoard = (s: string) => s === "completed" || s === "cancelled" || s === "paused";
          const mine = (userData?.role === "maid" && myId)
            ? allTasks.filter(t => t.assignedTo?.includes(myId))
            : allTasks;

          const enrich = (t: HousekeepingTask): EnrichedTask => ({ ...t, cabinName: resolveLocationName(t) });
          setTasks(mine.filter(t => t.status !== "skipped" && !isOffBoard(t.status)).map(enrich));
          // 'skipped' sai do quadro principal mas fica num bloco próprio ("Não limpar hoje"),
          // só de hoje, para que um toque errado se conserte sem ligar para o gestor.
          const today = new Date().toDateString();
          markTasksReady();
          setSkippedTasks(
            mine
              .filter(t => t.status === "skipped")
              .filter(t => { const s = t.skippedAt ?? t.updatedAt; return !s || new Date(s).toDateString() === today; })
              .map(enrich)
          );
        }, "day", () => { setLoadFailed(true); markTasksReady(); });
      } catch {
        showToast("Erro ao carregar dados.", T.red);
        setLoadFailed(true);
        markTasksReady();
      } finally {
        setDataLoading(false);
      }
    };

    init();
    return () => {
      unsubscribe?.();
      if (firstLoadTimer.current) { clearTimeout(firstLoadTimer.current); firstLoadTimer.current = null; }
    };
  }, [property, userData?.id, userData?.role, showToast, authConfirmed, reloadSeq]);

  // Feed de reposições no cartão da faxina — fetch via rota field; o realtime
  // da tabela restock_requests só dispara o refetch.
  const fetchRepRequests = useCallback(async () => {
    if (!property?.id) return;
    try {
      const r = await fetch(`/api/field/restock-requests?propertyId=${encodeURIComponent(property.id)}`, { cache: "no-store" });
      if (r.ok) {
        const rows = (await r.json()) as RestockRequest[];
        setRepRequests(rows.filter(x => x.status === "pending" || x.status === "in_progress"));
      }
    } catch { /* mantém o estado atual */ }
  }, [property?.id]);

  useEffect(() => {
    if (!property?.id) return;
    fetchRepRequests();
    return RestockService.listenToRequests(property.id, fetchRepRequests);
  }, [property?.id, fetchRepRequests]);

  const handleStart = useCallback(async (taskId: string) => {
    if (!property || !userData || startingRef.current) return;
    const activeTask = tasks.find(t => t.status === "in_progress");
    if (activeTask && activeTask.id !== taskId) {
      setPauseConfirm({ currentTaskId: activeTask.id, newTaskId: taskId });
      return;
    }
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    startingRef.current = true;
    setStartingTaskId(taskId);

    const prev = tasks;
    const isResume = !!task.startedAt;
    const nowIso = new Date().toISOString();
    // Otimista: move o cartão para "Em andamento" na hora. O realtime reconcilia em seguida.
    setTasks(curr => curr.map(t => {
      if (t.id !== taskId) return t;
      if (isResume) {
        const pausedMs = t.pausedAt ? Date.now() - new Date(t.pausedAt).getTime() : 0;
        return { ...t, status: "in_progress", pausedAt: undefined, totalPausedDuration: (t.totalPausedDuration || 0) + Math.floor(pausedMs / 1000) };
      }
      return { ...t, status: "in_progress", startedAt: nowIso };
    }));
    showToast(isResume ? "Limpeza retomada! Cronômetro continuando." : "Limpeza iniciada! Cronômetro rodando.");

    try {
      await postAction(isResume ? "resume" : "start", taskId);
    } catch {
      setTasks(prev);
      showToast("Erro ao iniciar tarefa.", T.red);
    } finally {
      startingRef.current = false;
      setStartingTaskId(null);
    }
  }, [property, userData, tasks, showToast, postAction]);

  const handlePauseAndStart = useCallback(async () => {
    if (!pauseConfirm || !property || !userData || pauseStartBusy) return;
    setPauseStartBusy(true);
    const { currentTaskId, newTaskId } = pauseConfirm;
    const prev = tasks;
    const newTask = tasks.find(t => t.id === newTaskId);
    const isResume = !!newTask?.startedAt;
    const nowIso = new Date().toISOString();
    // Otimista: pausa a atual e ativa a nova imediatamente.
    setTasks(curr => curr.map(t => {
      if (t.id === currentTaskId) return { ...t, status: "pending", pausedAt: nowIso };
      if (t.id === newTaskId) {
        if (isResume) {
          const pausedMs = t.pausedAt ? Date.now() - new Date(t.pausedAt).getTime() : 0;
          return { ...t, status: "in_progress", pausedAt: undefined, totalPausedDuration: (t.totalPausedDuration || 0) + Math.floor(pausedMs / 1000) };
        }
        return { ...t, status: "in_progress", startedAt: nowIso };
      }
      return t;
    }));
    setPauseConfirm(null);
    showToast("Tarefa anterior pausada. Nova limpeza iniciada!");
    try {
      await postAction("pause", currentTaskId);
      await postAction(isResume ? "resume" : "start", newTaskId);
    } catch {
      setTasks(prev);
      showToast("Erro ao trocar tarefa.", T.red);
    } finally {
      setPauseStartBusy(false);
    }
  }, [pauseConfirm, property, userData, tasks, showToast, pauseStartBusy, postAction]);

  const handleSkip = useCallback(async () => {
    if (!skipConfirmTaskId || !property || !userData || skipBusy) return;
    setSkipBusy(true);
    const id = skipConfirmTaskId;
    const prev = tasks;
    const task = tasks.find(t => t.id === id);
    setTasks(curr => curr.filter(t => t.id !== id));
    if (task) setSkippedTasks(curr => curr.some(t => t.id === id) ? curr : [...curr, { ...task, status: "skipped" }]);
    setSkipConfirmTaskId(null);
    // Barra de desfazer em vez do toast de 2,6s: quem pulou sem querer tem 15s e um botão
    // grande para voltar atrás na hora, antes de sequer sair da tela.
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndoSkip({ id, name: task?.cabinName || "Faxina" });
    undoTimer.current = setTimeout(() => setUndoSkip(null), 15000);
    try {
      await postAction("skip", id);
    } catch {
      setTasks(prev);
      setSkippedTasks(curr => curr.filter(t => t.id !== id));
      setUndoSkip(null);
      showToast("Erro ao registrar. A faxina continua na lista.", T.red);
    } finally {
      setSkipBusy(false);
    }
  }, [skipConfirmTaskId, property, userData, skipBusy, showToast, tasks, postAction]);

  const handleUnskip = useCallback(async (taskId: string) => {
    if (!property || !userData || unskippingId) return;
    setUnskippingId(taskId);
    const task = skippedTasks.find(t => t.id === taskId);
    setSkippedTasks(curr => curr.filter(t => t.id !== taskId));
    if (task) setTasks(curr => curr.some(t => t.id === taskId) ? curr : [...curr, { ...task, status: "pending", skippedAt: undefined }]);
    setUndoSkip(u => u?.id === taskId ? null : u);
    showToast("Pronto! A faxina voltou para a sua lista.");
    try {
      await postAction("unskip", taskId);
    } catch {
      // Rollback: devolve ao bloco "Não limpar hoje" para não sumir dos dois lugares.
      setTasks(curr => curr.filter(t => t.id !== taskId));
      if (task) setSkippedTasks(curr => curr.some(t => t.id === taskId) ? curr : [...curr, task]);
      showToast("Erro ao voltar a faxina.", T.red);
    } finally {
      setUnskippingId(null);
    }
  }, [property, userData, unskippingId, skippedTasks, showToast, postAction]);

  const handleFinish = useCallback(async (taskId: string, checklist: ChecklistItem[]) => {
    if (!property || !userData) return;
    const prev = tasks;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    // Otimista: conferência → "Aguardando governanta"; caso contrário conclui e sai da lista.
    const goesToConference = requiresConferenceClient(task);
    setTasks(curr => goesToConference
      ? curr.map(t => t.id === taskId ? { ...t, status: "waiting_conference", checklist } : t)
      : curr.filter(t => t.id !== taskId));
    showToast(goesToConference ? "Enviada para conferência da governanta!" : "Faxina concluída!");
    try {
      await postAction("finish", taskId, { checklist, observations: "" });
    } catch (e) {
      setTasks(prev);
      if ((e as Error).message === "CHECKLIST_INCOMPLETE") showToast("Marque ao menos um item antes de finalizar.", T.amber);
      else showToast("Erro ao finalizar.", T.red);
    }
  }, [property, userData, tasks, showToast, postAction]);

  const handlePause = useCallback(async (taskId: string) => {
    if (!property || !userData) return;
    const prev = tasks;
    const nowIso = new Date().toISOString();
    setTasks(curr => curr.map(t => t.id === taskId ? { ...t, status: "pending", pausedAt: nowIso } : t));
    showToast("Limpeza pausada.");
    try {
      await postAction("pause", taskId);
    } catch {
      setTasks(prev);
      showToast("Erro ao pausar tarefa.", T.red);
    }
  }, [property, userData, tasks, showToast, postAction]);

  const handleUpgrade = useCallback(async (taskId: string) => {
    if (!property || !userData) return;
    const prev = tasks;
    setTasks(curr => curr.map(t => t.id === taskId ? { ...t, type: "linen_change" } : t));
    showToast("Convertido para Troca de Roupa!");
    try {
      await postAction("upgrade", taskId);
    } catch {
      setTasks(prev);
      showToast("Erro ao converter tarefa.", T.red);
    }
  }, [property, userData, tasks, showToast, postAction]);

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

  const handleLogout = () => {
    if (logoutRef.current) return;
    logoutRef.current = true;
    showToast("Saindo...");
    // Usa rota server-side para garantir limpeza dos cookies sb- mesmo quando o
    // token local está expirado e supabase.auth.signOut() falharia silenciosamente,
    // deixando o cookie stale que o middleware usa para redirecionar de volta ao app.
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 4000);
    fetch('/api/auth/signout', { method: 'POST', signal: ctrl.signal })
      .catch(() => {})
      .finally(() => { window.location.href = '/admin/login'; });
  };

  const skipTask = skipConfirmTaskId ? tasks.find(t => t.id === skipConfirmTaskId) ?? null : null;
  const skipArmed = useArmed(!!skipTask);
  const pauseArmed = useArmed(!!pauseConfirm);

  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current); }, []);

  const navItems: { id: Tab; label: string; icon: IName; badge: number }[] = [
    { id: "home", label: "Início", icon: "home", badge: 0 },
    { id: "tasks", label: "Faxinas", icon: "sparkles", badge: tasks.filter(t => t.status === "pending" || t.status === "in_progress").length },
    { id: "profile", label: "Equipe", icon: "users", badge: 0 },
  ];

  // dataLoading começa true e só vai para false quando init() termina.
  // init() é gateado em authConfirmed — o spinner mostra naturalmente até a sessão ser confirmada.
  const isBootstrapping = authLoading || !userDataReady || propertyLoading;
  const loading = isBootstrapping || dataLoading || !tasksReady;

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
              // Logout de emergência: não usa o browser Supabase client (pode estar travado).
              // Chama a rota server-side que limpa os cookies sb- e força navegação hard.
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

      <div className="dark maid-shell" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100dvh", background: T.bg }}>
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
            {tab === "tasks" && <FaxinasScreen tasks={tasks} skippedTasks={skippedTasks} onStart={handleStart} onSkip={setSkipConfirmTaskId} onUnskip={handleUnskip} showToast={showToast} onToggle={handleToggle} propertyId={property?.id ?? ""} userId={userData?.id ?? ""} userName={userData?.fullName ?? "Camareira"} onChecklistLoaded={handleChecklistLoaded} repRequests={repRequests} startingTaskId={startingTaskId} unskippingId={unskippingId} onFinish={handleFinish} onPause={handlePause} onUpgrade={handleUpgrade} onConfer={canConfer ? () => router.push("/governanta?screen=conference") : undefined} loadFailed={loadFailed} onReload={() => setReloadSeq(n => n + 1)} />}
            {tab === "profile" && <ProfileScreen userData={userData} showToast={showToast} onLogout={handleLogout} propertyId={property?.id ?? ""} />}
          </div>

          {/* Pause confirm modal */}
          {pauseConfirm && (
            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 24 }}>
              {!pauseArmed && <TapShield z={310} />}
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
                    disabled={pauseStartBusy}
                    style={{ flex: 1, padding: 14, background: T.greenG, color: "#021a17", fontFamily: "inherit", fontSize: 14, fontWeight: 800, border: "none", borderRadius: 14, cursor: pauseStartBusy ? "wait" : "pointer", opacity: pauseStartBusy ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                  >
                    {pauseStartBusy ? <I n="loader" s={16} c="#021a17" w={2} /> : "Pausar e iniciar"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Confirmação de "não limpar" — a ÚNICA agora.
              Antes eram duas caixas em cascata, ambas centralizadas, do mesmo tamanho, com o
              botão de confirmar a ~12px de distância: a primeira agia no pointerdown e a
              segunda herdava o click do mesmo toque. Um toque só pulava a faxina sem que a
              camareira chegasse a ver a segunda pergunta.
              Agora: uma caixa, inerte nos primeiros 450ms (mata o click órfão), com o local
              em letra grande, o caminho seguro em destaque e o confirmar exigindo 1,6s de
              dedo firme — impossível de acertar por engano ou de raspão. */}
          {skipTask && (
            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.82)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 20, backdropFilter: "blur(3px)" }}>
              {!skipArmed && <TapShield z={310} />}
              <div style={{ background: "#111827", border: `1px solid ${T.roseBorder}`, borderRadius: 26, padding: "26px 20px 20px", width: "100%", maxWidth: 340, boxShadow: "0 20px 60px rgba(0,0,0,0.75)", animation: "maid-pop .18s ease" }}>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
                  <div style={{ width: 72, height: 72, borderRadius: 24, background: T.roseBg, border: `2px solid ${T.roseBorder}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <I n="dnd" s={38} c={T.rose} w={1.9} />
                  </div>
                </div>
                <div style={{ textAlign: "center" as const, fontSize: 15, fontWeight: 700, color: T.muted, marginBottom: 4 }}>
                  O hóspede pediu para NÃO limpar
                </div>
                <div style={{ textAlign: "center" as const, fontSize: 26, fontWeight: 900, color: T.text, lineHeight: 1.15, marginBottom: 4 }}>
                  {skipTask.cabinName || "Cabana"}
                </div>
                <div style={{ textAlign: "center" as const, fontSize: 13, color: T.muted, marginBottom: skipTask.startedAt ? 12 : 18 }}>
                  {getTaskLabel(skipTask.type)} · sai da sua lista de hoje
                </div>
                {/* Foi exatamente este o caso da 06: faxina já começada, dedo no "pausar". */}
                {skipTask.startedAt && (
                  <div style={{ display: "flex", alignItems: "center", gap: 9, background: T.amberBg, border: `1px solid ${T.amberBorder}`, borderRadius: 14, padding: "10px 12px", marginBottom: 18 }}>
                    <I n="pause" s={17} c={T.amber} w={2} />
                    <span style={{ fontSize: 12.5, fontWeight: 800, color: T.amber, lineHeight: 1.35 }}>
                      Você já começou esta faxina. Queria só <b>pausar</b>?
                    </span>
                  </div>
                )}

                {/* O caminho seguro é o botão grande e colorido; o destrutivo exige pressão. */}
                <button
                  onClick={() => setSkipConfirmTaskId(null)}
                  style={{ width: "100%", padding: 17, background: T.greenG, color: "#021a17", border: "none", borderRadius: 18, cursor: "pointer", fontFamily: "inherit", fontSize: 15, fontWeight: 900, letterSpacing: "0.03em", textTransform: "uppercase" as const, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 14 }}
                >
                  <span style={{ display: "inline-flex", transform: "rotate(180deg)" }}><I n="arrow" s={19} c="#021a17" w={2.4} /></span> Não, voltar
                </button>
                <HoldConfirm
                  label="Não limpar"
                  holdingLabel="Segure..."
                  icon="dnd"
                  ms={1600}
                  tone="danger"
                  size="lg"
                  hint="always"
                  disabled={!skipArmed}
                  busy={skipBusy}
                  onComplete={handleSkip}
                />
              </div>
            </div>
          )}

          {/* Desfazer — 15s com um botão grande, para o engano morrer na própria tela */}
          {undoSkip && (
            <div style={{ position: "absolute", left: 12, right: 12, bottom: "calc(env(safe-area-inset-bottom,8px) + 76px)", zIndex: 250, animation: "maid-toast .22s ease" }}>
              <div style={{ background: "#111827", border: `1px solid ${T.roseBorder}`, borderRadius: 18, padding: "12px 12px 12px 14px", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 12px 40px rgba(0,0,0,0.6)" }}>
                <I n="dnd" s={22} c={T.rose} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{undoSkip.name}</div>
                  <div style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>Não vai ser limpa hoje</div>
                </div>
                <div style={{ flexShrink: 0, width: 132 }}>
                  <HoldConfirm
                    label="Desfazer"
                    holdingLabel="Segure..."
                    icon="undo"
                    ms={900}
                    tone="quiet"
                    size="sm"
                    hint="nudge"
                    disabled={unskippingId !== null && unskippingId !== undoSkip.id}
                    busy={unskippingId === undoSkip.id}
                    onComplete={() => handleUnskip(undoSkip.id)}
                  />
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
