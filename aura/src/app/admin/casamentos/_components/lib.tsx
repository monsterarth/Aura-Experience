// Casamentos — tokens, helpers e primitivas compartilhadas entre a página e
// os modais extraídos (movimento mecânico do page.tsx monolítico).
import React from "react";
import { Wedding, WeddingStatus, WeddingCabinAssignment, WeddingInstallment } from "@/types/aura";
import { Shield, Camera, Music, Mic, Flower2, Coffee, Star, Truck, Sun } from "lucide-react";
import { Field, FieldRow, Input, Select, Switch } from "@/components/aura";

// ─── Design tokens ────────────────────────────────────────────────────────────
// Promovidos a módulo compartilhado (identidade oficial do admin) — o objeto
// continua exportado daqui para não quebrar os imports do módulo.
import { T, alpha, tone } from "@/lib/admin-tokens";
export { T, alpha, tone };

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

// Primitivas de formulário — finas sobre o kit (Field/Input/Select/FieldRow/Switch):
// os modais do módulo sobem de identidade e responsividade sem mudar de assinatura.
export const FLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="ak-field__label" style={{ marginBottom: 6 }}>{children}</div>
);

export const FInput = ({ value, onChange, placeholder, type = "text", style }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string; style?: React.CSSProperties;
}) => (
  <Input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={style} />
);

export const FSelect = ({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) => (
  <Select value={value} onChange={e => onChange(e.target.value)}>
    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </Select>
);

export const FRow = ({ children, cols = 2 }: { children: React.ReactNode; cols?: number }) => (
  <FieldRow cols={cols === 3 ? 3 : cols === 4 ? 4 : 2}>{children}</FieldRow>
);

export const FField = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <Field label={label}>{children}</Field>
);

export const FToggle = ({ label, sub, checked, onChange }: {
  label: string; sub?: string; checked: boolean; onChange: (v: boolean) => void;
}) => (
  <div style={{ padding: "10px 14px", borderRadius: 12, border: `1px solid ${checked ? T.violetBorder : T.border}`, background: checked ? T.violetBg : T.glass }}>
    <Switch checked={checked} onChange={onChange} label={label} hint={sub} />
  </div>
);

// ─── Parcelas ─────────────────────────────────────────────────────────────────

/**
 * Resumo financeiro do contrato — REGRA ÚNICA para card e drawer.
 * Fonte: wedding_installments; fallback na derivação legada (2 campos fixos +
 * saldo) SÓ quando `installments` nem veio na query (pré-migration). Array
 * vazio é resposta real — casamento sem parcelas, sem ressuscitar fantasmas
 * legados (excluir todas criava beco sem saída: fantasmas + botão sumido).
 * Linhas legadas têm id "legacy-*" e são só leitura.
 */
export function installmentSummary(w: Wedding): {
  rows: WeddingInstallment[]; paidTotal: number; paidPct: number; legacy: boolean;
} {
  if (w.installments != null) {
    const list = w.installments
      .slice()
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
    const paidTotal = list.filter(i => i.paid).reduce((s, i) => s + Number(i.value), 0);
    const paidPct = w.contractTotal > 0 ? Math.round((paidTotal / w.contractTotal) * 100) : 0;
    return { rows: list, paidTotal, paidPct, legacy: false };
  }

  const deposit = w.depositValue ?? 0;
  const second = w.secondInstallmentValue ?? 0;
  const balance = Math.max(w.contractTotal - deposit - second, 0);
  const rows: WeddingInstallment[] = [
    ...(deposit > 0 ? [{ id: "legacy-1", weddingId: w.id, label: "1ª parcela — Sinal", value: deposit, paid: w.depositPaid ?? false }] : []),
    ...(second > 0 ? [{ id: "legacy-2", weddingId: w.id, label: "2ª parcela — Intermediária", value: second, paid: w.secondInstallmentPaid ?? false }] : []),
    ...(balance > 0 ? [{ id: "legacy-3", weddingId: w.id, label: "3ª parcela — Saldo final", value: balance, paid: false }] : []),
  ];
  const paidTotal = (w.depositPaid ? deposit : 0) + (w.secondInstallmentPaid ? second : 0);
  // Guarda de zero: contrato vazio virava NaN% na tela e width:NaN% na barra.
  const paidPct = w.contractTotal > 0 ? Math.round((paidTotal / w.contractTotal) * 100) : 0;
  return { rows, paidTotal, paidPct, legacy: true };
}

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
