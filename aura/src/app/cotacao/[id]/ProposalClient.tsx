// A parte interativa da proposta: o cliente escolhe UMA cabana por
// acomodação e aceita. Visual no tema "camaleão" do Portal do Hóspede.
"use client";

import { useMemo, useRef, useState } from "react";
import { acceptQuoteProposal } from "@/app/actions/quote-actions";
import { DISPLAY_FONT } from "@/app/check-in/[code]/_portal/ui";
import type { PublicQuoteView } from "@/services/rate-quote-public-service";

const money = (v: number) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtBR = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

export default function ProposalClient({ quote }: { quote: PublicQuoteView }) {
  const [picks, setPicks] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const r of quote.rooms) if (r.selectedCategory) initial[r.id] = r.selectedCategory;
    return initial;
  });
  const [sending, setSending] = useState(false);
  const [accepted, setAccepted] = useState(!!quote.acceptedAt);
  const [error, setError] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState("");
  const openedAt = useRef(Date.now());

  const total = useMemo(() => {
    let sum = 0;
    let partial = false;
    for (const room of quote.rooms) {
      const chosen = room.options.find((o) => o.categoryId === picks[room.id]);
      if (chosen) { sum += chosen.total; continue; }
      const mins = room.options.map((o) => o.total).filter((v) => v > 0);
      if (mins.length) { sum += Math.min(...mins); partial = true; }
    }
    return { sum, partial };
  }, [picks, quote.rooms]);

  const allPicked = quote.rooms.every((r) => picks[r.id]);

  const accept = async () => {
    if (!allPicked || sending) return;
    setSending(true);
    setError(null);
    const res = await acceptQuoteProposal(quote.id, {
      selections: quote.rooms.map((r) => ({ roomId: r.id, categoryId: picks[r.id] })),
      elapsedMs: Date.now() - openedAt.current,
      website: honeypot,
    });
    setSending(false);
    if (res.ok) setAccepted(true);
    else setError(res.error ?? "Não foi possível registrar.");
  };

  const waLink = quote.property.whatsapp
    ? `https://wa.me/${quote.property.whatsapp.replace(/\D/g, "")}`
    : null;

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "28px 18px 56px" }}>
      {/* Cabeçalho */}
      <header style={{ textAlign: "center", marginBottom: 24 }}>
        {quote.property.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={quote.property.logoUrl} alt={quote.property.name}
            style={{ height: 48, objectFit: "contain", margin: "0 auto 14px", display: "block" }} />
        )}
        <p style={{
          fontSize: 11, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase",
          color: "var(--muted)", margin: 0,
        }}>
          Sua proposta
        </p>
        <h1 style={{
          fontFamily: DISPLAY_FONT, fontSize: 30, lineHeight: 1.15,
          color: "var(--ink)", margin: "6px 0 8px", fontWeight: 400,
        }}>
          {quote.clientFirstName ? `Olá, ${quote.clientFirstName}!` : "Que bom te receber!"}
        </h1>
        <p style={{ fontSize: 14, color: "var(--ink-soft)", margin: 0 }}>
          {fmtBR(quote.checkIn)} a {fmtBR(quote.checkOut)} · {quote.nights} noite{quote.nights !== 1 ? "s" : ""}
        </p>
        {quote.expiresAt && !accepted && (
          <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
            Válida até {fmtBR(quote.expiresAt)}
          </p>
        )}
      </header>

      {accepted ? (
        <div style={{
          background: "var(--green-soft)", border: "1px solid var(--green)",
          borderRadius: 18, padding: "28px 22px", textAlign: "center",
        }}>
          <p style={{ fontFamily: DISPLAY_FONT, fontSize: 24, color: "var(--ink)", margin: "0 0 8px", fontWeight: 400 }}>
            Proposta aceita!
          </p>
          <p style={{ fontSize: 14, color: "var(--ink-soft)", margin: 0, lineHeight: 1.55 }}>
            Recebemos a sua escolha e já avisamos a recepção. Em instantes
            entramos em contato para confirmar a reserva e combinar o
            pagamento.
          </p>
          {waLink && (
            <a href={waLink} target="_blank" rel="noreferrer"
              style={{
                display: "inline-block", marginTop: 18, padding: "12px 22px",
                borderRadius: 999, background: "var(--brand)", color: "#fff",
                fontSize: 14, fontWeight: 700, textDecoration: "none",
              }}>
              Falar com a pousada
            </a>
          )}
        </div>
      ) : (<>
        <p style={{ fontSize: 14, color: "var(--ink-soft)", lineHeight: 1.6, marginBottom: 20 }}>
          {quote.rooms.length > 1
            ? `Preparamos opções para as ${quote.rooms.length} acomodações. Escolha uma cabana para cada e confirme abaixo.`
            : "Escolha a cabana que mais combina com você e confirme abaixo."}
        </p>

        {quote.rooms.map((room) => (
          <section key={room.id} style={{ marginBottom: 22 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", margin: 0 }}>
                {room.label}
              </h2>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>
                {room.adults + room.children} pessoa{room.adults + room.children !== 1 ? "s" : ""}
                {room.babies > 0 ? ` · ${room.babies} bebê${room.babies > 1 ? "s" : ""}` : ""}
                {room.pets > 0 ? ` · ${room.pets} pet${room.pets > 1 ? "s" : ""}` : ""}
              </span>
              {room.ownPeriod && (
                <span style={{
                  fontSize: 11, fontWeight: 700, color: "var(--brand)",
                  background: "var(--brand-soft)", borderRadius: 999, padding: "2px 9px",
                }}>
                  {fmtBR(room.checkIn)} a {fmtBR(room.checkOut)} · {room.nights} noite{room.nights !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {room.options.map((o) => {
                const picked = picks[room.id] === o.categoryId;
                return (
                  <button key={o.categoryId}
                    onClick={() => setPicks((p) => ({ ...p, [room.id]: o.categoryId }))}
                    style={{
                      display: "flex", alignItems: "center", gap: 12, width: "100%",
                      textAlign: "left", cursor: "pointer", fontFamily: "inherit",
                      background: picked ? "var(--brand-soft)" : "var(--surface)",
                      border: `1.5px solid ${picked ? "var(--brand)" : "var(--line)"}`,
                      borderRadius: 16, padding: "14px 16px",
                      boxShadow: picked ? "var(--sh-sm)" : "var(--sh-xs)",
                      transition: "border-color .15s, background .15s",
                    }}>
                    <span style={{
                      width: 20, height: 20, borderRadius: 999, flexShrink: 0,
                      border: `2px solid ${picked ? "var(--brand)" : "var(--line)"}`,
                      background: picked ? "var(--brand)" : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {picked && <span style={{ width: 7, height: 7, borderRadius: 999, background: "#fff" }} />}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>
                        {o.name}
                      </span>
                      <span style={{ display: "block", fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                        R$ {money(o.avgNightly)} por noite
                        {o.siteUrl && (
                          <>
                            {" · "}
                            <a href={o.siteUrl} target="_blank" rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              style={{ color: "var(--brand)", textDecoration: "underline" }}>
                              ver fotos
                            </a>
                          </>
                        )}
                      </span>
                    </span>
                    <span style={{ textAlign: "right", flexShrink: 0 }}>
                      {o.wasTotal && (
                        <span style={{ display: "block", fontSize: 12, color: "var(--muted)", textDecoration: "line-through" }}>
                          R$ {money(o.wasTotal)}
                        </span>
                      )}
                      <span style={{ display: "block", fontSize: 17, fontWeight: 800, color: "var(--ink)" }}>
                        R$ {money(o.total)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}

        {/* Honeypot — invisível para gente. */}
        <input type="text" name="website" value={honeypot} tabIndex={-1} autoComplete="off"
          onChange={(e) => setHoneypot(e.target.value)}
          style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
          aria-hidden="true" />

        <div style={{
          position: "sticky", bottom: 0, background: "var(--bg)",
          paddingTop: 14, paddingBottom: 8, marginTop: 8,
          borderTop: "1px solid var(--line-soft)",
        }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>
              {total.partial ? "A partir de" : "Total"}
              {quote.rooms.length > 1 ? ` · ${quote.rooms.length} acomodações` : ""}
            </span>
            <span style={{ fontFamily: DISPLAY_FONT, fontSize: 26, color: "var(--ink)" }}>
              R$ {money(total.sum)}
            </span>
          </div>

          {error && (
            <p style={{
              fontSize: 13, color: "var(--clay)", background: "var(--clay-soft)",
              borderRadius: 12, padding: "10px 14px", margin: "0 0 10px",
            }}>
              {error}
            </p>
          )}

          <button onClick={accept} disabled={!allPicked || sending}
            style={{
              width: "100%", padding: "16px 20px", borderRadius: 999, border: "none",
              background: allPicked ? "var(--brand)" : "var(--line)",
              color: allPicked ? "#fff" : "var(--muted)",
              fontSize: 15, fontWeight: 700, fontFamily: "inherit",
              cursor: allPicked && !sending ? "pointer" : "default",
              opacity: sending ? 0.7 : 1,
            }}>
            {sending ? "Registrando…"
              : allPicked ? "Aceitar proposta"
              : quote.rooms.length > 1 ? "Escolha uma cabana para cada acomodação" : "Escolha uma cabana"}
          </button>

          <p style={{ fontSize: 11.5, color: "var(--muted)", textAlign: "center", margin: "10px 0 0", lineHeight: 1.5 }}>
            Aceitar não gera cobrança: a recepção confirma a disponibilidade e
            combina o pagamento com você.
          </p>
        </div>
      </>)}
    </div>
  );
}
