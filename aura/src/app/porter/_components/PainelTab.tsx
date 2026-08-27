"use client";

// Painel do turno — a tela que fica aberta. Quase tudo vem de dado que já
// existe: as chegadas trazem hora prevista e placa do pré-check-in.
import React, { useState } from "react";
import { T, KIND, money, shortMoney, displayPlate, since } from "./guarita-ui";
import type { GuaritaState } from "./useGuarita";

export function PainelTab({ g, onRegister }: { g: GuaritaState; onRegister: () => void }) {
  const { data } = g;
  const [editingRate, setEditingRate] = useState(false);
  const [custom, setCustom] = useState("");

  const rate = data.rate;
  const needsRate = !rate;

  const label = (txt: string) => (
    <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: T.muted2 }}>{txt}</div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "0 16px 16px" }}>

      {/* Tarifa do dia */}
      <div style={{
        borderRadius: 16, padding: "14px 15px",
        background: needsRate ? T.amberBg : "rgba(155,109,255,0.10)",
        border: `1px solid ${needsRate ? T.amberBorder : T.brandBorder}`,
        display: "flex", flexDirection: "column", gap: needsRate || editingRate ? 12 : 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {label(needsRate ? "Tarifa não definida" : rate?.closed ? "Hoje" : "Tarifa de hoje")}
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.02em", lineHeight: 1.2, marginTop: 2 }}>
              {needsRate ? "Defina para cobrar" : rate?.closed ? "Fechado" : money(rate!.amount)}
            </div>
          </div>
          {!needsRate && !editingRate && (
            <button onClick={() => setEditingRate(true)} style={{
              padding: "9px 14px", borderRadius: 10, background: T.glass2, border: `1px solid ${T.border2}`,
              color: T.text, fontSize: 13, fontWeight: 700, minHeight: 44, cursor: "pointer", fontFamily: "inherit",
            }}>Alterar</button>
          )}
        </div>

        {(needsRate || editingRate) && (
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {data.ratePresets.map(v => (
                <button key={v} onClick={() => { void g.setRate(v); setEditingRate(false); }} disabled={g.busy} style={{
                  padding: "11px 15px", borderRadius: 11, background: T.glass2, border: `1px solid ${T.border2}`,
                  color: T.text, fontSize: 15, fontWeight: 800, minHeight: 44, cursor: "pointer", fontFamily: "inherit",
                }}>{shortMoney(v)}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 7 }}>
              <input
                value={custom} onChange={e => setCustom(e.target.value)}
                inputMode="decimal" placeholder="Outro valor"
                style={{
                  flex: 1, minWidth: 0, height: 46, borderRadius: 11, background: T.card,
                  border: `1px solid ${T.border2}`, color: T.text, fontSize: 16, padding: "0 13px", fontFamily: "inherit",
                }}
              />
              <button
                onClick={() => { const v = parseFloat(custom.replace(",", ".")); if (v > 0) { void g.setRate(v); setCustom(""); setEditingRate(false); } }}
                disabled={g.busy || !custom}
                style={{
                  padding: "0 18px", height: 46, borderRadius: 11, background: T.grad, border: "none",
                  color: "#0b0d14", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
                }}
              >Usar</button>
            </div>
            <button onClick={() => { void g.setRate(0, true); setEditingRate(false); }} disabled={g.busy} style={{
              height: 44, borderRadius: 11, background: "transparent", border: `1px solid ${T.border2}`,
              color: T.muted, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}>Hoje não abre</button>
          </div>
        )}
      </div>

      {/* Resumo do turno */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 8 }}>
        {[
          { v: data.patio.length, l: "No pátio", c: T.text },
          { v: data.summary?.paidCount ?? 0, l: "Pagantes", c: T.green },
          { v: shortMoney(data.summary?.total ?? 0), l: "No turno", c: T.text },
        ].map((k, i) => (
          <div key={i} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "12px 10px" }}>
            <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1, letterSpacing: "-.02em", color: k.c }}>{k.v}</div>
            <div style={{ marginTop: 4 }}>{label(k.l)}</div>
          </div>
        ))}
      </div>

      {/* Chegadas */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          {label("Chegam hoje")}
          <span style={{ fontSize: 11, color: T.muted2 }}>{data.arrivals.length} reserva(s)</span>
        </div>
        {data.arrivals.length === 0 ? (
          <div style={{ padding: 14, textAlign: "center", border: `1px dashed ${T.border2}`, borderRadius: 14, color: T.muted2, fontSize: 12, fontWeight: 700 }}>
            Nenhuma chegada prevista
          </div>
        ) : data.arrivals.map(a => (
          <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 11, background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "11px 13px" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.guestName}</div>
              <div style={{ fontSize: 12, color: T.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.cabinName ?? "sem cabana"}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{a.expectedArrivalTime || "—"}</div>
              {a.vehiclePlate ? (
                <div style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 700, letterSpacing: ".04em", background: T.glass2, border: `1px solid ${T.border2}`, borderRadius: 5, padding: "1px 5px" }}>
                  {displayPlate(a.vehiclePlate)}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: T.muted2 }}>sem placa</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Saídas e eventos */}
      {(data.departures.length > 0 || data.events.length > 0) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {label("Também hoje")}
          {data.departures.length > 0 && (
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "11px 13px", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{data.departures.length} saída(s)</span>
              <span style={{ fontSize: 12, color: T.muted, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {data.departures.map(d => d.cabinName ?? d.guestName).join(" · ")}
              </span>
            </div>
          )}
          {data.events.map(ev => (
            <div key={ev.id} style={{ background: T.violetBg, border: `1px solid ${T.violetBorder}`, borderRadius: 14, padding: "11px 13px", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: T.violet }}>Evento</span>
              <span style={{ fontSize: 13, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ev.title}</span>
            </div>
          ))}
        </div>
      )}

      {/* Últimas entradas */}
      {data.patio.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {label("Últimas entradas")}
          {data.patio.slice(0, 3).map(m => {
            const k = KIND[m.kind] ?? KIND.customer;
            return (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "10px 13px" }}>
                <span style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 700, letterSpacing: ".05em" }}>{displayPlate(m.plate)}</span>
                <span style={{ padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".05em", background: k.bg, border: `1px solid ${k.border}`, color: k.color }}>{k.label}</span>
                <span style={{ marginLeft: "auto", fontSize: 12, color: T.muted, flexShrink: 0 }}>{since(m.enteredAt)}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Ação principal */}
      <button onClick={onRegister} style={{
        height: 56, borderRadius: 16, background: T.grad, border: "none", color: "#0b0d14",
        fontSize: 16, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", marginTop: 4,
      }}>
        Registrar entrada
      </button>
    </div>
  );
}
