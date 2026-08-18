// Painel lateral de detalhes do casamento — extraído do page.tsx.
"use client";

import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { parseMoneyBR, moneyToInput } from "@/lib/parse-money";
import { Wedding, WeddingInstallment, WeddingStatus } from "@/types/aura";
import { Heart, Shield, Clock, X, Plus, Users, Globe, Star, Check, DollarSign, Calendar, Trash2, CheckCircle2, Archive, Loader2, Pencil, Copy, RefreshCw, Power, ExternalLink } from "lucide-react";
import { T, fmt, todayIso, daysUntil, nightsBetween, fmtMoney, STATUS_CFG, VENDOR_ICONS, Pill, CabinMap, leadState, installmentSummary } from "./lib";
import { LostReasonModal } from "./LostReasonModal";

type DrawerTab = 'evento' | 'hospedagem' | 'fornecedores' | 'site' | 'financeiro';

// ─── Parcelas (aba financeiro) ────────────────────────────────────────────────
// Componente no topo do módulo de propósito: definido dentro do render o React
// remontaria os inputs a cada tecla (pegadinha já vivida no LeadSettingsModal).

type InstallmentForm = { id?: string; label: string; value: string; dueDate: string };

function InstallmentsPanel({ wedding, onDataChanged }: {
  wedding: Wedding;
  /** Recarrega a lista da página (o % pago do card muda junto). */
  onDataChanged?: () => void;
}) {
  // null = ainda espelha wedding.installments; após uma mutação a API devolve
  // a lista fresca e ela passa a mandar (a página recarrega em paralelo).
  const [rows, setRows] = useState<WeddingInstallment[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [form, setForm] = useState<InstallmentForm | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setRows(null); setForm(null); }, [wedding.id]);

  const summary = installmentSummary(rows ? { ...wedding, installments: rows } : wedding);
  const today = todayIso();

  const mutate = async (init: RequestInit, qs = "") => {
    const res = await fetch(`/api/admin/weddings/${wedding.id}/installments${qs}`, init);
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || "Erro na operação.");
    setRows(data.installments || []);
    onDataChanged?.();
  };

  const togglePaid = async (inst: WeddingInstallment) => {
    setBusyId(inst.id);
    try {
      await mutate({
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ installmentId: inst.id, paid: !inst.paid }),
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar a parcela.");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (inst: WeddingInstallment) => {
    if (!confirm(`Excluir a parcela "${inst.label}"?`)) return;
    setBusyId(inst.id);
    try {
      await mutate({ method: "DELETE" }, `?installmentId=${inst.id}`);
      toast.success("Parcela excluída.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir a parcela.");
    } finally {
      setBusyId(null);
    }
  };

  const saveForm = async () => {
    if (!form || saving) return;
    const value = parseMoneyBR(form.value);
    if (!form.label.trim() || !Number.isFinite(value) || value <= 0) {
      toast.error("Preencha nome e valor da parcela.");
      return;
    }
    setSaving(true);
    try {
      await mutate({
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          installmentId: form.id, label: form.label.trim(), value,
          dueDate: form.dueDate || null,
        }),
      });
      setForm(null);
      toast.success(form.id ? "Parcela atualizada." : "Parcela criada.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar a parcela.");
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 9,
    border: `1px solid ${T.border2}`, background: T.glass, color: T.text,
    fontFamily: "inherit", fontSize: 12, outline: "none",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Resumo */}
      <div style={{ background: T.glass, border: `1px solid ${T.border}`, borderRadius: 14, padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: T.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 4 }}>Total do contrato</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: T.text, letterSpacing: "-1px" }}>{fmtMoney(wedding.contractTotal)}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: T.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 4 }}>Recebido</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: T.green }}>{summary.paidPct}%</div>
          </div>
        </div>
        <div style={{ height: 8, borderRadius: 999, background: T.glass3, overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: 999, background: T.grad, width: `${Math.min(summary.paidPct, 100)}%`, transition: "width .8s" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
          <span style={{ fontSize: 11, color: T.green, fontWeight: 700 }}>{fmtMoney(summary.paidTotal)} recebido</span>
          <span style={{ fontSize: 11, color: summary.paidPct >= 100 ? T.green : T.amber, fontWeight: 700 }}>
            {summary.paidPct >= 100 ? "Quitado ✓" : `${fmtMoney(Math.max(wedding.contractTotal - summary.paidTotal, 0))} a receber`}
          </span>
        </div>
      </div>

      {/* Parcelas */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase", color: T.muted }}>Parcelas</div>
        {!summary.legacy || summary.rows.length === 0 ? (
          <button onClick={() => setForm({ label: "", value: "", dueDate: "" })}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 9, border: `1px dashed ${T.border2}`, background: "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 700, color: T.muted }}>
            <Plus size={12} /> Adicionar
          </button>
        ) : null}
      </div>

      {summary.legacy && summary.rows.length > 0 && (
        <div style={{ fontSize: 11, color: T.muted, background: T.amberBg, border: `1px solid ${T.amberBorder}`, borderRadius: 10, padding: "8px 12px" }}>
          Parcelas legadas (somente leitura) — rode a migration <b>weddings_installments.sql</b> para editar, dar vencimento e gerar cobranças.
        </div>
      )}

      {summary.rows.length === 0 && !form && (
        <div style={{ fontSize: 12, color: T.muted, textAlign: "center", padding: "14px 0" }}>
          Nenhuma parcela — contrato sem valores ainda.
        </div>
      )}

      {summary.rows.map((inst) => {
        const isLegacy = inst.id.startsWith("legacy-");
        const overdue = !inst.paid && !!inst.dueDate && inst.dueDate <= today;
        const busy = busyId === inst.id;
        return (
          <div key={inst.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", background: inst.paid ? T.greenBg : overdue ? T.redBg : T.glass, border: `1px solid ${inst.paid ? T.greenBorder : overdue ? T.redBorder : T.border}`, borderRadius: 13 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, flexShrink: 0, background: inst.paid ? T.greenBg : overdue ? T.redBg : T.amberBg, border: `1px solid ${inst.paid ? T.greenBorder : overdue ? T.redBorder : T.amberBorder}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {inst.paid ? <Check size={15} color={T.green} /> : <DollarSign size={15} color={overdue ? T.red : T.amber} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 800 }}>{inst.label}</div>
              {inst.dueDate && (
                <div style={{ fontSize: 10, fontWeight: 700, color: overdue ? T.red : T.muted, marginTop: 2 }}>
                  {overdue ? "Venceu" : "Vence"} {fmt(inst.dueDate)}
                </div>
              )}
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 900, color: inst.paid ? T.green : T.text }}>{fmtMoney(Number(inst.value))}</div>
              <Pill label={inst.paid ? "Pago" : overdue ? "Vencida" : "Pendente"} bg={inst.paid ? T.greenBg : overdue ? T.redBg : T.amberBg} color={inst.paid ? T.green : overdue ? T.red : T.amber} border={inst.paid ? T.greenBorder : overdue ? T.redBorder : T.amberBorder} style={{ marginTop: 3, fontSize: 8 }} />
            </div>
            {!isLegacy && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                <button title={inst.paid ? "Voltar a pendente" : "Marcar como paga"} disabled={busy} onClick={() => togglePaid(inst)}
                  style={{ width: 26, height: 26, borderRadius: 8, border: `1px solid ${inst.paid ? T.border2 : T.greenBorder}`, background: inst.paid ? T.glass : T.greenBg, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {busy ? <Loader2 size={12} color={T.muted} className="animate-spin" /> : <Check size={12} color={inst.paid ? T.muted : T.green} />}
                </button>
                <div style={{ display: "flex", gap: 4 }}>
                  <button title="Editar" disabled={busy}
                    onClick={() => setForm({ id: inst.id, label: inst.label, value: moneyToInput(Number(inst.value)), dueDate: inst.dueDate ?? "" })}
                    style={{ width: 26, height: 26, borderRadius: 8, border: `1px solid ${T.border2}`, background: T.glass, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Pencil size={11} color={T.muted} />
                  </button>
                  <button title="Excluir" disabled={busy} onClick={() => remove(inst)}
                    style={{ width: 26, height: 26, borderRadius: 8, border: `1px solid ${T.redBorder}`, background: T.redBg, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Trash2 size={11} color={T.red} />
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {form && (
        <div style={{ background: T.glass, border: `1px solid ${T.border2}`, borderRadius: 13, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".05em", color: T.muted }}>
            {form.id ? "Editar parcela" : "Nova parcela"}
          </div>
          <input style={inputStyle} placeholder="Nome (ex.: 2ª parcela — Intermediária)"
            value={form.label} onChange={(e) => setForm(f => f && { ...f, label: e.target.value })} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <input style={inputStyle} placeholder="Valor (R$)" inputMode="decimal"
              value={form.value} onChange={(e) => setForm(f => f && { ...f, value: e.target.value })} />
            <input style={inputStyle} type="date"
              value={form.dueDate} onChange={(e) => setForm(f => f && { ...f, dueDate: e.target.value })} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setForm(null)}
              style={{ flex: 1, padding: 8, borderRadius: 9, border: `1px solid ${T.border2}`, background: T.glass, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700, color: T.muted }}>
              Cancelar
            </button>
            <button onClick={saveForm} disabled={saving}
              style={{ flex: 2, padding: 8, borderRadius: 9, border: "none", background: T.grad, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 800, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: saving ? .7 : 1 }}>
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              {form.id ? "Salvar" : "Criar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Site dos noivos (aba Site) ───────────────────────────────────────────────
// Componente no topo do módulo (mesma razão do InstallmentsPanel): definido
// dentro do render, os inputs remontariam a cada tecla.

type SiteState = {
  enabled: boolean;
  guestCode: string | null;
  coupleCode: string | null;
  rateTableId: string | null;
  maxExtendNights: number;
  status: string;
  checkin: string | null;
  checkout: string | null;
};

type SitePreReservation = {
  id: string; clientName: string | null; clientPhone: string | null;
  status: string; checkIn: string; checkOut: string; pax: number;
  categoryName: string; value: number; stayId: string | null;
  fromSite: boolean; createdAt: string;
};

const QUOTE_STATUS_CFG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  open:        { label: "Pendente",    color: "#f59e0b", bg: "rgba(245,158,11,.08)", border: "rgba(245,158,11,.22)" },
  sent:        { label: "Enviada",     color: "#60a5fa", bg: "rgba(96,165,250,.08)",  border: "rgba(96,165,250,.22)" },
  negotiating: { label: "Negociando",  color: "#a78bfa", bg: "rgba(167,139,250,.08)", border: "rgba(167,139,250,.22)" },
  won:         { label: "Confirmada",  color: "#4ade80", bg: "rgba(74,222,128,.08)",  border: "rgba(74,222,128,.22)" },
  lost:        { label: "Perdida",     color: "#f87171", bg: "rgba(248,113,113,.08)", border: "rgba(248,113,113,.22)" },
};

function SitePanel({ wedding, onDataChanged }: { wedding: Wedding; onDataChanged?: () => void }) {
  const [site, setSite] = useState<SiteState | null>(null);
  const [preReservations, setPreReservations] = useState<SitePreReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/weddings/${wedding.id}/site`);
      const data = await res.json().catch(() => null);
      if (res.ok && data?.site) {
        setSite(data.site);
        setPreReservations(data.preReservations || []);
      }
    } finally {
      setLoading(false);
    }
    // Reavalia quando o casamento muda de tabela/status/janela (ex.: recepção
    // vinculou a tabela no formulário) — o checklist de ativação depende disso.
  }, [wedding.id, wedding.rateTableId, wedding.status, wedding.checkin, wedding.checkout]);

  useEffect(() => { setLoading(true); setSite(null); load(); }, [load]);

  const act = async (body: Record<string, string>) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/weddings/${wedding.id}/site`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Erro na operação.");
      await load();
      onDataChanged?.();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro na operação.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const copy = (text: string, what: string) => {
    navigator.clipboard.writeText(text)
      .then(() => toast.success(`${what} copiado!`))
      .catch(() => toast.error("Não foi possível copiar."));
  };

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "40px 0", color: T.muted }}>
        <Loader2 size={16} className="animate-spin" /> Carregando…
      </div>
    );
  }
  if (!site) {
    return <div style={{ fontSize: 13, color: T.muted, textAlign: "center", padding: "30px 0" }}>Não foi possível carregar o site.</div>;
  }

  const requirements = [
    { ok: site.status === "confirmed", label: "Casamento confirmado" },
    { ok: !!site.rateTableId, label: "Tabela de tarifa vinculada (aba Hospedagem do formulário)" },
    { ok: !!site.checkin && !!site.checkout && (site.checkin ?? "") < (site.checkout ?? ""), label: "Janela de hospedagem definida (check-in/check-out)" },
  ];
  const ready = requirements.every((r) => r.ok);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const guestLink = site.guestCode ? `${origin}/casamento?code=${site.guestCode}` : null;

  const CodeRow = ({ label, code, link, which }: { label: string; code: string | null; link: string | null; which: "guest" | "couple" }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", background: T.glass, border: `1px solid ${T.border}`, borderRadius: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: T.muted }}>{label}</div>
        <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: ".2em", marginTop: 2 }}>{code ?? "—"}</div>
      </div>
      {code && (
        <>
          {link && (
            <button title="Copiar link" onClick={() => copy(link, "Link")}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 9, border: `1px solid ${T.border2}`, background: T.glass2, cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 700, color: T.text }}>
              <Copy size={11} /> link
            </button>
          )}
          <button title="Copiar código" onClick={() => copy(code, "Código")}
            style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${T.border2}`, background: T.glass2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: T.muted }}>
            <Copy size={12} />
          </button>
          <button title="Regenerar código (o antigo morre na hora)" disabled={busy}
            onClick={() => { if (confirm("Regenerar este código? Quem tiver o antigo perde o acesso — inclusive convites já impressos.")) act({ action: "regenerate", which }); }}
            style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${T.amberBorder}`, background: T.amberBg, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <RefreshCw size={12} color={T.amber} />
          </button>
        </>
      )}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Estado + ativação */}
      <div style={{ background: site.enabled ? T.greenBg : T.glass, border: `1px solid ${site.enabled ? T.greenBorder : T.border}`, borderRadius: 14, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Globe size={16} color={site.enabled ? T.green : T.muted} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: site.enabled ? T.green : T.text }}>
              {site.enabled ? "Site no ar" : "Site desligado"}
            </div>
            <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
              Convidados simulam a hospedagem com a tarifa do casamento e deixam pré-reservas no funil comercial.
            </div>
          </div>
          {site.enabled && guestLink && (
            <a href={`/casamento/${site.guestCode}`} target="_blank" rel="noreferrer" title="Abrir o site como convidado"
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 9, border: `1px solid ${T.greenBorder}`, background: T.greenBg, fontFamily: "inherit", fontSize: 11, fontWeight: 800, color: T.green, textDecoration: "none", flexShrink: 0 }}>
              <ExternalLink size={11} /> abrir
            </a>
          )}
        </div>

        {!site.enabled && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
            {requirements.map((r) => (
              <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: r.ok ? T.green : T.muted }}>
                {r.ok ? <Check size={13} color={T.green} /> : <X size={13} color={T.red} />} {r.label}
              </div>
            ))}
          </div>
        )}

        <button disabled={busy || (!site.enabled && !ready)}
          onClick={async () => {
            if (site.enabled) {
              if (confirm("Desligar o site? Os códigos continuam válidos para quando reativar.")) {
                await act({ action: "deactivate" });
              }
            } else if (await act({ action: "activate" })) {
              toast.success("Site ativado!");
            }
          }}
          style={{
            marginTop: 12, width: "100%", padding: 10, borderRadius: 11,
            border: site.enabled ? `1px solid ${T.border2}` : "none",
            background: site.enabled ? T.glass : T.grad,
            cursor: busy || (!site.enabled && !ready) ? "default" : "pointer",
            opacity: busy || (!site.enabled && !ready) ? .55 : 1,
            fontFamily: "inherit", fontSize: 13, fontWeight: 800,
            color: site.enabled ? T.muted : "#fff",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
          }}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Power size={14} />}
          {site.enabled ? "Desligar site" : "Ativar site"}
        </button>
      </div>

      {/* Códigos */}
      {(site.guestCode || site.coupleCode) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase", color: T.muted }}>Códigos de acesso</div>
          <CodeRow label="Convidados (vai no convite)" code={site.guestCode} link={guestLink} which="guest" />
          <CodeRow label="Noivos (painel do casal)" code={site.coupleCode}
            link={site.coupleCode ? `${origin}/casamento?code=${site.coupleCode}` : null} which="couple" />
        </div>
      )}

      {/* Pré-reservas */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase", color: T.muted, marginBottom: 8 }}>
          Pré-reservas ({preReservations.length})
        </div>
        {preReservations.length === 0 ? (
          <div style={{ fontSize: 12, color: T.muted, textAlign: "center", padding: "14px 0" }}>
            Nenhuma pré-reserva ainda — os convidados aparecem aqui (e no funil comercial, com o selo 💍).
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {preReservations.map((p) => {
              const cfg = QUOTE_STATUS_CFG[p.status] ?? QUOTE_STATUS_CFG.open;
              return (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", background: T.glass, border: `1px solid ${T.border}`, borderRadius: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {p.clientName || "Sem nome"}
                    </div>
                    <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
                      {p.categoryName} · {fmt(p.checkIn)} → {fmt(p.checkOut)} · {p.pax} pax
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 900 }}>{fmtMoney(p.value)}</div>
                    <Pill label={cfg.label} bg={cfg.bg} color={cfg.color} border={cfg.border} style={{ marginTop: 3, fontSize: 8 }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function DetailDrawer({ wedding, cabinsTotal, onClose, showFinancial, onEdit, onDelete, onStatusChange, onMarkLost, onFollowUp, onDataChanged }: {
  wedding: Wedding | null; cabinsTotal: number; onClose: () => void; showFinancial: boolean;
  onEdit: (w: Wedding) => void; onDelete: (w: Wedding) => void;
  onStatusChange: (w: Wedding, status: WeddingStatus) => Promise<void>;
  onMarkLost: (w: Wedding, reason: string) => Promise<void>;
  onFollowUp: (w: Wedding) => Promise<void>;
  onDataChanged?: () => void;
}) {
  const [tab, setTab] = useState<DrawerTab>("evento");
  const [lostOpen, setLostOpen] = useState(false);

  useEffect(() => { if (wedding) { setTab("evento"); setLostOpen(false); } }, [wedding]);

  if (!wedding) return null;

  const sc = STATUS_CFG[wedding.status];
  const nights = nightsBetween(wedding.checkin, wedding.checkout);
  const days = daysUntil(wedding.weddingDate);
  const vendors = wedding.vendors ?? [];
  const vendorConfirmed = vendors.filter(v => v.confirmed).length;
  const assignments = wedding.cabinAssignments ?? [];

  const tabs: { id: DrawerTab; label: string }[] = [
    { id: "evento",       label: "Evento" },
    { id: "hospedagem",   label: "Hospedagem" },
    { id: "fornecedores", label: `Fornecedores (${vendors.length})` },
    { id: "site",         label: "Site" },
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
      <div onClick={e => e.stopPropagation()} style={{ width: "min(520px, 100vw)", background: T.card, borderLeft: `1px solid ${T.border2}`, display: "flex", flexDirection: "column", animation: "wedding-slide-in .22s ease", boxShadow: "-24px 0 80px rgba(0,0,0,.6)" }}>
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
                {wedding.status === "lost" && (
                  <InfoBox icon={Archive} label="Motivo da perda" value={wedding.lostReason ?? "—"} color={T.muted} bg={T.glass2} border={T.border2} />
                )}
                {wedding.status === "tentative" && (
                  <InfoBox icon={Clock} label="Follow-up / validade"
                    value={`${wedding.followUpAt ? fmt(wedding.followUpAt) : "—"} · vence ${wedding.expiresAt ? fmt(wedding.expiresAt) : "—"}`}
                    color={leadState(wedding, todayIso()).tone === "overdue" ? T.red : T.amber}
                    bg={T.amberBg} border={T.amberBorder} />
                )}
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

          {tab === "site" && (
            <SitePanel wedding={wedding} onDataChanged={onDataChanged} />
          )}

          {tab === "financeiro" && showFinancial && (
            <InstallmentsPanel wedding={wedding} onDataChanged={onDataChanged} />
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 24px", borderTop: `1px solid ${T.border}`, display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
          {/* Contato registrado renova a validade — impede o lead ativo de expirar */}
          {wedding.status === "tentative" && (
            <button onClick={() => onFollowUp(wedding)}
              style={{ flexBasis: "100%", padding: 10, borderRadius: 11, border: `1px solid ${T.amberBorder}`, background: T.amberBg, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 800, color: T.amber, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
              <Clock size={14} /> Registrar follow-up
            </button>
          )}
          {/* Negociação que não frutificou sai da lista ativa com motivo registrado */}
          {(wedding.status === "tentative" || wedding.status === "confirmed") && (
            <button onClick={() => setLostOpen(true)}
              style={{ flexBasis: "100%", padding: 10, borderRadius: 11, border: `1px solid ${T.border2}`, background: T.glass, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700, color: T.muted, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
              <Archive size={14} /> Arquivar como negociação perdida
            </button>
          )}
          {/* Atalho direto: grava só o status, sem passar pelo formulário completo */}
          {wedding.status !== "completed" && wedding.status !== "cancelled" && wedding.status !== "lost" && days < 0 && (
            <button onClick={() => onStatusChange(wedding, "completed")}
              style={{ flexBasis: "100%", padding: 10, borderRadius: 11, border: `1px solid ${T.greenBorder}`, background: T.greenBg, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 800, color: T.green, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
              <CheckCircle2 size={14} /> Marcar como realizado
            </button>
          )}
          <button onClick={() => onDelete(wedding)} style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${T.redBorder}`, background: T.redBg, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Trash2 size={14} color={T.red} />
          </button>
          <button onClick={() => onEdit(wedding)} style={{ flex: 1, padding: 10, borderRadius: 11, border: `1px solid ${T.border2}`, background: T.glass, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700, color: T.muted }}>
            Editar
          </button>
          {/* Só aparece com WhatsApp do casal cadastrado (antes era um botão morto) */}
          {wedding.couplePhone && (
            <a href={`https://wa.me/${wedding.couplePhone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"
              style={{ flex: 2, padding: 10, borderRadius: 11, border: "none", background: T.grad, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 800, color: "#fff", boxShadow: "0 4px 14px rgba(155,109,255,.3)", display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>
              Falar com o casal
            </a>
          )}
        </div>
      </div>

      {lostOpen && (
        <LostReasonModal
          wedding={wedding}
          onCancel={() => setLostOpen(false)}
          onConfirm={async (reason) => { await onMarkLost(wedding, reason); setLostOpen(false); }}
        />
      )}
    </div>
  );
}
