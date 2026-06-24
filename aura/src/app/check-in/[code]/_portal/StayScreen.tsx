"use client";

import React from "react";
import { Icon, Card, SectionTitle, PrimaryBtn, Avatar, toneColor, toneBg } from "./ui";
import { usePortal, type Lang } from "./context";

const LOCALE: Record<string, string> = { pt: "pt-BR", en: "en-US", es: "es-ES" };

function RowItem({ icon, tone = "brand", title, sub, right, onClick, danger }: {
    icon: string; tone?: string; title: string; sub?: string; right?: React.ReactNode; onClick?: () => void; danger?: boolean;
}) {
    return (
        <button onClick={onClick} style={{ width: "100%", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 13, padding: "12px 14px" }}>
            <div style={{ width: 38, height: 38, borderRadius: 11, background: toneBg[tone] || toneBg.brand, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon n={icon} s={19} c={toneColor[tone] || toneColor.brand} /></div>
            <div style={{ flex: 1, textAlign: "left", minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: danger ? "var(--clay)" : "var(--ink)", letterSpacing: "-.01em" }}>{title}</div>
                {sub && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>}
            </div>
            {right || <Icon n="chevright" s={17} c="var(--faint)" />}
        </button>
    );
}

function Divider() { return <div style={{ height: 1, background: "var(--line)", margin: "0 14px 0 65px" }} />; }

export function StayScreen() {
    const { stay, property, code, lang, setLang, t, openSheet, push, go, dnd, handleDnd } = usePortal();
    const locale = LOCALE[lang] || "pt-BR";

    const cabinName = (stay as unknown as { cabinName?: string }).cabinName || property?.name || t.accommodation;
    const guestName = (stay as unknown as { guestName?: string }).guestName;

    const guests: { name: string }[] = [];
    if (guestName) guests.push({ name: guestName });
    (stay.additionalGuests || []).forEach((g) => { if (g.fullName) guests.push({ name: g.fullName }); });

    const checkIn = stay.checkIn ? new Date(stay.checkIn).toLocaleDateString(locale, { day: "2-digit", month: "short" }) : "";
    const checkInTime = stay.checkIn ? new Date(stay.checkIn).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) : "";
    const checkOut = stay.checkOut ? new Date(stay.checkOut).toLocaleDateString(locale, { day: "2-digit", month: "short" }) : "";
    const checkOutTime = stay.checkOut ? new Date(stay.checkOut).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) : "";

    const dndUntilLabel = dnd.until ? new Date(dnd.until).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) : "";

    const toggleDnd = () => { if (dnd.on) handleDnd(null); else openSheet("dnd"); };

    const avatarTones = ["brand", "green", "gold"];

    return (
        <div style={{ padding: "8px 18px 28px", display: "flex", flexDirection: "column", gap: 20 }}>
            {/* header + idioma */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                <div>
                    <h1 style={{ margin: "4px 2px 3px", fontSize: 27, fontWeight: 800, letterSpacing: "-.02em", color: "var(--ink)" }}>{t.stayTitle}</h1>
                    {guestName && <p style={{ margin: "0 2px", fontSize: 13.5, color: "var(--muted)" }}>{guestName}</p>}
                </div>
                <div style={{ display: "flex", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 11, padding: 3, gap: 2 }}>
                    {(["pt", "en", "es"] as Lang[]).map((l) => (
                        <button key={l} onClick={() => setLang(l)} style={{ border: "none", cursor: "pointer", fontFamily: "inherit", padding: "5px 8px", borderRadius: 8, fontSize: 11, fontWeight: 800, textTransform: "uppercase", background: lang === l ? "var(--brand)" : "transparent", color: lang === l ? "#fff" : "var(--muted)" }}>{l}</button>
                    ))}
                </div>
            </div>

            {/* resumo da reserva */}
            <Card pad={0} style={{ overflow: "hidden" }}>
                <div style={{ background: "linear-gradient(145deg,var(--brand),var(--brand-deep))", padding: 17, color: "#fff", position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", right: -18, top: -18, opacity: .14 }}><Icon n="home" s={110} c="#fff" w={1.2} /></div>
                    <div style={{ position: "relative" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, opacity: .8, letterSpacing: ".06em", textTransform: "uppercase" }}>{t.accommodation}</div>
                        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.01em", marginTop: 2 }}>{cabinName}</div>
                    </div>
                </div>
                <div style={{ padding: 15, display: "flex", flexDirection: "column", gap: 13 }}>
                    {(guests.length > 0 || stay.hasPet) && (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {guests.map((g, i) => (
                                <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--surface-alt)", borderRadius: 999, padding: "5px 11px 5px 6px", fontSize: 12, fontWeight: 600, color: "var(--ink-soft)" }}>
                                    <Avatar name={g.name ?? ""} size={22} tone={avatarTones[i % avatarTones.length]} />{g.name?.split(" ")[0] ?? ""}
                                </span>
                            ))}
                            {stay.hasPet && <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--gold-soft)", borderRadius: 999, padding: "5px 12px", fontSize: 12, fontWeight: 700, color: "#8a6512" }}><Icon n="paw" s={15} c="#8a6512" />{t.petLabel}</span>}
                        </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--line)", paddingTop: 13 }}>
                        <div><div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".05em" }}>{t.checkin}</div><div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", marginTop: 2 }}>{checkIn}{checkInTime ? ` · ${checkInTime}` : ""}</div></div>
                        <div style={{ textAlign: "right" }}><div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".05em" }}>{t.checkout}</div><div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", marginTop: 2 }}>{checkOut}{checkOutTime ? ` · ${checkOutTime}` : ""}</div></div>
                    </div>
                </div>
            </Card>

            {/* avaliar — destaque */}
            <button onClick={() => push(`/feedback/${stay.id}`)} style={{ width: "100%", border: "none", cursor: "pointer", fontFamily: "inherit", borderRadius: 20, padding: 16, background: "linear-gradient(135deg,#D4A53A,var(--gold))", color: "#fff", display: "flex", alignItems: "center", gap: 13, boxShadow: "0 14px 30px -16px rgba(201,150,47,.8)" }}>
                <div style={{ width: 44, height: 44, borderRadius: 13, background: "rgba(255,255,255,.22)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon n="star" s={22} c="#fff" fill="#fff" /></div>
                <div style={{ flex: 1, textAlign: "left" }}>
                    <div style={{ fontSize: 15.5, fontWeight: 800, letterSpacing: "-.01em" }}>{t.rateStay}</div>
                    <div style={{ fontSize: 12, opacity: .9 }}>{t.rateStaySub}</div>
                </div>
                <Icon n="arrowright" s={20} c="#fff" />
            </button>

            {/* essenciais */}
            <div>
                <SectionTitle>{t.essentials}</SectionTitle>
                <Card pad={0}>
                    <RowItem icon="key" tone="brand" title={t.keyAccess} sub={t.keyAccessSub} onClick={() => openSheet("access")} />
                    <Divider />
                    <RowItem icon="wifi" tone="green" title={t.wifiShort} sub={t.wifiShortSub} onClick={() => openSheet("wifi")} />
                    <Divider />
                    <RowItem icon="map" tone="clay" title={t.mapRow} sub={t.mapRowSub} onClick={() => go("explore")} />
                </Card>
            </div>

            {/* serviços do quarto */}
            <div>
                <SectionTitle>{t.roomServices}</SectionTitle>
                <Card pad={0}>
                    <RowItem icon="moon" tone="gold" title={t.dndRow} sub={dnd.on ? t.dndOnSub.replace("{time}", dndUntilLabel) : t.dndOffSub} onClick={toggleDnd}
                        right={<span style={{ position: "relative", width: 46, height: 27, borderRadius: 99, background: dnd.on ? "var(--gold)" : "var(--line)", transition: "background .2s", flexShrink: 0 }}>
                            <span style={{ position: "absolute", top: 3, left: dnd.on ? 22 : 3, width: 21, height: 21, borderRadius: 99, background: "#fff", transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }} />
                        </span>} />
                    <Divider />
                    <RowItem icon="flag" tone="danger" danger title={t.reportRow} sub={t.reportRowSub} onClick={() => openSheet("report")} />
                </Card>
            </div>

            {/* guias & informações (políticas reais da propriedade) */}
            <div>
                <SectionTitle>{t.guidesInfo}</SectionTitle>
                <Card pad={0}>
                    <RowItem icon="home" tone="brand" title={t.guideRules} sub={t.guideRulesSub} onClick={() => openSheet("guide", "rules")} />
                    {stay.hasPet && <><Divider /><RowItem icon="paw" tone="gold" title={t.guidePet} sub={t.guidePetSub} onClick={() => openSheet("guide", "pet")} /></>}
                    <Divider />
                    <RowItem icon="shield" tone="green" title={t.guidePrivacy} sub={t.guidePrivacySub} onClick={() => openSheet("guide", "privacy")} />
                </Card>
            </div>

            {/* late checkout */}
            <Card onClick={() => openSheet("latecheckout")} pad={15} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 13 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: "var(--brand-soft)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon n="clock" s={20} c="var(--brand)" /></div>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>{t.lateRow}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>{t.lateRowSub}</div>
                </div>
                <Icon n="chevright" s={17} c="var(--faint)" />
            </Card>

            <PrimaryBtn icon="message" tone="ink" onClick={() => openSheet("contact")}>{t.talkReception}</PrimaryBtn>

            <div style={{ textAlign: "center", opacity: .55 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)" }}>{t.poweredBy} <b style={{ color: "var(--ink-soft)" }}>aura</b></span>
            </div>
        </div>
    );
}
