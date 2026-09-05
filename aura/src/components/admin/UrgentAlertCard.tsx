"use client";

// Card fixo de urgência do balcão — pedido de concierge do hóspede, reserva de
// estrutura pendente e área de liberação diária que já deveria ter aberto.
//
// Nasceu de um número medido em produção (30 dias): ~9.800 mensagens de WhatsApp
// recebidas contra 8 pedidos de hóspede. O sino ficava permanentemente vermelho
// por causa das mensagens e escondia justamente o que não pode esperar. Aqui a
// urgência ganha canal próprio: fica na tela, com campainha a cada 2 min, até
// alguém resolver — mas NÃO bloqueia (a recepção precisa terminar o check-in que
// está fazendo). "Suprimir 5 min" é a válvula; pedido novo fura o silêncio.

import React from "react";
import { BellRing, Calendar, Check, ChevronRight, Lock, ShoppingBag, Unlock, X } from "lucide-react";
import { T, alpha } from "@/lib/admin-tokens";

export interface UrgentItem {
  id: string;
  kind: "concierge" | "booking" | "release";
  /** Linha forte: cabana (concierge) ou estrutura (agendamento, área fechada). */
  title: string;
  /** Linha fraca: item pedido / hóspede + horário / desde quando está fechada. */
  detail: string;
  /** Chegada do pedido — na área fechada, o horário de abertura de hoje. */
  createdAt: string;
}

function waitLabel(createdAt: string, now: number) {
  const m = Math.max(0, Math.round((now - new Date(createdAt).getTime()) / 60_000));
  if (m < 1) return "agora";
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  return `há ${h}h${m % 60 ? ` ${m % 60}min` : ""}`;
}

const btn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4,
  height: 28, padding: "0 10px", borderRadius: 9,
  fontFamily: "inherit", fontSize: 11, fontWeight: 800, letterSpacing: ".01em",
  cursor: "pointer", whiteSpace: "nowrap",
};

export function UrgentAlertCard({
  items, now, busyId, onOpenConcierge, onOpenBooking, onApprove, onReject, onRelease, onSuppress,
}: {
  items: UrgentItem[];
  /** Relógio do pai (tique de 30s) — mantém o "há X min" vivo sem timer próprio. */
  now: number;
  busyId?: string | null;
  onOpenConcierge: () => void;
  onOpenBooking: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  /** Libera a área do dia direto do card — recebe o id da ESTRUTURA. */
  onRelease: (structureId: string) => void;
  onSuppress: () => void;
}) {
  if (items.length === 0) return null;

  const oldest = items.reduce((a, b) => (a.createdAt <= b.createdAt ? a : b));
  const shown = items.slice(0, 3);
  const rest = items.length - shown.length;
  const hasConcierge = items.some(i => i.kind === "concierge");
  const hasRelease = items.some(i => i.kind === "release");
  const onlyRelease = items.every(i => i.kind === "release");

  return (
    <div className="ak-urgent" role="alert" aria-live="assertive">
      {/* Cabeçalho */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: T.amberBg, borderBottom: `1px solid ${T.amberBorder}` }}>
        <span style={{
          width: 30, height: 30, borderRadius: 9, flexShrink: 0,
          background: alpha(T.amber, 18), border: `1px solid ${T.amberBorder}`,
          display: "flex", alignItems: "center", justifyContent: "center", color: T.amber,
        }}>
          <BellRing size={15} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 12.5, fontWeight: 900, color: T.amber, letterSpacing: "-.01em" }}>
            {onlyRelease
              ? (items.length === 1 ? "Área fechada para o hóspede" : `${items.length} áreas fechadas para o hóspede`)
              : (items.length === 1 ? "Hóspede aguardando" : `${items.length} pendências aguardando`)}
          </p>
          <p style={{ margin: 0, fontSize: 10.5, fontWeight: 600, color: T.muted }}>
            {onlyRelease ? "Fechada" : "O mais antigo espera"} {waitLabel(oldest.createdAt, now)}
          </p>
        </div>
      </div>

      {/* Itens */}
      <div>
        {shown.map(it => {
          const isBooking = it.kind === "booking";
          const isRelease = it.kind === "release";
          const busy = busyId === it.id;
          const tint = isRelease
            ? { bg: T.amberBg, border: T.amberBorder, color: T.amber }
            : isBooking
              ? { bg: T.violetBg, border: T.violetBorder, color: T.violet }
              : { bg: T.orangeBg, border: T.orangeBorder, color: T.orange };
          const row = (
            <>
              <span style={{
                width: 26, height: 26, borderRadius: 8, flexShrink: 0, marginTop: 1,
                background: tint.bg,
                border: `1px solid ${tint.border}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: tint.color,
              }}>
                {isRelease ? <Lock size={13} /> : isBooking ? <Calendar size={13} /> : <ShoppingBag size={13} />}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <p style={{ margin: 0, flex: 1, minWidth: 0, fontSize: 12, fontWeight: 800, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.title}</p>
                  <span style={{ fontSize: 10, fontWeight: 700, color: T.muted2, whiteSpace: "nowrap" }}>{waitLabel(it.createdAt, now)}</span>
                </div>
                <p style={{ margin: "1px 0 0", fontSize: 11, color: T.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.detail}</p>

                {isBooking && (
                  <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
                    <button
                      type="button" disabled={busy} onClick={() => onApprove(it.id)} className="ak-press"
                      style={{ ...btn, background: T.grad, color: "#fff", border: "none", opacity: busy ? .5 : 1 }}
                    >
                      <Check size={12} /> Aprovar
                    </button>
                    <button
                      type="button" disabled={busy} onClick={() => onReject(it.id)} className="ak-press"
                      style={{ ...btn, background: T.glass2, color: T.muted, border: `1px solid ${T.border2}`, opacity: busy ? .5 : 1 }}
                    >
                      <X size={12} /> Recusar
                    </button>
                    <button
                      type="button" onClick={onOpenBooking} className="ak-press"
                      style={{ ...btn, background: "none", color: T.muted2, border: "none", padding: "0 4px" }}
                    >
                      Ver agenda
                    </button>
                  </div>
                )}

                {/* Um clique resolve: é o mesmo gesto da agenda, trazido para onde a
                    pessoa está. O atrito de atravessar o menu é metade do problema. */}
                {isRelease && (
                  <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
                    <button
                      type="button" disabled={busy} onClick={() => onRelease(it.id.replace(/^release-/, ""))} className="ak-press"
                      style={{ ...btn, background: T.grad, color: "#fff", border: "none", opacity: busy ? .5 : 1 }}
                    >
                      <Unlock size={12} /> Liberar agora
                    </button>
                    <button
                      type="button" onClick={onOpenBooking} className="ak-press"
                      style={{ ...btn, background: "none", color: T.muted2, border: "none", padding: "0 4px" }}
                    >
                      Ver agenda
                    </button>
                  </div>
                )}
              </div>
            </>
          );

          // Concierge: a linha inteira leva para a fila (a decisão é lá dentro —
          // assumir, entregar ou não entregar). Agendamento e área fechada resolvem
          // no próprio card.
          return isBooking || isRelease ? (
            <div key={it.id} style={{ display: "flex", gap: 10, padding: "10px 14px", borderBottom: `1px solid ${T.border}` }}>
              {row}
            </div>
          ) : (
            <button
              key={it.id} type="button" onClick={onOpenConcierge} className="ak-press"
              style={{ width: "100%", display: "flex", gap: 10, padding: "10px 14px", borderBottom: `1px solid ${T.border}`, background: "none", border: "none", textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}
            >
              {row}
              <ChevronRight size={14} style={{ color: T.muted2, alignSelf: "center", flexShrink: 0 }} />
            </button>
          );
        })}

        {rest > 0 && (
          <button
            type="button" onClick={hasConcierge ? onOpenConcierge : onOpenBooking} className="ak-press"
            style={{ width: "100%", padding: "8px 14px", background: "none", border: "none", borderBottom: `1px solid ${T.border}`, color: T.muted, fontFamily: "inherit", fontSize: 11, fontWeight: 700, textAlign: "left", cursor: "pointer" }}
          >
            e mais {rest} {onlyRelease ? `área${rest > 1 ? "s" : ""} fechada${rest > 1 ? "s" : ""}` : `pendência${rest > 1 ? "s" : ""}`} na fila
          </button>
        )}
      </div>

      {/* Rodapé */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 14px" }}>
        <button
          type="button" onClick={onSuppress} className="ak-press"
          style={{ ...btn, height: 26, padding: "0 8px", background: "none", border: `1px solid ${T.border2}`, color: T.muted, fontWeight: 700 }}
        >
          Suprimir por 5 min
        </button>
        {hasConcierge ? (
          <button
            type="button" onClick={onOpenConcierge} className="ak-press"
            style={{ ...btn, height: 26, background: alpha(T.amber, 14), border: `1px solid ${T.amberBorder}`, color: T.amber }}
          >
            Abrir concierge
          </button>
        ) : hasRelease ? (
          <button
            type="button" onClick={onOpenBooking} className="ak-press"
            style={{ ...btn, height: 26, background: alpha(T.amber, 14), border: `1px solid ${T.amberBorder}`, color: T.amber }}
          >
            Abrir agenda
          </button>
        ) : null}
      </div>
    </div>
  );
}
