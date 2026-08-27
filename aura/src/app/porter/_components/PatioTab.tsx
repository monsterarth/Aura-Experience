"use client";

// Quem está no pátio agora — entrada sem saída. É o que a planilha de papel
// tentava responder e não conseguia, porque só anotava a chegada.
//
// Também é onde o registro se conserta: tocar na linha abre a correção, e é ali
// que a NSU entra depois (ela pode faltar na hora, mas não passa do fechamento).
import React, { useMemo, useState } from "react";
import { T, KIND, KIND_ORDER, PAYMENTS, CARD_BRANDS, money, displayPlate, normalizePlate, hhmm, since } from "./guarita-ui";
import type { GuaritaState } from "./useGuarita";
import type { VehicleKind, VehicleMovement } from "@/types/aura";

/** Cartão sem NSU — mesma regra do servidor, para o aviso aparecer na hora. */
const missingNsu = (m: VehicleMovement) =>
  (m.paymentMethod === "credit" || m.paymentMethod === "debit") && Number(m.amount) > 0 && !String(m.nsu ?? "").trim();

export function PatioTab({ g }: { g: GuaritaState }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "paid" | "free" | "pending">("all");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const rows = useMemo(() => {
    const q = normalizePlate(query);
    return g.data.patio.filter(m => {
      if (q && !normalizePlate(m.plate).includes(q)) return false;
      if (filter === "paid" && !(Number(m.amount) > 0)) return false;
      if (filter === "free" && Number(m.amount) > 0) return false;
      if (filter === "pending" && !missingNsu(m)) return false;
      return true;
    });
  }, [g.data.patio, query, filter]);

  const paid = g.data.patio.filter(m => Number(m.amount) > 0).length;
  const pending = g.data.pendingNsu.length;

  const chip = (id: typeof filter, txt: string, tone?: "amber") => {
    const on = filter === id;
    return (
      <button key={id} onClick={() => setFilter(id)} style={{
        padding: "9px 14px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit", minHeight: 40,
        background: on ? (tone === "amber" ? T.amberBg : "rgba(155,109,255,0.10)") : T.glass,
        border: `1px solid ${on ? (tone === "amber" ? T.amberBorder : T.brandBorder) : T.border}`,
        color: on ? (tone === "amber" ? T.amber : T.text) : T.muted,
        fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap",
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

      {/* Pendência que trava o fechamento — inclusive de quem já saiu */}
      {pending > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "12px 14px", borderRadius: 14, background: T.amberBg, border: `1px solid ${T.amberBorder}` }}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={T.amber} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="9" /><path d="M12 7.5v5M12 16v.5" />
          </svg>
          <div style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.45 }}>
            <span style={{ fontWeight: 700 }}>{pending} pagamento(s) sem NSU</span>
            <span style={{ color: T.muted }}> — o turno não fecha assim.</span>
          </div>
        </div>
      )}

      {/* Os que já saíram e continuam sem NSU não aparecem na lista do pátio */}
      {g.data.pendingNsu.filter(p => p.exitedAt).length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: T.amber }}>
            Já saíram e falta a NSU
          </div>
          {g.data.pendingNsu.filter(p => p.exitedAt).map(m => (
            editing === m.id
              ? <EditRow key={m.id} g={g} m={m} onDone={() => setEditing(null)} />
              : (
                <button key={m.id} onClick={() => setEditing(m.id)} style={{
                  display: "flex", alignItems: "center", gap: 11, background: T.card,
                  border: `1px solid ${T.amberBorder}`, borderRadius: 14, padding: "11px 12px",
                  cursor: "pointer", fontFamily: "inherit", textAlign: "left", color: T.text,
                }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontFamily: T.mono, fontSize: 14, fontWeight: 700, letterSpacing: ".06em" }}>{displayPlate(m.plate)}</span>
                    <span style={{ display: "block", fontSize: 12, color: T.muted, marginTop: 2 }}>
                      {money(Number(m.amount))} · saiu {hhmm(m.exitedAt)}
                    </span>
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: T.amber, flexShrink: 0 }}>Informar NSU</span>
                </button>
              )
          ))}
        </div>
      )}

      <input
        value={query} onChange={e => setQuery(e.target.value.toUpperCase())}
        placeholder="Buscar placa" autoCapitalize="characters" autoCorrect="off" spellCheck={false}
        style={{
          height: 48, borderRadius: 13, background: T.card, border: `1px solid ${T.border}`,
          color: T.text, fontSize: 16, padding: "0 14px", fontFamily: "inherit", boxSizing: "border-box",
        }}
      />

      <div style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 2 }}>
        {chip("all", `Todos · ${g.data.patio.length}`)}
        {chip("paid", `Pagantes · ${paid}`)}
        {chip("free", `Isentos · ${g.data.patio.length - paid}`)}
        {pending > 0 && chip("pending", "Sem NSU", "amber")}
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
            const incomplete = missingNsu(m);

            if (editing === m.id) return <EditRow key={m.id} g={g} m={m} onDone={() => setEditing(null)} />;

            return (
              <div key={m.id} style={{
                display: "flex", alignItems: "center", gap: 11, background: T.card,
                border: `1px solid ${isConfirming ? T.g1 : incomplete ? T.amberBorder : T.border}`,
                borderRadius: 14, padding: "11px 12px",
              }}>
                <div style={{ width: 4, alignSelf: "stretch", borderRadius: 999, background: k.color, flexShrink: 0 }} />

                {/* A linha toda abre a correção — é o caminho do NSU e do erro de digitação */}
                <button onClick={() => setEditing(m.id)} style={{
                  flex: 1, minWidth: 0, background: "transparent", border: "none", padding: 0,
                  textAlign: "left", cursor: "pointer", fontFamily: "inherit", color: T.text,
                }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: T.mono, fontSize: 14, fontWeight: 700, letterSpacing: ".06em" }}>{displayPlate(m.plate)}</span>
                    <span style={{ padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".05em", background: k.bg, border: `1px solid ${k.border}`, color: k.color }}>
                      {paidRow ? "Pago" : k.label}
                    </span>
                    {incomplete && (
                      <span style={{ padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".05em", background: T.amberBg, border: `1px solid ${T.amberBorder}`, color: T.amber }}>
                        falta NSU
                      </span>
                    )}
                  </span>
                  <span style={{ display: "block", fontSize: 12, color: T.muted, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {m.guestName ? `${m.guestName}${m.cabinName ? ` · ${m.cabinName}` : ""}` : (m.vehicle?.ownerName || k.label)}
                    {paidRow ? ` · ${money(Number(m.amount))}` : ""} · {hhmm(m.enteredAt)} ({since(m.enteredAt)})
                  </span>
                </button>

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

/**
 * Correção de um registro — é aqui que a NSU entra depois e que o erro de
 * digitação se conserta. Mexe na linha inteira: tipo, valor, forma, bandeira,
 * NSU e o nome de quem é (o fornecedor se identifica assim).
 */
function EditRow({ g, m, onDone }: { g: GuaritaState; m: VehicleMovement; onDone: () => void }) {
  const [kind, setKind] = useState<VehicleKind>(m.kind as VehicleKind);
  const [amount, setAmount] = useState(String(Number(m.amount) || ""));
  const [method, setMethod] = useState<string | null>(m.paymentMethod ?? null);
  const [brand, setBrand] = useState(m.cardBrand ?? "");
  const [nsu, setNsu] = useState(m.nsu ?? "");
  const [name, setName] = useState(m.vehicle?.ownerName ?? "");

  const value = parseFloat((amount || "0").replace(",", "."));
  const isCard = method === "credit" || method === "debit";

  const field: React.CSSProperties = {
    height: 46, borderRadius: 11, background: T.bg, border: `1px solid ${T.border2}`,
    color: T.text, fontSize: 15, padding: "0 12px", fontFamily: "inherit",
    boxSizing: "border-box", width: "100%",
  };

  const save = async () => {
    const ok = await g.updateMovement(m.id, {
      kind,
      amount: value,
      paymentMethod: value > 0 ? method : null,
      cardBrand: isCard ? brand || null : null,
      nsu: isCard ? nsu || null : null,
      ownerName: name || null,
    });
    if (ok) onDone();
  };

  return (
    <div style={{ background: T.card, border: `1px solid ${T.g1}`, borderRadius: 14, padding: 13, display: "flex", flexDirection: "column", gap: 11 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span style={{ fontFamily: T.mono, fontSize: 16, fontWeight: 700, letterSpacing: ".06em" }}>{displayPlate(m.plate)}</span>
        <span style={{ fontSize: 11.5, color: T.muted }}>
          entrou {hhmm(m.enteredAt)}{m.exitedAt ? ` · saiu ${hhmm(m.exitedAt)}` : ""}
        </span>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {KIND_ORDER.map(kk => {
          const cfg = KIND[kk];
          const on = kind === kk;
          return (
            <button key={kk} onClick={() => setKind(kk)} style={{
              padding: "9px 12px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", minHeight: 40,
              background: on ? cfg.bg : T.glass, border: `1px solid ${on ? cfg.color : T.border}`,
              color: on ? cfg.color : T.muted, fontSize: 12.5, fontWeight: 700,
            }}>{cfg.label}</button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="Valor" style={{ ...field, flex: 1 }} />
        <select value={method ?? ""} onChange={e => setMethod(e.target.value || null)} style={{ ...field, flex: 1, color: method ? T.text : T.muted2 }}>
          <option value="">Isento</option>
          {PAYMENTS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </div>

      {isCard && value > 0 && (
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={nsu} onChange={e => setNsu(e.target.value)} inputMode="numeric" placeholder="NSU"
            autoFocus={missingNsu(m)}
            style={{ ...field, flex: 1, border: `1px solid ${nsu ? T.border2 : T.amber}` }}
          />
          <select value={brand} onChange={e => setBrand(e.target.value)} style={{ ...field, width: 138, color: brand ? T.text : T.muted2 }}>
            <option value="">Bandeira</option>
            {CARD_BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
      )}

      <input
        value={name} onChange={e => setName(e.target.value)}
        placeholder={kind === "supplier" ? "Nome da empresa" : "Nome"}
        style={field}
      />

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onDone} style={{
          flex: 1, height: 48, borderRadius: 12, background: "transparent", border: `1px solid ${T.border2}`,
          color: T.muted, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
        }}>Cancelar</button>
        <button onClick={() => void save()} disabled={g.busy} style={{
          flex: 2, height: 48, borderRadius: 12, background: T.grad, border: "none",
          color: "#0b0d14", fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
        }}>{g.busy ? "Salvando…" : "Salvar"}</button>
      </div>
    </div>
  );
}
