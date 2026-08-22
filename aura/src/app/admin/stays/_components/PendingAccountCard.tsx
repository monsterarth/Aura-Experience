"use client";

import React from "react";
import { CheckCircle2, Clock, DollarSign, Image as ImageIcon, PackageSearch, Receipt } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { T } from "@/lib/admin-tokens";
import { Button } from "@/components/aura/Button";
import { Pill } from "@/components/aura/Pill";
import { fmtDay, titleCase, type StayRow } from "./stay-utils";

export interface PendingAccountCardProps {
  stay: StayRow;
  onOpen: (s: StayRow) => void;
  onCloseBill: (s: StayRow) => void;
  opening?: boolean;
  closing?: boolean;
}

const sectionTitle = (color: string): React.CSSProperties => ({ display: "flex", alignItems: "center", gap: 6, fontSize: 10, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color, marginBottom: 10 });

/** Estadia encerrada com conta pendente ou objetos esquecidos por tratar. */
export function PendingAccountCard({ stay: s, onOpen, onCloseBill, opening, closing }: PendingAccountCardProps) {
  const guestName = titleCase(s.guestName) || "Hóspede desconhecido";
  const folioItems: any[] = s.folioItems ?? [];
  const pendingItems = folioItems.filter(f => f.status === "pending");
  const paidItems = folioItems.filter(f => f.status !== "pending");
  const totalPending = pendingItems.reduce((acc, f) => acc + (f.totalPrice ?? 0), 0);
  const totalPaid = paidItems.reduce((acc, f) => acc + (f.totalPrice ?? 0), 0);

  return (
    <article className="ak-card" data-pad="0" style={{ borderColor: T.orangeBorder, overflow: "hidden" }}>
      <div style={{ padding: "14px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <Pill tone={s.cabinId ? "brand" : "amber"} size="md" label={s.cabinName || "Sem cabana"} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: T.text, letterSpacing: "-.2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{guestName}</div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: T.muted, marginTop: 2 }}>
              <Clock size={11} /> {fmtDay(s.checkIn)} — {fmtDay(s.checkOut)}
            </div>
          </div>
        </div>
        {totalPending > 0 && (
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: T.orange, opacity: .8 }}>Saldo pendente</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: T.orange, letterSpacing: "-.5px" }}>R$ {totalPending.toFixed(2)}</div>
          </div>
        )}
      </div>

      <div className="ak-fieldrow" data-cols="2" style={{ padding: 16, gap: 16 }}>
        <section>
          <div style={sectionTitle(T.orange)}><Receipt size={13} /> Lançamentos do fólio</div>
          {folioItems.length === 0 ? (
            <p style={{ fontSize: 13, color: T.muted2, fontStyle: "italic", margin: 0 }}>Nenhum lançamento registrado.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {folioItems.map(item => {
                const pending = item.status === "pending";
                return (
                  <div key={item.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 10px", borderRadius: 10, border: `1px solid ${pending ? T.orangeBorder : T.greenBorder}`, background: pending ? T.orangeBg : T.greenBg, opacity: pending ? 1 : .7, fontSize: 13 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      {pending ? <DollarSign size={13} color={T.orange} style={{ flexShrink: 0 }} /> : <CheckCircle2 size={13} color={T.green} style={{ flexShrink: 0 }} />}
                      <span style={{ fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.description}</span>
                      <span style={{ fontSize: 10, color: T.muted, flexShrink: 0 }}>×{item.quantity}</span>
                    </div>
                    <span style={{ fontWeight: 800, color: pending ? T.orange : T.green, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>R$ {(item.totalPrice ?? 0).toFixed(2)}</span>
                  </div>
                );
              })}
              <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, borderTop: `1px solid ${T.border}`, fontSize: 10, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase" }}>
                {paidItems.length > 0 && <span style={{ color: T.green }}>Pago: R$ {totalPaid.toFixed(2)}</span>}
                {pendingItems.length > 0 && <span style={{ color: T.orange, marginLeft: "auto" }}>Pendente: R$ {totalPending.toFixed(2)}</span>}
              </div>
            </div>
          )}
        </section>

        <section>
          <div style={sectionTitle(T.blue)}><PackageSearch size={13} /> Objetos esquecidos</div>
          {!s.lostItemsDescription ? (
            <p style={{ fontSize: 13, color: T.muted2, fontStyle: "italic", margin: 0 }}>Nenhum objeto reportado.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ padding: "12px 14px", background: T.blueBg, border: `1px solid ${T.blueBorder}`, borderRadius: 12 }}>
                <p style={{ fontSize: 13, color: T.text, lineHeight: 1.5, margin: 0 }}>{s.lostItemsDescription}</p>
                {s.lostItemsReportedAt && (
                  <p style={{ fontSize: 10, color: T.muted, marginTop: 8, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase" }}>
                    Reportado em {format(new Date(s.lostItemsReportedAt), "dd/MM 'às' HH:mm", { locale: ptBR })}
                  </p>
                )}
              </div>
              {s.lostItemsPhoto && (
                <a href={s.lostItemsPhoto} target="_blank" rel="noopener noreferrer" style={{ display: "block", position: "relative", borderRadius: 12, overflow: "hidden", border: `1px solid ${T.blueBorder}` }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.lostItemsPhoto} alt="Objetos esquecidos" style={{ width: "100%", maxHeight: 200, objectFit: "cover", display: "block" }} />
                  <span style={{ position: "absolute", right: 8, bottom: 8, display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 800, color: "#fff", background: "rgba(0,0,0,.55)", borderRadius: 8, padding: "4px 8px" }}><ImageIcon size={11} /> Abrir</span>
                </a>
              )}
            </div>
          )}
        </section>
      </div>

      <div style={{ padding: "0 16px 16px", display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button variant="secondary" onClick={() => onOpen(s)} loading={opening} style={{ flex: 1 }}>Ficha completa</Button>
        <Button variant="primary" icon={CheckCircle2} onClick={() => onCloseBill(s)} loading={closing} style={{ flex: 1 }}>
          {pendingItems.length > 0 ? "Encerrar conta" : "Marcar encerrado"}
        </Button>
      </div>
    </article>
  );
}
