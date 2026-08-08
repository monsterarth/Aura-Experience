// Casamentos — tokens, helpers e primitivas compartilhadas entre a página e
// os modais extraídos (movimento mecânico do page.tsx monolítico).
import React from "react";
import { Wedding, WeddingStatus, WeddingCabinAssignment } from "@/types/aura";
import { Shield, Camera, Music, Mic, Flower2, Coffee, Star, Truck, Sun } from "lucide-react";

// ─── Design tokens ────────────────────────────────────────────────────────────
export const T = {
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

type FilterStatus = 'all' | WeddingStatus | 'followup_due';
type FilterExcl = 'all' | 'exclusive' | 'nonexclusive';
type DrawerTab = 'evento' | 'hospedagem' | 'fornecedores' | 'financeiro';
type ViewMode = 'grid' | 'list';

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function fmt(dateStr: string): string {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

/** Hoje no fuso da pousada — comparar prazo com data em UTC erra à noite. */
export function todayIso(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

export function daysUntil(dateStr: string): number {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + "T00:00:00");
  return Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function nightsBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) / (1000 * 60 * 60 * 24)
  );
}

export function fmtMoney(v: number): string {
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

export const STATUS_CFG: Record<WeddingStatus, { label: string; pillBg: string; pillColor: string; pillBorder: string }> = {
  confirmed: { label: "Confirmado",    pillBg: T.greenBg,  pillColor: T.green,  pillBorder: T.greenBorder  },
  tentative: { label: "Em negociação", pillBg: T.amberBg,  pillColor: T.amber,  pillBorder: T.amberBorder  },
  completed: { label: "Realizado",     pillBg: T.glass2,   pillColor: T.muted,  pillBorder: T.border2      },
  cancelled: { label: "Cancelado",     pillBg: T.redBg,    pillColor: T.red,    pillBorder: T.redBorder    },
  // Perdido ≠ cancelado: negociação que nunca virou contrato.
  lost:      { label: "Perdido",       pillBg: T.glass2,   pillColor: T.muted2, pillBorder: T.border2      },
};

export const VENDOR_ICONS: Record<string, React.ElementType> = {
  Fotografia: Camera, Filmagem: Camera, DJ: Music, Banda: Mic,
  Decoração: Flower2, Buffet: Coffee, Bolo: Star, Cerimonialista: Star,
  Floricultura: Flower2, Transporte: Truck, "Luz e Som": Sun, Assessoria: Shield,
};

// ─── Pill ─────────────────────────────────────────────────────────────────────

export function Pill({ label, bg, color, border, style }: {
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

export function CabinMap({ occupied, total, assignments = [] }: {
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

export const FLabel = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase' as const, color: T.muted, marginBottom: 5 }}>{children}</div>
);

export const FInput = ({ value, onChange, placeholder, type = 'text', style }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string; style?: React.CSSProperties;
}) => (
  <input
    type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
    style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 10, border: `1px solid ${T.border2}`, background: T.glass, color: T.text, fontFamily: 'inherit', fontSize: 13, outline: 'none', ...style }}
  />
);

export const FSelect = ({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) => (
  <select
    value={value} onChange={e => onChange(e.target.value)}
    style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 10, border: `1px solid ${T.border2}`, background: T.card, color: T.text, fontFamily: 'inherit', fontSize: 13, outline: 'none' }}
  >
    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
);

export const FRow = ({ children, cols = 2 }: { children: React.ReactNode; cols?: number }) => (
  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols},1fr)`, gap: 12 }}>{children}</div>
);

export const FField = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div><FLabel>{label}</FLabel>{children}</div>
);

export const FToggle = ({ label, sub, checked, onChange }: {
  label: string; sub?: string; checked: boolean; onChange: (v: boolean) => void;
}) => (
  <div
    onClick={() => onChange(!checked)}
    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, border: `1px solid ${checked ? T.violetBorder : T.border}`, background: checked ? T.violetBg : T.glass, cursor: 'pointer', userSelect: 'none' as const }}
  >
    <div style={{ width: 36, height: 20, borderRadius: 999, background: checked ? T.violet : T.glass3, border: `1px solid ${checked ? T.violet : T.border2}`, position: 'relative', flexShrink: 0, transition: 'all .2s' }}>
      <div style={{ position: 'absolute', top: 2, left: checked ? 18 : 2, width: 14, height: 14, borderRadius: '50%', background: checked ? '#fff' : T.muted2, transition: 'left .2s' }} />
    </div>
    <div>
      <div style={{ fontSize: 13, fontWeight: 800, color: checked ? T.violet : T.text }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  </div>
);

// ─── Estado do lead (follow-up/validade) ─────────────────────────────────────

export function leadState(w: Wedding, today: string): { tone: 'overdue' | 'today' | 'ok' | 'none'; label: string } {
  if (w.status !== 'tentative') return { tone: 'none', label: '' };
  if (w.expiresAt && w.expiresAt < today) return { tone: 'overdue', label: 'Prazo vencido' };
  if (w.followUpAt) {
    if (w.followUpAt < today) return { tone: 'overdue', label: 'Follow-up atrasado' };
    if (w.followUpAt === today) return { tone: 'today', label: 'Follow-up hoje' };
    return { tone: 'ok', label: `Follow-up ${fmt(w.followUpAt)}` };
  }
  return { tone: 'none', label: '' };
}

// Prazos padrão das negociações — vivem na tela onde são usados, não no setup.
// Fora do LeadSettingsModal DE PROPÓSITO: definido dentro, cada setForm criava
// um tipo novo de componente → React remontava o input → foco perdido a cada
