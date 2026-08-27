"use client";

// Fechamento do turno — o resumo que hoje sai em papel e é redigitado na
// recepção. Aqui ele nasce somado, e o turno fechado congela.
import React, { useState } from "react";
import { T, KIND, PAYMENTS, money } from "./guarita-ui";
import type { GuaritaState } from "./useGuarita";
import type { VehicleKind } from "@/types/aura";

export function TurnoTab({ g }: { g: GuaritaState }) {
  const [confirming, setConfirming] = useState(false);
  const [notes, setNotes] = useState("");

  const { shift, summary } = g.data;

  const label = (txt: string) => (
    <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: T.muted2 }}>{txt}</div>
  );

  if (!shift) {
    return (
      <div style={{ padding: "24px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 17, fontWeight: 800 }}>Nenhum turno aberto</div>
        <div style={{ fontSize: 13.5, color: T.muted, textAlign: "center", lineHeight: 1.5, maxWidth: 280 }}>
          O turno abre sozinho quando você registrar a primeira entrada.
        </div>
      </div>
    );
  }

  const openedAt = new Date(shift.openedAt);
  const cash = summary?.byMethod?.cash?.total ?? 0;

  return (
    <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 14 }}>

      <div>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-.02em" }}>Turno {shift.number}</div>
        <div style={{ fontSize: 12.5, color: T.muted, marginTop: 2 }}>
          {shift.openedByName ?? "—"} · desde {openedAt.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>

      {/* Total */}
      <div style={{
        borderRadius: 18, background: T.gradSoft, border: `1px solid ${T.brandBorder}`,
        padding: "18px 16px", display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14,
      }}>
        <div>
          {label("Recebido no turno")}
          <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-.03em", lineHeight: 1, marginTop: 4 }}>
            {money(summary?.total ?? 0)}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>{summary?.paidCount ?? 0}</div>
          <div style={{ marginTop: 3 }}>{label("pagantes")}</div>
        </div>
      </div>

      {/* Por forma */}
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: "15px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
        {label("Por forma de pagamento")}
        {PAYMENTS.map(p => {
          const row = summary?.byMethod?.[p.id];
          return (
            <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span style={{ fontSize: 14, color: row ? T.text : T.muted2 }}>{p.label}</span>
                {row && <span style={{ fontSize: 11.5, color: T.muted2 }}>{row.count} carro(s)</span>}
              </div>
              <span style={{ fontSize: 15, fontWeight: 700, color: row ? T.text : T.muted2, fontVariantNumeric: "tabular-nums" }}>
                {money(row?.total ?? 0)}
              </span>
            </div>
          );
        })}
        <div style={{ height: 1, background: T.border }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".04em", textTransform: "uppercase" }}>Em espécie na gaveta</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: T.green, fontVariantNumeric: "tabular-nums" }}>{money(cash)}</span>
        </div>
      </div>

      {/* Isentos */}
      {summary && Object.keys(summary.freeByKind ?? {}).length > 0 && (
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: "15px 16px", display: "flex", flexDirection: "column", gap: 11 }}>
          {label("Entraram sem cobrança")}
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            {Object.entries(summary.freeByKind).map(([kind, n]) => {
              const k = KIND[kind as VehicleKind] ?? KIND.customer;
              return (
                <span key={kind} style={{
                  padding: "7px 12px", borderRadius: 999, background: k.bg, border: `1px solid ${k.border}`,
                  fontSize: 12.5, fontWeight: 700, color: k.color,
                }}>{k.label} · {n}</span>
              );
            })}
          </div>
        </div>
      )}

      {/* Ainda no pátio */}
      {(summary?.stillInside ?? 0) > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "13px 15px", borderRadius: 14, background: T.amberBg, border: `1px solid ${T.amberBorder}` }}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={T.amber} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5M12 16v.5" /></svg>
          <div style={{ flex: 1, fontSize: 13, lineHeight: 1.45 }}>
            <span style={{ fontWeight: 700 }}>{summary!.stillInside} veículo(s) ainda no pátio</span>
            <span style={{ color: T.muted }}> passam para o próximo turno.</span>
          </div>
        </div>
      )}

      {/* Fechar */}
      {confirming ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          <textarea
            value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            placeholder="Alguma observação do turno? (opcional)"
            style={{
              borderRadius: 13, background: T.card, border: `1px solid ${T.border}`, color: T.text,
              fontSize: 15, padding: 13, fontFamily: "inherit", resize: "none", boxSizing: "border-box",
            }}
          />
          <button onClick={async () => { if (await g.closeShift(notes)) { setConfirming(false); setNotes(""); } }} disabled={g.busy} style={{
            height: 56, borderRadius: 16, background: T.grad, border: "none", color: "#0b0d14",
            fontSize: 16, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
          }}>{g.busy ? "Fechando…" : "Confirmar fechamento"}</button>
          <button onClick={() => setConfirming(false)} style={{
            height: 48, borderRadius: 14, background: "transparent", border: `1px solid ${T.border2}`,
            color: T.muted, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
          }}>Voltar</button>
        </div>
      ) : (
        <>
          <button onClick={() => setConfirming(true)} style={{
            height: 56, borderRadius: 16, background: T.grad, border: "none", color: "#0b0d14",
            fontSize: 16, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
          }}>Fechar e enviar à recepção</button>
          <div style={{ fontSize: 11.5, color: T.muted2, textAlign: "center", lineHeight: 1.5 }}>
            O resumo vai para a recepção e não pode mais ser editado.
          </div>
        </>
      )}
    </div>
  );
}
