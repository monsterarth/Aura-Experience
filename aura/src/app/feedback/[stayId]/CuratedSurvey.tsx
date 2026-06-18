"use client";

import React from "react";
import type { Stay, Property, SurveyTemplate, SurveyChip } from "@/types/aura";
import { getPortalThemeVars } from "@/app/check-in/[code]/_portal/theme";
import { Icon, Card, PrimaryBtn, GhostBtn, IconBtn, Chip } from "@/app/check-in/[code]/_portal/ui";

/* ============================================================
   Survey 2.0 — fluxo curado do hóspede (faces → categorias →
   destaques → recomendação + comentário → final inteligente).
   Tema "camaleão" via getPortalThemeVars + átomos do portal.
   ============================================================ */

type Lang = "pt" | "en" | "es";
const LOCALE: Record<Lang, string> = { pt: "pt-BR", en: "en-US", es: "es-ES" };

const TXT = {
    pt: {
        brand: "Sua opinião", overallQ: "Como foi sua estadia", overallSub: "Sua opinião molda a experiência dos próximos hóspedes.",
        catsQ: "Avalie por item", catsSub: (n: number) => `Toque nas estrelas. Avalie ao menos ${n}.`,
        hlQ: "O que se destacou?", hlSub: "Escolha tudo que combina com sua experiência.",
        hlLiked: "O que mais gostou?", hlImprove: "O que podemos melhorar?", other: "Outro…", otherPlaceholder: "Conte pra gente",
        recQ: (p: string) => `Recomendaria ${p}?`, recSub: "Quase lá!",
        commentLabelPublic: "Quer deixar um recado?", commentLabelPrivate: "Conte o que podemos melhorar", commentOptional: "(opcional)",
        commentPlaceholder: "Escreva aqui…",
        continue: "Continuar", send: "Enviar avaliação", chooseFace: "Toque em uma carinha",
        thanksTitle: (n: string) => `Obrigado, ${n}!`, thanksSub: "Sua avaliação foi enviada à equipe. Esperamos te ver de novo 🌿",
        recoveryTitle: "Obrigado por contar", recoveryDefault: "Sentimos muito que sua estadia não tenha sido o que você merecia. Obrigado por nos contar com sinceridade — já avisamos a equipe, e a recepção vai entrar em contato pessoalmente para entender o que aconteceu e fazer o possível para corrigir. Sua experiência importa demais para nós. 🌿",
        shareTitle: "Que tal compartilhar publicamente? Ajuda muito 💛", google: "Publicar no Google", booking: "Booking", copied: "Copiamos seu comentário — é só colar!",
        back: "Voltar", giftTitle: "Um presente para você", home: "Concluir",
        no: "Não", maybe: "Talvez", yes: "Com certeza",
        f1: "Ruim", f2: "Regular", f3: "Bom", f4: "Ótimo", f5: "Incrível",
    },
    en: {
        brand: "Your feedback", overallQ: "How was your stay", overallSub: "Your opinion shapes the next guests' experience.",
        catsQ: "Rate by item", catsSub: (n: number) => `Tap the stars. Rate at least ${n}.`,
        hlQ: "What stood out?", hlSub: "Pick everything that matches your experience.",
        hlLiked: "What did you like most?", hlImprove: "What can we improve?", other: "Other…", otherPlaceholder: "Tell us",
        recQ: (p: string) => `Would you recommend ${p}?`, recSub: "Almost there!",
        commentLabelPublic: "Want to leave a note?", commentLabelPrivate: "Tell us what we can improve", commentOptional: "(optional)",
        commentPlaceholder: "Write here…",
        continue: "Continue", send: "Send review", chooseFace: "Tap a face",
        thanksTitle: (n: string) => `Thank you, ${n}!`, thanksSub: "Your review was sent to the team. We hope to see you again 🌿",
        recoveryTitle: "Thank you for telling us", recoveryDefault: "We're truly sorry your stay wasn't what you deserved. Thank you for telling us honestly — our team has already been notified, and reception will reach out personally to understand what happened and make it right. Your experience means the world to us. 🌿",
        shareTitle: "Care to share publicly? It helps a lot 💛", google: "Post on Google", booking: "Booking", copied: "We copied your comment — just paste!",
        back: "Back", giftTitle: "A gift for you", home: "Done",
        no: "No", maybe: "Maybe", yes: "Definitely",
        f1: "Bad", f2: "Fair", f3: "Good", f4: "Great", f5: "Amazing",
    },
    es: {
        brand: "Tu opinión", overallQ: "¿Cómo fue tu estadía", overallSub: "Tu opinión moldea la experiencia de los próximos huéspedes.",
        catsQ: "Evalúa por ítem", catsSub: (n: number) => `Toca las estrellas. Evalúa al menos ${n}.`,
        hlQ: "¿Qué se destacó?", hlSub: "Elige todo lo que combine con tu experiencia.",
        hlLiked: "¿Qué te gustó más?", hlImprove: "¿Qué podemos mejorar?", other: "Otro…", otherPlaceholder: "Cuéntanos",
        recQ: (p: string) => `¿Recomendarías ${p}?`, recSub: "¡Casi listo!",
        commentLabelPublic: "¿Quieres dejar un mensaje?", commentLabelPrivate: "Cuéntanos qué podemos mejorar", commentOptional: "(opcional)",
        commentPlaceholder: "Escribe aquí…",
        continue: "Continuar", send: "Enviar evaluación", chooseFace: "Toca una carita",
        thanksTitle: (n: string) => `¡Gracias, ${n}!`, thanksSub: "Tu evaluación fue enviada al equipo. ¡Esperamos verte de nuevo! 🌿",
        recoveryTitle: "Gracias por contarnos", recoveryDefault: "Lamentamos mucho que tu estadía no haya sido lo que merecías. Gracias por contárnoslo con sinceridad — ya avisamos al equipo y recepción se pondrá en contacto personalmente para entender qué pasó y hacer lo posible por corregirlo. Tu experiencia es muy importante para nosotros. 🌿",
        shareTitle: "¿Compartir públicamente? Ayuda mucho 💛", google: "Publicar en Google", booking: "Booking", copied: "Copiamos tu comentario — ¡solo pega!",
        back: "Volver", giftTitle: "Un regalo para ti", home: "Finalizar",
        no: "No", maybe: "Tal vez", yes: "Sin duda",
        f1: "Mala", f2: "Regular", f3: "Buena", f4: "Genial", f5: "Increíble",
    },
};

function Stars({ value, onChange, size = 26 }: { value: number; onChange: (v: number) => void; size?: number }) {
    return (
        <div style={{ display: "flex", gap: 6 }}>
            {[1, 2, 3, 4, 5].map((i) => (
                <button key={i} onClick={() => onChange(i)} style={{ border: "none", background: "transparent", cursor: "pointer", padding: 2, lineHeight: 0 }}>
                    <Icon n="star" s={size} c={i <= value ? "var(--gold)" : "var(--line)"} fill={i <= value ? "var(--gold)" : "none"} w={1.6} />
                </button>
            ))}
        </div>
    );
}

const DISPLAY = "var(--font-portal-display), serif";

export function CuratedSurvey({ stay, property, template, lang }: {
    stay: Stay; property: Property | null; template: SurveyTemplate; lang: Lang;
}) {
    const t = TXT[lang] || TXT.pt;
    const locale = LOCALE[lang] || "pt-BR";
    const config = template.config!;
    const propName = property?.name || "a propriedade";
    const guestFirst = (stay as unknown as { guestName?: string }).guestName?.split(" ")[0]
        || (lang === "en" ? "guest" : lang === "es" ? "huésped" : "hóspede");

    const cats = config.categories ?? [];
    const minCats = Math.min(config.minCategories ?? 3, cats.length || 3);
    const hlPositive = config.highlights?.positive ?? [];
    const hlImprove = config.highlights?.improve ?? [];
    const otherPositive = !!config.highlights?.otherPositive;
    const otherImprove = !!config.highlights?.otherImprove;
    const hasHighlights = hlPositive.length > 0 || hlImprove.length > 0 || otherPositive || otherImprove;

    // monta a sequência de passos conforme a config
    const steps: ("overall" | "categories" | "highlights" | "final")[] = [];
    if (config.overall?.enabled !== false) steps.push("overall");
    if (cats.length) steps.push("categories");
    if (hasHighlights) steps.push("highlights");
    steps.push("final");

    const [idx, setIdx] = React.useState(0);
    const [overall, setOverall] = React.useState(0);
    const [catRatings, setCatRatings] = React.useState<Record<string, number>>({});
    const [highlights, setHighlights] = React.useState<string[]>([]);
    const [otherPosOn, setOtherPosOn] = React.useState(false);
    const [otherPosText, setOtherPosText] = React.useState("");
    const [otherImpOn, setOtherImpOn] = React.useState(false);
    const [otherImpText, setOtherImpText] = React.useState("");
    const [recommend, setRecommend] = React.useState<"no" | "maybe" | "yes" | null>(null);
    const [comment, setComment] = React.useState("");
    const [submitting, setSubmitting] = React.useState(false);
    const [finished, setFinished] = React.useState(false);
    const [copied, setCopied] = React.useState(false);

    const cl = (c: { label: string; label_en?: string; label_es?: string }) =>
        (lang === "en" && c.label_en) || (lang === "es" && c.label_es) || c.label;
    const loc = (obj: Record<string, unknown> | undefined, base: string): string | undefined => {
        if (!obj) return undefined;
        const v = (lang !== "pt" && obj[`${base}_${lang}`]) || obj[base];
        return typeof v === "string" ? v : undefined;
    };

    const step = steps[idx];
    const ratedCount = Object.values(catRatings).filter((v) => v > 0).length;
    const canNext =
        step === "overall" ? overall > 0 :
        step === "categories" ? ratedCount >= minCats :
        step === "final" ? (config.recommend?.enabled === false || !!recommend) :
        true;

    // Detrator vence: "Não", ou impressão geral <=2, ou qualquer categoria <=2
    // (uma estrela baixa importa mais que um "Com certeza" contraditório).
    const anyLowCat = Object.values(catRatings).some((v) => v > 0 && v <= 2);
    const isDetractor = recommend === "no" || (overall > 0 && overall <= 2) || anyLowCat;
    const bucket: "promoter" | "detractor" | "passive" =
        isDetractor ? "detractor" : (recommend === "yes" || overall >= 4) ? "promoter" : "passive";

    const toggleChip = (id: string) => setHighlights((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);

    const chipStyle = (on: boolean): React.CSSProperties => ({ border: on ? "1.5px solid var(--brand)" : "1px solid var(--line)", background: on ? "var(--brand-soft)" : "var(--surface)", color: on ? "var(--brand-deep)" : "var(--ink-soft)", borderRadius: 999, padding: "11px 16px", fontFamily: "inherit", fontSize: 13.5, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 7 });
    const subTitle: React.CSSProperties = { margin: "0 0 10px", fontSize: 12, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--muted)" };
    const otherInput: React.CSSProperties = { width: "100%", boxSizing: "border-box", marginTop: 10, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: "10px 13px", fontFamily: "inherit", fontSize: 14, color: "var(--ink)", outline: "none" };

    const submit = async () => {
        setSubmitting(true);
        const answers: Record<string, unknown> = {};
        if (overall > 0) answers.overall = overall;
        Object.entries(catRatings).forEach(([id, v]) => { if (v > 0) answers[`cat:${id}`] = v; });
        if (recommend) answers.recommend = recommend;
        const chosen: string[] = [];
        [...hlPositive, ...hlImprove].forEach((c) => { if (highlights.includes(c.id)) chosen.push(c.label); });
        if (otherPosOn && otherPosText.trim()) chosen.push(otherPosText.trim());
        if (otherImpOn && otherImpText.trim()) chosen.push(otherImpText.trim());
        if (chosen.length) answers.highlights = chosen;
        if (comment.trim()) answers.comment = comment.trim();
        try {
            const res = await fetch("/api/guest/survey", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ stayId: stay.id, guestId: stay.guestId, templateId: template.id, answers, propertyId: stay.propertyId }),
            });
            // sucesso ou "já respondida" levam à tela final mesmo assim
            await res.json().catch(() => ({}));
        } catch { /* mostra final assim mesmo */ }
        setSubmitting(false);
        setFinished(true);
    };

    const next = () => { if (idx < steps.length - 1) setIdx(idx + 1); else submit(); };

    // Garante esquema absoluto (evita virar caminho relativo do site).
    const normUrl = (u?: string): string | null => {
        const s = (u || "").trim();
        if (!s) return null;
        return /^https?:\/\//i.test(s) ? s : `https://${s}`;
    };
    const reviewUrl = (() => {
        const pid = (config.review?.googlePlaceId || "").trim();
        // Place ID real (ChIJ…) abre a tela de avaliar; CID puramente numérico daria 404
        // no writereview, então abre a ficha do Google; senão, usa a URL completa.
        if (/^[A-Za-z]/.test(pid)) return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(pid)}`;
        const full = normUrl(config.review?.google);
        if (full) return full;
        if (/^\d{5,}$/.test(pid)) return `https://www.google.com/maps?cid=${pid}`;
        return null;
    })();
    const bookingUrl = normUrl(config.review?.booking);
    const publishGoogle = async () => {
        if (comment.trim()) { try { await navigator.clipboard?.writeText(comment.trim()); setCopied(true); setTimeout(() => setCopied(false), 2200); } catch { /* noop */ } }
        if (reviewUrl) window.open(reviewUrl, "_blank");
    };

    const rootStyle: React.CSSProperties = { ...getPortalThemeVars(property), fontFamily: "var(--font-portal-body), system-ui, sans-serif", background: "var(--bg)", color: "var(--ink)", minHeight: "100dvh" };

    /* ---------------- TELA FINAL ---------------- */
    if (finished) {
        const reward = template.reward;
        const rewardDesc = reward?.hasReward ? ((lang === "en" && reward.description_en) || (lang === "es" && reward.description_es) || reward.description) : null;
        return (
            <div style={rootStyle}>
                <div style={{ maxWidth: 448, margin: "0 auto", minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "32px 24px" }}>
                    <div className="portal-pop" style={{ width: 88, height: 88, borderRadius: 28, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24, background: bucket === "detractor" ? "var(--surface-alt)" : "linear-gradient(135deg,#D4A53A,var(--gold))", boxShadow: bucket === "detractor" ? "none" : "0 18px 36px -16px rgba(201,150,47,.8)" }}>
                        <Icon n={bucket === "detractor" ? "message" : "checkcircle"} s={46} c={bucket === "detractor" ? "var(--brand)" : "#fff"} w={2} />
                    </div>
                    {bucket === "detractor" ? (
                        <>
                            <h1 style={{ margin: "0 0 10px", fontFamily: DISPLAY, fontSize: 30, fontWeight: 400, color: "var(--ink)" }}>{t.recoveryTitle}</h1>
                            <p style={{ margin: "0 0 28px", fontSize: 14.5, color: "var(--muted)", maxWidth: 300, lineHeight: 1.55 }}>{loc(config.recovery, "message") || t.recoveryDefault}</p>
                        </>
                    ) : (
                        <>
                            <h1 style={{ margin: "0 0 10px", fontFamily: DISPLAY, fontSize: 30, fontWeight: 400, color: "var(--ink)" }}>{loc(config.thankYou, "title") || t.thanksTitle(guestFirst)}</h1>
                            <p style={{ margin: "0 0 28px", fontSize: 14.5, color: "var(--muted)", maxWidth: 300, lineHeight: 1.55 }}>{loc(config.thankYou, "subtitle") || t.thanksSub}</p>
                        </>
                    )}

                    {bucket === "promoter" && (reviewUrl || bookingUrl) && (
                        <Card pad={16} style={{ width: "100%", marginBottom: 16 }}>
                            <p style={{ margin: "0 0 12px", fontSize: 13.5, color: "var(--ink-soft)", fontWeight: 600, lineHeight: 1.4 }}>{t.shareTitle}</p>
                            <div style={{ display: "flex", gap: 9 }}>
                                {reviewUrl && <GhostBtn icon="star" style={{ flex: 1 }} onClick={publishGoogle}>{t.google}</GhostBtn>}
                                {bookingUrl && <GhostBtn icon="heart" style={{ flex: 1 }} onClick={() => window.open(bookingUrl, "_blank")}>{t.booking}</GhostBtn>}
                            </div>
                            {copied && <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--green)", fontWeight: 600 }}>{t.copied}</p>}
                        </Card>
                    )}

                    {rewardDesc && (
                        <Card pad={16} style={{ width: "100%", marginBottom: 16, background: "var(--gold-soft)", borderColor: "var(--gold)" }}>
                            <Icon n="gift" s={28} c="#8a6512" style={{ margin: "0 auto 8px", display: "block" } as React.CSSProperties} />
                            <div style={{ fontSize: 13.5, fontWeight: 800, color: "#8a6512", marginBottom: 4 }}>{t.giftTitle}</div>
                            <p style={{ margin: 0, fontSize: 13, color: "#8a6512" }}>{rewardDesc}</p>
                        </Card>
                    )}
                </div>
            </div>
        );
    }

    /* ---------------- FLUXO ---------------- */
    return (
        <div style={rootStyle}>
            <div style={{ maxWidth: 448, margin: "0 auto", minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
                {/* header: progresso */}
                <div style={{ padding: "calc(14px + env(safe-area-inset-top)) 18px 12px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                    {idx > 0 && <IconBtn n="arrowleft" tone="soft" size={38} onClick={() => setIdx(idx - 1)} />}
                    <div style={{ flex: 1, display: "flex", gap: 5 }}>
                        {steps.map((_, i) => (
                            <div key={i} style={{ height: 4, flex: 1, borderRadius: 99, background: i <= idx ? "var(--brand)" : "var(--line)", transition: "background .3s" }} />
                        ))}
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>{idx + 1}/{steps.length}</span>
                </div>

                <div style={{ flex: 1, overflowY: "auto", padding: "8px 22px 24px" }}>
                    {/* OVERALL */}
                    {step === "overall" && (
                        <div className="portal-fade-up" style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", paddingTop: 20 }}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 800, color: "var(--brand)", background: "var(--brand-soft)", padding: "5px 12px", borderRadius: 999, letterSpacing: ".04em", textTransform: "uppercase" }}><Icon n="leaf" s={14} c="var(--brand)" />{propName}</span>
                            <h1 style={{ margin: "20px 0 8px", fontFamily: DISPLAY, fontSize: 30, fontWeight: 400, color: "var(--ink)", lineHeight: 1.1 }}>{t.overallQ}, {guestFirst}?</h1>
                            <p style={{ margin: "0 0 30px", fontSize: 14, color: "var(--muted)", maxWidth: 280, lineHeight: 1.5 }}>{t.overallSub}</p>
                            <div style={{ display: "flex", justifyContent: "center", gap: 6, width: "100%" }}>
                                {[{ v: 1, e: "😞", l: t.f1 }, { v: 2, e: "😕", l: t.f2 }, { v: 3, e: "🙂", l: t.f3 }, { v: 4, e: "😃", l: t.f4 }, { v: 5, e: "🤩", l: t.f5 }].map((f) => (
                                    <button key={f.v} onClick={() => setOverall(f.v)} style={{ flex: 1, border: overall === f.v ? "2px solid var(--brand)" : "1px solid var(--line)", background: overall === f.v ? "var(--surface)" : "var(--surface-alt)", borderRadius: 16, padding: "13px 4px", cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: 5, transform: overall === f.v ? "scale(1.06)" : "scale(1)", transition: "transform .15s" }}>
                                        <span style={{ fontSize: 26, filter: overall === f.v ? "none" : "grayscale(.5)", opacity: overall === f.v ? 1 : .6 }}>{f.e}</span>
                                        <span style={{ fontSize: 9.5, fontWeight: 700, color: overall === f.v ? "var(--brand)" : "var(--muted)" }}>{f.l}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* CATEGORIES */}
                    {step === "categories" && (
                        <div className="portal-fade-up">
                            <h2 style={{ margin: "10px 0 6px", fontSize: 23, fontWeight: 800, letterSpacing: "-.02em", color: "var(--ink)" }}>{t.catsQ}</h2>
                            <p style={{ margin: "0 0 22px", fontSize: 13.5, color: "var(--muted)" }}>{t.catsSub(minCats)}</p>
                            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                                {cats.map((c) => (
                                    <Card key={c.id} pad={14} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                        <div style={{ width: 38, height: 38, borderRadius: 11, background: "var(--surface-alt)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon n={c.icon || "sparkle"} s={19} c="var(--brand)" /></div>
                                        <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>{cl(c)}</span>
                                        <Stars value={catRatings[c.id] || 0} onChange={(v) => setCatRatings((p) => ({ ...p, [c.id]: v }))} size={22} />
                                    </Card>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* HIGHLIGHTS — dois grupos rotulados + chip "Outro" (texto livre) */}
                    {step === "highlights" && (
                        <div className="portal-fade-up">
                            <h2 style={{ margin: "10px 0 6px", fontSize: 23, fontWeight: 800, letterSpacing: "-.02em", color: "var(--ink)" }}>{t.hlQ}</h2>
                            <p style={{ margin: "0 0 22px", fontSize: 13.5, color: "var(--muted)" }}>{t.hlSub}</p>

                            {(hlPositive.length > 0 || otherPositive) && (
                                <div style={{ marginBottom: 18 }}>
                                    <h3 style={subTitle}>{t.hlLiked}</h3>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 9 }}>
                                        {hlPositive.map((c: SurveyChip) => { const on = highlights.includes(c.id); return (
                                            <button key={c.id} onClick={() => toggleChip(c.id)} style={chipStyle(on)}>{on && <Icon n="check" s={15} c="var(--brand)" w={2.5} />}{cl(c)}</button>
                                        ); })}
                                        {otherPositive && <button onClick={() => setOtherPosOn(v => !v)} style={chipStyle(otherPosOn)}>{otherPosOn && <Icon n="check" s={15} c="var(--brand)" w={2.5} />}{t.other}</button>}
                                    </div>
                                    {otherPositive && otherPosOn && <input value={otherPosText} onChange={(e) => setOtherPosText(e.target.value)} placeholder={t.otherPlaceholder} style={otherInput} />}
                                </div>
                            )}

                            {(hlImprove.length > 0 || otherImprove) && (
                                <div>
                                    <h3 style={subTitle}>{t.hlImprove}</h3>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 9 }}>
                                        {hlImprove.map((c: SurveyChip) => { const on = highlights.includes(c.id); return (
                                            <button key={c.id} onClick={() => toggleChip(c.id)} style={chipStyle(on)}>{on && <Icon n="check" s={15} c="var(--brand)" w={2.5} />}{cl(c)}</button>
                                        ); })}
                                        {otherImprove && <button onClick={() => setOtherImpOn(v => !v)} style={chipStyle(otherImpOn)}>{otherImpOn && <Icon n="check" s={15} c="var(--brand)" w={2.5} />}{t.other}</button>}
                                    </div>
                                    {otherImprove && otherImpOn && <input value={otherImpText} onChange={(e) => setOtherImpText(e.target.value)} placeholder={t.otherPlaceholder} style={otherInput} />}
                                </div>
                            )}
                        </div>
                    )}

                    {/* FINAL: recommend + comment */}
                    {step === "final" && (
                        <div className="portal-fade-up">
                            <h2 style={{ margin: "10px 0 6px", fontSize: 23, fontWeight: 800, letterSpacing: "-.02em", color: "var(--ink)" }}>{t.recSub}</h2>
                            {config.recommend?.enabled !== false && (
                                <>
                                    <p style={{ margin: "0 0 18px", fontSize: 13.5, color: "var(--muted)" }}>{t.recQ(propName)}</p>
                                    <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
                                        {[{ v: "no" as const, e: "🙁", l: t.no }, { v: "maybe" as const, e: "😐", l: t.maybe }, { v: "yes" as const, e: "💚", l: t.yes }].map((o) => (
                                            <button key={o.v} onClick={() => setRecommend(o.v)} style={{ flex: 1, border: recommend === o.v ? "2px solid var(--brand)" : "1px solid var(--line)", background: recommend === o.v ? "var(--surface)" : "var(--surface-alt)", borderRadius: 15, padding: "14px 6px", cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                                                <span style={{ fontSize: 22 }}>{o.e}</span>
                                                <span style={{ fontSize: 12, fontWeight: 700, color: recommend === o.v ? "var(--brand)" : "var(--ink-soft)" }}>{o.l}</span>
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                            {config.comment?.enabled !== false && (
                                <>
                                    <label style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", display: "block", marginBottom: 9 }}>
                                        {recommend === "no" ? t.commentLabelPrivate : (loc(config.comment, "prompt") || t.commentLabelPublic)} <span style={{ color: "var(--muted)", fontWeight: 500 }}>{t.commentOptional}</span>
                                    </label>
                                    <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={4} placeholder={t.commentPlaceholder} style={{ width: "100%", boxSizing: "border-box", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 16, padding: 14, fontFamily: "inherit", fontSize: 14, color: "var(--ink)", resize: "none", outline: "none" }} />
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* footer CTA */}
                <div style={{ padding: "12px 22px calc(16px + env(safe-area-inset-bottom))", flexShrink: 0, background: "linear-gradient(to top, var(--bg) 70%, transparent)" }}>
                    <PrimaryBtn onClick={next} disabled={!canNext || submitting} icon={idx === steps.length - 1 ? "checkcircle" : "arrowright"}>
                        {idx === steps.length - 1 ? t.send : step === "overall" && overall === 0 ? t.chooseFace : t.continue}
                    </PrimaryBtn>
                </div>
            </div>
        </div>
    );
}
