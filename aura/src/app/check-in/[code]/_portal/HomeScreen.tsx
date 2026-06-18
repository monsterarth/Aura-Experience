"use client";

import React from "react";
import { Icon, Card, SectionTitle, toneColor, toneBg } from "./ui";
import { usePortal } from "./context";

const LOCALE: Record<string, string> = { pt: "pt-BR", en: "en-US", es: "es-ES" };

interface TimelineItem {
    id: string; icon: string; tone: string; time: string; title: string; body: string; cta: string;
    urgent?: boolean; onAction: () => void;
}

function StayProgress({ nights, current }: { nights: number; current: number }) {
    return (
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            {Array.from({ length: nights }).map((_, i) => (
                <div key={i} style={{ height: 4, flex: 1, borderRadius: 99, background: i < current ? "rgba(255,255,255,.92)" : "rgba(255,255,255,.32)" }} />
            ))}
        </div>
    );
}

function TodayCard({ item }: { item: TimelineItem }) {
    const c = toneColor[item.tone] || toneColor.brand;
    const bg = toneBg[item.tone] || toneBg.brand;
    return (
        <Card pad={0} style={{ overflow: "hidden", borderColor: item.urgent ? "var(--brand)" : "var(--line)", boxShadow: item.urgent ? "0 14px 30px -16px rgba(110,70,33,.5)" : "var(--sh-xs)" }}>
            <div style={{ display: "flex", gap: 13, padding: 15 }}>
                <div style={{ width: 44, height: 44, borderRadius: 13, background: bg, color: c, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, position: "relative" }}>
                    <Icon n={item.icon} s={22} c={c} />
                    {item.urgent && <span className="portal-pulse-dot" style={{ position: "absolute", top: -3, right: -3, width: 11, height: 11, borderRadius: 99, background: "var(--clay)", border: "2px solid var(--surface)" }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".05em", color: c, textTransform: "uppercase" }}>{item.time}</span>
                    <h3 style={{ margin: "2px 0 0", fontSize: 15.5, fontWeight: 700, color: "var(--ink)", letterSpacing: "-.01em", lineHeight: 1.25 }}>{item.title}</h3>
                    <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.4 }}>{item.body}</p>
                    <button onClick={item.onAction} style={{ marginTop: 11, border: "none", background: item.urgent ? "var(--brand)" : "var(--surface-alt)", color: item.urgent ? "#fff" : "var(--brand-deep)", borderRadius: 11, padding: "9px 14px", fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
                        {item.cta}<Icon n="arrowright" s={15} c={item.urgent ? "#fff" : "var(--brand)"} />
                    </button>
                </div>
            </div>
        </Card>
    );
}

function QuickAction({ icon, label, sub, tone, onClick }: {
    icon: string; label: string; sub: string; tone: string; onClick: () => void;
}) {
    return (
        <button onClick={onClick} style={{ textAlign: "left", border: "1px solid var(--line)", background: "var(--surface)", borderRadius: 20, padding: 15, cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", gap: 11, boxShadow: "var(--sh-xs)" }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: toneBg[tone] || toneBg.brand, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon n={icon} s={21} c={toneColor[tone] || toneColor.brand} />
            </div>
            <div>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--ink)", letterSpacing: "-.01em" }}>{label}</div>
                <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 1 }}>{sub}</div>
            </div>
        </button>
    );
}

export function HomeScreen() {
    const { stay, property, code, lang, t, go, push, openSheet, dnd } = usePortal();
    const locale = LOCALE[lang] || "pt-BR";

    const cabinName = (stay as unknown as { cabinName?: string }).cabinName || property?.name || t.accommodation;
    const guestName = (stay as unknown as { guestName?: string }).guestName;
    const firstName = guestName ? guestName.split(" ")[0] : "";

    const hour = new Date().getHours();
    const greeting = hour < 12 ? t.goodMorning : hour < 18 ? t.goodAfternoon : t.goodEvening;

    const checkIn = stay.checkIn ? new Date(stay.checkIn) : null;
    const checkOut = stay.checkOut ? new Date(stay.checkOut) : null;
    const nights = checkIn && checkOut ? Math.max(1, Math.round((checkOut.getTime() - checkIn.getTime()) / 86400000)) : 1;
    const elapsed = checkIn ? Math.floor((Date.now() - checkIn.getTime()) / 86400000) : 0;
    const currentNight = Math.min(nights, Math.max(1, elapsed + 1));
    const checkoutDate = checkOut ? checkOut.toLocaleDateString(locale, { day: "2-digit", month: "short" }) : "";
    const checkoutTime = checkOut ? checkOut.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) : "12:00";

    const fbEnabled = !!property?.settings?.fbSettings?.breakfast?.enabled &&
        ["delivery", "buffet", "both"].includes(property?.settings?.fbSettings?.breakfast?.modality ?? "");

    // ---- Timeline "Sua jornada hoje" (camada Aura, a partir de dados reais) ----
    const today: TimelineItem[] = [];
    if (fbEnabled) {
        today.push({ id: "cafe", icon: "coffee", tone: "brand", urgent: true, time: t.qaBreakfast, title: t.tlBreakfastTitle, body: t.tlBreakfastBody, cta: t.tlBreakfastCta, onAction: () => push(`/check-in/${code}/breakfast`) });
    }
    if (dnd.on) {
        today.push({ id: "dnd", icon: "moon", tone: "gold", time: t.dndRow, title: t.tlDndTitle, body: t.tlDndBody.replace("{time}", dnd.until ? new Date(dnd.until).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) : "—"), cta: t.tlDndCta, onAction: () => go("stay") });
    }
    today.push({ id: "checkout", icon: "clock", tone: "neutral", time: t.checkout, title: t.tlCheckoutTitle.replace("{time}", checkoutTime), body: t.tlCheckoutBody, cta: t.tlCheckoutCta, onAction: () => openSheet("latecheckout") });
    today.push({ id: "explore", icon: "compass", tone: "green", time: "Hoje", title: t.tlExploreTitle, body: t.tlExploreBody, cta: t.tlExploreCta, onAction: () => go("explore") });

    return (
        <div style={{ padding: "8px 18px 28px", display: "flex", flexDirection: "column", gap: 24 }}>
            {/* Hero */}
            <div style={{ position: "relative", borderRadius: 26, overflow: "hidden", padding: 20, color: "#fff", boxShadow: "0 22px 44px -22px rgba(63,44,20,.6)", background: "linear-gradient(150deg, var(--brand) 0%, var(--brand-deep) 100%)" }}>
                <div style={{ position: "absolute", inset: 0, opacity: .13, backgroundImage: "radial-gradient(circle at 1.5px 1.5px, #fff 1px, transparent 0)", backgroundSize: "13px 13px" }} />
                <div style={{ position: "absolute", right: -28, top: -22, opacity: .14 }}><Icon n="leaf" s={150} c="#fff" w={1} /></div>
                <div style={{ position: "relative" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                            <Icon n="binoculars" s={18} c="rgba(255,255,255,.85)" />
                            <span style={{ fontFamily: "var(--font-portal-display), serif", fontSize: 21, letterSpacing: ".01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{property?.name || "Aura"}</span>
                        </div>
                    </div>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, opacity: .82, letterSpacing: ".02em" }}>{greeting}{firstName ? `, ${firstName}` : ""} ☀</p>
                    <h1 style={{ margin: "3px 0 0", fontSize: 30, fontWeight: 800, letterSpacing: "-.02em", lineHeight: 1.02 }}>{cabinName}</h1>
                    <p style={{ margin: "5px 0 16px", fontSize: 13, opacity: .82 }}>
                        {checkIn ? checkIn.toLocaleDateString(locale, { day: "2-digit", month: "short" }) : ""}
                        {checkIn && checkOut ? " – " : ""}
                        {checkoutDate}
                    </p>
                    <StayProgress nights={nights} current={currentNight} />
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 9, fontSize: 12, opacity: .9 }}>
                        <span style={{ fontWeight: 600 }}>{t.night} {currentNight} {t.of} {nights}</span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Icon n="calendar" s={13} c="#fff" />{t.checkout} {checkoutDate} · {checkoutTime}</span>
                    </div>
                </div>
            </div>

            {/* Aura sugere — timeline Hoje */}
            <div>
                <SectionTitle right={<span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: "var(--brand)", background: "var(--brand-soft)", padding: "4px 9px", borderRadius: 999 }}><Icon n="sparkle" s={13} c="var(--brand)" />Aura</span>}>{t.journeyToday}</SectionTitle>
                <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                    {today.map((it) => <TodayCard key={it.id} item={it} />)}
                </div>
            </div>

            {/* Ações rápidas */}
            <div>
                <SectionTitle>{t.quickAccess}</SectionTitle>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11 }}>
                    {fbEnabled ? (
                        <QuickAction icon="coffee" label={t.qaBreakfast} sub={t.qaBreakfastSub} tone="brand" onClick={() => push(`/check-in/${code}/breakfast`)} />
                    ) : (
                        <QuickAction icon="ticket" label={t.eventsFull} sub={t.eventsFullSub} tone="brand" onClick={() => push(`/check-in/${code}/events`)} />
                    )}
                    <QuickAction icon="calendar" label={t.qaSchedule} sub={t.qaScheduleSub} tone="green" onClick={() => push(`/check-in/${code}/structures`)} />
                    <QuickAction icon="bell" label={t.qaConcierge} sub={t.qaConciergeSub} tone="gold" onClick={() => push(`/check-in/${code}/concierge`)} />
                    <QuickAction icon="map" label={t.qaMap} sub={t.qaMapSub} tone="clay" onClick={() => go("explore")} />
                </div>
            </div>

            {/* Chave + Wi-Fi atalho */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11 }}>
                <Card onClick={() => openSheet("access")} pad={15} style={{ cursor: "pointer", display: "flex", flexDirection: "column", gap: 9 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <Icon n="key" s={20} c="var(--brand)" />
                        <Icon n="chevright" s={16} c="var(--faint)" />
                    </div>
                    <div>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)" }}>{t.keyAccess}</div>
                        <div style={{ fontSize: 11, color: "var(--muted)" }}>{t.keyAccessSub}</div>
                    </div>
                </Card>
                <Card onClick={() => openSheet("wifi")} pad={15} style={{ cursor: "pointer", display: "flex", flexDirection: "column", gap: 9 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <Icon n="wifi" s={20} c="var(--green)" />
                        <Icon n="chevright" s={16} c="var(--faint)" />
                    </div>
                    <div>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)" }}>{t.wifiShort}</div>
                        <div style={{ fontSize: 11, color: "var(--muted)" }}>{t.wifiShortSub}</div>
                    </div>
                </Card>
            </div>

            {/* Fale com a recepção */}
            <button onClick={() => openSheet("contact")} style={{ width: "100%", border: "1px solid var(--line)", background: "var(--surface)", borderRadius: 18, padding: "14px 18px", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 13, boxShadow: "var(--sh-xs)" }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: "var(--green-soft)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon n="message" s={20} c="var(--green)" /></div>
                <div style={{ textAlign: "left", flex: 1 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--ink)" }}>{t.talkReception}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>{t.talkReceptionSub}</div>
                </div>
                <Icon n="arrowright" s={18} c="var(--brand)" />
            </button>

            <div style={{ textAlign: "center", opacity: .55, marginTop: 2 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", letterSpacing: ".02em" }}>{t.poweredBy} <b style={{ color: "var(--ink-soft)" }}>aura</b></span>
            </div>
        </div>
    );
}
