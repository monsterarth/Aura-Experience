"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useProperty } from "@/context/PropertyContext";
import { supabase } from "@/lib/supabase";
import { Wedding, WeddingCabinAssignment, WeddingStatus } from "@/types/aura";
import { toast } from "sonner";
import {
  Heart, Shield, Clock, Sparkles, Search, Grid3X3, List,
  ChevronRight, X, Plus, Bed, Users, Globe,
  Camera, Music, Mic, Flower2, Coffee, Star, Truck, Sun,
  Check, DollarSign, Calendar, Loader2,
} from "lucide-react";

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  card:        "#1c1c1c",
  glass:       "rgba(255,255,255,0.035)",
  glass2:      "rgba(255,255,255,0.055)",
  glass3:      "rgba(255,255,255,0.08)",
  border:      "rgba(255,255,255,0.07)",
  border2:     "rgba(255,255,255,0.12)",
  text:        "#eef0f8",
  muted:       "rgba(238,240,248,0.42)",
  muted2:      "rgba(238,240,248,0.22)",
  g1:          "#9b6dff",
  g2:          "#4ec9d4",
  grad:        "linear-gradient(135deg,#9b6dff 0%,#4ec9d4 100%)",
  gradSoft:    "linear-gradient(135deg,rgba(155,109,255,0.15) 0%,rgba(78,201,212,0.15) 100%)",
  green:       "#2dd4bf", greenBg:   "rgba(45,212,191,0.08)",   greenBorder:  "rgba(45,212,191,0.22)",
  amber:       "#f59e0b", amberBg:   "rgba(245,158,11,0.08)",   amberBorder:  "rgba(245,158,11,0.22)",
  blue:        "#60a5fa", blueBg:    "rgba(96,165,250,0.08)",   blueBorder:   "rgba(96,165,250,0.22)",
  red:         "#f87171", redBg:     "rgba(248,113,113,0.08)",  redBorder:    "rgba(248,113,113,0.22)",
  violet:      "#c084fc", violetBg:  "rgba(192,132,252,0.08)",  violetBorder: "rgba(192,132,252,0.22)",
  rose:        "#fb7185", roseBg:    "rgba(251,113,133,0.08)",  roseBorder:   "rgba(251,113,133,0.22)",
};

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterStatus = 'all' | WeddingStatus;
type FilterExcl = 'all' | 'exclusive' | 'nonexclusive';
type DrawerTab = 'evento' | 'hospedagem' | 'fornecedores' | 'financeiro';
type ViewMode = 'grid' | 'list';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(dateStr: string): string {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function daysUntil(dateStr: string): number {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + "T00:00:00");
  return Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function nightsBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) / (1000 * 60 * 60 * 24)
  );
}

function fmtMoney(v: number): string {
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

const STATUS_CFG: Record<WeddingStatus, { label: string; pillBg: string; pillColor: string; pillBorder: string }> = {
  confirmed: { label: "Confirmado",    pillBg: T.greenBg,  pillColor: T.green,  pillBorder: T.greenBorder  },
  tentative: { label: "Em negociação", pillBg: T.amberBg,  pillColor: T.amber,  pillBorder: T.amberBorder  },
  completed: { label: "Realizado",     pillBg: T.glass2,   pillColor: T.muted,  pillBorder: T.border2      },
  cancelled: { label: "Cancelado",     pillBg: T.redBg,    pillColor: T.red,    pillBorder: T.redBorder    },
};

const VENDOR_ICONS: Record<string, React.ElementType> = {
  Fotografia: Camera, Filmagem: Camera, DJ: Music, Banda: Mic,
  Decoração: Flower2, Buffet: Coffee, Bolo: Star, Cerimonialista: Star,
  Floricultura: Flower2, Transporte: Truck, "Luz e Som": Sun, Assessoria: Shield,
};

// ─── Pill ─────────────────────────────────────────────────────────────────────

function Pill({ label, bg, color, border, style }: {
  label: string; bg: string; color: string; border: string; style?: React.CSSProperties;
}) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      fontSize: 9, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase",
      padding: "2px 8px", borderRadius: 999, lineHeight: 1.6,
      background: bg, color, border: `1px solid ${border}`,
      ...style,
    }}>{label}</span>
  );
}

// ─── Cabin map ────────────────────────────────────────────────────────────────

function CabinMap({ occupied, total, assignments = [] }: {
  occupied: number; total: number; assignments?: WeddingCabinAssignment[];
}) {
  const free = total - occupied;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{ flex: 1, height: 6, borderRadius: 999, background: T.glass3, overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: 999, background: T.grad, width: `${(occupied / total) * 100}%`, transition: "width .8s" }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 800, color: T.g1, flexShrink: 0 }}>{occupied}/{total}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(80px,1fr))", gap: 6 }}>
        {Array.from({ length: total }, (_, i) => {
          const num = i + 1;
          const key = `Cabana ${String(num).padStart(2, "0")}`;
          const assign = assignments.find(a => a.cabinName === key);
          const isOcc = i < occupied;
          return (
            <div key={i} title={assign ? `${key}: ${assign.guestDescription}` : key} style={{
              padding: "7px 6px", borderRadius: 10, textAlign: "center", fontSize: 10, fontWeight: 800,
              background: isOcc ? "rgba(155,109,255,0.12)" : T.glass,
              border: `1px solid ${isOcc ? "rgba(155,109,255,0.3)" : T.border}`,
              color: isOcc ? T.g1 : T.muted2, cursor: "default",
            }}>
              <div style={{ fontSize: 14, marginBottom: 2 }}>{isOcc ? "🏡" : "🌿"}</div>
              <div>{String(num).padStart(2, "0")}</div>
              {isOcc && assign && (
                <div style={{ fontSize: 8, color: T.muted, marginTop: 2, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {assign.guestDescription.split(" ")[0]}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: T.muted }}>
          <div style={{ width: 10, height: 10, borderRadius: 3, background: "rgba(155,109,255,0.3)", border: "1px solid rgba(155,109,255,0.5)" }} />
          {occupied} ocupadas
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: T.muted }}>
          <div style={{ width: 10, height: 10, borderRadius: 3, background: T.glass3, border: `1px solid ${T.border}` }} />
          {free} livres
        </div>
      </div>
    </div>
  );
}

// ─── Detail drawer ────────────────────────────────────────────────────────────

function DetailDrawer({ wedding, cabinsTotal, onClose, showFinancial }: {
  wedding: Wedding | null; cabinsTotal: number; onClose: () => void; showFinancial: boolean;
}) {
  const [tab, setTab] = useState<DrawerTab>("evento");

  useEffect(() => { if (wedding) setTab("evento"); }, [wedding]);

  if (!wedding) return null;

  const sc = STATUS_CFG[wedding.status];
  const nights = nightsBetween(wedding.checkin, wedding.checkout);
  const days = daysUntil(wedding.weddingDate);
  const vendors = wedding.vendors ?? [];
  const vendorConfirmed = vendors.filter(v => v.confirmed).length;
  const assignments = wedding.cabinAssignments ?? [];

  const deposit = wedding.depositValue ?? 0;
  const second  = wedding.secondInstallmentValue ?? 0;
  const balance = wedding.contractTotal - deposit - second;
  const paidTotal = (wedding.depositPaid ? deposit : 0) + (wedding.secondInstallmentPaid ? second : 0);
  const paidPct = Math.round((paidTotal / wedding.contractTotal) * 100);

  const tabs: { id: DrawerTab; label: string }[] = [
    { id: "evento",       label: "Evento" },
    { id: "hospedagem",   label: "Hospedagem" },
    { id: "fornecedores", label: `Fornecedores (${vendors.length})` },
    ...(showFinancial ? [{ id: "financeiro" as DrawerTab, label: "Financeiro" }] : []),
  ];

  const InfoBox = ({ icon: Icon, label, value, color, bg, border }: {
    icon: React.ElementType; label: string; value: string; color: string; bg: string; border: string;
  }) => (
    <div style={{ padding: 14, background: T.glass, border: `1px solid ${border}`, borderRadius: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
        <div style={{ width: 26, height: 26, borderRadius: 8, background: bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon size={13} color={color} />
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase" as const, color: T.muted }}>{label}</span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 900, color, lineHeight: 1.3 }}>{value}</div>
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "stretch", justifyContent: "flex-end" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: 520, background: T.card, borderLeft: `1px solid ${T.border2}`, display: "flex", flexDirection: "column", animation: "wedding-slide-in .22s ease", boxShadow: "-24px 0 80px rgba(0,0,0,.6)" }}>
        {/* Header */}
        <div style={{ padding: "20px 24px 0", borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 16 }}>
            <div style={{ display: "flex", flexShrink: 0 }}>
              <div style={{ width: 44, height: 44, borderRadius: 13, background: T.gradSoft, border: "2px solid rgba(155,109,255,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900, color: T.g1, zIndex: 2, position: "relative" }}>
                {wedding.brideShort ?? wedding.bride.slice(0, 2).toUpperCase()}
              </div>
              <div style={{ width: 44, height: 44, borderRadius: 13, background: T.roseBg, border: `2px solid ${T.roseBorder}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900, color: T.rose, marginLeft: -10, zIndex: 1, position: "relative" }}>
                {wedding.groomShort ?? wedding.groom.slice(0, 2).toUpperCase()}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 900, lineHeight: 1.2 }}>
                {wedding.bride} <span style={{ color: T.rose }}>♥</span> {wedding.groom}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                <Pill label={sc.label} bg={sc.pillBg} color={sc.pillColor} border={sc.pillBorder} />
                {wedding.exclusivity && <Pill label="Exclusivo" bg={T.violetBg} color={T.violet} border={T.violetBorder} />}
                {wedding.status !== "completed" && days >= 0 && (
                  <Pill label={`em ${days}d`} bg={days <= 30 ? T.redBg : days <= 90 ? T.amberBg : T.glass2} color={days <= 30 ? T.red : days <= 90 ? T.amber : T.muted} border={days <= 30 ? T.redBorder : days <= 90 ? T.amberBorder : T.border2} />
                )}
              </div>
            </div>
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 9, border: `1px solid ${T.border2}`, background: T.glass, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: T.muted, flexShrink: 0 }}>
              <X size={14} />
            </button>
          </div>
          <div style={{ display: "flex", gap: 0 }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "9px 14px", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700, background: "transparent", color: tab === t.id ? T.text : T.muted, borderBottom: `2px solid ${tab === t.id ? T.g1 : "transparent"}`, transition: "all .15s" }}>{t.label}</button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>

          {tab === "evento" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <InfoBox icon={Heart} label="Data do casamento" value={fmt(wedding.weddingDate)} color={T.rose} bg={T.roseBg} border={T.roseBorder} />
                <InfoBox icon={Clock} label="Dias restantes" value={wedding.status === "completed" ? "Realizado" : (days < 0 ? "Passou" : days === 0 ? "Hoje!" : `${days} dias`)} color={days <= 30 && wedding.status !== "completed" ? T.red : T.green} bg={T.greenBg} border={T.greenBorder} />
                <InfoBox icon={Calendar} label="Cerimônia" value={wedding.ceremonyDetails ?? "—"} color={T.violet} bg={T.violetBg} border={T.violetBorder} />
                <InfoBox icon={Users} label="Convidados" value={`${wedding.guestCount} pessoas`} color={T.blue} bg={T.blueBg} border={T.blueBorder} />
              </div>
              <div style={{ background: T.glass, border: `1px solid ${T.border}`, borderRadius: 14, padding: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase", color: T.muted, marginBottom: 12 }}>Programação</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[
                    { dot: T.rose, label: "Cerimônia", value: wedding.ceremonyDetails },
                    { dot: T.violet, label: "Recepção", value: wedding.receptionDetails },
                  ].map(item => item.value && (
                    <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: item.dot, flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: 10, color: T.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" }}>{item.label}</div>
                        <div style={{ fontSize: 13, fontWeight: 800, marginTop: 2 }}>{item.value}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {wedding.coordinator && (
                  <div style={{ background: T.glass, border: `1px solid ${T.border}`, borderRadius: 12, padding: 14 }}>
                    <div style={{ fontSize: 10, color: T.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 5 }}>Cerimonialista</div>
                    <div style={{ fontSize: 13, fontWeight: 800 }}>{wedding.coordinator}</div>
                  </div>
                )}
                {wedding.coupleWebsite && (
                  <a href={wedding.coupleWebsite} target="_blank" rel="noopener noreferrer" style={{ background: T.gradSoft, border: "1px solid rgba(155,109,255,0.25)", borderRadius: 12, padding: 14, textDecoration: "none", display: "flex", flexDirection: "column", gap: 5 }}>
                    <div style={{ fontSize: 10, color: T.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>Site dos Noivos</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, color: T.g1, fontWeight: 800, fontSize: 12 }}>
                      <Globe size={13} color={T.g1} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{wedding.coupleWebsite.replace("https://", "")}</span>
                    </div>
                  </a>
                )}
              </div>
              {wedding.notes && (
                <div style={{ background: T.amberBg, border: `1px solid ${T.amberBorder}`, borderRadius: 12, padding: 14 }}>
                  <div style={{ fontSize: 10, color: T.amber, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6 }}>Observações</div>
                  <p style={{ fontSize: 13, color: T.text, lineHeight: 1.6, fontStyle: "italic" }}>&ldquo;{wedding.notes}&rdquo;</p>
                </div>
              )}
            </div>
          )}

          {tab === "hospedagem" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                {[
                  { label: "Check-in", value: fmt(wedding.checkin), color: T.green },
                  { label: "Check-out", value: fmt(wedding.checkout), color: T.red },
                  { label: "Noites", value: `${nights}n`, color: T.blue },
                ].map(item => (
                  <div key={item.label} style={{ background: T.glass, border: `1px solid ${T.border}`, borderRadius: 12, padding: "12px 14px", textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: T.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6 }}>{item.label}</div>
                    <div style={{ fontSize: 15, fontWeight: 900, color: item.color }}>{item.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: wedding.exclusivity ? T.violetBg : T.glass, border: `1px solid ${wedding.exclusivity ? T.violetBorder : T.border}`, borderRadius: 14, padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: wedding.exclusivity ? 14 : 0 }}>
                  <Shield size={16} color={wedding.exclusivity ? T.violet : T.muted} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: wedding.exclusivity ? T.violet : T.text }}>
                      {wedding.exclusivity ? "Com exclusividade" : "Sem exclusividade"}
                    </div>
                    {!wedding.exclusivity && <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>Outras cabanas podem estar ocupadas durante o evento.</div>}
                  </div>
                </div>
                {wedding.exclusivity && wedding.cabinsOccupied != null && (
                  <CabinMap occupied={wedding.cabinsOccupied} total={cabinsTotal} assignments={assignments} />
                )}
              </div>
              {assignments.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase", color: T.muted, marginBottom: 10 }}>Alocação de Cabanas</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {assignments.map((a, i) => (
                      <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: T.glass, border: `1px solid ${T.border}`, borderRadius: 11 }}>
                        <div style={{ width: 30, height: 30, borderRadius: 8, background: T.gradSoft, border: "1px solid rgba(155,109,255,.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <span style={{ fontSize: 11, fontWeight: 900, color: T.g1 }}>{String(i + 1).padStart(2, "0")}</span>
                        </div>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 800 }}>{a.cabinName}</div>
                          <div style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>{a.guestDescription}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "fornecedores" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 4 }}>
                <div style={{ background: T.greenBg, border: `1px solid ${T.greenBorder}`, borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                  <Check size={16} color={T.green} />
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: T.green }}>{vendorConfirmed}</div>
                    <div style={{ fontSize: 11, color: T.muted }}>confirmados</div>
                  </div>
                </div>
                <div style={{ background: T.amberBg, border: `1px solid ${T.amberBorder}`, borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                  <Clock size={16} color={T.amber} />
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: T.amber }}>{vendors.length - vendorConfirmed}</div>
                    <div style={{ fontSize: 11, color: T.muted }}>pendentes</div>
                  </div>
                </div>
              </div>
              {vendors.map(v => {
                const VIcon = VENDOR_ICONS[v.category] ?? Star;
                return (
                  <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 16px", background: T.glass, border: `1px solid ${v.confirmed ? T.border : T.amberBorder}`, borderRadius: 14 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 11, flexShrink: 0, background: v.confirmed ? T.greenBg : T.amberBg, border: `1px solid ${v.confirmed ? T.greenBorder : T.amberBorder}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <VIcon size={16} color={v.confirmed ? T.green : T.amber} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: T.muted, marginBottom: 3 }}>{v.category}</div>
                      <div style={{ fontSize: 13, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.name}</div>
                      <div style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>{v.contact}</div>
                    </div>
                    <Pill label={v.confirmed ? "Confirmado" : "Pendente"} bg={v.confirmed ? T.greenBg : T.amberBg} color={v.confirmed ? T.green : T.amber} border={v.confirmed ? T.greenBorder : T.amberBorder} />
                  </div>
                );
              })}
              <button style={{ width: "100%", padding: 12, borderRadius: 12, border: `1px dashed ${T.border2}`, background: "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700, color: T.muted, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <Plus size={14} /> Adicionar Fornecedor
              </button>
            </div>
          )}

          {tab === "financeiro" && showFinancial && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ background: T.glass, border: `1px solid ${T.border}`, borderRadius: 14, padding: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, color: T.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 4 }}>Total do contrato</div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: T.text, letterSpacing: "-1px" }}>{fmtMoney(wedding.contractTotal)}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 11, color: T.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 4 }}>Recebido</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: T.green }}>{paidPct}%</div>
                  </div>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: T.glass3, overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 999, background: T.grad, width: `${paidPct}%`, transition: "width .8s" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                  <span style={{ fontSize: 11, color: T.green, fontWeight: 700 }}>{fmtMoney(paidTotal)} recebido</span>
                  <span style={{ fontSize: 11, color: balance > 0 && !wedding.secondInstallmentPaid ? T.amber : T.green, fontWeight: 700 }}>
                    {paidPct === 100 ? "Quitado ✓" : `${fmtMoney(wedding.contractTotal - paidTotal)} a receber`}
                  </span>
                </div>
              </div>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase", color: T.muted, marginBottom: 4 }}>Parcelas</div>
              {[
                { label: "1ª Parcela — Sinal (30%)",         value: deposit, paid: wedding.depositPaid ?? false },
                { label: "2ª Parcela — Intermediária (35%)", value: second,  paid: wedding.secondInstallmentPaid ?? false },
                { label: "3ª Parcela — Saldo final (35%)",   value: balance, paid: paidPct === 100 },
              ].map((inst, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", background: inst.paid ? T.greenBg : T.glass, border: `1px solid ${inst.paid ? T.greenBorder : T.border}`, borderRadius: 13 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 9, flexShrink: 0, background: inst.paid ? T.greenBg : T.amberBg, border: `1px solid ${inst.paid ? T.greenBorder : T.amberBorder}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {inst.paid ? <Check size={15} color={T.green} /> : <DollarSign size={15} color={T.amber} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 800 }}>{inst.label}</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 900, color: inst.paid ? T.green : T.text }}>{fmtMoney(inst.value)}</div>
                    <Pill label={inst.paid ? "Pago" : "Pendente"} bg={inst.paid ? T.greenBg : T.amberBg} color={inst.paid ? T.green : T.amber} border={inst.paid ? T.greenBorder : T.amberBorder} style={{ marginTop: 3, fontSize: 8 }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 24px", borderTop: `1px solid ${T.border}`, display: "flex", gap: 8, flexShrink: 0 }}>
          <button style={{ flex: 1, padding: 10, borderRadius: 11, border: `1px solid ${T.border2}`, background: T.glass, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700, color: T.muted }}>
            Editar
          </button>
          <button style={{ flex: 2, padding: 10, borderRadius: 11, border: "none", background: T.grad, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 800, color: "#fff", boxShadow: "0 4px 14px rgba(155,109,255,.3)" }}>
            Enviar comunicado ao casal
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Wedding card ─────────────────────────────────────────────────────────────

function WeddingCard({ wedding, cabinsTotal, onOpen, view, showFinancial, highlightExclusive }: {
  wedding: Wedding; cabinsTotal: number; onOpen: (w: Wedding) => void; view: ViewMode;
  showFinancial: boolean; highlightExclusive: boolean;
}) {
  const sc = STATUS_CFG[wedding.status];
  const days = daysUntil(wedding.weddingDate);
  const isUpcoming = wedding.status === "confirmed" || wedding.status === "tentative";
  const nights = nightsBetween(wedding.checkin, wedding.checkout);
  const vendors = wedding.vendors ?? [];
  const fin = wedding.contractTotal;
  const deposit  = wedding.depositValue ?? 0;
  const second   = wedding.secondInstallmentValue ?? 0;
  const paidTotal = (wedding.depositPaid ? deposit : 0) + (wedding.secondInstallmentPaid ? second : 0);
  const paidPct  = Math.round((paidTotal / fin) * 100);
  const vendorConfirmed = vendors.filter(v => v.confirmed).length;

  const accentColor = wedding.status === "completed" ? T.muted
    : wedding.exclusivity && highlightExclusive ? T.violet
    : wedding.status === "tentative" ? T.amber
    : T.rose;

  if (view === "list") {
    return (
      <div
        onClick={() => onOpen(wedding)}
        style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 20px", background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, cursor: "pointer", transition: "all .15s" }}
        onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = T.glass2; el.style.borderColor = T.border2; }}
        onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = T.card; el.style.borderColor = T.border; }}
      >
        <div style={{ display: "flex", flexShrink: 0 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: T.gradSoft, border: "2px solid rgba(155,109,255,0.35)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: T.g1, zIndex: 2, position: "relative" }}>
            {wedding.brideShort ?? wedding.bride.slice(0, 2).toUpperCase()}
          </div>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: T.roseBg, border: `2px solid ${T.roseBorder}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: T.rose, marginLeft: -8, zIndex: 1, position: "relative" }}>
            {wedding.groomShort ?? wedding.groom.slice(0, 2).toUpperCase()}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{wedding.bride} ♥ {wedding.groom}</div>
          <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{fmt(wedding.weddingDate)} · {wedding.guestCount} convidados · {nights}n</div>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
          <Pill label={sc.label} bg={sc.pillBg} color={sc.pillColor} border={sc.pillBorder} />
          {wedding.exclusivity && highlightExclusive && <Pill label="Exclusivo" bg={T.violetBg} color={T.violet} border={T.violetBorder} />}
          {isUpcoming && days >= 0 && <Pill label={`${days}d`} bg={days <= 30 ? T.redBg : days <= 90 ? T.amberBg : T.glass2} color={days <= 30 ? T.red : days <= 90 ? T.amber : T.muted} border={days <= 30 ? T.redBorder : days <= 90 ? T.amberBorder : T.border2} />}
        </div>
        {showFinancial && (
          <div style={{ textAlign: "right", flexShrink: 0, minWidth: 80 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: T.g1 }}>{fmtMoney(fin)}</div>
            <div style={{ fontSize: 10, color: T.muted, marginTop: 1 }}>{paidPct}% pago</div>
          </div>
        )}
        <ChevronRight size={16} color={T.muted2} />
      </div>
    );
  }

  return (
    <div
      onClick={() => onOpen(wedding)}
      style={{ background: T.card, borderRadius: 20, overflow: "hidden", cursor: "pointer", border: `1px solid ${T.border}`, transition: "all .15s", display: "flex", flexDirection: "column" }}
      onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = T.border2; el.style.transform = "translateY(-2px)"; el.style.boxShadow = "0 12px 40px rgba(0,0,0,.4)"; }}
      onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = T.border; el.style.transform = "none"; el.style.boxShadow = "none"; }}
    >
      <div style={{ height: 4, background: `linear-gradient(90deg,${accentColor},${accentColor}88)`, opacity: .8 }} />
      <div style={{ padding: 20, flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div style={{ display: "flex" }}>
            <div style={{ width: 42, height: 42, borderRadius: 13, background: T.gradSoft, border: "2px solid rgba(155,109,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900, color: T.g1, zIndex: 2, position: "relative" }}>
              {wedding.brideShort ?? wedding.bride.slice(0, 2).toUpperCase()}
            </div>
            <div style={{ width: 42, height: 42, borderRadius: 13, background: T.roseBg, border: `2px solid ${T.roseBorder}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900, color: T.rose, marginLeft: -10, zIndex: 1, position: "relative" }}>
              {wedding.groomShort ?? wedding.groom.slice(0, 2).toUpperCase()}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <Pill label={sc.label} bg={sc.pillBg} color={sc.pillColor} border={sc.pillBorder} />
            {wedding.exclusivity && highlightExclusive && <Pill label="Exclusivo" bg={T.violetBg} color={T.violet} border={T.violetBorder} />}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 900, lineHeight: 1.25, marginBottom: 4 }}>
            {wedding.bride.split(" ")[0]} <span style={{ color: T.rose }}>♥</span> {wedding.groom.split(" ")[0]}
          </div>
          <div style={{ fontSize: 11, color: T.muted, fontWeight: 600 }}>
            {wedding.bride.split(" ").slice(1).join(" ")} &amp; {wedding.groom.split(" ").slice(1).join(" ")}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Heart size={12} color={accentColor} />
            <span style={{ fontSize: 12, fontWeight: 700, color: accentColor }}>{fmt(wedding.weddingDate)}</span>
            {isUpcoming && days >= 0 && (
              <Pill label={`em ${days}d`} bg={days <= 30 ? T.redBg : days <= 60 ? T.amberBg : T.glass2} color={days <= 30 ? T.red : days <= 60 ? T.amber : T.muted} border={days <= 30 ? T.redBorder : days <= 60 ? T.amberBorder : T.border2} style={{ marginLeft: "auto", fontSize: 8 }} />
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Users size={12} color={T.muted2} />
            <span style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>{wedding.guestCount} convidados</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Bed size={12} color={T.muted2} />
            <span style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>{fmt(wedding.checkin)} → {fmt(wedding.checkout)} · {nights}n</span>
          </div>
          {wedding.exclusivity && wedding.cabinsOccupied != null && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Shield size={12} color={T.violet} />
              <span style={{ fontSize: 12, color: T.violet, fontWeight: 700 }}>{wedding.cabinsOccupied}/{cabinsTotal} cabanas reservadas</span>
              <span style={{ fontSize: 11, color: T.green, fontWeight: 700, marginLeft: "auto" }}>{cabinsTotal - (wedding.cabinsOccupied ?? 0)} livres</span>
            </div>
          )}
        </div>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
            <span style={{ fontSize: 10, color: T.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>Fornecedores</span>
            <span style={{ fontSize: 11, fontWeight: 800, color: T.green }}>{vendorConfirmed}/{vendors.length}</span>
          </div>
          <div style={{ height: 4, borderRadius: 999, background: T.glass3, overflow: "hidden" }}>
            <div style={{ height: "100%", borderRadius: 999, background: T.green, width: `${(vendorConfirmed / Math.max(1, vendors.length)) * 100}%` }} />
          </div>
        </div>
        {showFinancial && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
            <div>
              <div style={{ fontSize: 10, color: T.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>Contrato</div>
              <div style={{ fontSize: 15, fontWeight: 900, color: T.g1, marginTop: 2 }}>{fmtMoney(fin)}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: T.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>Recebido</div>
              <div style={{ fontSize: 15, fontWeight: 900, color: paidPct === 100 ? T.green : T.amber, marginTop: 2 }}>{paidPct}%</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CasamentosPage() {
  const { currentProperty: property, loading: propLoading } = useProperty();

  const [weddings, setWeddings] = useState<Wedding[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Wedding | null>(null);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [filterExcl, setFilterExcl] = useState<FilterExcl>("all");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>("grid");
  const [showFinancial] = useState(true);
  const [highlightExclusive] = useState(true);
  const [cabinsTotal, setCabinsTotal] = useState(0);

  const loadWeddings = useCallback(async () => {
    if (!property) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/weddings?propertyId=${property.id}`);
      if (!res.ok) throw new Error('Erro ao carregar casamentos');
      setWeddings(await res.json());
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao carregar casamentos');
    } finally {
      setLoading(false);
    }
  }, [property]);

  useEffect(() => {
    loadWeddings();
  }, [loadWeddings]);

  useEffect(() => {
    if (!property) return;
    supabase.from('cabins').select('id', { count: 'exact', head: true }).eq('propertyId', property.id)
      .then((res: { count: number | null }) => { if (res.count) setCabinsTotal(res.count); });
  }, [property]);

  const filtered = useMemo(() => weddings
    .filter(w => {
      if (filterStatus !== "all" && w.status !== filterStatus) return false;
      if (filterExcl === "exclusive" && !w.exclusivity) return false;
      if (filterExcl === "nonexclusive" && w.exclusivity) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!w.bride.toLowerCase().includes(q) && !w.groom.toLowerCase().includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => new Date(a.weddingDate).getTime() - new Date(b.weddingDate).getTime()),
    [weddings, filterStatus, filterExcl, search]
  );

  const upcoming = weddings.filter(w => w.status === "confirmed" || w.status === "tentative");
  const exclusive = weddings.filter(w => w.exclusivity && (w.status === "confirmed" || w.status === "tentative"));
  const totalRevenue = weddings.filter(w => w.status !== "cancelled").reduce((s, w) => s + w.contractTotal, 0);
  const pendingVendors = weddings.flatMap(w => w.vendors ?? []).filter(v => !v.confirmed).length;

  const kpis = [
    { label: "Próximos eventos",       value: upcoming.length,       sub: "confirmados ou em neg.", color: T.rose,   bg: T.roseBg,   border: T.roseBorder,   icon: Heart    },
    { label: "Com exclusividade",      value: exclusive.length,      sub: "pousada reservada",      color: T.violet, bg: T.violetBg, border: T.violetBorder, icon: Shield   },
    { label: "Fornecedores pendentes", value: pendingVendors,        sub: "aguardando confirmação", color: T.amber,  bg: T.amberBg,  border: T.amberBorder,  icon: Clock    },
    { label: "Receita total",          value: fmtMoney(totalRevenue),sub: "todos os contratos",     color: T.g1,     bg: T.gradSoft, border: "rgba(155,109,255,0.22)", icon: Sparkles },
  ];

  if (propLoading) return (
    <div className="flex items-center justify-center h-[60vh]">
      <Loader2 className="w-6 h-6 animate-spin" style={{ color: T.g1 }} />
    </div>
  );

  if (!property) return (
    <div className="flex items-center justify-center h-[60vh]">
      <p className="text-sm" style={{ color: T.muted }}>Selecione uma propriedade.</p>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      <style>{`
        @keyframes wedding-fade-in { from { opacity:0; transform:translateY(5px) } to { opacity:1; transform:translateY(0) } }
        @keyframes wedding-slide-in { from { opacity:0; transform:translateX(24px) } to { opacity:1; transform:translateX(0) } }
      `}</style>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 14 }}>
        {kpis.map((k, i) => (
          <div key={i} style={{ background: T.card, border: `1px solid ${k.border}`, borderRadius: 14, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, animation: `wedding-fade-in .3s ease ${i * .07}s both`, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: -20, right: -20, width: 70, height: 70, borderRadius: "50%", background: `radial-gradient(circle,${k.color}18 0%,transparent 70%)`, pointerEvents: "none" }} />
            <div style={{ width: 36, height: 36, borderRadius: 10, background: k.bg, border: `1px solid ${k.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <k.icon size={16} color={k.color} />
            </div>
            <div>
              <div style={{ fontSize: typeof k.value === "string" ? 16 : 22, fontWeight: 900, color: k.color, lineHeight: 1, letterSpacing: typeof k.value === "string" ? "-.3px" : "-1px" }}>{k.value}</div>
              <div style={{ fontSize: 11, color: T.muted, marginTop: 4, fontWeight: 600 }}>{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: T.glass, border: `1px solid ${T.border2}`, borderRadius: 10, padding: "7px 12px", flex: 1, maxWidth: 280 }}>
          <Search size={13} color={T.muted} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nome do casal…" style={{ background: "none", border: "none", outline: "none", color: T.text, fontFamily: "inherit", fontSize: 13, flex: 1 }} />
        </div>
        <div style={{ display: "flex", gap: 5 }}>
          {([
            { id: "all",       label: "Todos"      },
            { id: "confirmed", label: "Confirmado" },
            { id: "tentative", label: "Em neg."    },
            { id: "completed", label: "Realizado"  },
          ] as { id: FilterStatus; label: string }[]).map(f => (
            <button key={f.id} onClick={() => setFilterStatus(f.id)} style={{ padding: "7px 12px", borderRadius: 9, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700, background: filterStatus === f.id ? "rgba(155,109,255,0.15)" : T.glass, color: filterStatus === f.id ? T.g1 : T.muted, outline: filterStatus === f.id ? `1px solid rgba(155,109,255,.28)` : `1px solid ${T.border}`, transition: "all .15s" }}>{f.label}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 5 }}>
          {([
            { id: "all",          label: "Todos"      },
            { id: "exclusive",    label: "Exclusivo"  },
            { id: "nonexclusive", label: "Sem exclus."},
          ] as { id: FilterExcl; label: string }[]).map(f => (
            <button key={f.id} onClick={() => setFilterExcl(f.id)} style={{ padding: "7px 12px", borderRadius: 9, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700, background: filterExcl === f.id ? T.violetBg : T.glass, color: filterExcl === f.id ? T.violet : T.muted, outline: filterExcl === f.id ? `1px solid ${T.violetBorder}` : `1px solid ${T.border}`, transition: "all .15s" }}>{f.label}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 2, background: T.glass, border: `1px solid ${T.border}`, borderRadius: 9, padding: 3, marginLeft: "auto" }}>
          {([{ id: "grid" as ViewMode, Icon: Grid3X3 }, { id: "list" as ViewMode, Icon: List }]).map(({ id, Icon }) => (
            <button key={id} onClick={() => setView(id)} style={{ width: 30, height: 28, borderRadius: 7, border: "none", cursor: "pointer", background: view === id ? T.card : "transparent", color: view === id ? T.text : T.muted, display: "flex", alignItems: "center", justifyContent: "center", transition: "all .15s" }}>
              <Icon size={14} />
            </button>
          ))}
        </div>
        <button style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 16px", borderRadius: 10, border: "none", background: T.grad, cursor: "pointer", color: "#fff", fontSize: 13, fontWeight: 800, fontFamily: "inherit", boxShadow: "0 4px 14px rgba(155,109,255,.3)" }}>
          <Plus size={14} color="#fff" /> Novo Casamento
        </button>
      </div>

      {/* Cards */}
      <div>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "64px 0", gap: 12, color: T.muted }}>
            <Loader2 size={20} className="animate-spin" style={{ color: T.g1 }} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Carregando casamentos…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "64px 0", gap: 12, color: T.muted }}>
            <Heart size={32} color={T.muted2} />
            <div style={{ fontSize: 14, fontWeight: 700 }}>{weddings.length === 0 ? "Nenhum casamento cadastrado" : "Nenhum casamento encontrado"}</div>
          </div>
        ) : view === "grid" ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 14 }}>
            {filtered.map((w, i) => (
              <div key={w.id} style={{ animation: `wedding-fade-in .3s ease ${i * .06}s both` }}>
                <WeddingCard wedding={w} cabinsTotal={cabinsTotal} onOpen={setSelected} view="grid" showFinancial={showFinancial} highlightExclusive={highlightExclusive} />
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 900, margin: "0 auto" }}>
            {filtered.map((w, i) => (
              <div key={w.id} style={{ animation: `wedding-fade-in .2s ease ${i * .05}s both` }}>
                <WeddingCard wedding={w} cabinsTotal={cabinsTotal} onOpen={setSelected} view="list" showFinancial={showFinancial} highlightExclusive={highlightExclusive} />
              </div>
            ))}
          </div>
        )}
      </div>

      <DetailDrawer wedding={selected} cabinsTotal={cabinsTotal} onClose={() => setSelected(null)} showFinancial={showFinancial} />
    </div>
  );
}
