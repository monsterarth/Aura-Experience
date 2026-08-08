// Painel lateral de detalhes do casamento — extraído do page.tsx.
"use client";

import React, { useState, useEffect } from "react";
import { Wedding, WeddingStatus } from "@/types/aura";
import { Heart, Shield, Clock, X, Plus, Users, Globe, Star, Check, DollarSign, Calendar, Trash2, CheckCircle2, Archive } from "lucide-react";
import { T, fmt, todayIso, daysUntil, nightsBetween, fmtMoney, STATUS_CFG, VENDOR_ICONS, Pill, CabinMap, leadState } from "./lib";
import { LostReasonModal } from "./LostReasonModal";

type DrawerTab = 'evento' | 'hospedagem' | 'fornecedores' | 'financeiro';

export function DetailDrawer({ wedding, cabinsTotal, onClose, showFinancial, onEdit, onDelete, onStatusChange, onMarkLost, onFollowUp }: {
  wedding: Wedding | null; cabinsTotal: number; onClose: () => void; showFinancial: boolean;
  onEdit: (w: Wedding) => void; onDelete: (w: Wedding) => void;
  onStatusChange: (w: Wedding, status: WeddingStatus) => Promise<void>;
  onMarkLost: (w: Wedding, reason: string) => Promise<void>;
  onFollowUp: (w: Wedding) => Promise<void>;
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

  const deposit = wedding.depositValue ?? 0;
  const second  = wedding.secondInstallmentValue ?? 0;
  const balance = wedding.contractTotal - deposit - second;
  const paidTotal = (wedding.depositPaid ? deposit : 0) + (wedding.secondInstallmentPaid ? second : 0);
  // Guarda de zero: contrato vazio virava NaN% na tela e width:NaN% na barra.
  const paidPct = wedding.contractTotal > 0 ? Math.round((paidTotal / wedding.contractTotal) * 100) : 0;

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
