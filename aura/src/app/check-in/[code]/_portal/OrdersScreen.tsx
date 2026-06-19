"use client";

import React from "react";
import { Icon, Card, SectionTitle, PrimaryBtn, GhostBtn, Tag, QtyStepper, Chip } from "./ui";
import { Sheet } from "./sheets";
import { CafeBuilder } from "./CafeBuilder";
import { usePortal, type Lang } from "./context";
import { ConciergeService } from "@/services/concierge-service";
import { submitConciergeRequest } from "@/app/actions/concierge-actions";
import { toggleGuestDND } from "@/app/actions/dnd-actions";
import type { ConciergeItem, ConciergeRequest, ConciergeGroup } from "@/types/aura";

/* ============================================================
   Portal do Hóspede — TELA PEDIDOS (Fase 2)
   Café (entrada para a rota existente) · Concierge (completo,
   ligado ao backend real) · Em andamento (status real).
   ============================================================ */

const LOCALE: Record<string, string> = { pt: "pt-BR", en: "en-US", es: "es-ES" };

// i18n local (segue o padrão da página de concierge existente).
const ORD = {
    pt: {
        cafe: "Café", concierge: "Concierge", status: "Em andamento",
        cafeTitle: "Café da manhã", cafeBody: "Monte a cesta perfeita e receba no seu chalé.", cafeCta: "Montar cesta",
        cafeOff: "Café da manhã indisponível para esta acomodação.",
        cafeScheduled: "Cesta de café · amanhã", deliverAt: "Entrega no chalé às", editBasket: "Editar cesta",
        itemsWord: "itens", scheduledTag: "Agendado", buffetTitle: "Café buffet", buffetBody: "Servido no nosso restaurante central. É só chegar — bom apetite!", buffetOpen: "Ver detalhes", howToGet: "Como chegar", openNow: "Aberto agora", closedNow: "Fechado agora", buffetHours: (o: string, c: string) => `de ${o} às ${c}`,
        conciergeLead: "Peça itens e serviços direto ao seu chalé.",
        consumption: "Consumo", loan: "Empréstimo",
        free: "Grátis", included: "incluso na hospedagem",
        lossPenalty: "Multa por extravio", notesPlaceholder: "Observação (opcional) · ex: entregar à noite",
        request: "Solicitar", requested: (q: number, n: string) => `${q}× ${n} solicitado`,
        noItems: "Nenhum item disponível no momento.",
        searchPlaceholder: "Buscar item…", allCats: "Todos", noResults: "Nada encontrado para o filtro.",
        nothing: "Nada em andamento", nothingSub: "Seus pedidos ao concierge aparecem aqui com status ao vivo.",
        seeConcierge: "Ver itens do concierge", onTheWay: "a caminho",
        dndTitle: "Não Perturbe ativo", dndBody: (q: number, n: string) => `Você está em modo Não Perturbe. Deseja receber ${q}× ${n} no chalé mesmo assim?`,
        deliverNow: "Sim, entregar agora", cancel: "Cancelar",
        stPending: "Recebido", stDelivered: "Entregue", stReturned: "Devolvido", stLost: "Extraviado",
        loanTag: "Empréstimo", orderedAt: "Pedido ao concierge",
    },
    en: {
        cafe: "Breakfast", concierge: "Concierge", status: "In progress",
        cafeTitle: "Breakfast", cafeBody: "Build the perfect basket, delivered to your cabin.", cafeCta: "Build basket",
        cafeOff: "Breakfast isn't available for this accommodation.",
        cafeScheduled: "Breakfast basket · tomorrow", deliverAt: "Delivered to your cabin at", editBasket: "Edit basket",
        itemsWord: "items", scheduledTag: "Scheduled", buffetTitle: "Buffet breakfast", buffetBody: "Served at our central restaurant. Just drop by — enjoy!", buffetOpen: "See details", howToGet: "Get directions", openNow: "Open now", closedNow: "Closed now", buffetHours: (o: string, c: string) => `${o}–${c}`,
        conciergeLead: "Request items and services straight to your cabin.",
        consumption: "Consumption", loan: "Loan",
        free: "Free", included: "included in your stay",
        lossPenalty: "Loss penalty", notesPlaceholder: "Note (optional) · e.g. deliver at night",
        request: "Request", requested: (q: number, n: string) => `${q}× ${n} requested`,
        noItems: "No items available right now.",
        searchPlaceholder: "Search item…", allCats: "All", noResults: "Nothing matches your filter.",
        nothing: "Nothing in progress", nothingSub: "Your concierge requests show up here with live status.",
        seeConcierge: "See concierge items", onTheWay: "on the way",
        dndTitle: "Do Not Disturb on", dndBody: (q: number, n: string) => `You're in Do Not Disturb mode. Receive ${q}× ${n} at the cabin anyway?`,
        deliverNow: "Yes, deliver now", cancel: "Cancel",
        stPending: "Received", stDelivered: "Delivered", stReturned: "Returned", stLost: "Lost",
        loanTag: "Loan", orderedAt: "Concierge request",
    },
    es: {
        cafe: "Desayuno", concierge: "Concierge", status: "En curso",
        cafeTitle: "Desayuno", cafeBody: "Arma la cesta perfecta y recíbela en tu cabaña.", cafeCta: "Armar cesta",
        cafeOff: "El desayuno no está disponible para este alojamiento.",
        cafeScheduled: "Cesta de desayuno · mañana", deliverAt: "Entrega en tu cabaña a las", editBasket: "Editar cesta",
        itemsWord: "ítems", scheduledTag: "Programado", buffetTitle: "Desayuno buffet", buffetBody: "Servido en nuestro restaurante central. Solo acércate — ¡buen provecho!", buffetOpen: "Ver detalles", howToGet: "Cómo llegar", openNow: "Abierto ahora", closedNow: "Cerrado ahora", buffetHours: (o: string, c: string) => `de ${o} a ${c}`,
        conciergeLead: "Pide ítems y servicios directo a tu cabaña.",
        consumption: "Consumo", loan: "Préstamo",
        free: "Gratis", included: "incluido en tu estadía",
        lossPenalty: "Penalización por extravío", notesPlaceholder: "Nota (opcional) · ej: entregar de noche",
        request: "Solicitar", requested: (q: number, n: string) => `${q}× ${n} solicitado`,
        noItems: "No hay ítems disponibles ahora.",
        searchPlaceholder: "Buscar ítem…", allCats: "Todos", noResults: "Nada encontrado para el filtro.",
        nothing: "Nada en curso", nothingSub: "Tus pedidos al concierge aparecen aquí con estado en vivo.",
        seeConcierge: "Ver ítems del concierge", onTheWay: "en camino",
        dndTitle: "No Molestar activo", dndBody: (q: number, n: string) => `Estás en modo No Molestar. ¿Recibir ${q}× ${n} en la cabaña de todas formas?`,
        deliverNow: "Sí, entregar ahora", cancel: "Cancelar",
        stPending: "Recibido", stDelivered: "Entregado", stReturned: "Devuelto", stLost: "Extraviado",
        loanTag: "Préstamo", orderedAt: "Pedido al concierge",
    },
};

function itemName(item: ConciergeItem, lang: Lang): string {
    if (lang === "en" && item.name_en) return item.name_en;
    if (lang === "es" && item.name_es) return item.name_es;
    return item.name;
}
function itemDesc(item: ConciergeItem, lang: Lang): string | undefined {
    if (lang === "en" && item.description_en) return item.description_en;
    if (lang === "es" && item.description_es) return item.description_es;
    return item.description;
}
const money = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;

// O emoji do item é codificado no image_url como "emoji:🧴" (mesmo esquema do admin).
const EMOJI_PREFIX = "emoji:";
const isEmojiUrl = (u?: string) => !!u && u.startsWith(EMOJI_PREFIX);
const emojiFromUrl = (u?: string) => (u ? u.slice(EMOJI_PREFIX.length) : "");

/* ---------- sub-nav ---------- */
function SubNav({ sub, setSub, labels, statusCount }: {
    sub: string; setSub: (s: string) => void; labels: typeof ORD["pt"]; statusCount: number;
}) {
    const tabs = [
        { id: "cafe", label: labels.cafe, icon: "coffee", badge: 0 },
        { id: "concierge", label: labels.concierge, icon: "bell", badge: 0 },
        { id: "status", label: labels.status, icon: "clock", badge: statusCount },
    ];
    return (
        <div style={{ display: "flex", gap: 7 }}>
            {tabs.map((tb) => {
                const on = sub === tb.id;
                return (
                    <button key={tb.id} onClick={() => setSub(tb.id)} style={{ flex: 1, cursor: "pointer", fontFamily: "inherit", background: on ? "var(--ink)" : "var(--surface)", color: on ? "#fff" : "var(--ink-soft)", border: on ? "1px solid var(--ink)" : "1px solid var(--line)", borderRadius: 13, padding: "10px 6px", fontSize: 12.5, fontWeight: 700, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, position: "relative" }}>
                        <Icon n={tb.icon} s={18} c={on ? "#fff" : "var(--brand)"} />
                        {tb.label}
                        {tb.badge > 0 && <span style={{ position: "absolute", top: 6, right: 10, minWidth: 16, height: 16, padding: "0 4px", borderRadius: 99, background: "var(--clay)", color: "#fff", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{tb.badge}</span>}
                    </button>
                );
            })}
        </div>
    );
}

/* ---------- item do concierge ---------- */
function ConciergeItemCard({ item, lang, labels, onRequest }: {
    item: ConciergeItem; lang: Lang; labels: typeof ORD["pt"]; onRequest: (item: ConciergeItem, qty: number, note: string) => void;
}) {
    const [qty, setQty] = React.useState(1);
    const [note, setNote] = React.useState("");
    const loan = item.category === "loan";
    const tone = loan ? "green" : "brand";
    const priceLabel = item.price === 0 ? (item.included_qty > 0 ? `${item.included_qty} ${labels.included}` : labels.free) : money(item.price);
    return (
        <Card pad={13} style={{ display: "flex", gap: 13 }}>
            <div style={{ width: 46, height: 46, borderRadius: 13, background: `var(--${tone}-soft)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
                {isEmojiUrl(item.image_url)
                    ? <span style={{ fontSize: 25, lineHeight: 1 }}>{emojiFromUrl(item.image_url)}</span>
                    : item.image_url
                        ? <img src={item.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : <Icon n={loan ? "package" : "bag"} s={22} c={`var(--${tone})`} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: 14.5, fontWeight: 700, color: "var(--ink)", letterSpacing: "-.01em" }}>{itemName(item, lang)}</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: item.price === 0 ? "var(--green)" : "var(--brand)", flexShrink: 0 }}>{item.price === 0 ? (item.included_qty > 0 ? "" : labels.free) : money(item.price)}</span>
                </div>
                {itemDesc(item, lang) && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{itemDesc(item, lang)}</div>}
                {item.included_qty > 0 && item.price === 0 && <div style={{ fontSize: 10.5, color: "var(--green)", marginTop: 3, fontWeight: 700 }}>{priceLabel}</div>}
                {loan && item.loss_price ? <div style={{ fontSize: 10.5, color: "var(--clay)", marginTop: 3 }}>{labels.lossPenalty}: {money(item.loss_price)}</div> : null}
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={labels.notesPlaceholder} style={{ width: "100%", boxSizing: "border-box", marginTop: 9, background: "var(--surface-alt)", border: "1px solid var(--line)", borderRadius: 11, padding: "8px 11px", fontFamily: "inherit", fontSize: 12, color: "var(--ink)", outline: "none" }} />
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
                    <QtyStepper value={qty} onChange={setQty} min={1} max={9} size="sm" />
                    <button onClick={() => onRequest(item, qty, note)} style={{ flex: 1, border: "none", background: "var(--brand)", color: "#fff", borderRadius: 12, padding: "11px 14px", fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                        <Icon n="bell" s={15} c="#fff" />{labels.request}
                    </button>
                </div>
            </div>
        </Card>
    );
}

/* ---------- status ---------- */
type StatusKey = "stPending" | "stDelivered" | "stReturned" | "stLost";
const STATUS_META: Record<string, { key: StatusKey; tone: string; step: number }> = {
    pending: { key: "stPending", tone: "gold", step: 1 },
    delivered: { key: "stDelivered", tone: "green", step: 4 },
    returned: { key: "stReturned", tone: "green", step: 4 },
    lost: { key: "stLost", tone: "clay", step: 4 },
};

function Tracker({ step, tone }: { step: number; tone: string }) {
    const c = `var(--${tone === "gold" ? "gold" : tone === "clay" ? "clay" : tone === "green" ? "green" : "brand"})`;
    return (
        <div style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 10 }}>
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={{ height: 5, flex: 1, borderRadius: 99, background: i < step ? c : "var(--line)", transition: "background .3s" }} />
            ))}
        </div>
    );
}

export function OrdersScreen() {
    const { stay, property, code, lang, go, dnd, setDnd, toast, cafeVenue, setMapFocus } = usePortal();
    const labels = ORD[lang] || ORD.pt;
    const locale = LOCALE[lang] || "pt-BR";

    const fb = property?.settings?.fbSettings?.breakfast;
    const fbEnabled = !!fb?.enabled && ["delivery", "buffet", "both"].includes(fb?.modality ?? "");
    // Resolve a modalidade efetiva (mesma regra da página de café): 'both' usa o
    // dailyMode da recepção; uma estadia pode ser forçada para entrega.
    const resolvedModality = fb?.modality === "both" ? (fb?.dailyMode ?? "delivery") : fb?.modality;
    const cafeDelivery = (stay.cestaBreakfastEnabled === true ? "delivery" : resolvedModality) === "delivery";
    // Salão do café (estrutura marcada): horário + se está aberto agora.
    const nowHM = `${String(new Date().getHours()).padStart(2, "0")}:${String(new Date().getMinutes()).padStart(2, "0")}`;
    const salonOpen = !!cafeVenue?.openTime && !!cafeVenue?.closeTime && nowHM >= cafeVenue.openTime && nowHM <= cafeVenue.closeTime;
    const hmShort = (s?: string) => (s ? s.replace(/^0/, "") : "");

    const [sub, setSub] = React.useState<string>(fbEnabled ? "cafe" : "concierge");
    const [items, setItems] = React.useState<ConciergeItem[]>([]);
    const [requests, setRequests] = React.useState<ConciergeRequest[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [dndPending, setDndPending] = React.useState<{ item: ConciergeItem; qty: number; note: string } | null>(null);
    const [search, setSearch] = React.useState("");
    const [cat, setCat] = React.useState<string>(""); // "" = todas; senão groupId

    React.useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const [itemsData, reqData] = await Promise.all([
                    ConciergeService.getConciergeItemsForGuest(stay.propertyId),
                    ConciergeService.getConciergeRequestsForStay(stay.propertyId, stay.id),
                ]);
                if (!alive) return;
                setItems(itemsData);
                setRequests(reqData);
            } catch { /* silently ignore */ }
            finally { if (alive) setLoading(false); }
        })();
        return () => { alive = false; };
    }, [stay.propertyId, stay.id]);

    const refreshRequests = async () => {
        try { setRequests(await ConciergeService.getConciergeRequestsForStay(stay.propertyId, stay.id)); } catch { /* noop */ }
    };

    const doRequest = async (item: ConciergeItem, qty: number, note: string, forceDelivery = false) => {
        try {
            const result = await submitConciergeRequest(stay.id, code, item.id, qty, note || undefined);
            if (result.dndActive && !forceDelivery) { setDndPending({ item, qty, note }); return; }
            if (!result.success) { toast(result.error || "Erro ao enviar pedido.", "info"); return; }
            toast(labels.requested(qty, itemName(item, lang)), "bell");
            await refreshRequests();
            setSub("status");
        } catch { toast("Erro ao enviar pedido.", "info"); }
    };

    const onDndAccept = async () => {
        if (!dndPending) return;
        const p = dndPending; setDndPending(null);
        await toggleGuestDND(stay.id, code, null);
        setDnd({ on: false, until: null });
        await doRequest(p.item, p.qty, p.note, true);
    };

    const consumo = items.filter((i) => i.category === "consumption");
    const loan = items.filter((i) => i.category === "loan");
    const pendingCount = requests.filter((r) => r.status === "pending").length;
    const recentPending = requests.find((r) => r.status === "pending");

    // Busca + filtro por categoria (grupos do concierge cadastrados no admin).
    const groups = React.useMemo(() => {
        const map = new Map<string, ConciergeGroup>();
        for (const it of items) if (it.group && it.groupId && !map.has(it.groupId)) map.set(it.groupId, it.group);
        return Array.from(map.values()).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }, [items]);
    const groupName = (g: ConciergeGroup) => (lang === "en" && g.name_en) || (lang === "es" && g.name_es) || g.name;
    const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const q = norm(search.trim());
    const matchesFilter = (it: ConciergeItem) =>
        (cat === "" || it.groupId === cat) &&
        (q === "" || norm(itemName(it, lang)).includes(q) || norm(itemDesc(it, lang) || "").includes(q));
    const consumoF = consumo.filter(matchesFilter);
    const loanF = loan.filter(matchesFilter);
    const anyResult = consumoF.length + loanF.length > 0;

    return (
        <div style={{ padding: "8px 18px 28px", display: "flex", flexDirection: "column", gap: 16 }}>
            <SubNav sub={sub} setSub={setSub} labels={labels} statusCount={pendingCount} />

            {/* CAFÉ — status ao vivo do pedido + entrada para o wizard completo */}
            {sub === "cafe" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 4 }}>
                    {!fbEnabled ? (
                        <Card pad={20} style={{ textAlign: "center" }}>
                            <Icon n="coffee" s={32} c="var(--faint)" style={{ margin: "0 auto 10px" }} />
                            <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted)", fontWeight: 600 }}>{labels.cafeOff}</p>
                        </Card>
                    ) : !cafeDelivery ? (
                        /* Buffet — servido no salão; mostra horário e leva ao mapa */
                        <div style={{ borderRadius: 22, padding: 18, color: "#fff", position: "relative", overflow: "hidden", background: "linear-gradient(145deg,var(--brand),var(--brand-deep))" }}>
                            <div style={{ position: "absolute", right: -16, top: -16, opacity: .16 }}><Icon n="utensils" s={120} c="#fff" w={1.2} /></div>
                            <div style={{ position: "relative" }}>
                                <h2 style={{ margin: "0 0 7px", fontFamily: "var(--font-portal-display), serif", fontSize: 26, fontWeight: 400 }}>{labels.buffetTitle}</h2>
                                {cafeVenue?.openTime && cafeVenue?.closeTime ? (
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "0 0 16px" }}>
                                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 700 }}>
                                            <Icon n="clock" s={15} c="#fff" />{labels.buffetHours(hmShort(cafeVenue.openTime), hmShort(cafeVenue.closeTime))}
                                        </span>
                                        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".04em", textTransform: "uppercase", background: salonOpen ? "rgba(255,255,255,.22)" : "rgba(0,0,0,.18)", borderRadius: 999, padding: "3px 9px" }}>{salonOpen ? labels.openNow : labels.closedNow}</span>
                                    </div>
                                ) : (
                                    <p style={{ margin: "0 0 16px", fontSize: 12.5, opacity: .85, lineHeight: 1.4 }}>{labels.buffetBody}</p>
                                )}
                                {salonOpen && cafeVenue?.mapPin && (
                                    <PrimaryBtn icon="pin" tone="ink" onClick={() => { setMapFocus(cafeVenue!.mapPin!); go("explore"); }}>{labels.howToGet}</PrimaryBtn>
                                )}
                            </div>
                        </div>
                    ) : (
                        /* Entrega no chalé — builder numa página só */
                        <CafeBuilder />
                    )}
                </div>
            )}

            {/* CONCIERGE */}
            {sub === "concierge" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingBottom: 8 }}>
                    <p style={{ margin: "0 2px", fontSize: 13, color: "var(--muted)" }}>{labels.conciergeLead}</p>

                    {dnd.on && (
                        <div style={{ display: "flex", alignItems: "center", gap: 9, background: "var(--gold-soft)", borderRadius: 14, padding: "11px 13px" }}>
                            <Icon n="moon" s={18} c="var(--gold)" />
                            <span style={{ fontSize: 12.5, color: "#8a6512", fontWeight: 600, lineHeight: 1.35 }}>{labels.dndTitle}.</span>
                        </div>
                    )}

                    {recentPending && (
                        <button onClick={() => setSub("status")} style={{ border: "1px solid var(--line)", background: "var(--surface)", borderRadius: 14, padding: "11px 13px", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 11, boxShadow: "var(--sh-xs)" }}>
                            <span className="portal-pulse-dot" style={{ width: 9, height: 9, borderRadius: 99, background: "var(--green)", flexShrink: 0 }} />
                            <span style={{ flex: 1, textAlign: "left", fontSize: 12.5, color: "var(--ink-soft)", fontWeight: 600 }}>{recentPending.quantity}× {recentPending.item ? itemName(recentPending.item, lang) : ""} — {labels.onTheWay}</span>
                            <Icon n="chevright" s={16} c="var(--faint)" />
                        </button>
                    )}

                    {loading ? (
                        <div style={{ textAlign: "center", padding: 30 }}><Icon n="refresh" s={26} c="var(--faint)" /></div>
                    ) : items.length === 0 ? (
                        <div style={{ textAlign: "center", padding: "30px 10px", color: "var(--muted)" }}>
                            <Icon n="bag" s={36} c="var(--faint)" style={{ margin: "0 auto 10px" }} />
                            <p style={{ margin: 0, fontSize: 13.5 }}>{labels.noItems}</p>
                        </div>
                    ) : (
                        <>
                            {/* Busca */}
                            <div style={{ position: "relative" }}>
                                <Icon n="search" s={16} c="var(--faint)" style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)" }} />
                                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={labels.searchPlaceholder} style={{ width: "100%", boxSizing: "border-box", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 14, padding: "11px 13px 11px 38px", fontFamily: "inherit", fontSize: 13.5, color: "var(--ink)", outline: "none", boxShadow: "var(--sh-xs)" }} />
                            </div>

                            {/* Filtro por categoria (grupos do concierge) */}
                            {groups.length > 0 && (
                                <div style={{ display: "flex", gap: 7, overflowX: "auto" }} className="portal-noscroll">
                                    <Chip active={cat === ""} onClick={() => setCat("")}>{labels.allCats}</Chip>
                                    {groups.map((g) => (
                                        <Chip key={g.id} active={cat === g.id} onClick={() => setCat(g.id)}>{g.icon ? `${g.icon} ` : ""}{groupName(g)}</Chip>
                                    ))}
                                </div>
                            )}

                            {!anyResult ? (
                                <div style={{ textAlign: "center", padding: "26px 10px", color: "var(--muted)" }}>
                                    <Icon n="search" s={30} c="var(--faint)" style={{ margin: "0 auto 8px" }} />
                                    <p style={{ margin: 0, fontSize: 13 }}>{labels.noResults}</p>
                                </div>
                            ) : (
                                <>
                                    {consumoF.length > 0 && (
                                        <div>
                                            <SectionTitle right={<Icon n="bag" s={16} c="var(--faint)" />}>{labels.consumption}</SectionTitle>
                                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                                {consumoF.map((it) => <ConciergeItemCard key={it.id} item={it} lang={lang} labels={labels} onRequest={doRequest} />)}
                                            </div>
                                        </div>
                                    )}
                                    {loanF.length > 0 && (
                                        <div>
                                            <SectionTitle right={<Icon n="package" s={16} c="var(--faint)" />}>{labels.loan}</SectionTitle>
                                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                                {loanF.map((it) => <ConciergeItemCard key={it.id} item={it} lang={lang} labels={labels} onRequest={doRequest} />)}
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* EM ANDAMENTO */}
            {sub === "status" && (
                requests.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "60px 20px" }}>
                        <div style={{ width: 76, height: 76, borderRadius: 22, background: "var(--surface-alt)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}><Icon n="clock" s={36} c="var(--faint)" /></div>
                        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--ink)" }}>{labels.nothing}</h3>
                        <p style={{ margin: "6px auto 20px", fontSize: 13.5, color: "var(--muted)", maxWidth: 240, lineHeight: 1.5 }}>{labels.nothingSub}</p>
                        <GhostBtn icon="bell" onClick={() => setSub("concierge")} style={{ display: "inline-flex", width: "auto", margin: "0 auto" }}>{labels.seeConcierge}</GhostBtn>
                    </div>
                ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 4 }}>
                        {requests.map((r) => {
                            const m = STATUS_META[r.status] || STATUS_META.pending;
                            const loanItem = r.item?.category === "loan";
                            return (
                                <Card key={r.id} pad={15}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                        <div style={{ width: 44, height: 44, borderRadius: 13, background: `var(--${m.tone}-soft)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>{(() => {
                                            const u = r.item?.image_url;
                                            return isEmojiUrl(u)
                                                ? <span style={{ fontSize: 22, lineHeight: 1 }}>{emojiFromUrl(u)}</span>
                                                : u
                                                    ? <img src={u} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                                    : <Icon n={loanItem ? "package" : "bag"} s={22} c={`var(--${m.tone})`} />;
                                        })()}</div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--ink)" }}>{r.quantity}× {r.item ? itemName(r.item, lang) : ""}</div>
                                            <div style={{ fontSize: 12, color: "var(--muted)" }}>{loanItem ? labels.loanTag : labels.orderedAt} · {new Date(r.createdAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}</div>
                                        </div>
                                        <Tag tone={m.tone === "gold" ? "gold" : m.tone === "clay" ? "clay" : "green"}>{labels[m.key]}</Tag>
                                    </div>
                                    {r.notes && <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 8, background: "var(--surface-alt)", borderRadius: 10, padding: "8px 11px" }}>{r.notes}</div>}
                                    <Tracker step={m.step} tone={m.tone} />
                                </Card>
                            );
                        })}
                    </div>
                )
            )}

            {/* confirmação DND (entregar mesmo assim) */}
            {dndPending && (
                <Sheet onClose={() => setDndPending(null)} title={labels.dndTitle} icon="moon" iconTone="gold" maxH="auto">
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                        <p style={{ margin: 0, fontSize: 14, color: "var(--ink-soft)", lineHeight: 1.5 }}>{labels.dndBody(dndPending.qty, itemName(dndPending.item, lang))}</p>
                        <PrimaryBtn icon="checkcircle" onClick={onDndAccept}>{labels.deliverNow}</PrimaryBtn>
                        <GhostBtn onClick={() => setDndPending(null)}>{labels.cancel}</GhostBtn>
                    </div>
                </Sheet>
            )}
        </div>
    );
}
