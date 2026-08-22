// Comercial · Marketing — "meio feita" de propósito: os blocos com dado real
// já funcionam (KPIs do pipeline, descontos, promoções, resumo das
// pesquisas) e o que ainda não tem escopo fechado fica como wireframe
// assumido ("em definição"), no lugar onde vai nascer.
// Visual: identidade do admin (dark glass — ver src/app/admin/CLAUDE.md).
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  BadgePercent, ChartNoAxesCombined, Gift, Megaphone, MessageSquareHeart,
  Plus, Radio, Save, Send, Star, Tag, Trash2, TrendingUp,
} from "lucide-react";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { useProperty } from "@/context/PropertyContext";
import { T } from "@/lib/admin-tokens";
import {
  CrmChannel, CrmLead, RateDiscount, RatePromo, SurveyResponseWithStay,
} from "@/types/aura";
import { S, money, pillS } from "../_components/shared";
import { PageShell, PageHeader, Button, PageSkeleton } from "@/components/aura";

const sectionLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 900, letterSpacing: ".14em", textTransform: "uppercase",
  color: T.muted, margin: 0,
};

const DAY_TYPE_LABEL: Record<RatePromo["dayType"], string> = {
  all: "todo o período", fds: "só FDS", week: "só semana",
};

function KpiCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div style={{ ...S.card, padding: "16px 18px", position: "relative", overflow: "hidden" }}>
      <div style={{
        position: "absolute", top: -30, right: -30, width: 110, height: 110, borderRadius: 999,
        background: "radial-gradient(circle, rgba(155,109,255,.14), transparent 70%)",
      }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 10, background: T.gradSoft,
          border: `1px solid ${T.g1Border}`, display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon size={14} color={T.g1} />
        </div>
        <span style={sectionLabel}>{label}</span>
      </div>
      <div style={{ fontSize: 21, fontWeight: 900, letterSpacing: "-.02em", color: color ?? T.text }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: T.muted, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

/** Bloco assumidamente futuro — desenhado, mas sem dado. */
function Wireframe({ icon: Icon, title, desc }: {
  icon: React.ElementType; title: string; desc: string;
}) {
  return (
    <div style={{
      border: `1px dashed ${T.border2}`, borderRadius: 16, padding: "22px 20px",
      display: "flex", gap: 14, alignItems: "flex-start", opacity: 0.85,
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: 12, background: T.glass2, flexShrink: 0,
        border: `1px solid ${T.border2}`, display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon size={16} color={T.muted} />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13.5, fontWeight: 800, color: T.text }}>{title}</span>
          <span style={pillS(T.glass2, T.muted, T.border2)}>em definição</span>
        </div>
        <p style={{ fontSize: 12, color: T.muted, margin: "4px 0 10px", lineHeight: 1.5 }}>{desc}</p>
        {/* esqueleto do que vem */}
        <div style={{ display: "flex", gap: 6 }}>
          {[64, 40, 52].map((w, i) => (
            <div key={i} style={{ width: `${w}%`, height: 8, borderRadius: 999, background: T.glass2 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function MarketingPage() {
  const { currentProperty: property } = useProperty();

  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [channels, setChannels] = useState<CrmChannel[]>([]);
  const [responses, setResponses] = useState<SurveyResponseWithStay[] | null>(null);
  const [discounts, setDiscounts] = useState<RateDiscount[]>([]);
  const [promos, setPromos] = useState<RatePromo[]>([]);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const [newDisc, setNewDisc] = useState({ name: "", pct: "" });
  const [newPromo, setNewPromo] = useState({
    name: "", pct: "", startDate: "", endDate: "", minNights: "1",
    dayType: "all" as RatePromo["dayType"],
  });

  const load = useCallback(async () => {
    if (!property?.id) return;
    const pid = property.id;
    const [pipelineRes, settingsRes, surveysRes] = await Promise.all([
      fetch(`/api/admin/comercial?propertyId=${pid}&funnel=quote`).catch(() => null),
      fetch(`/api/admin/marketing/settings?propertyId=${pid}`).catch(() => null),
      fetch(`/api/admin/survey-responses?propertyId=${pid}`).catch(() => null),
    ]);
    if (pipelineRes?.ok) {
      const d = await pipelineRes.json();
      setLeads(d.leads || []);
      setChannels(d.channels || []);
    }
    if (settingsRes?.ok) {
      const d = await settingsRes.json();
      setDiscounts(d.discounts || []);
      setPromos(d.promos || []);
    }
    if (surveysRes?.ok) {
      const d = await surveysRes.json();
      setResponses(d.responses || []);
    }
    setLoading(false);
  }, [property?.id]);

  useEffect(() => { setLoading(true); setDirty(false); load(); }, [load]);

  // ── KPIs do pipeline (mesmo recorte da página de reservas: ativos + 60d) ──
  const kpis = useMemo(() => {
    const active = leads.filter((l) => ["open", "sent", "negotiating"].includes(l.stage));
    const won = leads.filter((l) => l.stage === "won");
    const lost = leads.filter((l) => l.stage === "lost");
    const closed = won.length + lost.length;
    return {
      activeCount: active.length,
      activeValue: active.reduce((s, l) => s + l.value, 0),
      wonValue: won.reduce((s, l) => s + l.value, 0),
      conversion: closed > 0 ? Math.round((won.length / closed) * 100) : null,
      ticket: won.length > 0 ? won.reduce((s, l) => s + l.value, 0) / won.length : 0,
    };
  }, [leads]);

  const bySource = useMemo(() => {
    const map = new Map<string, { count: number; value: number }>();
    for (const l of leads) {
      const key = l.source || "";
      const cur = map.get(key) ?? { count: 0, value: 0 };
      cur.count += 1;
      cur.value += l.value;
      map.set(key, cur);
    }
    const labelOf = (id: string) =>
      id === "" ? "Sem origem" : channels.find((c) => c.id === id)?.label ?? id;
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, label: labelOf(id), ...v }))
      .sort((a, b) => b.count - a.count);
  }, [leads, channels]);

  // ── Pesquisas (Survey 2.0) ─────────────────────────────────────────────────
  const surveyStats = useMemo(() => {
    if (!responses || responses.length === 0) return null;
    const scored = responses.filter((r) => typeof r.metrics?.npsScore === "number");
    const promoters = scored.filter((r) => r.metrics.npsScore! >= 9).length;
    const detractors = scored.filter((r) => r.metrics.npsScore! <= 6).length;
    const nps = scored.length > 0
      ? Math.round(((promoters - detractors) / scored.length) * 100)
      : null;
    const overall = responses
      .map((r) => r.metrics?.overall ?? r.metrics?.averageRating)
      .filter((v): v is number => typeof v === "number");
    const avg = overall.length > 0
      ? Math.round((overall.reduce((s, v) => s + v, 0) / overall.length) * 10) / 10
      : null;
    const improve = new Map<string, number>();
    for (const r of responses) {
      for (const h of r.metrics?.highlightsImprove ?? []) {
        improve.set(h, (improve.get(h) ?? 0) + 1);
      }
    }
    const topImprove = Array.from(improve.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);
    return { total: responses.length, nps, avg, topImprove };
  }, [responses]);

  // ── Descontos & promoções ──────────────────────────────────────────────────
  const addDisc = () => {
    const pct = parseFloat(newDisc.pct.replace(",", "."));
    if (!newDisc.name.trim() || isNaN(pct)) return toast.error("Preencha nome e percentual.");
    setDiscounts((p) => [...p, { id: crypto.randomUUID(), name: newDisc.name.trim(), pct }]);
    setNewDisc({ name: "", pct: "" });
    setDirty(true);
  };

  const addPromo = () => {
    const pct = parseFloat(newPromo.pct.replace(",", "."));
    if (!newPromo.name.trim() || isNaN(pct) || !newPromo.startDate || !newPromo.endDate) {
      return toast.error("Preencha nome, percentual e datas.");
    }
    if (newPromo.startDate > newPromo.endDate) return toast.error("Data inicial maior que a final.");
    setPromos((p) => [...p, {
      id: crypto.randomUUID(), name: newPromo.name.trim(), pct,
      startDate: newPromo.startDate, endDate: newPromo.endDate,
      minNights: parseInt(newPromo.minNights) || 1, dayType: newPromo.dayType,
    }]);
    setNewPromo({ name: "", pct: "", startDate: "", endDate: "", minNights: "1", dayType: "all" });
    setDirty(true);
  };

  const save = async () => {
    if (!property?.id) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/marketing/settings", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId: property.id, settings: { discounts, promos } }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error);
      setDirty(false);
      toast.success("Descontos e promoções salvos — valem na próxima cotação.");
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  if (!property) return null;

  return (
    <PageShell maxWidth="xl">
      <PageHeader
        icon={Megaphone}
        title="Marketing"
        subtitle="Origem dos leads, política de descontos e a voz do hóspede."
        primaryAction={dirty ? { label: "Salvar alterações", icon: Save, onClick: save, loading: saving, mobile: "bar" } : undefined}
      />

      {loading ? (
        <PageSkeleton kpis={3} rows={4} />
      ) : (<>
        {/* KPIs — recorte honesto: pipeline de reservas, ativos + fechados 60d */}
        <div>
          <p style={{ ...sectionLabel, marginBottom: 8 }}>Pipeline de reservas · ativos + fechados 60d</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
            <KpiCard icon={ChartNoAxesCombined} label="Em negociação"
              value={`R$ ${money(kpis.activeValue)}`}
              sub={`${kpis.activeCount} lead${kpis.activeCount !== 1 ? "s" : ""} ativo${kpis.activeCount !== 1 ? "s" : ""}`} />
            <KpiCard icon={TrendingUp} label="Conversão"
              value={kpis.conversion !== null ? `${kpis.conversion}%` : "—"}
              sub="ganhos ÷ fechados" color={T.emerald} />
            <KpiCard icon={Gift} label="Ganhos (60d)" value={`R$ ${money(kpis.wonValue)}`} color={T.emerald} />
            <KpiCard icon={Tag} label="Ticket médio"
              value={kpis.ticket > 0 ? `R$ ${money(kpis.ticket)}` : "—"} sub="por reserva ganha" />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))", gap: 14, alignItems: "start" }}>
          {/* Origem dos leads */}
          <div style={{ ...S.card, padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={sectionLabel}><Radio size={11} style={{ verticalAlign: -1, marginRight: 5 }} />Origem dos leads</p>
            {bySource.length === 0 ? (
              <p style={{ fontSize: 12, color: T.muted, margin: 0 }}>Sem leads no recorte.</p>
            ) : bySource.map((s) => {
              const max = bySource[0].count;
              return (
                <div key={s.id || "none"} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: T.text }}>{s.label}</span>
                    <span style={{ fontSize: 11, color: T.muted }}>{s.count} lead{s.count !== 1 ? "s" : ""}</span>
                    <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 800, color: T.text }}>
                      R$ {money(s.value)}
                    </span>
                  </div>
                  <div style={{ height: 6, borderRadius: 999, background: T.glass2, overflow: "hidden" }}>
                    <div style={{ width: `${(s.count / max) * 100}%`, height: "100%", background: T.grad, borderRadius: 999 }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pesquisas */}
          <div style={{ ...S.card, padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={sectionLabel}>
              <MessageSquareHeart size={11} style={{ verticalAlign: -1, marginRight: 5 }} />A voz do hóspede
            </p>
            {responses === null ? (
              <p style={{ fontSize: 12, color: T.muted, margin: 0 }}>Não foi possível carregar as pesquisas.</p>
            ) : !surveyStats ? (
              <p style={{ fontSize: 12, color: T.muted, margin: 0 }}>Nenhuma resposta de pesquisa ainda.</p>
            ) : (<>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: surveyStats.nps !== null && surveyStats.nps >= 50 ? T.emerald : T.text }}>
                    {surveyStats.nps !== null ? surveyStats.nps : "—"}
                  </div>
                  <div style={{ fontSize: 10, color: T.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em" }}>NPS</div>
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: T.text, display: "flex", alignItems: "center", gap: 4 }}>
                    {surveyStats.avg ?? "—"}{surveyStats.avg && <Star size={13} color={T.amber} fill={T.amber} />}
                  </div>
                  <div style={{ fontSize: 10, color: T.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em" }}>Nota geral</div>
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: T.text }}>{surveyStats.total}</div>
                  <div style={{ fontSize: 10, color: T.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em" }}>Respostas</div>
                </div>
              </div>
              {surveyStats.topImprove.length > 0 && (
                <div>
                  <p style={{ fontSize: 10.5, color: T.muted, fontWeight: 800, margin: "0 0 5px" }}>O que mais pedem para melhorar</p>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {surveyStats.topImprove.map(([label, n]) => (
                      <span key={label} style={pillS(T.amberBg, T.amber, T.amberBorder)}>
                        {label} · {n}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ display: "flex", gap: 10 }}>
                <Link href="/admin/surveys/responses" style={{ fontSize: 11, color: T.g1, textDecoration: "underline", textUnderlineOffset: 2 }}>
                  todas as respostas
                </Link>
                <Link href="/admin/surveys/avaliacoes" style={{ fontSize: 11, color: T.g1, textDecoration: "underline", textUnderlineOffset: 2 }}>
                  avaliações públicas
                </Link>
              </div>
            </>)}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))", gap: 14, alignItems: "start" }}>
          {/* Descontos manuais */}
          <div style={{ ...S.card, padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={sectionLabel}>
              <Tag size={11} style={{ verticalAlign: -1, marginRight: 5 }} />Descontos manuais
            </p>
            <p style={{ fontSize: 11, color: T.muted, margin: 0, lineHeight: 1.5 }}>
              Aparecem como opções na cotação — a recepção marca, o preço cai na hora.
            </p>
            {discounts.map((d) => (
              <div key={d.id} style={{ ...S.row, display: "flex", alignItems: "center", gap: 10, padding: "8px 12px" }}>
                <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: T.text, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {d.name}
                </span>
                <span style={{ fontSize: 12.5, fontWeight: 900, color: T.emerald }}>−{d.pct}%</span>
                <button onClick={() => { setDiscounts((p) => p.filter((x) => x.id !== d.id)); setDirty(true); }}
                  style={{ padding: 4, borderRadius: 7, background: "none", border: "none", color: T.muted, cursor: "pointer", display: "flex" }}>
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 6 }}>
              <input style={{ ...S.input, flex: 1 }} placeholder="Nome (ex.: Pix à vista)"
                value={newDisc.name} onChange={(e) => setNewDisc((p) => ({ ...p, name: e.target.value }))} />
              <input style={{ ...S.input, width: 70 }} placeholder="%" inputMode="decimal"
                value={newDisc.pct} onChange={(e) => setNewDisc((p) => ({ ...p, pct: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") addDisc(); }} />
              <button onClick={addDisc} style={{ ...S.ghostBtn, padding: "8px 11px" }}><Plus size={14} /></button>
            </div>
          </div>

          {/* Promoções automáticas */}
          <div style={{ ...S.card, padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={sectionLabel}>
              <BadgePercent size={11} style={{ verticalAlign: -1, marginRight: 5 }} />Promoções automáticas
            </p>
            <p style={{ fontSize: 11, color: T.muted, margin: 0, lineHeight: 1.5 }}>
              Aplicam sozinhas por diária dentro do intervalo — sem depender de ninguém marcar.
            </p>
            {promos.map((p) => (
              <div key={p.id} style={{ ...S.row, display: "flex", alignItems: "center", gap: 10, padding: "8px 12px" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.name}
                  </div>
                  <div style={{ fontSize: 10.5, color: T.muted }}>
                    {p.startDate.split("-").reverse().slice(0, 2).join("/")} → {p.endDate.split("-").reverse().slice(0, 2).join("/")}
                    {" · "}{DAY_TYPE_LABEL[p.dayType]}{p.minNights > 1 ? ` · mín. ${p.minNights}n` : ""}
                  </div>
                </div>
                <span style={{ fontSize: 12.5, fontWeight: 900, color: T.emerald }}>−{p.pct}%</span>
                <button onClick={() => { setPromos((prev) => prev.filter((x) => x.id !== p.id)); setDirty(true); }}
                  style={{ padding: 4, borderRadius: 7, background: "none", border: "none", color: T.muted, cursor: "pointer", display: "flex" }}>
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 70px", gap: 6 }}>
              <input style={S.input} placeholder="Nome (ex.: Semana do saco cheio)"
                value={newPromo.name} onChange={(e) => setNewPromo((p) => ({ ...p, name: e.target.value }))} />
              <input style={S.input} placeholder="%" inputMode="decimal"
                value={newPromo.pct} onChange={(e) => setNewPromo((p) => ({ ...p, pct: e.target.value }))} />
              <div style={{ display: "flex", gap: 6, gridColumn: "1 / -1" }}>
                <input type="date" style={{ ...S.input, flex: 1 }} value={newPromo.startDate}
                  onChange={(e) => setNewPromo((p) => ({ ...p, startDate: e.target.value }))} />
                <input type="date" style={{ ...S.input, flex: 1 }} value={newPromo.endDate}
                  onChange={(e) => setNewPromo((p) => ({ ...p, endDate: e.target.value }))} />
                <input style={{ ...S.input, width: 58 }} title="Mínimo de noites" inputMode="numeric"
                  value={newPromo.minNights} onChange={(e) => setNewPromo((p) => ({ ...p, minNights: e.target.value.replace(/\D/g, "") }))} />
                <select style={{ ...S.input, width: 110, background: T.card }} value={newPromo.dayType}
                  onChange={(e) => setNewPromo((p) => ({ ...p, dayType: e.target.value as RatePromo["dayType"] }))}>
                  <option value="all">Período todo</option>
                  <option value="fds">Só FDS</option>
                  <option value="week">Só semana</option>
                </select>
                <button onClick={addPromo} style={{ ...S.ghostBtn, padding: "8px 11px" }}><Plus size={14} /></button>
              </div>
            </div>
          </div>
        </div>

        {/* O que ainda não existe — assumido como plano, não como página vazia */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))", gap: 14 }}>
          <Wireframe icon={ChartNoAxesCombined} title="Campanhas & UTM"
            desc="De onde vem cada lead de verdade: link rastreável por campanha, custo por reserva e comparação entre canais pagos e orgânicos." />
          <Wireframe icon={Send} title="Disparos de mensagem"
            desc="Campanhas de WhatsApp para a base — pós-estadia, aniversário, datas especiais — com opt-out e teto de volume." />
        </div>
      </>)}
    </PageShell>
  );
}

export default function ComercialMarketingPage() {
  return (
    <RoleGuard allowedRoles={["super_admin", "admin", "manager", "marketing"]}>
      <MarketingPage />
    </RoleGuard>
  );
}
