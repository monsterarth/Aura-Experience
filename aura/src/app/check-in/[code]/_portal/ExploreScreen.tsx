"use client";

import React from "react";
import { Icon, Card, Chip, Photo, Tag, PrimaryBtn } from "./ui";
import { usePortal, type Lang } from "./context";
import { EventService } from "@/services/event-service";
import { StructureService } from "@/services/structure-service";
import type { Event, Structure } from "@/types/aura";
import { formatEventDate, isToday, eventTitle, eventPrice } from "./eventHelpers";

/* ============================================================
   Portal do Hóspede — TELA EXPLORAR (Fase 3)
   Mapa (preview) · Áreas agendáveis (catálogo real → rota de
   booking existente) · Eventos (lista real + sheet de detalhe).
   ============================================================ */

const EXP = {
    pt: { areas: "Áreas", eventos: "Eventos", hint: "Tudo já vem no nome da sua reserva — escolha o horário na tela de agendamento.", book: "Agendar", today: "Hoje", noEvents: "Nenhum evento por enquanto", noEventsSub: "Novidades chegam em breve.", noAreas: "Nenhuma área disponível no momento.", openMap: "Abrir mapa", youHere: "Você está aqui" },
    en: { areas: "Areas", eventos: "Events", hint: "It's all included in your booking — just pick a time on the scheduling screen.", book: "Book", today: "Today", noEvents: "No events right now", noEventsSub: "New events coming soon.", noAreas: "No areas available right now.", openMap: "Open map", youHere: "You are here" },
    es: { areas: "Áreas", eventos: "Eventos", hint: "Todo viene incluido en tu reserva — solo elige el horario en la pantalla de reservas.", book: "Reservar", today: "Hoy", noEvents: "Sin eventos por ahora", noEventsSub: "Novedades próximamente.", noAreas: "No hay áreas disponibles ahora.", openMap: "Abrir mapa", youHere: "Estás aquí" },
};

const CAT_VISUAL: Record<string, { icon: string; tone: string }> = {
    spa: { icon: "spa", tone: "plum" },
    sport: { icon: "compass", tone: "brand" },
    leisure: { icon: "waves", tone: "green" },
    service: { icon: "bell", tone: "gold" },
};
function catVisual(cat: string) { return CAT_VISUAL[cat] || { icon: "leaf", tone: "brand" }; }

function structureName(s: Structure, lang: Lang): string {
    if (lang === "en" && s.name_en) return s.name_en;
    if (lang === "es" && s.name_es) return s.name_es;
    return s.name;
}
function structureDesc(s: Structure, lang: Lang): string {
    if (lang === "en" && s.description_en) return s.description_en;
    if (lang === "es" && s.description_es) return s.description_es;
    return s.description;
}

function MiniMap({ onOpen, label }: { onOpen: () => void; label: string }) {
    const dots = [{ x: 46, y: 54, you: true }, { x: 58, y: 42 }, { x: 64, y: 58 }, { x: 38, y: 40 }, { x: 74, y: 70 }];
    return (
        <button onClick={onOpen} style={{ width: "100%", border: "1px solid var(--line)", borderRadius: 22, overflow: "hidden", cursor: "pointer", padding: 0, fontFamily: "inherit", boxShadow: "var(--sh-sm)", display: "block", position: "relative" }}>
            <div style={{ height: 170, position: "relative", background: "linear-gradient(160deg, #BFD0A8 0%, #A9C28E 40%, #8FAE72 100%)" }}>
                <div style={{ position: "absolute", right: "8%", bottom: "10%", width: "40%", height: "42%", borderRadius: "46% 54% 60% 40%", background: "linear-gradient(160deg,#7FB0C9,#5E94B0)", opacity: .9 }} />
                <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: .5 }} viewBox="0 0 100 100" preserveAspectRatio="none">
                    <path d="M10 80 Q40 60 50 54 T90 30" stroke="#fff" strokeWidth="1.6" fill="none" strokeDasharray="3 3" strokeLinecap="round" />
                </svg>
                {dots.map((d, i) => (
                    <div key={i} style={{ position: "absolute", left: `${d.x}%`, top: `${d.y}%`, transform: "translate(-50%,-50%)" }}>
                        {d.you ? <div style={{ width: 16, height: 16, borderRadius: 99, background: "var(--gold)", border: "3px solid #fff", boxShadow: "0 2px 6px rgba(0,0,0,.3)" }} /> : <div style={{ width: 9, height: 9, borderRadius: 99, background: "var(--brand)", border: "2px solid #fff" }} />}
                    </div>
                ))}
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(40,30,15,.45), transparent 55%)" }} />
                <div style={{ position: "absolute", left: 16, bottom: 13, color: "#fff", fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", opacity: .9 }}>{label}</div>
                <div style={{ position: "absolute", right: 14, bottom: 13, display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,.92)", color: "var(--brand-deep)", borderRadius: 999, padding: "8px 13px", fontSize: 12.5, fontWeight: 700 }}>
                    <Icon n="map" s={15} c="var(--brand)" />
                </div>
            </div>
        </button>
    );
}

function AreaCard({ s, lang, bookLabel, onBook }: { s: Structure; lang: Lang; bookLabel: string; onBook: () => void }) {
    const v = catVisual(s.category);
    const hours = s.operatingHours ? `${s.operatingHours.openTime}–${s.operatingHours.closeTime}` : "";
    return (
        <Card pad={0} style={{ overflow: "hidden" }}>
            {s.imageUrl ? (
                <div style={{ height: 108, position: "relative" }}>
                    <img src={s.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    {hours && <div style={{ position: "absolute", left: 12, bottom: 11, color: "#fff", fontSize: 12, fontWeight: 700, textShadow: "0 1px 6px rgba(0,0,0,.4)" }}>{hours}</div>}
                </div>
            ) : (
                <Photo icon={v.icon} h={108} tone={v.tone} label={hours} />
            )}
            <div style={{ padding: 15 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--ink)", letterSpacing: "-.01em" }}>{structureName(s, lang)}</h3>
                {structureDesc(s, lang) && <p style={{ margin: "3px 0 0", fontSize: 12.5, color: "var(--muted)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{structureDesc(s, lang)}</p>}
                <div style={{ marginTop: 12 }}>
                    <PrimaryBtn icon="calendar" onClick={onBook} style={{ padding: "12px 16px", fontSize: 14 }}>{bookLabel}</PrimaryBtn>
                </div>
            </div>
        </Card>
    );
}

function EventRow({ ev, lang, todayLabel, onOpen }: { ev: Event; lang: Lang; todayLabel: string; onOpen: () => void }) {
    const tone = ev.type === "external" ? "plum" : "brand";
    const when = `${formatEventDate(ev.startDate, ev.endDate, lang)}${ev.startTime ? ` · ${ev.startTime}` : ""}`;
    return (
        <button onClick={onOpen} style={{ width: "100%", border: "1px solid var(--line)", background: "var(--surface)", borderRadius: 18, padding: 13, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 13, boxShadow: "var(--sh-xs)" }}>
            <div style={{ width: 46, height: 46, borderRadius: 13, background: `var(--${tone === "plum" ? "plum" : "brand"}-soft, #E8DCE6)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
                {ev.imageUrl ? <img src={ev.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Icon n="ticket" s={22} c={tone === "plum" ? "var(--plum)" : "var(--brand)"} />}
            </div>
            <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: tone === "plum" ? "var(--plum)" : "var(--brand)", letterSpacing: ".04em", textTransform: "uppercase" }}>{when}</span>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--ink)", letterSpacing: "-.01em", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{eventTitle(ev, lang)}</div>
                <div style={{ fontSize: 12, color: "var(--muted)", display: "inline-flex", alignItems: "center", gap: 4, marginTop: 1 }}>
                    {ev.location ? <><Icon n="pin" s={12} c="var(--muted)" />{ev.location}</> : eventPrice(ev, lang)}
                </div>
            </div>
            {isToday(ev.startDate) ? <Tag tone="green">{todayLabel}</Tag> : <Icon n="chevright" s={18} c="var(--faint)" />}
        </button>
    );
}

export function ExploreScreen() {
    const { stay, code, lang, t, push, openSheet } = usePortal();
    const L = EXP[lang] || EXP.pt;

    const [events, setEvents] = React.useState<Event[]>([]);
    const [structures, setStructures] = React.useState<Structure[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [sub, setSub] = React.useState<"areas" | "eventos">("areas");

    React.useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const today = new Date().toISOString().split("T")[0];
                const [evs, strs] = await Promise.all([
                    EventService.getPublishedEvents(stay.propertyId, today),
                    StructureService.getStructures(stay.propertyId),
                ]);
                if (!alive) return;
                setEvents(evs);
                setStructures(strs as Structure[]);
            } catch { /* silently ignore */ }
            finally { if (alive) setLoading(false); }
        })();
        return () => { alive = false; };
    }, [stay.propertyId]);

    return (
        <div style={{ padding: "8px 18px 28px", display: "flex", flexDirection: "column", gap: 22 }}>
            <div>
                <h1 style={{ margin: "4px 2px 3px", fontSize: 27, fontWeight: 800, letterSpacing: "-.02em", color: "var(--ink)" }}>{t.exploreTitle}</h1>
                <p style={{ margin: "0 2px 16px", fontSize: 13.5, color: "var(--muted)" }}>{t.exploreLead}</p>
                <MiniMap onOpen={() => openSheet("map")} label={L.youHere} />
            </div>

            <div style={{ display: "flex", gap: 8 }}>
                <Chip icon="calendar" active={sub === "areas"} onClick={() => setSub("areas")}>{L.areas}</Chip>
                <Chip icon="ticket" active={sub === "eventos"} onClick={() => setSub("eventos")}>{L.eventos}</Chip>
            </div>

            {sub === "areas" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9, background: "var(--brand-soft)", borderRadius: 14, padding: "11px 13px" }}>
                        <Icon n="sparkle" s={17} c="var(--brand)" />
                        <span style={{ fontSize: 12.5, color: "var(--brand-deep)", fontWeight: 600, lineHeight: 1.35 }}>{L.hint}</span>
                    </div>
                    {loading ? (
                        <div style={{ textAlign: "center", padding: 30 }}><Icon n="refresh" s={26} c="var(--faint)" /></div>
                    ) : structures.length === 0 ? (
                        <div style={{ textAlign: "center", padding: "20px 10px", color: "var(--muted)", fontSize: 13.5 }}>{L.noAreas}</div>
                    ) : (
                        structures.map((s) => <AreaCard key={s.id} s={s} lang={lang} bookLabel={L.book} onBook={() => push(`/check-in/${code}/structures`)} />)
                    )}
                </div>
            )}

            {sub === "eventos" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                    {loading ? (
                        <div style={{ textAlign: "center", padding: 30 }}><Icon n="refresh" s={26} c="var(--faint)" /></div>
                    ) : events.length === 0 ? (
                        <div style={{ textAlign: "center", padding: "40px 20px" }}>
                            <div style={{ width: 72, height: 72, borderRadius: 22, background: "var(--surface-alt)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}><Icon n="ticket" s={34} c="var(--faint)" /></div>
                            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--ink)" }}>{L.noEvents}</h3>
                            <p style={{ margin: "6px auto 0", fontSize: 13, color: "var(--muted)", maxWidth: 240 }}>{L.noEventsSub}</p>
                        </div>
                    ) : (
                        events.map((ev) => <EventRow key={ev.id} ev={ev} lang={lang} todayLabel={L.today} onOpen={() => openSheet("event", ev)} />)
                    )}
                </div>
            )}
        </div>
    );
}
