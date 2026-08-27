"use client";

// Registro de entrada — a placa vem primeiro.
//
// O guarita digita e o sistema responde quem é: hóspede (isento, um toque),
// cliente (cobra a tarifa do dia) ou veículo em atenção (alerta antes de tudo).
// A digitação vira conferência.
import React, { useState } from "react";
import { T, KIND, KIND_ORDER, PAYMENTS, CARD_BRANDS, money, displayPlate, normalizePlate } from "./guarita-ui";
import type { GuaritaState } from "./useGuarita";
import type { PlateLookup, VehicleKind } from "@/types/aura";

export function RegistroTab({ g, onDone }: { g: GuaritaState; onDone: () => void }) {
  const [plate, setPlate] = useState("");
  const [lookup, setLookup] = useState<PlateLookup | null>(null);
  const [searching, setSearching] = useState(false);
  const [ackAlert, setAckAlert] = useState(false);

  // Campos do registro
  const [kind, setKind] = useState<VehicleKind>("customer");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string | null>(null);
  const [brand, setBrand] = useState("");
  const [installments, setInstallments] = useState(1);
  const [nsu, setNsu] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [optIn, setOptIn] = useState(false);
  // Hóspede/visita cuja placa o sistema ainda não conhece: o guarita aponta a
  // estadia e o vínculo passa a existir para sempre.
  const [stayId, setStayId] = useState<string | null>(null);
  const [stayQuery, setStayQuery] = useState("");
  // Todo veículo entra cobrável; quem dispensa é o guarita.
  const [exempt, setExempt] = useState(false);

  const rate = g.data.rate;
  const clean = normalizePlate(plate);

  const reset = () => {
    setPlate(""); setLookup(null); setAckAlert(false);
    setKind("customer"); setAmount(""); setMethod(null); setBrand(""); setInstallments(1);
    setNsu(""); setOwnerName(""); setOwnerPhone(""); setOptIn(false);
    setStayId(null); setStayQuery(""); setExempt(false);
  };

  const search = async () => {
    if (clean.length < 6) return;
    setSearching(true);
    const res = await g.lookup(clean);
    setSearching(false);
    if (!res) return;
    setLookup(res);
    setKind(res.kind);
    // A tarifa do dia já vem preenchida seja quem for — cobrar é o padrão.
    if (rate && !rate.closed) setAmount(String(rate.amount));
    if (res.vehicle?.ownerName) setOwnerName(res.vehicle.ownerName);
    if (res.vehicle?.ownerPhone) setOwnerPhone(res.vehicle.ownerPhone);
    setStayId(res.stayId ?? null);
  };

  const submit = async () => {
    const value = exempt ? 0 : parseFloat((amount || "0").replace(",", "."));
    const ok = await g.registerEntry({
      plate: clean,
      kind,
      amount: value,
      paymentMethod: value > 0 ? method : null,
      cardBrand: value > 0 && PAYMENTS.find(p => p.id === method)?.card ? brand || null : null,
      installments: value > 0 && method === "credit" ? installments : null,
      nsu: value > 0 && PAYMENTS.find(p => p.id === method)?.card ? nsu || null : null,
      stayId: stayId ?? lookup?.stayId ?? null,
      ownerName: ownerName || null,
      ownerPhone: ownerPhone || null,
      marketingOptIn: optIn,
    });
    if (ok) { reset(); onDone(); }
  };

  const label = (txt: string) => (
    <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: T.muted2 }}>{txt}</div>
  );

  const input = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} style={{
      width: "100%", height: 50, borderRadius: 13, background: T.card, border: `1px solid ${T.border}`,
      color: T.text, fontSize: 16, padding: "0 14px", fontFamily: "inherit", boxSizing: "border-box", ...props.style,
    }} />
  );

  // ── Passo 1: a placa ──
  if (!lookup) {
    return (
      <div style={{ padding: "8px 16px 16px", display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, paddingTop: 12 }}>
          {label("Placa do veículo")}
          <input
            autoFocus value={plate}
            onChange={e => setPlate(e.target.value.toUpperCase().slice(0, 8))}
            onKeyDown={e => { if (e.key === "Enter") void search(); }}
            autoCapitalize="characters" autoCorrect="off" spellCheck={false}
            placeholder="ABC1D23"
            style={{
              width: "100%", height: 84, borderRadius: 18, background: T.card,
              border: `2px solid ${clean.length >= 6 ? T.g1 : T.border2}`, color: T.text,
              fontFamily: T.mono, fontSize: 34, fontWeight: 700, letterSpacing: ".12em",
              textAlign: "center", boxSizing: "border-box", outline: "none",
            }}
          />
          <div style={{ fontSize: 13, color: T.muted }}>
            {clean.length < 6 ? "Digite a placa e toque em buscar" : "Pronto para buscar"}
          </div>
        </div>

        <button onClick={() => void search()} disabled={clean.length < 6 || searching} style={{
          height: 56, borderRadius: 16, border: "none", cursor: "pointer", fontFamily: "inherit",
          background: clean.length >= 6 ? T.grad : T.glass2,
          color: clean.length >= 6 ? "#0b0d14" : T.muted2, fontSize: 16, fontWeight: 800,
        }}>{searching ? "Buscando…" : "Buscar"}</button>

        {g.data.patio.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {label("No pátio agora")}
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {g.data.patio.slice(0, 6).map(m => (
                <span key={m.id} style={{
                  padding: "8px 12px", borderRadius: 10, background: T.glass, border: `1px solid ${T.border}`,
                  fontFamily: T.mono, fontSize: 13, fontWeight: 700, letterSpacing: ".05em",
                }}>{displayPlate(m.plate)}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Alerta de atenção: interrompe antes de qualquer coisa ──
  if (lookup.status === "blacklist" && !ackAlert) {
    return (
      <div style={{ padding: "16px 16px 20px", display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, textAlign: "center", paddingTop: 20 }}>
          <div style={{ width: 62, height: 62, borderRadius: 20, background: T.redBg, border: `1px solid ${T.redBorder}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="31" height="31" viewBox="0 0 24 24" fill="none" stroke={T.red} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4.5L2.8 20h18.4z" /><path d="M12 10v4M12 17v.5" /></svg>
          </div>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: T.red }}>Veículo em atenção</div>
          <div style={{ fontFamily: T.mono, fontSize: 30, fontWeight: 700, letterSpacing: ".1em" }}>{displayPlate(lookup.plate)}</div>
        </div>

        <div style={{ borderRadius: 16, background: T.redBg, border: `1px solid ${T.redBorder}`, padding: "15px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          {label("Motivo")}
          <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.45 }}>{lookup.statusReason || "Sem motivo registrado."}</div>
          {lookup.vehicle?.statusByName && (
            <>
              <div style={{ height: 1, background: T.redBorder }} />
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <span style={{ fontSize: 12, color: T.muted }}>Marcado por</span>
                <span style={{ fontSize: 12, fontWeight: 700 }}>{lookup.vehicle.statusByName}</span>
              </div>
            </>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          <button onClick={() => setAckAlert(true)} style={{
            height: 52, borderRadius: 14, background: "transparent", border: `1px solid ${T.redBorder}`,
            color: T.red, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
          }}>Liberar mesmo assim</button>
          <button onClick={reset} style={{
            height: 48, borderRadius: 14, background: "transparent", border: "none",
            color: T.muted, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
          }}>Voltar</button>
        </div>
        <div style={{ fontSize: 11.5, color: T.muted2, textAlign: "center", lineHeight: 1.5 }}>
          Liberar registra quem autorizou.
        </div>
      </div>
    );
  }

  // ── Já está no pátio ──
  if (lookup.openMovement) {
    return (
      <div style={{ padding: "16px 16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ textAlign: "center", paddingTop: 16 }}>
          <div style={{ fontFamily: T.mono, fontSize: 30, fontWeight: 700, letterSpacing: ".1em" }}>{displayPlate(lookup.plate)}</div>
        </div>
        <div style={{ borderRadius: 16, background: T.amberBg, border: `1px solid ${T.amberBorder}`, padding: "16px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: T.amber }}>Este veículo já está no pátio</div>
          <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.5 }}>
            Entrou às {new Date(lookup.openMovement.enteredAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}. Se ele saiu sem registro, marque a saída pelo Pátio antes de registrar de novo.
          </div>
        </div>
        <button onClick={reset} style={{
          height: 56, borderRadius: 16, background: T.grad, border: "none", color: "#0b0d14",
          fontSize: 16, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
        }}>Outra placa</button>
      </div>
    );
  }

  // ── Passo 2: confirmação (isento) ou cobrança (cliente) ──
  const k = KIND[kind];
  const methodCfg = PAYMENTS.find(p => p.id === method);

  // Hóspede e visita precisam de reserva: sem isso o carro entra sem dono e o
  // painel não sabe de quem é.
  const needsStay = (kind === "guest" || kind === "visitor") && !lookup.stayId;
  const chosenStay = g.data.housed.find(h => h.id === stayId) ?? null;
  const housedFiltered = g.data.housed.filter(h => {
    const q = stayQuery.trim().toLowerCase();
    if (!q) return true;
    return (h.cabinName ?? "").toLowerCase().includes(q) || h.guestName.toLowerCase().includes(q);
  });

  const value = parseFloat((amount || "0").replace(",", "."));
  const canSubmit = (exempt || (value > 0 && !!method)) && (!needsStay || !!stayId);

  return (
    <div style={{ padding: "8px 16px 16px", display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Identificação */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, paddingTop: 8 }}>
        <div style={{ fontFamily: T.mono, fontSize: 30, fontWeight: 700, letterSpacing: ".1em" }}>{displayPlate(lookup.plate)}</div>
        <div style={{ width: "100%", borderRadius: 18, background: k.bg, border: `1px solid ${k.border}`, padding: "16px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: k.color }}>
            {k.label}
          </div>
          {lookup.guestName && (
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-.02em" }}>{lookup.guestName}</div>
              {lookup.cabinName && <div style={{ fontSize: 14, color: T.muted, marginTop: 2 }}>{lookup.cabinName}</div>}
            </div>
          )}
          {lookup.staffName && <div style={{ fontSize: 20, fontWeight: 800 }}>{lookup.staffName}</div>}
          {!lookup.guestName && !lookup.staffName && (lookup.visitCount ?? 0) > 0 && (
            <div style={{ fontSize: 13, color: T.muted }}>Já esteve aqui {lookup.visitCount}×</div>
          )}
        </div>
      </div>

      {/* Trocar o tipo */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {label("Tipo")}
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          {KIND_ORDER.map(kk => {
            const cfg = KIND[kk];
            const on = kind === kk;
            return (
              <button key={kk} onClick={() => setKind(kk)} style={{
                padding: "10px 14px", borderRadius: 11, cursor: "pointer", fontFamily: "inherit", minHeight: 44,
                background: on ? cfg.bg : T.glass, border: `1px solid ${on ? cfg.color : T.border}`,
                color: on ? cfg.color : T.muted, fontSize: 13, fontWeight: 700,
              }}>{cfg.label}</button>
            );
          })}
        </div>
      </div>

      {/* Qual estadia — some quando a placa já veio ligada a uma reserva */}
      {needsStay && (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
            {label(kind === "guest" ? "De qual cabana?" : "Visita de quem?")}
            {!chosenStay && <span style={{ fontSize: 11, color: T.amber, fontWeight: 700 }}>obrigatório</span>}
          </div>

          {chosenStay ? (
            <button onClick={() => { setStayId(null); setStayQuery(""); }} style={{
              display: "flex", alignItems: "center", gap: 11, padding: "12px 13px", borderRadius: 14,
              background: KIND[kind].bg, border: `1px solid ${KIND[kind].color}`, cursor: "pointer",
              fontFamily: "inherit", textAlign: "left", width: "100%",
            }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 15, fontWeight: 800 }}>{chosenStay.cabinName ?? "Sem cabana"}</span>
                <span style={{ display: "block", fontSize: 12.5, color: T.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{chosenStay.guestName}</span>
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: T.muted, flexShrink: 0 }}>trocar</span>
            </button>
          ) : (
            <>
              {g.data.housed.length > 6 && (
                <input
                  value={stayQuery} onChange={e => setStayQuery(e.target.value)}
                  placeholder="Buscar cabana ou nome"
                  style={{
                    height: 48, borderRadius: 13, background: T.card, border: `1px solid ${T.border}`,
                    color: T.text, fontSize: 16, padding: "0 14px", fontFamily: "inherit", boxSizing: "border-box",
                  }}
                />
              )}
              {housedFiltered.length === 0 ? (
                <div style={{ padding: 14, textAlign: "center", border: `1px dashed ${T.border2}`, borderRadius: 13, color: T.muted2, fontSize: 12.5 }}>
                  {g.data.housed.length === 0 ? "Ninguém hospedado agora" : "Nada com essa busca"}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
                  {housedFiltered.map(h => (
                    <button key={h.id} onClick={() => setStayId(h.id)} style={{
                      display: "flex", alignItems: "center", gap: 11, padding: "11px 13px", borderRadius: 13,
                      background: T.card, border: `1px solid ${T.border}`, cursor: "pointer",
                      fontFamily: "inherit", textAlign: "left", minHeight: 52,
                    }}>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {h.cabinName ?? "Sem cabana"}
                        </span>
                        <span style={{ display: "block", fontSize: 12, color: T.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {h.guestName}
                        </span>
                      </span>
                      {h.status !== "active" && (
                        <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".05em", color: T.amber, flexShrink: 0 }}>chega hoje</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {chosenStay && kind === "guest" && (
            <div style={{ fontSize: 11.5, color: T.muted2, lineHeight: 1.5 }}>
              A placa fica ligada a esta reserva — na próxima entrada o sistema já reconhece.
            </div>
          )}
        </div>
      )}

      {/* Isento — o guarita decide, seja quem for */}
      <button onClick={() => { setExempt(v => !v); if (!exempt) setMethod(null); }} style={{
        display: "flex", alignItems: "center", gap: 12, padding: "13px 15px", borderRadius: 14, cursor: "pointer",
        fontFamily: "inherit", textAlign: "left", minHeight: 56,
        background: exempt ? T.greenBg : T.glass, border: `1px solid ${exempt ? T.green : T.border}`,
      }}>
        <span style={{
          width: 24, height: 24, borderRadius: 7, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
          background: exempt ? T.green : "transparent", border: `1.5px solid ${exempt ? T.green : T.border2}`,
        }}>
          {exempt && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0b0d14" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 15, fontWeight: 800, color: exempt ? T.green : T.text }}>Isento</span>
          <span style={{ display: "block", fontSize: 12, color: T.muted, marginTop: 1 }}>
            {exempt ? "Entra sem cobrança" : "Marque para liberar sem cobrar"}
          </span>
        </span>
      </button>

      {/* Cobrança — sempre, a menos que o guarita marque isento */}
      {!exempt && (
        <>
          <div style={{ borderRadius: 16, background: T.card, border: `1px solid ${T.border}`, padding: 15, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {label("Valor a cobrar")}
              <input
                value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="0,00"
                style={{
                  width: "100%", background: "transparent", border: "none", outline: "none", color: T.text,
                  fontSize: 30, fontWeight: 800, letterSpacing: "-.02em", fontFamily: "inherit", padding: "4px 0 0",
                }}
              />
              <div style={{ fontSize: 12, color: T.muted }}>
                {rate?.closed ? "hoje marcado como fechado" : rate ? `tarifa de hoje ${money(rate.amount)}` : "sem tarifa definida"}
              </div>
            </div>
            {rate && !rate.closed && (
              <div style={{ display: "flex", flexDirection: "column", gap: 7, flexShrink: 0 }}>
                <button onClick={() => setAmount(String(rate.amount))} style={{ padding: "9px 13px", borderRadius: 10, background: T.glass2, border: `1px solid ${T.border2}`, color: T.text, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Cheia</button>
                <button onClick={() => setAmount(String(Math.round((rate.amount / 2) * 100) / 100))} style={{ padding: "9px 13px", borderRadius: 10, background: T.glass2, border: `1px solid ${T.border2}`, color: T.text, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Meia</button>
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {label("Forma de pagamento")}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 8 }}>
              {PAYMENTS.map(p => {
                const on = method === p.id;
                return (
                  <button key={p.id} onClick={() => setMethod(p.id)} style={{
                    height: 56, borderRadius: 14, cursor: "pointer", fontFamily: "inherit",
                    background: on ? "rgba(155,109,255,0.10)" : T.glass,
                    border: `1px solid ${on ? T.g1 : T.border}`,
                    color: on ? T.text : T.muted, fontSize: 14, fontWeight: 700,
                  }}>{p.label}</button>
                );
              })}
            </div>
          </div>

          {methodCfg?.card && (
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {label("Do comprovante")}
              {input({ value: nsu, onChange: e => setNsu(e.target.value), placeholder: "NSU", inputMode: "numeric" })}
              <div style={{ display: "flex", gap: 8 }}>
                <select value={brand} onChange={e => setBrand(e.target.value)} style={{
                  flex: 1, height: 50, borderRadius: 13, background: T.card, border: `1px solid ${T.border}`,
                  color: brand ? T.text : T.muted2, fontSize: 15, padding: "0 12px", fontFamily: "inherit",
                }}>
                  <option value="">Bandeira</option>
                  {CARD_BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
                {method === "credit" && (
                  <select value={installments} onChange={e => setInstallments(Number(e.target.value))} style={{
                    width: 100, height: 50, borderRadius: 13, background: T.card, border: `1px solid ${T.border}`,
                    color: T.text, fontSize: 15, padding: "0 12px", fontFamily: "inherit",
                  }}>
                    {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}x</option>)}
                  </select>
                )}
              </div>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
              {label("Cliente")}
              <span style={{ fontSize: 11, color: T.muted2 }}>opcional</span>
            </div>
            {input({ value: ownerName, onChange: e => setOwnerName(e.target.value), placeholder: "Nome" })}
            {input({ value: ownerPhone, onChange: e => setOwnerPhone(e.target.value), placeholder: "Telefone", inputMode: "tel" })}
            <button onClick={() => setOptIn(v => !v)} style={{
              display: "flex", alignItems: "center", gap: 10, background: "transparent", border: "none",
              padding: "4px 2px", cursor: "pointer", fontFamily: "inherit", textAlign: "left", minHeight: 44,
            }}>
              <span style={{
                width: 22, height: 22, borderRadius: 6, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                background: optIn ? T.g1 : "transparent", border: `1.5px solid ${optIn ? T.g1 : T.border2}`,
              }}>
                {optIn && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0b0d14" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
              </span>
              <span style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.4 }}>Aceita receber novidades da pousada</span>
            </button>
          </div>
        </>
      )}

      {/* Ações */}
      <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 4 }}>
        <button onClick={() => void submit()} disabled={!canSubmit || g.busy} style={{
          height: 56, borderRadius: 16, border: "none", cursor: canSubmit ? "pointer" : "default", fontFamily: "inherit",
          background: canSubmit ? T.grad : T.glass2, color: canSubmit ? "#0b0d14" : T.muted2,
          fontSize: 16, fontWeight: 800,
        }}>
          {g.busy ? "Registrando…" : exempt ? "Liberar sem cobrar" : `Cobrar ${money(value)} e liberar`}
        </button>
        <button onClick={reset} style={{
          height: 48, borderRadius: 14, background: "transparent", border: `1px solid ${T.border2}`,
          color: T.muted, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
        }}>Cancelar</button>
      </div>
    </div>
  );
}
