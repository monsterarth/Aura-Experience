"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import { HousekeepingService } from "@/services/housekeeping-service";
import { CabinService } from "@/services/cabin-service";
import { ConciergeService } from "@/services/concierge-service";
import { StayService } from "@/services/stay-service";
import { supabase } from "@/lib/supabase";
import { HousekeepingTask, Cabin, ConciergeItem, MinibarItem } from "@/types/aura";

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

// ─── Bottom Sheet wrapper ─────────────────────────────────────────────────────

function Sheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "absolute", inset: 0, zIndex: 50,
        background: "rgba(0,0,0,0.75)",
        display: "flex", flexDirection: "column", justifyContent: "flex-end",
        animation: "maid-fadein .2s ease", backdropFilter: "blur(4px)",
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: "#0d1020", border: `1px solid ${T.border2}`,
        borderRadius: "28px 28px 0 0", borderBottom: "none",
        maxHeight: "92dvh", display: "flex", flexDirection: "column",
        animation: "maid-slideup .28s cubic-bezier(.32,.72,0,1)",
      }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: T.border2, margin: "12px auto 4px", flexShrink: 0 }} />
        {children}
      </div>
    </div>
  );
}

// ─── Icon component (subset) ─────────────────────────────────────────────────

type IName = "home"|"coffee"|"sparkles"|"user"|"key"|"check"|"arrow"|"plus"|"minus"|"x"|"pkg"|"info"|"send"|"logout"|"edit"|"sun"|"clock"|"list"|"chevr"|"loader"|"camera"|"inbox"|"search";

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
  };
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round">
      {d[n]}
    </svg>
  );
}

// ─── Minibar Sheet ────────────────────────────────────────────────────────────

function MinibarSheet({
  cabinName, items, onClose, onSend,
  keyLocation, stayId, propertyId, userId, userName, showToast,
}: {
  cabinName: string;
  items: MinibarItem[];
  onClose: () => void;
  onSend: (cart: Record<string, number>) => Promise<void>;
  keyLocation?: "reception" | "cabin" | "unknown";
  stayId?: string;
  propertyId?: string;
  userId?: string;
  userName?: string;
  showToast?: (msg: string, color?: string) => void;
}) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  // cart → key (if cabin) → lost → fin
  const [phase, setPhase] = useState<"cart" | "key" | "lost" | "fin">("cart");
  const [lostDesc, setLostDesc] = useState("");
  const [lostPhoto, setLostPhoto] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [savingLost, setSavingLost] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const adj = (id: string, d: number) =>
    setCart(p => { const n = { ...p }, v = Math.max(0, (p[id] ?? 0) + d); if (!v) delete n[id]; else n[id] = v; return n; });

  const total = Object.entries(cart).reduce((s, [id, q]) => s + (items.find(m => m.id === id)?.price ?? 0) * q, 0);
  const count = Object.values(cart).reduce((a, b) => a + b, 0);

  const submitCart = async () => {
    setBusy(true);
    try {
      await onSend(cart);
      setBusy(false);
      if (keyLocation === "cabin") {
        setPhase("key");
      } else {
        setPhase("lost");
      }
    } catch {
      setBusy(false);
    }
  };

  const confirmKey = async (found: boolean) => {
    if (!found && stayId && propertyId && userId) {
      try {
        await StayService.addFolioItemManual(
          propertyId, stayId,
          { description: "Chave não encontrada", quantity: 1, unitPrice: 0, totalPrice: 0, category: "services", addedBy: userId },
          userId, userName ?? "Camareira",
        );
        showToast?.("Chave não encontrada registrada no fólio.", T.amber);
      } catch { /* non-blocking */ }
    }
    setPhase("lost");
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("path", `lost-items/${stayId ?? "unknown"}/${Date.now()}`);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error("upload_failed");
      const { url } = await res.json();
      setLostPhoto(url);
    } catch {
      showToast?.("Erro ao enviar foto.", T.red);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const submitLost = async (hasItems: boolean) => {
    if (!hasItems) {
      setPhase("fin");
      showToast?.("Conferência concluída!");
      setTimeout(onClose, 700);
      return;
    }
    if (!lostDesc.trim()) return;
    setSavingLost(true);
    try {
      await supabase.from("stays").update({
        lostItemsDescription: lostDesc.trim(),
        lostItemsPhoto: lostPhoto,
        lostItemsReportedAt: new Date().toISOString(),
        lostItemsReportedBy: userId,
      }).eq("id", stayId ?? "");
      showToast?.("Objetos esquecidos registrados!", T.amber);
    } catch {
      showToast?.("Erro ao registrar. Tente novamente.", T.red);
    } finally {
      setSavingLost(false);
      setPhase("fin");
      setTimeout(onClose, 700);
    }
  };

  // ── Key step ────────────────────────────────────────────────────────────────
  if (phase === "key") {
    return (
      <Sheet onClose={onClose}>
        <div style={{ padding: "0 20px 14px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: T.amberBg, border: `1px solid ${T.amberBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <I n="key" s={22} c={T.amber} />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 900 }}>Confirmar Chave</div>
              <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{cabinName}</div>
            </div>
          </div>
          <div style={{ fontSize: 14, color: T.text, fontWeight: 600, marginTop: 16, lineHeight: 1.5 }}>
            A chave estava na acomodação?
          </div>
        </div>
        <div className="maid-sheet-body" style={{ padding: "0 16px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
            <button onClick={() => confirmKey(true)} style={{ padding: "20px 16px", background: T.greenBg, border: `2px solid ${T.greenBorder}`, borderRadius: 18, cursor: "pointer", fontFamily: "inherit", color: T.green, textAlign: "left", display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(45,212,191,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <I n="check" s={22} c={T.green} w={2.5} />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 900 }}>Sim, estava lá</div>
                <div style={{ fontSize: 12, color: T.green, opacity: 0.7, marginTop: 2 }}>Chave encontrada na acomodação</div>
              </div>
            </button>
            <button onClick={() => confirmKey(false)} style={{ padding: "20px 16px", background: T.redBg, border: `2px solid rgba(248,113,113,0.3)`, borderRadius: 18, cursor: "pointer", fontFamily: "inherit", color: T.red, textAlign: "left", display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(248,113,113,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <I n="x" s={22} c={T.red} w={2.5} />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 900 }}>Não encontramos</div>
                <div style={{ fontSize: 12, color: T.red, opacity: 0.7, marginTop: 2 }}>Será registrado no fólio da estadia</div>
              </div>
            </button>
          </div>
          <div style={{ height: 40 }} />
        </div>
      </Sheet>
    );
  }

  // ── Lost items step ─────────────────────────────────────────────────────────
  if (phase === "lost") {
    return (
      <Sheet onClose={onClose}>
        <div style={{ padding: "0 20px 14px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: T.blueBg, border: `1px solid ${T.blueBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <I n="search" s={22} c={T.blue} />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 900 }}>Objetos Esquecidos</div>
              <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{cabinName}</div>
            </div>
          </div>
          <div style={{ fontSize: 14, color: T.text, fontWeight: 600, marginTop: 16, lineHeight: 1.5 }}>
            Encontrou algum objeto esquecido?
          </div>
        </div>
        <div className="maid-sheet-body" style={{ padding: "0 16px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
            {/* Textarea for description */}
            <textarea
              placeholder="Descreva os objetos encontrados... (ex: óculos de sol, carregador, livro)"
              value={lostDesc}
              onChange={e => setLostDesc(e.target.value)}
              rows={4}
              style={{
                width: "100%", background: T.glass2, border: `1px solid ${lostDesc ? T.blueBorder : T.border}`,
                borderRadius: 16, padding: "14px 16px", color: T.text, fontSize: 14, fontFamily: "inherit",
                resize: "none", outline: "none", lineHeight: 1.6, transition: "border-color .15s",
              }}
            />

            {/* Photo upload */}
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handlePhotoChange} />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingPhoto}
              style={{
                width: "100%", padding: "14px 16px", background: lostPhoto ? "rgba(96,165,250,0.12)" : T.glass,
                border: `1px solid ${lostPhoto ? T.blueBorder : T.border}`, borderRadius: 16,
                cursor: uploadingPhoto ? "wait" : "pointer", fontFamily: "inherit", color: lostPhoto ? T.blue : T.muted,
                display: "flex", alignItems: "center", gap: 12, fontSize: 14, fontWeight: 600,
              }}
            >
              {uploadingPhoto ? (
                <><span style={{ display: "inline-flex", animation: "maid-spin 1s linear infinite" }}><I n="loader" s={18} c={T.blue} w={2} /></span> Enviando foto...</>
              ) : lostPhoto ? (
                <><I n="check" s={18} c={T.blue} /> Foto anexada — trocar</>
              ) : (
                <><I n="camera" s={18} c={T.muted} /> Tirar foto dos objetos</>
              )}
            </button>

            {lostPhoto && (
              <div style={{ borderRadius: 16, overflow: "hidden", border: `1px solid ${T.blueBorder}` }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={lostPhoto} alt="Objetos esquecidos" style={{ width: "100%", maxHeight: 200, objectFit: "cover", display: "block" }} />
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 4 }}>
              <button
                onClick={() => submitLost(false)}
                style={{ padding: "16px 12px", background: T.glass, border: `1px solid ${T.border}`, borderRadius: 16, cursor: "pointer", fontFamily: "inherit", color: T.muted, fontSize: 14, fontWeight: 700 }}
              >
                Não encontrei
              </button>
              <button
                onClick={() => submitLost(true)}
                disabled={!lostDesc.trim() || savingLost}
                style={{
                  padding: "16px 12px", background: lostDesc.trim() ? T.grad : T.glass,
                  border: `1px solid ${lostDesc.trim() ? "transparent" : T.border}`, borderRadius: 16,
                  cursor: lostDesc.trim() && !savingLost ? "pointer" : "not-allowed", fontFamily: "inherit",
                  color: lostDesc.trim() ? "#fff" : T.muted, fontSize: 14, fontWeight: 800,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  opacity: lostDesc.trim() ? 1 : 0.4,
                }}
              >
                {savingLost ? <I n="loader" s={16} c="#fff" w={2} /> : <><I n="send" s={16} />Registrar</>}
              </button>
            </div>
          </div>
          <div style={{ height: 32 }} />
        </div>
      </Sheet>
    );
  }

  // ── Cart step ───────────────────────────────────────────────────────────────
  return (
    <Sheet onClose={onClose}>
      <div style={{ padding: "0 20px 14px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900 }}>{cabinName}</div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 3, fontWeight: 500 }}>Conferência da cabana</div>
        </div>
        <button onClick={onClose} style={{ background: T.glass2, border: `1px solid ${T.border}`, borderRadius: 10, padding: 8, cursor: "pointer", color: T.muted }}>
          <I n="x" s={15} />
        </button>
      </div>

      {/* Steps indicator */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 20px 14px", flexShrink: 0 }}>
        {[
          { label: "Frigobar", active: true },
          { label: keyLocation === "cabin" ? "Chave" : null },
          { label: "Achados" },
        ].filter(s => s.label).map((s, i, arr) => (
          <React.Fragment key={i}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 20, height: 20, borderRadius: "50%", background: s.active ? T.g1 : "rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900, color: s.active ? "#fff" : T.muted }}>{i + 1}</div>
              <span style={{ fontSize: 11, fontWeight: s.active ? 700 : 500, color: s.active ? T.text : T.muted }}>{s.label}</span>
            </div>
            {i < arr.length - 1 && <div style={{ flex: 1, height: 1, background: T.border }} />}
          </React.Fragment>
        ))}
      </div>

      <div className="maid-sheet-body" style={{ padding: "0 16px" }}>
        {items.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 0", color: T.muted }}>
            <I n="inbox" s={36} c={T.muted} />
            <div style={{ fontSize: 13, marginTop: 10 }}>Nenhum item no frigobar</div>
          </div>
        ) : items.map(item => {
          const q = cart[item.id] ?? 0;
          return (
            <div key={item.id} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "12px",
              borderRadius: 14, borderBottom: `1px solid ${T.border}`,
              background: q > 0 ? "rgba(155,109,255,0.08)" : "transparent", transition: "background .15s",
            }}>
              <span style={{ flex: 1, fontSize: 14, fontWeight: q > 0 ? 700 : 400, color: q > 0 ? T.g1 : T.text }}>{item.name}</span>
              <span style={{ fontSize: 11, color: T.muted, marginRight: 6 }}>R${item.price}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button onClick={() => adj(item.id, -1)} disabled={!q} style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${T.border}`, background: T.glass2, cursor: q ? "pointer" : "not-allowed", opacity: q ? 1 : 0.3, display: "flex", alignItems: "center", justifyContent: "center", color: T.text }}>
                  <I n="minus" s={13} />
                </button>
                <span style={{ width: 18, textAlign: "center", fontWeight: 900, fontSize: 14 }}>{q}</span>
                <button onClick={() => adj(item.id, 1)} style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg,rgba(155,109,255,0.3),rgba(78,201,212,0.3))", border: "1px solid rgba(155,109,255,0.3)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: T.g1 }}>
                  <I n="plus" s={13} />
                </button>
              </div>
            </div>
          );
        })}
        <div style={{ height: 100 }} />
      </div>

      <div style={{ padding: "12px 16px", borderTop: `1px solid ${T.border}`, background: "#0d1020", flexShrink: 0 }}>
        {count > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, padding: "0 4px" }}>
            <span style={{ fontSize: 13, color: T.muted, fontWeight: 600 }}>{count} item(s)</span>
            <span style={{ fontSize: 14, fontWeight: 900, background: T.grad, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>R$ {total.toFixed(2)}</span>
          </div>
        )}
        <button
          onClick={submitCart}
          disabled={busy}
          style={{
            width: "100%", padding: 16, background: T.grad, color: "#fff",
            fontFamily: "inherit", fontSize: 14, fontWeight: 800, letterSpacing: "0.03em", textTransform: "uppercase" as const,
            border: "none", borderRadius: 16, cursor: busy ? "wait" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            boxShadow: "0 4px 20px rgba(155,109,255,0.35)",
          }}
        >
          {busy ? <I n="loader" s={17} c="#fff" w={2} /> : count > 0 ? <><I n="send" s={17} />Lançar e continuar</> : <><I n="arrow" s={17} />Sem consumo · Continuar</>}
        </button>
      </div>
    </Sheet>
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

  const adj = (id: string, d: number) =>
    setCart(p => { const n = { ...p }, v = Math.max(0, (p[id] ?? 0) + d); if (!v) delete n[id]; else n[id] = v; return n; });

  const count = Object.values(cart).reduce((a, b) => a + b, 0);

  const submit = async () => {
    setBusy(true);
    const entries = Object.entries(cart).filter(([, q]) => q > 0).map(([itemId, qty]) => ({ itemId, qty }));
    await onSend(entries);
    onClose();
  };

  return (
    <Sheet onClose={onClose}>
      <div style={{ padding: "0 20px 14px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900 }}>{cabinName}</div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 3 }}>Solicitar reposição</div>
        </div>
        <button onClick={onClose} style={{ background: T.glass2, border: `1px solid ${T.border}`, borderRadius: 10, padding: 8, cursor: "pointer", color: T.muted }}>
          <I n="x" s={15} />
        </button>
      </div>

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
        ) : (
          maidItems.map(item => {
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

  const handleSendRep = async (entries: { itemId: string; qty: number }[]) => {
    if (!task.stayId) { showToast("Sem reserva vinculada.", "var(--red)"); return; }
    try {
      await Promise.all(entries.map(({ itemId, qty }) =>
        ConciergeService.createRequest(
          { propertyId, stayId: task.stayId!, cabinId: task.cabinId, itemId, quantity: qty, requestedBy: "maid", notes: "Solicitado pela camareira" },
          userId, userName
        )
      ));
      showToast(`${entries.length} solicitação(ões) enviada(s)!`);
    } catch { showToast("Erro ao enviar solicitação.", T.red); }
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
                {task.type === "turnover" ? "Faxina Completa · Troca" : "Arrumação Diária"}
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
                    <I n="clock" s={11} c={T.green} /> {elapsed(task.startedAt as string)}
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

          {/* Reposição button */}
          <button onClick={openRep} style={{ width: "100%", padding: "15px 16px", background: T.glass, border: `1px solid ${T.border}`, borderRadius: 16, cursor: "pointer", color: T.text, display: "flex", alignItems: "center", gap: 12, fontFamily: "inherit", marginBottom: 20 }}>
            <div style={{ width: 38, height: 38, borderRadius: 12, background: `linear-gradient(135deg,rgba(245,158,11,0.2),rgba(252,211,77,0.15))`, border: `1px solid ${T.amberBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <I n="pkg" s={18} c={T.amber} />
            </div>
            <div style={{ textAlign: "left" as const, flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Solicitar Reposição</div>
              <div style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>Cama · Toalhas · Amenidades · Frigobar</div>
            </div>
            <I n="chevr" s={16} c={T.muted} />
          </button>
          <div style={{ height: 16 }} />
        </div>
      </Sheet>

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
  tasks, checkouts, cabins, onNav, userName,
}: {
  tasks: EnrichedTask[];
  checkouts: { cabinName: string; stayId: string }[];
  cabins: Record<string, Cabin>;
  onNav: (t: "home" | "checkouts" | "tasks" | "profile") => void;
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 20 }}>
        {[
          { label: "Ocupadas", val: all.filter(c => c.status === "occupied").length, color: T.blue, bg: T.blueBg, border: T.blueBorder },
          { label: "Checkouts", val: checkouts.length, color: T.amber, bg: T.amberBg, border: T.amberBorder },
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
                    {t.startedAt && <span style={{ marginLeft: "auto", fontSize: 12, color: T.green, fontWeight: 700 }}>{elapsed(t.startedAt as string)}</span>}
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

      {/* Checkouts CTA */}
      {checkouts.length > 0 && (
        <button onClick={() => onNav("checkouts")} style={{ width: "100%", textAlign: "left", cursor: "pointer", background: T.amberBg, border: `1px solid ${T.amberBorder}`, borderRadius: 20, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: T.amber, marginBottom: 4 }}>Checkouts aguardando</div>
              <div style={{ fontSize: 26, fontWeight: 900, color: T.amber, textShadow: "0 0 20px rgba(245,158,11,.4)" }}>{checkouts.length} cabana{checkouts.length !== 1 ? "s" : ""}</div>
              <div style={{ fontSize: 12, color: T.amber, opacity: 0.7, marginTop: 3 }}>Conferir cabana antes da faxina →</div>
            </div>
            <div style={{ width: 52, height: 52, borderRadius: 16, background: "rgba(245,158,11,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <I n="search" s={26} c={T.amber} />
            </div>
          </div>
        </button>
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
            <div style={{ fontSize: 12, color: T.muted, marginTop: 1 }}>{t.type === "turnover" ? "Faxina completa" : "Arrumação diária"}</div>
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

// ─── Checkouts screen ─────────────────────────────────────────────────────────

interface CheckoutEntry { cabinId: string; cabinName: string; cabinCategory: string; stayId: string; guestName: string; keyLocation: "reception" | "cabin" | "unknown"; }

function CheckoutsScreen({
  checkouts, minibarItems, showToast, propertyId, userId, userName,
  onAssume,
}: {
  checkouts: CheckoutEntry[];
  minibarItems: MinibarItem[];
  showToast: (m: string, c?: string) => void;
  propertyId: string; userId: string; userName: string;
  onAssume: (entry: CheckoutEntry) => void;
}) {
  const [miniTarget, setMiniTarget] = useState<CheckoutEntry | null>(null);
  const [assumed, setAssumed] = useState<Set<string>>(new Set());

  const handleMiniSend = async (cart: Record<string, number>) => {
    if (!miniTarget) return;
    try {
      await Promise.all(
        Object.entries(cart).filter(([, q]) => q > 0).map(([itemId, qty]) => {
          const item = minibarItems.find(m => m.id === itemId);
          if (!item) return Promise.resolve();
          return StayService.addFolioItemManual(
            propertyId, miniTarget.stayId,
            { description: item.name, quantity: qty, unitPrice: item.price, totalPrice: item.price * qty, category: "minibar", addedBy: userId },
            userId, userName,
          );
        })
      );
    } catch { showToast("Erro ao lançar frigobar.", T.red); throw new Error("folio_failed"); }
  };

  return (
    <>
      <div className="maid-scroll" style={{ padding: "0 16px 20px" }}>
        <div style={{ padding: "10px 0 20px" }}>
          <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.3px" }}>Checkouts</div>
          <div style={{ fontSize: 13, color: T.muted, marginTop: 5 }}>Confira o frigobar e objetos esquecidos antes da faxina.</div>
        </div>

        {checkouts.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: T.muted }}>
            <div style={{ width: 64, height: 64, borderRadius: 20, background: T.greenBg, border: `1px solid ${T.greenBorder}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <I n="check" s={32} c={T.green} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Tudo em dia!</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>Nenhum checkout pendente.</div>
          </div>
        ) : checkouts.map(co => (
          <div key={co.cabinId} style={{ marginBottom: 14 }}>
            <GBorder>
              <div style={{ background: "rgba(10,12,22,0.9)", borderRadius: 20, padding: 16 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 900 }}>{co.cabinName}</div>
                    <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{co.cabinCategory} · {co.guestName}</div>
                  </div>
                  <Pill
                    color={co.keyLocation === "reception" ? T.green : T.amber}
                    bg={co.keyLocation === "reception" ? T.greenBg : T.amberBg}
                    border={co.keyLocation === "reception" ? T.greenBorder : T.amberBorder}
                  >
                    <I n="key" s={9} />
                    {co.keyLocation === "reception" ? "Recepção" : "Conferir"}
                  </Pill>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <button
                    onClick={() => setMiniTarget(co)}
                    style={{ padding: 16, background: T.grad, color: "#fff", fontFamily: "inherit", fontSize: 14, fontWeight: 800, letterSpacing: "0.03em", textTransform: "uppercase" as const, border: "none", borderRadius: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 4px 20px rgba(155,109,255,0.35)" }}
                  >
                    <I n="check" s={16} /> Conferir
                  </button>
                  <button
                    disabled={assumed.has(co.cabinId)}
                    onClick={() => { setAssumed(p => { const s = new Set(p); s.add(co.cabinId); return s; }); onAssume(co); showToast("Cabana assumida por você!"); }}
                    style={{ padding: 15, background: T.glass2, color: T.text, fontFamily: "inherit", fontSize: 14, fontWeight: 700, letterSpacing: "0.02em", textTransform: "uppercase" as const, border: `1px solid ${T.border2}`, borderRadius: 16, cursor: assumed.has(co.cabinId) ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: assumed.has(co.cabinId) ? 0.5 : 1 }}
                  >
                    {assumed.has(co.cabinId) ? <><I n="check" s={15} />Assumida</> : "Assumir"}
                  </button>
                </div>
              </div>
            </GBorder>
          </div>
        ))}
      </div>

      {miniTarget && minibarItems.length > 0 && (
        <MinibarSheet
          cabinName={miniTarget.cabinName}
          items={minibarItems}
          onClose={() => setMiniTarget(null)}
          onSend={handleMiniSend}
          keyLocation={miniTarget.keyLocation}
          stayId={miniTarget.stayId}
          propertyId={propertyId}
          userId={userId}
          userName={userName}
          showToast={showToast}
        />
      )}
    </>
  );
}

// ─── Faxinas screen ───────────────────────────────────────────────────────────

function FaxinasScreen({
  tasks, minibarItems, onStart, showToast, onToggle,
  propertyId, userId, userName, onChecklistLoaded,
}: {
  tasks: EnrichedTask[];
  minibarItems: MinibarItem[];
  onStart: (id: string) => void;
  showToast: (m: string, c?: string) => void;
  onToggle: (tid: string, cid: string) => void;
  propertyId: string; userId: string; userName: string;
  onChecklistLoaded: (taskId: string, checklist: ChecklistItem[]) => void;
}) {
  const [detail, setDetail] = useState<string | null>(null);
  const [miniTarget, setMiniTarget] = useState<EnrichedTask | null>(null);

  const inProg = tasks.filter(t => t.status === "in_progress");
  const pending = tasks.filter(t => t.status === "pending");
  const waiting = tasks.filter(t => t.status === "waiting_conference");
  const fullTask = detail ? tasks.find(t => t.id === detail) ?? null : null;

  const handleMiniSend = async (cart: Record<string, number>) => {
    if (!miniTarget?.stayId) return;
    try {
      await Promise.all(
        Object.entries(cart).filter(([, q]) => q > 0).map(([itemId, qty]) => {
          const item = minibarItems.find(m => m.id === itemId);
          if (!item) return Promise.resolve();
          return StayService.addFolioItemManual(
            propertyId, miniTarget.stayId!,
            { description: item.name, quantity: qty, unitPrice: item.price, totalPrice: item.price * qty, category: "minibar", addedBy: userId },
            userId, userName,
          );
        })
      );
      showToast("Frigobar lançado!");
    } catch { showToast("Erro ao lançar frigobar.", T.red); }
  };

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
              return (
                <GBorder key={t.id} style={{ marginBottom: 10 }}>
                  <div style={{ background: "rgba(45,212,191,0.05)", borderRadius: 20, padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 26, fontWeight: 900, color: T.green, textShadow: "0 0 24px rgba(45,212,191,0.4)" }}>{t.cabinName || "Cabana"}</div>
                        <div style={{ fontSize: 12, color: T.green, opacity: 0.65, marginTop: 2 }}>{t.type === "turnover" ? "Faxina Completa" : "Arrumação Diária"}</div>
                      </div>
                      <div style={{ textAlign: "right" as const }}>
                        <div style={{ fontSize: 13, fontWeight: 900, color: T.green }}>{elapsed(t.startedAt as string)}</div>
                        <div style={{ fontSize: 11, color: T.green, opacity: 0.6, marginTop: 2 }}>{done}/{t.checklist.length} ✓</div>
                      </div>
                    </div>
                    <div style={{ height: 6, borderRadius: 6, background: "rgba(255,255,255,0.07)", marginBottom: 14 }}>
                      <div style={{ height: "100%", borderRadius: 6, background: T.greenG, width: `${pct}%`, transition: "width .4s ease" }} />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: t.type === "turnover" ? "48px 1fr" : "1fr", gap: 8 }}>
                      {t.type === "turnover" && (
                        <button onClick={() => setMiniTarget(t)} style={{ height: 50, background: T.amberBg, border: `1px solid ${T.amberBorder}`, borderRadius: 14, cursor: "pointer", color: T.amber, display: "flex", alignItems: "center", justifyContent: "center" }} title="Conferir cabana">
                          <I n="search" s={18} c={T.amber} />
                        </button>
                      )}
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
                    <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{t.type === "turnover" ? "Faxina Completa" : "Arrumação Diária"}</div>
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
                <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 4, marginBottom: 14 }}>
                  {t.checklist.slice(0, 3).map(c => (
                    <span key={c.id} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: T.glass3, color: T.muted, border: `1px solid ${T.border}` }}>{c.label}</span>
                  ))}
                  {t.checklist.length > 3 && <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: T.glass3, color: T.muted, border: `1px solid ${T.border}` }}>+{t.checklist.length - 3} itens</span>}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: t.type === "turnover" ? "48px 1fr" : "1fr", gap: 8 }}>
                  {t.type === "turnover" && (
                    <button onClick={() => setMiniTarget(t)} style={{ height: 52, background: T.amberBg, border: `1px solid ${T.amberBorder}`, borderRadius: 14, cursor: "pointer", color: T.amber, display: "flex", alignItems: "center", justifyContent: "center" }} title="Conferir cabana">
                      <I n="search" s={18} c={T.amber} />
                    </button>
                  )}
                  <button onClick={() => onStart(t.id)} style={{ padding: 16, background: T.grad, color: "#fff", fontFamily: "inherit", fontSize: 14, fontWeight: 800, letterSpacing: "0.03em", textTransform: "uppercase" as const, border: "none", borderRadius: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 4px 20px rgba(155,109,255,0.35)" }}>
                    Iniciar <I n="arrow" s={18} />
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
      {miniTarget && (
        <MinibarSheet
          cabinName={miniTarget.cabinName || "Cabana"}
          items={minibarItems}
          onClose={() => setMiniTarget(null)}
          onSend={handleMiniSend}
        />
      )}
    </>
  );
}

// ─── Profile screen ───────────────────────────────────────────────────────────

function ProfileScreen({ userData, showToast, onLogout }: { userData: any; showToast: (m: string, c?: string) => void; onLogout: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(userData?.fullName || "Camareira");
  const initials = name.split(" ").slice(0, 2).map((w: string) => w[0] ?? "").join("").toUpperCase();

  return (
    <div className="maid-scroll" style={{ padding: "0 16px 24px" }}>
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
              {editing ? (
                <input value={name} onChange={e => setName(e.target.value)} style={{ background: T.glass2, border: `1px solid ${T.border2}`, borderRadius: 10, padding: "8px 12px", color: T.text, fontSize: 17, fontWeight: 800, fontFamily: "inherit", width: "100%" }} />
              ) : (
                <div style={{ fontSize: 20, fontWeight: 900 }}>{name}</div>
              )}
              <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>Camareira</div>
              <Pill color={T.green} bg={T.greenBg} border={T.greenBorder}>Ativa hoje</Pill>
            </div>
            <button onClick={() => { if (editing) showToast("Perfil salvo!"); setEditing(e => !e); }} style={{ background: T.glass2, border: `1px solid ${T.border}`, borderRadius: 12, padding: 10, cursor: "pointer", color: T.muted }}>
              <I n={editing ? "check" : "edit"} s={17} c={editing ? T.green : T.muted} />
            </button>
          </div>
        </div>
      </GBorder>

      {/* Turno */}
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: T.muted, marginBottom: 10 }}>Turno hoje</div>
      <div style={{ background: T.glass, border: `1px solid ${T.border}`, borderRadius: 20, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: T.amberBg, border: `1px solid ${T.amberBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <I n="sun" s={18} c={T.amber} />
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14 }}>Manhã — 07:00 às 15:00</div>
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

type Tab = "home" | "checkouts" | "tasks" | "profile";

export default function MaidPage() {
  const { userData } = useAuth();
  const { currentProperty: property } = useProperty();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("home");
  const [tasks, setTasks] = useState<EnrichedTask[]>([]);
  const [cabins, setCabins] = useState<Record<string, Cabin>>({});
  const [minibarItems, setMinibarItems] = useState<MinibarItem[]>([]);
  const [checkouts, setCheckouts] = useState<CheckoutEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; color: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string, color = T.green) => {
    setToast({ msg, color });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  // Derive checkouts: turnover tasks that are unassigned (global pool) + cabin status = cleaning
  const deriveCheckouts = useCallback((allTasks: EnrichedTask[], cabinMap: Record<string, Cabin>) => {
    const turnoverPending = allTasks.filter(
      t => t.type === "turnover" && (t.status === "pending" || t.status === "in_progress")
    );
    const cos: CheckoutEntry[] = turnoverPending
      .filter(t => t.cabinId && cabinMap[t.cabinId])
      .map(t => ({
        cabinId: t.cabinId!,
        stayId: t.stayId ?? "",
        cabinName: cabinMap[t.cabinId!]?.name ?? t.cabinId!,
        cabinCategory: cabinMap[t.cabinId!]?.category ?? "",
        keyLocation: t.keyLocation ?? "unknown",
        guestName: "Hóspede",
      }));
    setCheckouts(cos);
  }, []);

  useEffect(() => {
    if (!property) return;

    let unsubscribe: (() => void) | undefined;

    const init = async () => {
      setLoading(true);
      try {
        const [cabinsData, { data: miniData }] = await Promise.all([
          CabinService.getCabinsByProperty(property.id),
          supabase.from("minibar_items").select("*").eq("propertyId", property.id).eq("active", true).order("order", { ascending: true }),
        ]);

        const cabinMap: Record<string, Cabin> = {};
        cabinsData.forEach(c => { cabinMap[c.id] = c; });
        setCabins(cabinMap);
        setMinibarItems((miniData || []) as MinibarItem[]);

        unsubscribe = HousekeepingService.listenToActiveTasks(property.id, allTasks => {
          // Filter to this maid's tasks (or all if governance/admin)
          const myId = userData?.id;
          const myTasks = (userData?.role === "maid" && myId)
            ? allTasks.filter(t => t.assignedTo?.includes(myId) && t.status !== "completed" && t.status !== "cancelled")
            : allTasks.filter(t => t.status !== "completed" && t.status !== "cancelled");

          // Enrich with cabin names
          const enriched: EnrichedTask[] = myTasks.map(t => ({
            ...t,
            cabinName: t.cabinId ? (cabinMap[t.cabinId]?.name ?? t.cabinId) : (t.customLocation ?? "Tarefa"),
          }));
          setTasks(enriched);

          // Derive checkouts from the global task list (all maids can see these)
          deriveCheckouts(allTasks, cabinMap);
        });
      } catch {
        showToast("Erro ao carregar dados.", T.red);
      } finally {
        setLoading(false);
      }
    };

    init();
    return () => unsubscribe?.();
  }, [property, userData?.id, userData?.role, deriveCheckouts, showToast]);

  const handleStart = useCallback(async (taskId: string) => {
    if (!property || !userData) return;
    try {
      await HousekeepingService.startTask(property.id, taskId, userData.id, userData.fullName);
      showToast("Limpeza iniciada! Cronômetro rodando.");
    } catch { showToast("Erro ao iniciar tarefa.", T.red); }
  }, [property, userData, showToast]);

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

  const handleAssume = useCallback(async (entry: CheckoutEntry) => {
    if (!property || !userData) return;
    try {
      const task = (await HousekeepingService.getActiveTasks(property.id)).find(
        t => t.stayId === entry.stayId || t.cabinId === entry.cabinId
      );
      if (!task) return;
      const existing = task.assignedTo || [];
      const newAssignees = existing.includes(userData.id) ? existing : [...existing, userData.id];
      await HousekeepingService.updateTask(property.id, task.id, { assignedTo: newAssignees }, userData.id, userData.fullName);
    } catch { /* silently fail — toast already shown */ }
  }, [property, userData]);

  const handleLogout = async () => {
    showToast("Saindo...");
    await supabase.auth.signOut();
    router.push("/admin/login");
  };

  const navItems: { id: Tab; label: string; icon: IName; badge: number }[] = [
    { id: "home", label: "Início", icon: "home", badge: 0 },
    { id: "checkouts", label: "Checkouts", icon: "coffee", badge: checkouts.length },
    { id: "tasks", label: "Faxinas", icon: "sparkles", badge: tasks.filter(t => t.status === "pending" || t.status === "in_progress").length },
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

      <div className="maid-shell" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100dvh", background: T.bg }}>
        <div style={{ width: "100%", maxWidth: 430, height: "100dvh", background: T.bg, color: T.text, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>

          {/* Ambient orbs */}
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0, background: "radial-gradient(ellipse 280px 220px at 10% 5%,rgba(155,109,255,0.12) 0%,transparent 70%),radial-gradient(ellipse 200px 160px at 90% 80%,rgba(78,201,212,0.09) 0%,transparent 70%)" }} />

          {/* Top bar */}
          <div style={{ padding: "14px 20px 12px", borderBottom: `1px solid ${T.border}`, background: "rgba(6,8,15,0.9)", backdropFilter: "blur(20px)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, position: "relative", zIndex: 10 }}>
            <span style={{ fontSize: 16, fontWeight: 900, letterSpacing: ".1em", textTransform: "uppercase" }}>
              <span style={{ background: T.grad, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>aaura</span>
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: T.led, boxShadow: `0 0 10px ${T.ledGlow}` }} />
              <span style={{ fontSize: 11, color: T.muted, fontWeight: 600 }}>Tempo real</span>
            </div>
          </div>

          {/* Screens */}
          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", position: "relative", zIndex: 1 }}>
            {tab === "home" && <HomeScreen tasks={tasks} checkouts={checkouts} cabins={cabins} onNav={setTab} userName={userData?.fullName ?? "Camareira"} />}
            {tab === "checkouts" && <CheckoutsScreen checkouts={checkouts} minibarItems={minibarItems} showToast={showToast} propertyId={property?.id ?? ""} userId={userData?.id ?? ""} userName={userData?.fullName ?? "Camareira"} onAssume={handleAssume} />}
            {tab === "tasks" && <FaxinasScreen tasks={tasks} minibarItems={minibarItems} onStart={handleStart} showToast={showToast} onToggle={handleToggle} propertyId={property?.id ?? ""} userId={userData?.id ?? ""} userName={userData?.fullName ?? "Camareira"} onChecklistLoaded={handleChecklistLoaded} />}
            {tab === "profile" && <ProfileScreen userData={userData} showToast={showToast} onLogout={handleLogout} />}
          </div>

          {/* Toast */}
          {toast && <Toast msg={toast.msg} color={toast.color} />}

          {/* Bottom nav */}
          <nav style={{ background: T.glass2, borderTop: `1px solid ${T.border}`, backdropFilter: "blur(20px)", display: "grid", gridTemplateColumns: "repeat(4,1fr)", paddingBottom: "env(safe-area-inset-bottom,8px)", flexShrink: 0, position: "relative", zIndex: 10 }}>
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
