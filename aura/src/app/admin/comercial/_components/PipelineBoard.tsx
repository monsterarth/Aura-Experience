// Um board do pipeline (Reservas OU Casamentos): colunas por estágio com
// contagem e soma, cards na identidade visual do admin (dark glass) — visual
// do projeto de design "Aura CRM Comercial Interface".
// Cards arrastáveis (DnD nativo HTML5 — sem lib): soltar numa coluna chama
// onDropLead e o FunnelPage decide (mover / ganhar / abrir modal de perda).
"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, CalendarDays, CircleDollarSign, Heart, Phone, Tag, CalendarClock, StickyNote } from "lucide-react";
import { T } from "@/lib/admin-tokens";
import { CrmAlarm, CrmChannel, CrmLead } from "@/types/aura";
import { ACTIVE_STAGES, StageDef, fmtBR, leadAlert, money, pillS, todayIso } from "./shared";
import { FilterChips, useIsMobile } from "@/components/aura";

/** Idade do lead em dias — envelhecimento é métrica clássica de pipeline. */
function ageDays(createdAt: string, today: string): number {
  const created = String(createdAt).slice(0, 10);
  return Math.max(0, Math.round(
    (new Date(`${today}T12:00`).getTime() - new Date(`${created}T12:00`).getTime()) / 86400000
  ));
}

export function PipelineBoard({ stages, leads, channels, alarms, onOpen, onDropLead, dragDisabled, onAddNew }: {
  stages: StageDef[];
  leads: CrmLead[];
  channels: CrmChannel[];
  alarms: CrmAlarm[];
  onOpen: (l: CrmLead) => void;
  /** Card solto numa coluna — o pai mapeia para mover/ganhar/perder. */
  onDropLead: (leadId: string, stageId: string) => void;
  dragDisabled?: boolean;
  /** "+ Nova cotação" no primeiro nível do funil (coluna inicial). */
  onAddNew?: () => void;
}) {
  const t = todayIso();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  // Celular: uma coluna por vez (chips de etapa com contagem).
  const isMobile = useIsMobile();
  const [mobileStage, setMobileStage] = useState<string>(stages[0]?.id ?? "");
  useEffect(() => { if (!stages.some((s) => s.id === mobileStage)) setMobileStage(stages[0]?.id ?? ""); }, [stages, mobileStage]);
  const visibleStages = isMobile ? stages.filter((s) => s.id === mobileStage) : stages;

  const channelLabel = (slug?: string | null) =>
    slug ? channels.find((c) => c.id === slug)?.label ?? slug : null;
  const paymentDue = (l: CrmLead) =>
    alarms.find((a) => a.entityId === l.id && a.kind === "payment" && a.dueAt <= t);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
    {isMobile && (
      <FilterChips items={stages.map((s) => ({ id: s.id, label: s.label, count: leads.filter((l) => l.stage === s.id).length }))} value={mobileStage} onChange={setMobileStage} ariaLabel="Etapa do funil" />
    )}
    <div data-no-ptr style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8, alignItems: "flex-start" }}>
      {visibleStages.map((stage) => {
        // Mais urgente em cima: follow-up mais próximo primeiro, sem prazo por último.
        const rows = leads
          .filter((l) => l.stage === stage.id)
          .sort((a, b) => (a.followUpAt ?? "9999").localeCompare(b.followUpAt ?? "9999"));
        const total = rows.reduce((s, l) => s + l.value, 0);
        const isOver = overStage === stage.id;
        return (
          <div key={stage.id} style={{ width: isMobile ? "100%" : 248, flexShrink: 0, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 4px", marginBottom: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: stage.dot, flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 800, color: T.text }}>{stage.label}</span>
              <span style={{ fontSize: 11, color: T.muted }}>({rows.length})</span>
              {total > 0 && (
                <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: T.muted }}>
                  R$ {money(total)}
                </span>
              )}
            </div>
            <div
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (overStage !== stage.id) setOverStage(stage.id); }}
              onDragLeave={(e) => { if (e.currentTarget === e.target) setOverStage(null); }}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain");
                setOverStage(null);
                setDraggingId(null);
                if (id) onDropLead(id, stage.id);
              }}
              style={{
                display: "flex", flexDirection: "column", gap: 8, minHeight: 90,
                background: isOver ? T.glass2 : T.glass,
                border: `1px dashed ${isOver ? T.g1Border : "transparent"}`,
                borderRadius: 14, padding: 8, transition: "background .15s, border-color .15s",
              }}>
              {rows.map((l) => {
                const alert = leadAlert(l);
                const src = channelLabel(l.source);
                const cobranca = paymentDue(l);
                return (
                  // div role=button (não <button>): o mini-WhatsApp é um <a>
                  // aninhado e anchor dentro de button é HTML inválido.
                  <div key={l.id} role="button" tabIndex={0}
                    draggable={!dragDisabled}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", l.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDraggingId(l.id);
                    }}
                    onDragEnd={() => { setDraggingId(null); setOverStage(null); }}
                    onClick={() => onOpen(l)}
                    onKeyDown={(e) => e.key === "Enter" && onOpen(l)}
                    style={{
                      background: T.card, border: `1px solid ${T.border}`, borderRadius: 12,
                      padding: 12, cursor: dragDisabled ? "pointer" : "grab", boxShadow: "none",
                      display: "flex", flexDirection: "column", gap: 6,
                      transition: "border-color .15s, opacity .15s",
                      opacity: draggingId === l.id ? 0.4 : 1,
                    }}
                    className="ak-card ak-press">
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {l.title}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: T.muted }}>
                      {l.entityType === "wedding" ? <Heart size={11} /> : <CalendarDays size={11} />}
                      {fmtBR(l.dateRef)}
                      {ACTIVE_STAGES.has(l.stage) && ageDays(String(l.createdAt), t) > 0 && (() => {
                        const age = ageDays(String(l.createdAt), t);
                        return (
                          <span title={`Lead criado há ${age} dia${age > 1 ? "s" : ""}`}
                            style={{
                              marginLeft: "auto", fontSize: 9, fontWeight: 800,
                              borderRadius: 999, padding: "1px 6px",
                              background: age > 14 ? T.redBg : age > 7 ? T.amberBg : T.glass2,
                              color: age > 14 ? T.red : age > 7 ? T.amber : T.muted,
                            }}>
                            {age}d
                          </span>
                        );
                      })()}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      {l.value > 0 && (
                        <span style={{ fontSize: 12, fontWeight: 800, color: T.text }}>
                          {l.valueApproximate ? "a partir de " : ""}R$ {money(l.value)}
                        </span>
                      )}
                      {src && (
                        <span style={{
                          fontSize: 10, background: T.glass2, border: `1px solid ${T.border}`,
                          borderRadius: 999, padding: "2px 8px", color: T.muted,
                          display: "inline-flex", alignItems: "center", gap: 4,
                        }}>
                          <Tag size={9} /> {src}
                        </span>
                      )}
                      {l.entityType === "quote" && l.weddingId && (
                        <span title="Convidado de casamento (pré-reserva do site dos noivos)"
                          style={pillS(T.roseBg, T.rose, T.roseBorder)}>
                          <Heart size={9} /> casamento
                        </span>
                      )}
                      {alert && (
                        <span style={pillS(
                          alert === "expired" ? T.redBg : T.amberBg,
                          alert === "expired" ? T.red : T.amber,
                          alert === "expired" ? T.redBorder : T.amberBorder
                        )}>
                          <CalendarClock size={9} /> {alert === "expired" ? "prazo vencido" : "follow-up"}
                        </span>
                      )}
                      {cobranca && (
                        <span style={pillS(T.orangeBg, T.orange, T.orangeBorder)}>
                          <CircleDollarSign size={9} /> {cobranca.dueAt < t ? "cobrança vencida" : "cobrança hoje"}
                        </span>
                      )}
                      {l.acceptedAt && (
                        <span title="O cliente aceitou a proposta na página pública"
                          style={pillS(T.emeraldBg, T.emerald, T.emeraldBorder)}>
                          <BadgeCheck size={9} /> aceita
                        </span>
                      )}
                      {l.lostReason && l.stage === "lost" && (
                        <span style={{
                          fontSize: 10, color: T.muted2,
                          display: "inline-flex", alignItems: "center", gap: 4,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%",
                        }}>
                          <StickyNote size={9} style={{ flexShrink: 0 }} /> {l.lostReason}
                        </span>
                      )}
                      {l.phone && (
                        <a href={`https://wa.me/${l.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"
                          onClick={(e) => e.stopPropagation()} title="Abrir WhatsApp"
                          style={{
                            marginLeft: "auto", padding: 4, borderRadius: 8,
                            background: T.emeraldBg, color: T.emerald, display: "inline-flex",
                          }}>
                          <Phone size={11} />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
              {rows.length === 0 && !(onAddNew && stage.id === stages[0]?.id) && (
                <p style={{ textAlign: "center", fontSize: 11, color: T.muted2, padding: "16px 0", margin: 0 }}>vazio</p>
              )}
              {onAddNew && stage.id === stages[0]?.id && (
                <button onClick={onAddNew}
                  style={{
                    width: "100%", padding: 10, borderRadius: 12,
                    border: `1px dashed ${T.border2}`, background: "transparent",
                    cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700,
                    color: T.muted, display: "flex", alignItems: "center",
                    justifyContent: "center", gap: 6,
                  }}>
                  + Nova cotação
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
    </div>
  );
}
