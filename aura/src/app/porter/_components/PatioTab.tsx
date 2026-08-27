"use client";

// Quem está no pátio agora — entrada sem saída. É o que a planilha de papel
// tentava responder e não conseguia, porque só anotava a chegada.
import React, { useMemo, useState } from "react";
import { T, KIND, money, displayPlate, normalizePlate, hhmm, since } from "./guarita-ui";
import type { GuaritaState } from "./useGuarita";
import type { VehicleKind } from "@/types/aura";

export function PatioTab({ g }: { g: GuaritaState }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "paid" | "free">("all");
  const [confirming, setConfirming] = useState<string | null>(null);

  const rows = useMemo(() => {
    const q = normalizePlate(query);
    return g.data.patio.filter(m => {
      if (q && !normalizePlate(m.plate).includes(q)) return false;
      if (filter === "paid" && !(Number(m.amount) > 0)) return false;
      if (filter === "free" && Number(m.amount) > 0) return false;
      return true;
    });
  }, [g.data.patio, query, filter]);

  const paid = g.data.patio.filter(m => Number(m.amount) > 0).length;

  const chip = (id: typeof filter, txt: string) => {
    const on = filter === id;
    return (
      <button key={id} onClick={() => setFilter(id)} style={{
        padding: "9px 14px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit", minHeight: 40,
        background: on ? "rgba(155,109,255,0.10)" : T.glass,
        border: `1px solid ${on ? T.brandBorder : T.border}`,
        color: on ? T.text : T.muted, fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap",
      }}>{txt}</button>
    );
  };

  return (
    <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 14 }}>

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-.02em" }}>No pátio</div>
        <div style={{ fontSize: 13, color: T.muted }}>
          <span style={{ color: T.text, fontWeight: 700 }}>{g.data.patio.length}</span> veículo(s)
        </div>
      </div>

      <input
        value={query} onChange={e => setQuery(e.target.value.toUpperCase())}
        placeholder="Buscar placa" autoCapitalize="characters" autoCorrect="off" spellCheck={false}
        style={{
          height: 48, borderRadius: 13, background: T.card, border: `1px solid ${T.border}`,
          color: T.text, fontSize: 16, padding: "0 14px", fontFamily: "inherit", boxSizing: "border-box",
        }}
      />

      <div style={{ display: "flex", gap: 7 }}>
        {chip("all", `Todos · ${g.data.patio.length}`)}
        {chip("paid", `Pagantes · ${paid}`)}
        {chip("free", `Isentos · ${g.data.patio.length - paid}`)}
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", border: `1px dashed ${T.border2}`, borderRadius: 16, color: T.muted2, fontSize: 13, fontWeight: 700 }}>
          {g.data.patio.length === 0 ? "Nenhum veículo no pátio" : "Nada com esse filtro"}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map(m => {
            const k = KIND[m.kind as VehicleKind] ?? KIND.customer;
            const paidRow = Number(m.amount) > 0;
            const isConfirming = confirming === m.id;
            return (
              <div key={m.id} style={{
                display: "flex", alignItems: "center", gap: 11, background: T.card,
                border: `1px solid ${isConfirming ? T.g1 : T.border}`, borderRadius: 14, padding: "11px 12px",
              }}>
                <div style={{ width: 4, alignSelf: "stretch", borderRadius: 999, background: k.color, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: T.mono, fontSize: 14, fontWeight: 700, letterSpacing: ".06em" }}>{displayPlate(m.plate)}</span>
                    <span style={{ padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".05em", background: k.bg, border: `1px solid ${k.border}`, color: k.color }}>
                      {paidRow ? "Pago" : k.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: T.muted, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {m.guestName ? `${m.guestName}${m.cabinName ? ` · ${m.cabinName}` : ""}` : k.label}
                    {paidRow ? ` · ${money(Number(m.amount))}` : ""} · {hhmm(m.enteredAt)} ({since(m.enteredAt)})
                  </div>
                </div>

                {isConfirming ? (
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button onClick={() => { void g.registerExit(m.id); setConfirming(null); }} disabled={g.busy} style={{
                      height: 44, padding: "0 14px", borderRadius: 11, background: T.grad, border: "none",
                      color: "#0b0d14", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
                    }}>Confirmar</button>
                    <button onClick={() => setConfirming(null)} style={{
                      height: 44, width: 44, borderRadius: 11, background: T.glass2, border: `1px solid ${T.border2}`,
                      color: T.muted, fontSize: 18, cursor: "pointer", fontFamily: "inherit",
                    }}>×</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirming(m.id)} style={{
                    height: 44, padding: "0 15px", borderRadius: 11, background: T.glass2, border: `1px solid ${T.border2}`,
                    color: T.text, fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
                  }}>Saída</button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
