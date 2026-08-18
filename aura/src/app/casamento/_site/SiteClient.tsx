"use client";

// Site dos noivos — client único das duas visões:
//   guest  → capa + simulador de hospedagem + pré-reserva
//   couple → capa + abas Painel (ocupação/personalização) e Simulador
// Tema via CSS vars do wrapper (getPortalThemeVars + overrides do casal).
// Preço NUNCA é calculado aqui: tudo vem de /api/wedding-site/* (server).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast, Toaster } from "sonner";
import {
  Loader2, Minus, Plus, Heart, CalendarDays, Users, PawPrint, Baby,
  CheckCircle2, ExternalLink, Camera, Palette, Gift, BedDouble, Sparkles,
} from "lucide-react";
import { addDays } from "@/lib/rate-engine";
import type {
  PublicWeddingSite, WeddingSiteQuote, WeddingSiteOption, CoupleOverviewRow,
} from "@/services/wedding-site-service";
import { SiteLang, siteI18n, longDate, shortDate, money, moneyFull } from "./i18n";

type Props = {
  code: string;
  site: PublicWeddingSite;
  overview: { categories: CoupleOverviewRow[] } | null;
};

const S = {
  card: {
    background: "var(--surface)", border: "1px solid var(--line)",
    borderRadius: 18, boxShadow: "var(--sh-xs)",
  } as React.CSSProperties,
  label: {
    fontSize: 11, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase",
    color: "var(--muted)",
  } as React.CSSProperties,
  input: {
    width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 12,
    border: "1px solid var(--line)", background: "var(--bg)", color: "var(--ink)",
    fontFamily: "inherit", fontSize: 15, outline: "none",
  } as React.CSSProperties,
  primaryBtn: {
    width: "100%", padding: "14px 18px", borderRadius: 14, border: "none",
    background: "var(--brand)", color: "#fff", fontFamily: "inherit",
    fontSize: 15, fontWeight: 800, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
  } as React.CSSProperties,
};

function Stepper({ value, min, max, onChange, label }: {
  value: number; min: number; max: number; onChange: (v: number) => void; label?: string;
}) {
  const btn = (disabled: boolean): React.CSSProperties => ({
    width: 34, height: 34, borderRadius: 10, border: "1px solid var(--line)",
    background: "var(--surface)", color: disabled ? "var(--faint)" : "var(--brand)",
    display: "flex", alignItems: "center", justifyContent: "center",
    cursor: disabled ? "default" : "pointer", flexShrink: 0,
  });
  const suffix = label ? ` ${label}` : "";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <button type="button" aria-label={`Menos${suffix}`} disabled={value <= min} style={btn(value <= min)}
        onClick={() => value > min && onChange(value - 1)}><Minus size={15} /></button>
      <span aria-live="polite" style={{ minWidth: 20, textAlign: "center", fontSize: 16, fontWeight: 800 }}>{value}</span>
      <button type="button" aria-label={`Mais${suffix}`} disabled={value >= max} style={btn(value >= max)}
        onClick={() => value < max && onChange(value + 1)}><Plus size={15} /></button>
    </div>
  );
}

export default function SiteClient({ code, site, overview }: Props) {
  const router = useRouter();
  const [lang, setLang] = useState<SiteLang>("pt");
  useEffect(() => {
    const nav = (navigator.language || "pt").slice(0, 2);
    if (nav === "en" || nav === "es") setLang(nav);
  }, []);
  const t = siteI18n[lang];

  const isCouple = site.role === "couple";
  const [tab, setTab] = useState<"panel" | "sim">(isCouple ? "panel" : "sim");

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      {/* Toaster local: o global vive no layout do admin — /casamento/[code] é público. */}
      <Toaster richColors position="top-center" />
      <Hero site={site} lang={lang} setLang={setLang} t={t} />

      <div style={{ width: "100%", maxWidth: 680, margin: "0 auto", padding: "0 16px 40px", boxSizing: "border-box", flex: 1 }}>
        {isCouple && (
          <div style={{ display: "flex", gap: 6, margin: "18px 0 4px", background: "var(--surface-alt)", border: "1px solid var(--line-soft)", borderRadius: 14, padding: 5 }}>
            {([
              { id: "panel" as const, label: t.panelTab, icon: Sparkles },
              { id: "sim" as const, label: t.simulatorTab, icon: BedDouble },
            ]).map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setTab(id)}
                style={{
                  flex: 1, padding: "10px 12px", borderRadius: 10, border: "none",
                  fontFamily: "inherit", fontSize: 13, fontWeight: 800, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                  background: tab === id ? "var(--surface)" : "transparent",
                  color: tab === id ? "var(--brand)" : "var(--muted)",
                  boxShadow: tab === id ? "var(--sh-xs)" : "none",
                }}>
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>
        )}

        {isCouple && tab === "panel" ? (
          <CouplePanel code={code} site={site} overview={overview} t={t} onSaved={() => router.refresh()} />
        ) : (
          <Simulator code={code} site={site} lang={lang} t={t} />
        )}
      </div>

      <footer style={{ textAlign: "center", padding: "0 0 26px", opacity: .55 }}>
        <span style={{ fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", fontWeight: 800, color: "var(--muted)" }}>
          {site.property.name} · Powered by Aura
        </span>
      </footer>
    </div>
  );
}

// ─── Capa ─────────────────────────────────────────────────────────────────────

function Hero({ site, lang, setLang, t }: {
  site: PublicWeddingSite; lang: SiteLang; setLang: (l: SiteLang) => void;
  t: (typeof siteI18n)["pt"];
}) {
  const cover = site.config.coverPhotoUrl;
  return (
    <div style={{
      position: "relative", overflow: "hidden",
      background: cover
        ? `linear-gradient(rgba(20,14,8,.35), rgba(20,14,8,.62)), url(${JSON.stringify(cover)}) center/cover no-repeat`
        : "linear-gradient(160deg, var(--brand-deep), var(--brand))",
      color: "#fff", textAlign: "center", padding: "54px 20px 44px",
    }}>
      <div style={{ position: "absolute", top: 14, right: 14, display: "flex", gap: 4 }}>
        {(["pt", "en", "es"] as SiteLang[]).map((l) => (
          <button key={l} onClick={() => setLang(l)}
            style={{
              padding: "5px 10px", borderRadius: 999, border: "1px solid rgba(255,255,255,.35)",
              background: lang === l ? "rgba(255,255,255,.92)" : "rgba(0,0,0,.18)",
              color: lang === l ? "var(--brand-deep)" : "#fff",
              fontFamily: "inherit", fontSize: 11, fontWeight: 800, cursor: "pointer",
              textTransform: "uppercase", letterSpacing: ".06em",
            }}>
            {l}
          </button>
        ))}
      </div>

      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".22em", textTransform: "uppercase", opacity: .85 }}>
        {t.weddingOf}
      </div>
      <h1 style={{
        margin: "10px 0 6px", fontFamily: "Georgia, 'Times New Roman', serif",
        fontSize: "clamp(30px, 8vw, 44px)", fontWeight: 500, lineHeight: 1.12, letterSpacing: "-.5px",
      }}>
        {site.bride} <Heart size={20} style={{ display: "inline", verticalAlign: "middle", margin: "0 4px" }} fill="currentColor" /> {site.groom}
      </h1>
      <div style={{ fontSize: 14, fontWeight: 700, opacity: .92 }}>{longDate(site.weddingDate, lang)}</div>

      <p style={{ maxWidth: 520, margin: "18px auto 0", fontSize: 14, lineHeight: 1.65, opacity: .94 }}>
        {site.config.welcomeMessage || t.welcomeDefault}
      </p>

      <div style={{ marginTop: 18, display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(0,0,0,.22)", borderRadius: 999, padding: "7px 14px", fontSize: 12, fontWeight: 700 }}>
        {site.property.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={site.property.logoUrl} alt="" style={{ height: 18, width: "auto", borderRadius: 4 }} />
        )}
        {t.hostedBy} {site.property.name}
      </div>
    </div>
  );
}

// ─── Simulador do convidado ───────────────────────────────────────────────────

function Simulator({ code, site, lang, t }: {
  code: string; site: PublicWeddingSite; lang: SiteLang; t: (typeof siteI18n)["pt"];
}) {
  const maxExtend = site.maxExtendNights;
  const [extendBefore, setExtendBefore] = useState(0);
  const [extendAfter, setExtendAfter] = useState(0);
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [babies, setBabies] = useState(0);
  const [pets, setPets] = useState(0);

  const checkIn = useMemo(() => addDays(site.window.checkin, -extendBefore), [site.window.checkin, extendBefore]);
  const checkOut = useMemo(() => addDays(site.window.checkout, extendAfter), [site.window.checkout, extendAfter]);

  const [quoting, setQuoting] = useState(false);
  const [quote, setQuote] = useState<WeddingSiteQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [selected, setSelected] = useState<WeddingSiteOption | null>(null);

  // Mudou a busca (datas/ocupantes) → a cotação e a escolha viram pó: sem isso,
  // o convidado confirmaria vendo o preço ANTIGO e a pré-reserva sairia com
  // outro (o servidor recalcula pelas datas novas). Força re-cotar.
  useEffect(() => {
    setQuote(null);
    setSelected(null);
    setQuoteError(null);
  }, [checkIn, checkOut, adults, children, babies, pets]);

  // Pré-reserva
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState<{ category: string; total: number; checkIn: string; checkOut: string } | null>(null);
  const formShownAt = useRef<number>(0);
  const websiteRef = useRef<HTMLInputElement>(null); // honeypot
  const resultsRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const policyText = site.policy ? (site.policy[lang] || site.policy.pt || site.policy.en || site.policy.es || "").trim() : "";

  const runQuote = async () => {
    setQuoting(true);
    setQuoteError(null);
    setQuote(null);
    setSelected(null);
    formShownAt.current = 0; // nova cotação → recomeça o relógio anti-robô
    try {
      const res = await fetch("/api/wedding-site/quote", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, checkIn, checkOut, adults, children, babies, pets }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setQuoteError(t.errors[data?.error] || t.errors.server_error);
        return;
      }
      setQuote(data.quote as WeddingSiteQuote);
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    } catch {
      setQuoteError(t.errors.server_error);
    } finally {
      setQuoting(false);
    }
  };

  const choose = (o: WeddingSiteOption) => {
    if (o.free <= 0) return;
    setSelected(o);
    setSubmitError(null);
    // Só marca o relógio na PRIMEIRA vez que o formulário aparece — trocar de
    // cabana não reinicia a contagem, senão um convidado que revê a escolha e
    // confirma rápido cairia no filtro anti-robô com tela de sucesso falsa.
    if (!formShownAt.current) formShownAt.current = Date.now();
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };

  const submit = async () => {
    if (!selected || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/wedding-site/prebook", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code, checkIn, checkOut, adults, children, babies, pets,
          categoryId: selected.categoryId,
          clientName: name, clientPhone: phone, clientEmail: email || null,
          lang, policyAccepted,
          elapsedMs: Date.now() - formShownAt.current,
          website: websiteRef.current?.value || "",
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        const msg = t.errors[data?.error] || t.errors.server_error;
        // Vaga que esgotou no meio do caminho: o formulário some (setSelected
        // null), então a mensagem inline iria junto — mostra via toast e refaz
        // a consulta para a lista refletir a disponibilidade nova.
        if (data?.error === "sold_out") { toast.error(msg); setSelected(null); runQuote(); }
        else setSubmitError(msg);
        return;
      }
      setDone(data.summary || { category: selected.name, total: selected.total, checkIn, checkOut });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setSubmitError(t.errors.server_error);
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div style={{ ...S.card, marginTop: 22, padding: 28, textAlign: "center" }}>
        <CheckCircle2 size={44} color="var(--green)" style={{ margin: "0 auto 12px" }} />
        <div style={{ fontFamily: "Georgia, serif", fontSize: 24, color: "var(--ink)", marginBottom: 8 }}>{t.requestSent}</div>
        <p style={{ fontSize: 14, color: "var(--ink-soft)", lineHeight: 1.6, maxWidth: 420, margin: "0 auto 20px" }}>
          {t.requestSentBody}
        </p>
        <div style={{ background: "var(--surface-alt)", border: "1px solid var(--line-soft)", borderRadius: 14, padding: 16, textAlign: "left", maxWidth: 380, margin: "0 auto" }}>
          {[
            [t.summaryCategory, done.category],
            [t.summaryDates, `${shortDate(done.checkIn, lang)} → ${shortDate(done.checkOut, lang)}`],
            [t.summaryTotal, moneyFull(done.total)],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "5px 0", fontSize: 13 }}>
              <span style={{ color: "var(--muted)", fontWeight: 700 }}>{k}</span>
              <span style={{ color: "var(--ink)", fontWeight: 800, textAlign: "right" }}>{v}</span>
            </div>
          ))}
        </div>
        <button onClick={() => { setDone(null); setQuote(null); setSelected(null); setName(""); setPhone(""); setEmail(""); setPolicyAccepted(false); }}
          style={{ marginTop: 20, background: "none", border: "none", color: "var(--brand)", fontFamily: "inherit", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
          {t.newQuote}
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Estadia */}
      <div style={{ ...S.card, marginTop: 22, padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <CalendarDays size={16} color="var(--brand)" />
          <span style={{ ...S.label, color: "var(--ink)" }}>{t.yourStay}</span>
        </div>

        <div style={{ background: "var(--brand-soft)", border: "1px solid var(--line-soft)", borderRadius: 14, padding: "12px 16px", marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--brand-deep)" }}>
            {t.eventWeekend} · {t.alwaysIncluded}
          </div>
          <div style={{ marginTop: 5, fontSize: 15, fontWeight: 800, color: "var(--ink)" }}>
            {shortDate(site.window.checkin, lang)} → {shortDate(site.window.checkout, lang)}
            <span style={{ fontWeight: 700, color: "var(--muted)", fontSize: 13 }}>
              {" "}· {site.window.nights} {site.window.nights > 1 ? t.nights : t.night}
            </span>
          </div>
        </div>

        {maxExtend > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 8 }}>
            {[
              { label: t.arriveEarlier, value: extendBefore, set: setExtendBefore },
              { label: t.leaveLater, value: extendAfter, set: setExtendAfter },
            ].map(({ label, value, set }) => (
              <div key={label} style={{ border: "1px solid var(--line)", borderRadius: 14, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: "var(--ink-soft)" }}>{label}</span>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <Stepper value={value} min={0} max={maxExtend} onChange={set} label={label} />
                  <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>
                    {value} {value === 1 ? t.night : t.nights}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, color: "var(--muted)", fontWeight: 700, padding: "4px 2px" }}>
          <span>{t.checkIn}: <b style={{ color: "var(--ink)" }}>{shortDate(checkIn, lang)}</b></span>
          <span>{t.checkOut}: <b style={{ color: "var(--ink)" }}>{shortDate(checkOut, lang)}</b></span>
        </div>
      </div>

      {/* Ocupantes */}
      <div style={{ ...S.card, marginTop: 14, padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <Users size={16} color="var(--brand)" />
          <span style={{ ...S.label, color: "var(--ink)" }}>{t.whoIsComing}</span>
        </div>
        {[
          { icon: Users, label: t.adults, hint: t.adultsHint, value: adults, set: setAdults, min: 1, max: 6 },
          { icon: Users, label: t.children, hint: t.childrenHint, value: children, set: setChildren, min: 0, max: 5 },
          { icon: Baby, label: t.babies, hint: t.babiesHint, value: babies, set: setBabies, min: 0, max: 4 },
          { icon: PawPrint, label: t.pets, hint: t.petsHint, value: pets, set: setPets, min: 0, max: 3 },
        ].map(({ icon: Icon, label, hint, value, set, min, max }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--line-soft)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Icon size={16} color="var(--muted)" />
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "var(--ink)" }}>{label}</div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>{hint}</div>
              </div>
            </div>
            <Stepper value={value} min={min} max={max} onChange={set} label={label} />
          </div>
        ))}
        {adults + children > 6 && (
          <div style={{ marginTop: 10, fontSize: 12, color: "var(--clay)", fontWeight: 700 }}>
            {t.errors.too_many_guests}
          </div>
        )}
        <button onClick={runQuote} disabled={quoting || adults + children > 6}
          style={{ ...S.primaryBtn, marginTop: 16, opacity: quoting || adults + children > 6 ? .6 : 1 }}>
          {quoting ? <><Loader2 size={16} className="animate-spin" /> {t.calculating}</> : t.seePrices}
        </button>
        {quoteError && (
          <div style={{ marginTop: 12, fontSize: 13, color: "var(--clay)", fontWeight: 700, textAlign: "center" }}>
            {quoteError}
          </div>
        )}
      </div>

      {/* Resultados */}
      {quote && (
        <div ref={resultsRef} style={{ marginTop: 22, scrollMarginTop: 12 }}>
          <div style={{ ...S.label, color: "var(--ink)", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <BedDouble size={15} color="var(--brand)" /> {t.chooseCabin}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {quote.options.map((o) => {
              const isSel = selected?.categoryId === o.categoryId;
              const gone = o.free <= 0;
              return (
                <div key={o.categoryId} style={{
                  ...S.card, padding: 18, position: "relative",
                  border: `1px solid ${isSel ? "var(--brand)" : "var(--line)"}`,
                  opacity: gone ? .55 : 1,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: "Georgia, serif", fontSize: 19, color: "var(--ink)" }}>{o.name}</div>
                      <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{
                          fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".05em",
                          borderRadius: 999, padding: "3px 9px",
                          background: gone ? "var(--clay-soft)" : o.free === 1 ? "var(--gold-soft)" : "var(--green-soft)",
                          color: gone ? "var(--clay)" : o.free === 1 ? "var(--gold)" : "var(--green)",
                        }}>
                          {gone ? t.soldOut : o.free === 1 ? t.lastOne : t.unitsLeft(o.free)}
                        </span>
                        {o.siteUrl && (
                          <a href={o.siteUrl} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: 11, fontWeight: 800, color: "var(--brand)", display: "inline-flex", alignItems: "center", gap: 4, textDecoration: "none" }}>
                            {t.seePhotos} <ExternalLink size={10} />
                          </a>
                        )}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 20, fontWeight: 900, color: "var(--ink)", letterSpacing: "-.5px" }}>{money(o.total)}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>
                        {t.totalForStay} · {money(o.avgNightly)}{t.perNight}
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: 12, borderTop: "1px dashed var(--line-soft)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
                    <PriceLine label={`${t.eventWindowLabel} (${quote.windowNights} ${quote.windowNights > 1 ? t.nights : t.night})`} value={o.windowTotal} />
                    {quote.extensionNights > 0 && (
                      <PriceLine label={`${t.extraNightsLabel} (${quote.extensionNights})`} value={o.extensionTotal} />
                    )}
                    {o.petFee > 0 && <PriceLine label={t.petFeeLabel} value={o.petFee} />}
                  </div>

                  {!gone && (
                    <button onClick={() => choose(o)}
                      style={{
                        ...S.primaryBtn, marginTop: 14, padding: "11px 16px", fontSize: 14,
                        background: isSel ? "var(--brand-deep)" : "var(--brand)",
                      }}>
                      {isSel ? <CheckCircle2 size={15} /> : null} {t.choose}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Dados do convidado */}
      {selected && (
        <div ref={formRef} style={{ ...S.card, marginTop: 22, padding: 20, scrollMarginTop: 12 }}>
          <div style={{ ...S.label, color: "var(--ink)", marginBottom: 4 }}>{t.yourDetails}</div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>
            {selected.name} · {moneyFull(selected.total)}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input style={S.input} placeholder={t.fullName} aria-label={t.fullName} value={name} autoComplete="name"
              onChange={(e) => setName(e.target.value)} maxLength={120} />
            <input style={S.input} placeholder={t.whatsapp} aria-label={t.whatsapp} value={phone} autoComplete="tel"
              inputMode="tel" onChange={(e) => setPhone(e.target.value)} maxLength={20} />
            <input style={S.input} placeholder={`${t.email} (${t.optional})`} aria-label={t.email} value={email} autoComplete="email"
              inputMode="email" onChange={(e) => setEmail(e.target.value)} maxLength={160} />
            {/* Honeypot — invisível para humanos, irresistível para robôs. */}
            <input ref={websiteRef} type="text" name="website" tabIndex={-1} autoComplete="off"
              style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }} aria-hidden="true" />
          </div>

          {policyText && (
            <div style={{ marginTop: 14 }}>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", fontSize: 13, color: "var(--ink-soft)" }}>
                <input type="checkbox" checked={policyAccepted} onChange={(e) => setPolicyAccepted(e.target.checked)}
                  style={{ marginTop: 3, width: 16, height: 16, accentColor: "var(--brand)" }} />
                <span>
                  {t.policyAccept}{" "}
                  <button type="button" onClick={() => setPolicyOpen((v) => !v)}
                    style={{ background: "none", border: "none", padding: 0, color: "var(--brand)", fontFamily: "inherit", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
                    {policyOpen ? t.policyClose : t.policyRead}
                  </button>
                </span>
              </label>
              {policyOpen && (
                <div style={{ marginTop: 10, maxHeight: 180, overflowY: "auto", background: "var(--surface-alt)", border: "1px solid var(--line-soft)", borderRadius: 12, padding: 14, fontSize: 12, lineHeight: 1.6, color: "var(--ink-soft)", whiteSpace: "pre-wrap" }}>
                  {policyText}
                </div>
              )}
            </div>
          )}

          <button onClick={submit} disabled={submitting}
            style={{ ...S.primaryBtn, marginTop: 16, opacity: submitting ? .6 : 1 }}>
            {submitting ? <><Loader2 size={16} className="animate-spin" /> {t.sending}</> : t.confirmPreBook}
          </button>
          {submitError && (
            <div style={{ marginTop: 12, fontSize: 13, color: "var(--clay)", fontWeight: 700, textAlign: "center" }}>
              {submitError}
            </div>
          )}
          <p style={{ marginTop: 12, fontSize: 12, color: "var(--muted)", textAlign: "center", lineHeight: 1.55 }}>
            {t.nothingCharged}
          </p>
        </div>
      )}
    </>
  );
}

function PriceLine({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12.5 }}>
      <span style={{ color: "var(--muted)", fontWeight: 700 }}>{label}</span>
      <span style={{ color: "var(--ink-soft)", fontWeight: 800 }}>{moneyFull(value)}</span>
    </div>
  );
}

// ─── Painel dos noivos ────────────────────────────────────────────────────────

function CouplePanel({ code, site, overview, t, onSaved }: {
  code: string; site: PublicWeddingSite;
  overview: { categories: CoupleOverviewRow[] } | null;
  t: (typeof siteI18n)["pt"];
  onSaved: () => void;
}) {
  const [coverPhotoUrl, setCoverPhotoUrl] = useState<string | null>(site.config.coverPhotoUrl);
  const [welcomeMessage, setWelcomeMessage] = useState(site.config.welcomeMessage ?? "");
  const [colors, setColors] = useState({
    primary: site.config.colors?.primary ?? "",
    background: site.config.colors?.background ?? "",
    surface: site.config.colors?.surface ?? "",
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setUploading(true);
    setFlash(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("weddingCode", code);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.url) throw new Error(data?.error || "upload");
      setCoverPhotoUrl(data.url);
    } catch {
      setFlash(t.errors.server_error);
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setFlash(null);
    try {
      const res = await fetch("/api/wedding-site/couple/config", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          coverPhotoUrl,
          welcomeMessage: welcomeMessage || null,
          colors: {
            primary: colors.primary || null,
            background: colors.background || null,
            surface: colors.surface || null,
          },
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || "save");
      setFlash(t.saved);
      onSaved();
    } catch {
      setFlash(t.errors.server_error);
    } finally {
      setSaving(false);
    }
  };

  const rows = overview?.categories ?? [];

  return (
    <>
      {/* Ocupação */}
      <div style={{ ...S.card, marginTop: 18, padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <BedDouble size={16} color="var(--brand)" />
          <span style={{ ...S.label, color: "var(--ink)" }}>{t.occupancyTitle}</span>
        </div>
        <p style={{ margin: "6px 0 14px", fontSize: 12.5, color: "var(--muted)" }}>{t.occupancySub}</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map((r) => {
            const taken = Math.min(r.unitsTotal, r.unitsTotal - r.free);
            return (
              <div key={r.categoryId} style={{ border: "1px solid var(--line-soft)", borderRadius: 14, padding: "12px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: "var(--ink)" }}>{r.name}</span>
                  <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>
                    {r.unitsTotal} {t.unitsTotal}
                  </span>
                </div>
                <div style={{ marginTop: 8, height: 7, borderRadius: 999, background: "var(--line-soft)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${r.unitsTotal > 0 ? Math.round((taken / r.unitsTotal) * 100) : 0}%`, background: "var(--brand)", borderRadius: 999, transition: "width .5s" }} />
                </div>
                <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap", fontSize: 11, fontWeight: 700 }}>
                  <span style={{ color: "var(--green)" }}>● {r.free} {t.freeUnits}</span>
                  <span style={{ color: "var(--gold)" }}>● {r.pending} {t.pendingUnits}</span>
                  <span style={{ color: "var(--brand)" }}>● {r.confirmed} {t.confirmedUnits}</span>
                </div>
              </div>
            );
          })}
          {rows.length === 0 && (
            <div style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", padding: "10px 0" }}>—</div>
          )}
        </div>
      </div>

      {/* Personalização */}
      <div style={{ ...S.card, marginTop: 14, padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Palette size={16} color="var(--brand)" />
          <span style={{ ...S.label, color: "var(--ink)" }}>{t.customizeTitle}</span>
        </div>
        <p style={{ margin: "6px 0 14px", fontSize: 12.5, color: "var(--muted)" }}>{t.customizeSub}</p>

        {/* Foto de capa */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ ...S.label, marginBottom: 8 }}>{t.coverPhoto}</div>
          {coverPhotoUrl ? (
            <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", border: "1px solid var(--line)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={coverPhotoUrl} alt="" style={{ width: "100%", height: 140, objectFit: "cover", display: "block" }} />
              <button onClick={() => setCoverPhotoUrl(null)}
                style={{ position: "absolute", top: 8, right: 8, padding: "5px 10px", borderRadius: 999, border: "none", background: "rgba(0,0,0,.55)", color: "#fff", fontFamily: "inherit", fontSize: 11, fontWeight: 800, cursor: "pointer" }}>
                {t.removePhoto}
              </button>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              style={{ width: "100%", padding: "22px 16px", borderRadius: 14, border: "1px dashed var(--line)", background: "var(--surface-alt)", color: "var(--muted)", fontFamily: "inherit", fontSize: 13, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {uploading ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />}
              {uploading ? t.uploading : t.uploadPhoto}
              <span style={{ fontWeight: 600, fontSize: 11 }}>· {t.coverPhotoHint}</span>
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
        </div>

        {/* Mensagem */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ ...S.label, marginBottom: 8 }}>{t.welcomeMessageLabel}</div>
          <textarea value={welcomeMessage} onChange={(e) => setWelcomeMessage(e.target.value)} rows={3} maxLength={600}
            placeholder={t.welcomeMessageHint}
            style={{ ...S.input, resize: "vertical", lineHeight: 1.55 }} />
        </div>

        {/* Cores */}
        <div>
          <div style={{ ...S.label, marginBottom: 8 }}>{t.colorsLabel}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            {([
              { key: "primary" as const, label: t.colorPrimary },
              { key: "background" as const, label: t.colorBackground },
              { key: "surface" as const, label: t.colorSurface },
            ]).map(({ key, label }) => (
              <label key={key} style={{ border: "1px solid var(--line-soft)", borderRadius: 12, padding: 10, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input type="color" value={colors[key] || "#8a5a2b"}
                  onChange={(e) => setColors((c) => ({ ...c, [key]: e.target.value }))}
                  style={{ width: 40, height: 30, border: "none", background: "none", cursor: "pointer", padding: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 800, color: "var(--ink-soft)" }}>{label}</span>
              </label>
            ))}
          </div>
          <button onClick={() => setColors({ primary: "", background: "", surface: "" })}
            style={{ marginTop: 8, background: "none", border: "none", padding: 0, color: "var(--muted)", fontFamily: "inherit", fontSize: 11.5, fontWeight: 800, cursor: "pointer" }}>
            {t.resetColors}
          </button>
        </div>

        <button onClick={save} disabled={saving || uploading}
          style={{ ...S.primaryBtn, marginTop: 18, opacity: saving || uploading ? .6 : 1 }}>
          {saving ? <><Loader2 size={16} className="animate-spin" /> {t.saving}</> : t.save}
        </button>
        {flash && (
          <div style={{ marginTop: 10, textAlign: "center", fontSize: 13, fontWeight: 800, color: flash === t.saved ? "var(--green)" : "var(--clay)" }}>
            {flash}
          </div>
        )}
      </div>

      {/* Lista de presentes — placeholder combinado em plano */}
      <div style={{ ...S.card, marginTop: 14, padding: 20, textAlign: "center" }}>
        <Gift size={22} color="var(--gold)" style={{ margin: "0 auto 8px" }} />
        <div style={{ fontFamily: "Georgia, serif", fontSize: 18, color: "var(--ink)" }}>{t.giftsTitle}</div>
        <p style={{ margin: "8px auto 0", maxWidth: 380, fontSize: 12.5, color: "var(--muted)", lineHeight: 1.6 }}>
          {t.giftsSoon}
        </p>
      </div>
    </>
  );
}
