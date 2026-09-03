// A parte interativa da proposta, em três telas: o cliente escolhe UMA cabana
// por acomodação e ACEITA → preenche o CADASTRO do titular (IntakeForm) →
// confirmação. Visual no tema "camaleão" do Portal do Hóspede.
//
// O aceite é registrado no clique do botão, ANTES do cadastro: quem desistir
// no meio do formulário já deixou o aceite no CRM e o alarme na fila da
// recepção. O cadastro é o passo 2, não um pedágio do aceite.
//
// Idioma: abre no idioma que o vendedor marcou no orçamento (quote.language)
// — quem falou com o hóspede sabe o idioma dele antes de mandar o link. O
// hóspede pode trocar por conta própria (pastilhas PT/EN/ES no cabeçalho,
// mesmo padrão do portal do hóspede — ver check-in/[code]/CLAUDE.md); a
// troca é só estado local da página, nunca grava no banco.
"use client";

import { useMemo, useRef, useState } from "react";
import { acceptQuoteProposal } from "@/app/actions/quote-actions";
import { DISPLAY_FONT } from "@/app/check-in/[code]/_portal/ui";
import IntakeForm, { INTAKE_DICT } from "./IntakeForm";
import { MsgLang, OVER_CAPACITY_NOTICE, OVER_CAPACITY_SHORT } from "@/lib/rate-engine";
import type { PublicQuoteView } from "@/services/rate-quote-public-service";

const money = (v: number) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtBR = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

type Dict = {
  eyebrow: string;
  greeting: (name: string) => string;
  greetingFallback: string;
  periodMixed: (a: string, b: string) => string;
  period: (a: string, b: string, nights: number) => string;
  validity: (date: string) => string;
  acceptedTitle: string;
  acceptedBody: string;
  talkToInn: string;
  introMulti: (n: number) => string;
  introSingle: string;
  people: (n: number) => string;
  babies: (n: number) => string;
  pets: (n: number) => string;
  perNight: (v: string) => string;
  seePhotos: string;
  inclusionsTitle: string;
  policyTitle: string;
  policyRead: string;
  policyHide: string;
  policyCheckbox: string;
  totalFrom: string;
  totalLabel: string;
  accommodationsCount: (n: number) => string;
  sending: string;
  pickAllRooms: string;
  pickOne: string;
  acceptPolicyFirst: string;
  acceptButton: string;
  disclaimer: string;
  genericError: string;
  /** Faixa curta no topo do cadastro — o aceite já foi registrado. */
  weddingGuest: (couple: string) => string;
  weddingSamePeriod: (couple: string) => string;
  acceptedBanner: string;
  skipIntake: string;
  /** Há menos cabanas livres desta categoria do que acomodações — aviso na opção. */
  onlyNLeft: (n: number) => string;
  /** Categoria sem cabana livre nas datas (ocupou depois do envio). */
  noneLeft: string;
};

const DICT: Record<MsgLang, Dict> = {
  pt: {
    eyebrow: "Sua proposta",
    greeting: (name) => `Olá, ${name}!`,
    greetingFallback: "Que bom te receber!",
    periodMixed: (a, b) => `Chegadas em datas diferentes · entre ${a} e ${b}`,
    period: (a, b, n) => `${a} a ${b} · ${n} noite${n !== 1 ? "s" : ""}`,
    validity: (date) => `Válida até ${date} mediante disponibilidade`,
    acceptedTitle: "Proposta aceita!",
    acceptedBody: "Recebemos a sua escolha e já avisamos a recepção. Em instantes entramos em contato para confirmar a reserva e combinar o pagamento.",
    talkToInn: "Falar com a pousada",
    introMulti: (n) => `Preparamos opções para as ${n} acomodações. Escolha uma cabana para cada e confirme abaixo.`,
    introSingle: "Escolha a cabana que mais combina com você e confirme abaixo.",
    people: (n) => `${n} pessoa${n !== 1 ? "s" : ""}`,
    babies: (n) => `${n} bebê${n > 1 ? "s" : ""}`,
    pets: (n) => `${n} pet${n > 1 ? "s" : ""}`,
    perNight: (v) => `R$ ${v} por noite`,
    seePhotos: "ver fotos",
    inclusionsTitle: "O que está incluso",
    policyTitle: "Regras da pousada",
    policyRead: "ler",
    policyHide: "ocultar",
    policyCheckbox: "Li e aceito as regras da pousada.",
    totalFrom: "A partir de",
    totalLabel: "Total",
    accommodationsCount: (n) => `${n} acomodações`,
    sending: "Registrando…",
    pickAllRooms: "Escolha uma cabana para cada acomodação",
    pickOne: "Escolha uma cabana",
    acceptPolicyFirst: "Aceite as regras da pousada",
    acceptButton: "Aceitar proposta",
    disclaimer: "Aceitar não gera cobrança: a recepção confirma a disponibilidade e combina o pagamento com você.",
    genericError: "Não foi possível registrar.",
    weddingGuest: (c) => `Convidados do casamento de ${c}`,
    weddingSamePeriod: (c) => `Casamento de ${c} na pousada neste período`,
    acceptedBanner: "Proposta aceita — já avisamos a recepção.",
    skipIntake: "Prefiro enviar meus dados depois",
    onlyNLeft: (n) => n === 1 ? "Só 1 disponível para essas datas" : `Só ${n} disponíveis para essas datas`,
    noneLeft: "Indisponível para essas datas",
  },
  en: {
    eyebrow: "Your quote",
    greeting: (name) => `Hi, ${name}!`,
    greetingFallback: "Great to have you here!",
    periodMixed: (a, b) => `Arrivals on different dates · between ${a} and ${b}`,
    period: (a, b, n) => `${a} to ${b} · ${n} night${n !== 1 ? "s" : ""}`,
    validity: (date) => `Valid until ${date}, subject to availability`,
    acceptedTitle: "Quote accepted!",
    acceptedBody: "We've received your choice and already notified the front desk. We'll be in touch shortly to confirm your booking and arrange payment.",
    talkToInn: "Talk to the inn",
    introMulti: (n) => `We've prepared options for your ${n} accommodations. Pick a cabin for each and confirm below.`,
    introSingle: "Pick the cabin that suits you best and confirm below.",
    people: (n) => `${n} ${n !== 1 ? "people" : "person"}`,
    babies: (n) => `${n} ${n > 1 ? "infants" : "infant"}`,
    pets: (n) => `${n} pet${n > 1 ? "s" : ""}`,
    perNight: (v) => `R$ ${v} per night`,
    seePhotos: "see photos",
    inclusionsTitle: "What's included",
    policyTitle: "House rules",
    policyRead: "read",
    policyHide: "hide",
    policyCheckbox: "I've read and accept the house rules.",
    totalFrom: "From",
    totalLabel: "Total",
    accommodationsCount: (n) => `${n} accommodations`,
    sending: "Submitting…",
    pickAllRooms: "Pick a cabin for each accommodation",
    pickOne: "Pick a cabin",
    acceptPolicyFirst: "Accept the house rules",
    acceptButton: "Accept quote",
    disclaimer: "Accepting doesn't charge you — the front desk will confirm availability and arrange payment with you.",
    genericError: "Couldn't submit your choice.",
    weddingGuest: (c) => `Guests of ${c}'s wedding`,
    weddingSamePeriod: (c) => `${c}'s wedding takes place here during your stay`,
    acceptedBanner: "Quote accepted — the front desk already knows.",
    skipIntake: "I'd rather send my details later",
    onlyNLeft: (n) => `Only ${n} available for these dates`,
    noneLeft: "No longer available for these dates",
  },
  es: {
    eyebrow: "Su presupuesto",
    greeting: (name) => `¡Hola, ${name}!`,
    greetingFallback: "¡Qué bueno recibirte!",
    periodMixed: (a, b) => `Llegadas en fechas distintas · entre el ${a} y el ${b}`,
    period: (a, b, n) => `${a} al ${b} · ${n} noche${n !== 1 ? "s" : ""}`,
    validity: (date) => `Válida hasta el ${date}, sujeta a disponibilidad`,
    acceptedTitle: "¡Presupuesto aceptado!",
    acceptedBody: "Recibimos su elección y ya avisamos a recepción. En breve nos pondremos en contacto para confirmar la reserva y coordinar el pago.",
    talkToInn: "Hablar con la posada",
    introMulti: (n) => `Preparamos opciones para los ${n} alojamientos. Elija una cabaña para cada uno y confirme abajo.`,
    introSingle: "Elija la cabaña que más le guste y confirme abajo.",
    people: (n) => `${n} persona${n !== 1 ? "s" : ""}`,
    babies: (n) => `${n} bebé${n > 1 ? "s" : ""}`,
    pets: (n) => `${n} mascota${n > 1 ? "s" : ""}`,
    perNight: (v) => `R$ ${v} por noche`,
    seePhotos: "ver fotos",
    inclusionsTitle: "Qué incluye",
    policyTitle: "Reglas de la posada",
    policyRead: "leer",
    policyHide: "ocultar",
    policyCheckbox: "Leí y acepto las reglas de la posada.",
    totalFrom: "Desde",
    totalLabel: "Total",
    accommodationsCount: (n) => `${n} alojamientos`,
    sending: "Enviando…",
    pickAllRooms: "Elija una cabaña para cada alojamiento",
    pickOne: "Elija una cabaña",
    acceptPolicyFirst: "Acepte las reglas de la posada",
    acceptButton: "Aceptar presupuesto",
    disclaimer: "Aceptar no genera ningún cobro: recepción confirmará la disponibilidad y coordinará el pago con usted.",
    genericError: "No se pudo registrar su elección.",
    weddingGuest: (c) => `Invitados de la boda de ${c}`,
    weddingSamePeriod: (c) => `Boda de ${c} en la posada durante su estadía`,
    acceptedBanner: "Presupuesto aceptado — ya avisamos a recepción.",
    skipIntake: "Prefiero enviar mis datos después",
    onlyNLeft: (n) => `Solo ${n} disponible${n !== 1 ? "s" : ""} para estas fechas`,
    noneLeft: "No disponible para estas fechas",
  },
};

function LangSwitcher({ lang, setLang }: { lang: MsgLang; setLang: (l: MsgLang) => void }) {
  return (
    <div style={{
      display: "inline-flex", gap: 3, background: "var(--surface)",
      border: "1px solid var(--line)", borderRadius: 999, padding: 3, marginTop: 10,
    }}>
      {(["pt", "en", "es"] as const).map((l) => (
        <button key={l} type="button" onClick={() => setLang(l)}
          style={{
            padding: "4px 11px", borderRadius: 999, border: "none", cursor: "pointer",
            fontFamily: "inherit", fontSize: 10.5, fontWeight: 800, letterSpacing: ".06em",
            textTransform: "uppercase",
            background: lang === l ? "var(--brand)" : "transparent",
            color: lang === l ? "#fff" : "var(--muted)",
          }}>
          {l}
        </button>
      ))}
    </div>
  );
}

/** Teto de vezes que a categoria pode ser escolhida entre as acomodações
 *  (cabanas livres, vindo do servidor). Sem número = sem teto, como era. */
const capOf = (quote: PublicQuoteView, categoryId: string) =>
  quote.unitsFree?.[categoryId] ?? Infinity;

/** `startAtIntake` = link "?cadastro=1", que a recepção copia no drawer para
 *  quem fechou por WhatsApp ou aceitou antes de o cadastro existir. */
export default function ProposalClient({ quote, startAtIntake }: {
  quote: PublicQuoteView;
  startAtIntake?: boolean;
}) {
  const [lang, setLang] = useState<MsgLang>(quote.language);
  const t = DICT[lang];
  const [picks, setPicks] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    // Escolha repetida acima do teto (a recepção pré-marcou a mesma cabana em
    // todas, ou a ocupação mudou depois do envio) cai em ordem: a primeira
    // acomodação fica com ela, as seguintes voltam a "escolha uma".
    const used: Record<string, number> = {};
    for (const r of quote.rooms) {
      // A escolha gravada só vale se ainda estiver entre as opções: recalcular
      // o orçamento pode ter tirado a cabana do ar, e um pick órfão deixava o
      // botão liberado com o total preso em "a partir de".
      const saved = r.selectedCategory
        && r.options.some((o) => o.categoryId === r.selectedCategory)
        ? r.selectedCategory : null;
      // Uma opção só não é escolha: deixar o cliente clicar num cartão único
      // para destravar o botão é charada, não decisão.
      const pick = saved ?? (r.options.length === 1 ? r.options[0].categoryId : null);
      if (!pick || (used[pick] ?? 0) >= capOf(quote, pick)) continue;
      used[pick] = (used[pick] ?? 0) + 1;
      initial[r.id] = pick;
    }
    return initial;
  });
  const [sending, setSending] = useState(false);
  // Três telas. Voltar ao link depois de aceitar (sem ter mandado os dados)
  // reabre o cadastro — é o que ainda falta para garantir a reserva.
  const [step, setStep] = useState<"choose" | "intake" | "done">(() => {
    if (quote.intakeDone) return "done";
    if (startAtIntake || quote.acceptedAt) return "intake";
    return "choose";
  });
  const [intakeDone, setIntakeDone] = useState(quote.intakeDone);
  // O link avulso (?cadastro=1) abre o cadastro sem aceite nenhum — a faixa de
  // "proposta aceita" só existe quando ela de fato aconteceu.
  const [accepted, setAccepted] = useState(!!quote.acceptedAt);
  const [error, setError] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState("");
  const [policyOpen, setPolicyOpen] = useState(false);
  const [policyOk, setPolicyOk] = useState(false);
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
  const policyPending = !!quote.policyText && !policyOk;
  const canAccept = allPicked && !policyPending;

  /** Validade só faz sentido com folga: "válida até hoje" não informa nada. */
  const showValidity = (() => {
    if (!quote.expiresAt) return false;
    const days = Math.round(
      (new Date(`${quote.checkIn}T12:00`).getTime() - new Date().setHours(12, 0, 0, 0)) / 86400000
    );
    return days > 1;
  })();

  const accept = async () => {
    if (!canAccept || sending) return;
    setSending(true);
    setError(null);
    const res = await acceptQuoteProposal(quote.id, {
      selections: quote.rooms.map((r) => ({ roomId: r.id, categoryId: picks[r.id] })),
      policyAccepted: policyOk,
      elapsedMs: Date.now() - openedAt.current,
      website: honeypot,
    });
    setSending(false);
    // Aceite gravado: o passo 2 (cadastro) começa aqui. Fechar a aba agora
    // não desfaz nada — a recepção já foi avisada.
    if (res.ok) { setAccepted(true); setStep("intake"); }
    else setError(res.error ?? t.genericError);
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
          {t.eyebrow}
        </p>
        {/* Casamento na casa: a foto do casal (quando existe no site dos
            noivos) e a frase certa para cada caso — convidado vs quem só
            calhou das mesmas datas. */}
        {quote.wedding && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 9,
            background: "var(--surface)", border: "1px solid var(--line)",
            borderRadius: 999, padding: quote.wedding.photoUrl ? "5px 16px 5px 5px" : "7px 16px",
            margin: "10px 0 2px", maxWidth: "100%",
          }}>
            {quote.wedding.photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={quote.wedding.photoUrl} alt={quote.wedding.couple}
                style={{ width: 34, height: 34, borderRadius: 999, objectFit: "cover", flexShrink: 0 }} />
            )}
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink-soft)", lineHeight: 1.35 }}>
              💍 {quote.wedding.guest
                ? t.weddingGuest(quote.wedding.couple)
                : t.weddingSamePeriod(quote.wedding.couple)}
            </span>
          </div>
        )}

        <h1 style={{
          fontFamily: DISPLAY_FONT, fontSize: 30, lineHeight: 1.15,
          color: "var(--ink)", margin: "6px 0 8px", fontWeight: 400,
        }}>
          {quote.clientFirstName ? t.greeting(quote.clientFirstName) : t.greetingFallback}
        </h1>
        {/* Períodos mistos: a data vive em cada acomodação, não aqui — senão
            o cliente lê o span do grupo como se fosse a estadia dele. */}
        <p style={{ fontSize: 14, color: "var(--ink-soft)", margin: 0 }}>
          {quote.mixedPeriods
            ? t.periodMixed(fmtBR(quote.checkIn), fmtBR(quote.checkOut))
            : t.period(fmtBR(quote.checkIn), fmtBR(quote.checkOut), quote.nights)}
        </p>
        {showValidity && step === "choose" && (
          <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
            {t.validity(fmtBR(quote.expiresAt!))}
          </p>
        )}
        <LangSwitcher lang={lang} setLang={setLang} />
      </header>

      {step === "done" ? (
        <div style={{
          background: "var(--green-soft)", border: "1px solid var(--green)",
          borderRadius: 18, padding: "28px 22px", textAlign: "center",
        }}>
          <p style={{ fontFamily: DISPLAY_FONT, fontSize: 24, color: "var(--ink)", margin: "0 0 8px", fontWeight: 400 }}>
            {intakeDone ? INTAKE_DICT[lang].doneTitle : t.acceptedTitle}
          </p>
          <p style={{ fontSize: 14, color: "var(--ink-soft)", margin: 0, lineHeight: 1.55 }}>
            {intakeDone ? INTAKE_DICT[lang].doneBody : t.acceptedBody}
          </p>
          {waLink && (
            <a href={waLink} target="_blank" rel="noreferrer"
              style={{
                display: "inline-block", marginTop: 18, padding: "12px 22px",
                borderRadius: 999, background: "var(--brand)", color: "#fff",
                fontSize: 14, fontWeight: 700, textDecoration: "none",
              }}>
              {t.talkToInn}
            </a>
          )}
        </div>
      ) : step === "intake" ? (<>
        {/* O aceite já está gravado — a faixa é o recibo disso. */}
        {accepted && (
          <div style={{
            background: "var(--green-soft)", border: "1px solid var(--green)",
            borderRadius: 999, padding: "9px 16px", marginBottom: 18,
            fontSize: 12.5, fontWeight: 700, color: "var(--ink-soft)", textAlign: "center",
          }}>
            ✓ {t.acceptedBanner}
          </div>
        )}

        <IntakeForm quote={quote} lang={lang} total={total.sum}
          onDone={() => { setIntakeDone(true); setStep("done"); }} />

        {accepted && (
        <div style={{ textAlign: "center", marginTop: 14 }}>
          <button type="button" onClick={() => setStep("done")}
            style={{
              background: "none", border: "none", padding: 8, cursor: "pointer",
              fontFamily: "inherit", fontSize: 12.5, color: "var(--muted)",
              textDecoration: "underline",
            }}>
            {t.skipIntake}
          </button>
        </div>
        )}
      </>) : (<>
        <p style={{ fontSize: 14, color: "var(--ink-soft)", lineHeight: 1.6, marginBottom: 20 }}>
          {quote.rooms.length > 1 ? t.introMulti(quote.rooms.length) : t.introSingle}
        </p>

        {quote.rooms.map((room) => (
          <section key={room.id} style={{ marginBottom: 22 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", margin: 0 }}>
                {room.label}
              </h2>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>
                {t.people(room.adults + room.children)}
                {room.babies > 0 ? ` · ${t.babies(room.babies)}` : ""}
                {room.pets > 0 ? ` · ${t.pets(room.pets)}` : ""}
              </span>
              {quote.mixedPeriods && (
                <span style={{
                  fontSize: 11, fontWeight: 700, color: "var(--brand)",
                  background: "var(--brand-soft)", borderRadius: 999, padding: "2px 9px",
                }}>
                  {t.period(fmtBR(room.checkIn), fmtBR(room.checkOut), room.nights)}
                </span>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {room.options.map((o) => {
                const picked = picks[room.id] === o.categoryId;
                // Teto por categoria: as OUTRAS acomodações já levaram todas
                // as cabanas livres desta? Então aqui ela não clica — e diz
                // por quê, em vez de sumir. `scarce` mostra o aviso antes de
                // esgotar, para o cliente entender a conta desde o início.
                const cap = capOf(quote, o.categoryId);
                const takenElsewhere = quote.rooms
                  .filter((r) => r.id !== room.id && picks[r.id] === o.categoryId).length;
                const exhausted = !picked && takenElsewhere >= cap;
                const scarce = quote.rooms.length > cap;
                return (
                  <button key={o.categoryId} disabled={exhausted}
                    aria-disabled={exhausted}
                    onClick={() => {
                      if (exhausted) return;
                      setPicks((p) => ({ ...p, [room.id]: o.categoryId }));
                    }}
                    style={{
                      display: "flex", alignItems: "center", gap: 12, width: "100%",
                      textAlign: "left", cursor: exhausted ? "not-allowed" : "pointer",
                      fontFamily: "inherit", opacity: exhausted ? 0.55 : 1,
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
                        {t.perNight(money(o.avgNightly))}
                        {o.siteUrl && (
                          <>
                            {" · "}
                            <a href={o.siteUrl} target="_blank" rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              style={{ color: "var(--brand)", textDecoration: "underline" }}>
                              {t.seePhotos}
                            </a>
                          </>
                        )}
                      </span>
                      {/* Ocupação estendida: o cliente precisa saber ANTES de
                          escolher que esta cabana é preparada para menos gente. */}
                      {o.overCapacity && (
                        <span style={{ display: "block", fontSize: 11.5, color: "var(--muted)", marginTop: 3 }}>
                          ⚠ {OVER_CAPACITY_SHORT[lang]}
                        </span>
                      )}
                      {scarce && (
                        <span style={{
                          display: "block", fontSize: 11.5, marginTop: 3,
                          color: exhausted ? "var(--ink-soft)" : "var(--muted)",
                          fontWeight: exhausted ? 700 : 500,
                        }}>
                          {cap === 0 ? t.noneLeft : t.onlyNLeft(cap)}
                        </span>
                      )}
                    </span>
                    {/* Com valor especial, o preço de tabela sai riscado e o
                        oferecido ganha destaque — é o que o cliente compara. */}
                    <span style={{ textAlign: "right", flexShrink: 0 }}>
                      {o.wasTotal && (
                        <span style={{ display: "block", fontSize: 12, color: "var(--muted)", textDecoration: "line-through" }}>
                          R$ {money(o.wasTotal)}
                        </span>
                      )}
                      <span style={{
                        display: "block", fontWeight: 800,
                        fontSize: o.wasTotal ? 19 : 17,
                        color: o.wasTotal ? "var(--brand-deep)" : "var(--ink)",
                      }}>
                        R$ {money(o.total)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}

        {/* Aviso de ocupação estendida — só aparece quando alguma cabana da
            proposta foi cotada acima da ocupação normal. */}
        {quote.overCapacityNotice && (
          <section style={{
            background: "var(--surface)", border: "1px solid var(--line)",
            borderRadius: 16, padding: "14px 16px", marginBottom: 14,
            display: "flex", alignItems: "flex-start", gap: 10,
          }}>
            <span style={{ fontSize: 16, lineHeight: 1.3, flexShrink: 0 }}>⚠</span>
            <p style={{ margin: 0, fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.55 }}>
              {OVER_CAPACITY_NOTICE[lang]}
            </p>
          </section>
        )}

        {/* O que está incluso — vem do Tarifário → Comercial, já no idioma certo. */}
        {quote.inclusions.length > 0 && (
          <section style={{
            background: "var(--surface)", border: "1px solid var(--line)",
            borderRadius: 16, padding: "16px 18px", marginBottom: 14,
          }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", margin: "0 0 10px" }}>
              {t.inclusionsTitle}
            </h2>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
              {quote.inclusions.map((item, i) => (
                <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 9, fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.5 }}>
                  <span aria-hidden="true" style={{
                    width: 18, height: 18, borderRadius: 999, flexShrink: 0, marginTop: 1,
                    background: "var(--green-soft)", color: "var(--green)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 900,
                  }}>✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Regras da pousada — aceite obrigatório antes de enviar a escolha. */}
        {quote.policyText && (
          <section style={{
            background: "var(--surface)", border: "1px solid var(--line)",
            borderRadius: 16, padding: "14px 16px", marginBottom: 18,
          }}>
            <button onClick={() => setPolicyOpen((v) => !v)}
              style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%",
                background: "none", border: "none", padding: 0, cursor: "pointer",
                fontFamily: "inherit", textAlign: "left",
              }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>
                {t.policyTitle}
              </span>
              <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--brand)", fontWeight: 700 }}>
                {policyOpen ? t.policyHide : t.policyRead}
              </span>
            </button>

            {policyOpen && (
              <div style={{
                fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.6,
                whiteSpace: "pre-wrap", marginTop: 10, maxHeight: 260, overflowY: "auto",
                borderTop: "1px solid var(--line-soft)", paddingTop: 10,
              }}>
                {quote.policyText}
              </div>
            )}

            <label style={{
              display: "flex", alignItems: "flex-start", gap: 10, marginTop: 12,
              fontSize: 13, color: "var(--ink)", cursor: "pointer", lineHeight: 1.5,
            }}>
              <input type="checkbox" checked={policyOk}
                onChange={(e) => setPolicyOk(e.target.checked)}
                style={{ marginTop: 2, width: 18, height: 18, accentColor: "var(--brand)", flexShrink: 0 }} />
              {t.policyCheckbox}
            </label>
          </section>
        )}

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
              {total.partial ? t.totalFrom : t.totalLabel}
              {quote.rooms.length > 1 ? ` · ${t.accommodationsCount(quote.rooms.length)}` : ""}
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

          <button onClick={accept} disabled={!canAccept || sending}
            style={{
              width: "100%", padding: "16px 20px", borderRadius: 999, border: "none",
              background: canAccept ? "var(--brand)" : "var(--line)",
              color: canAccept ? "#fff" : "var(--muted)",
              fontSize: 15, fontWeight: 700, fontFamily: "inherit",
              cursor: canAccept && !sending ? "pointer" : "default",
              opacity: sending ? 0.7 : 1,
            }}>
            {sending ? t.sending
              : !allPicked ? (quote.rooms.length > 1 ? t.pickAllRooms : t.pickOne)
              : policyPending ? t.acceptPolicyFirst
              : t.acceptButton}
          </button>

          <p style={{ fontSize: 11.5, color: "var(--muted)", textAlign: "center", margin: "10px 0 0", lineHeight: 1.5 }}>
            {t.disclaimer}
          </p>
        </div>
      </>)}
    </div>
  );
}
