"use client";

import React from "react";
import { Icon, Card, Chip, PrimaryBtn, titleCase } from "./ui";
import { usePortal, type Lang } from "./context";
import type { FBCategory, FBMenuItem, FBOrder } from "@/types/aura";

/* ============================================================
   Café da manhã (ENTREGA) numa página só, dentro do portal.
   Porta a lógica do wizard /breakfast (alvos individual/group_portion/
   group_unit + sabores + observações + janela + criar/editar) reusando
   os MESMOS endpoints e o MESMO payload `items` (cozinha intacta).
   Buffet continua na rota /breakfast (tratado no OrdersScreen).
   ============================================================ */

interface OrderSelection { id: string; menuItemId: string; quantity: number; flavor?: string; guestName?: string }

const TX = {
    pt: { title: "Café da manhã", deliverTomorrow: "amanhã no seu chalé", build: "Monte a cesta perfeita.", deadline: "Pedidos até hoje", time: "Horário da entrega", known: "Já sabemos quem está no chalé — não precisa digitar nomes.", maxGuest: (n: number) => `Máx. ${n} por hóspede`, group: "Opções do grupo", perPerson: (n: number) => `${n} por pessoa`, addFlavor: "+ Adicionar sabor…", limit: "Limite atingido", skip: "Pular", obs: "Observações", obsPh: "Ex: sem glúten para a Maria", confirm: (n: number, extra: number) => n === 0 ? "Escolha ao menos 1 item" : `Confirmar cesta · ${n} ${n === 1 ? "item" : "itens"}${extra > 0 ? ` · +R$ ${extra}` : ""}`, sending: "Enviando…", confirmed: "Cesta confirmada!", scheduledAt: "Entrega no chalé às", edit: "Editar cesta", closed: "Pedidos encerrados", standardBasket: (n: number) => `O horário de pedidos se encerrou. Uma cesta padrão para ${n} ${n === 1 ? "pessoa" : "pessoas"} será preparada e entregue no seu chalé.`, closedMsg: (a: string, b: string) => `Os pedidos são aceitos entre ${a} e ${b}.`, selected: (n: number) => `${n} selecionado(s)`, you: "Você", guest: (n: number) => `Hóspede ${n}` },
    en: { title: "Breakfast", deliverTomorrow: "tomorrow to your cabin", build: "Build the perfect basket.", deadline: "Order by today", time: "Delivery time", known: "We already know who's in the cabin — no need to type names.", maxGuest: (n: number) => `Max. ${n} per guest`, group: "Group options", perPerson: (n: number) => `${n} per person`, addFlavor: "+ Add flavor…", limit: "Limit reached", skip: "Skip", obs: "Notes", obsPh: "E.g. gluten-free for Maria", confirm: (n: number, extra: number) => n === 0 ? "Pick at least 1 item" : `Confirm basket · ${n} ${n === 1 ? "item" : "items"}${extra > 0 ? ` · +R$ ${extra}` : ""}`, sending: "Sending…", confirmed: "Basket confirmed!", scheduledAt: "Delivered to your cabin at", edit: "Edit basket", closed: "Orders closed", standardBasket: (n: number) => `Ordering has closed. A standard basket for ${n} ${n === 1 ? "guest" : "guests"} will be delivered to your cabin.`, closedMsg: (a: string, b: string) => `Orders are accepted between ${a} and ${b}.`, selected: (n: number) => `${n} selected`, you: "You", guest: (n: number) => `Guest ${n}` },
    es: { title: "Desayuno", deliverTomorrow: "mañana en tu cabaña", build: "Arma la cesta perfecta.", deadline: "Pedidos hasta hoy", time: "Horario de entrega", known: "Ya sabemos quién está en la cabaña — no hace falta escribir nombres.", maxGuest: (n: number) => `Máx. ${n} por huésped`, group: "Opciones del grupo", perPerson: (n: number) => `${n} por persona`, addFlavor: "+ Añadir sabor…", limit: "Límite alcanzado", skip: "Omitir", obs: "Notas", obsPh: "Ej: sin gluten para María", confirm: (n: number, extra: number) => n === 0 ? "Elige al menos 1 ítem" : `Confirmar cesta · ${n} ${n === 1 ? "ítem" : "ítems"}${extra > 0 ? ` · +R$ ${extra}` : ""}`, sending: "Enviando…", confirmed: "¡Cesta confirmada!", scheduledAt: "Entrega en tu cabaña a las", edit: "Editar cesta", closed: "Pedidos cerrados", standardBasket: (n: number) => `El horario de pedidos cerró. Se preparará una cesta estándar para ${n} ${n === 1 ? "persona" : "personas"} y se entregará en tu cabaña.`, closedMsg: (a: string, b: string) => `Los pedidos se aceptan entre ${a} y ${b}.`, selected: (n: number) => `${n} seleccionado(s)`, you: "Tú", guest: (n: number) => `Huésped ${n}` },
};

export function CafeBuilder() {
    const { stay, property, lang, toast } = usePortal();
    const t = TX[lang as Lang] || TX.pt;
    const fb = property?.settings?.fbSettings?.breakfast;

    const loc = (o: { name: string; name_en?: string; name_es?: string }) =>
        (lang === "en" && o.name_en) || (lang === "es" && o.name_es) || o.name;
    const locD = (o: { description?: string; description_en?: string; description_es?: string }) =>
        (lang === "en" && o.description_en) || (lang === "es" && o.description_es) || o.description;

    const totalGuests = Math.max(1, (stay.counts?.adults || 0) + (stay.counts?.children || 0));
    const guestNames = React.useMemo(() => {
        const primary = titleCase((stay as unknown as { guestName?: string }).guestName?.split(" ")[0]) || t.guest(1);
        const extra = (stay.additionalGuests || []).filter(g => g.type !== "free").map((g, i) => titleCase(g.fullName?.split(" ")[0]) || t.guest(i + 2));
        const all = [primary, ...extra].slice(0, totalGuests);
        while (all.length < totalGuests) all.push(t.guest(all.length + 1));
        return totalGuests === 1 ? [t.you] : all;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stay, totalGuests, lang]);

    const [loading, setLoading] = React.useState(true);
    const [categories, setCategories] = React.useState<FBCategory[]>([]);
    const [items, setItems] = React.useState<FBMenuItem[]>([]);
    const [selections, setSelections] = React.useState<OrderSelection[]>([]);
    const [deliveryTime, setDeliveryTime] = React.useState("");
    const [observations, setObservations] = React.useState("");
    const [existingOrder, setExistingOrder] = React.useState<FBOrder | null>(null);
    const [activeGuest, setActiveGuest] = React.useState<Record<string, number>>({});
    const [windowConfig, setWindowConfig] = React.useState<{ start: string; end: string } | null>(null);
    const [windowOpen, setWindowOpen] = React.useState(true);
    const [saving, setSaving] = React.useState(false);
    const [submitError, setSubmitError] = React.useState<string | null>(null);
    const [success, setSuccess] = React.useState(false);

    const deliveryTimes = fb?.delivery?.deliveryTimes || [];

    React.useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const res = await fetch(`/api/guest/breakfast-menu?propertyId=${stay.propertyId}`);
                const data = await res.json();
                const cats: FBCategory[] = (data.categories || []).filter((c: FBCategory) => c.type === "both" || c.type === "breakfast");
                const catIds = cats.map(c => c.id);
                const active: FBMenuItem[] = (data.menuItems || []).filter((i: FBMenuItem) => i.active && catIds.includes(i.categoryId));
                const validCats = cats.filter(c => active.some(i => i.categoryId === c.id));
                if (!alive) return;
                setCategories(validCats);
                setItems(active);
                if (deliveryTimes.length) setDeliveryTime(deliveryTimes[0]);

                const iso = new Date(Date.now() + 86400000).toISOString().split("T")[0];
                const exRes = await fetch(`/api/guest/breakfast-orders?stayId=${stay.id}&propertyId=${stay.propertyId}&deliveryDate=${iso}&type=breakfast`);
                const ex: FBOrder | null = exRes.ok ? (await exRes.json()).order : null;
                if (ex && ex.modality === "delivery") {
                    setExistingOrder(ex);
                    if (ex.deliveryTime) setDeliveryTime(ex.deliveryTime);
                    const reg = (ex.items as { menuItemId: string; quantity: number; flavor?: string; guestName?: string; notes?: string }[]).filter(it => it.menuItemId !== "guest_observations");
                    setSelections(reg.map(it => ({ id: Math.random().toString(36).slice(2, 9), menuItemId: it.menuItemId, quantity: it.quantity, flavor: it.flavor, guestName: it.guestName })));
                    const obs = (ex.items as { menuItemId: string; notes?: string }[]).find(it => it.menuItemId === "guest_observations");
                    if (obs?.notes) setObservations(obs.notes);
                }

                const dly = fb?.delivery;
                if (dly?.orderWindowStart && dly?.orderWindowEnd) {
                    const now = new Date();
                    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
                    setWindowOpen(hhmm >= dly.orderWindowStart && hhmm <= dly.orderWindowEnd);
                    setWindowConfig({ start: dly.orderWindowStart, end: dly.orderWindowEnd });
                }
            } catch { /* ignore */ } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stay.id, stay.propertyId]);

    // ---- carrinho (mesma lógica do wizard; checagem de limite fora do updater) ----
    const addSel = (menuItemId: string, guestName?: string, flavor?: string) => {
        const item = items.find(i => i.id === menuItemId);
        const cat = categories.find(c => c.id === item?.categoryId);
        if (cat?.selectionTarget === "individual" && guestName) {
            const q = selections.filter(s => s.guestName === guestName && items.find(i => i.id === s.menuItemId)?.categoryId === cat.id).reduce((a, s) => a + s.quantity, 0);
            if (q >= (cat.maxPerGuest || 1)) { toast(t.limit, "info"); return; }
        } else if (cat?.selectionTarget === "group_portion") {
            const q = selections.filter(s => s.menuItemId === menuItemId).reduce((a, s) => a + s.quantity, 0);
            if (q >= totalGuests) { toast(t.limit, "info"); return; }
        } else if (cat?.selectionTarget === "group_unit") {
            const q = selections.filter(s => items.find(i => i.id === s.menuItemId)?.categoryId === cat.id).reduce((a, s) => a + s.quantity, 0);
            if (q >= (cat.maxPerGuest || 1) * totalGuests) { toast(t.limit, "info"); return; }
        }
        setSelections(prev => {
            const idx = prev.findIndex(s => s.menuItemId === menuItemId && s.guestName === guestName && s.flavor === flavor);
            if (idx >= 0) { const u = [...prev]; u[idx] = { ...u[idx], quantity: u[idx].quantity + 1 }; return u; }
            return [...prev, { id: Math.random().toString(36).slice(2, 9), menuItemId, quantity: 1, guestName, flavor }];
        });
    };
    const removeSel = (selId: string) => {
        setSelections(prev => {
            const idx = prev.findIndex(s => s.id === selId);
            if (idx < 0) return prev;
            const u = [...prev];
            if (u[idx].quantity > 1) u[idx] = { ...u[idx], quantity: u[idx].quantity - 1 };
            else u.splice(idx, 1);
            return u;
        });
    };
    const qtyOf = (menuItemId: string, guestName?: string) =>
        selections.filter(s => s.menuItemId === menuItemId && (guestName ? s.guestName === guestName : true)).reduce((a, s) => a + s.quantity, 0);

    const totalItems = selections.reduce((a, s) => a + s.quantity, 0);
    const extras = selections.reduce((a, s) => a + ((items.find(i => i.id === s.menuItemId)?.price || 0) * s.quantity), 0);

    const submit = async () => {
        if (!deliveryTime || totalItems === 0) return;
        if (windowConfig && !existingOrder) {
            const now = new Date();
            const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
            if (hhmm < windowConfig.start || hhmm > windowConfig.end) { setSubmitError(t.closedMsg(windowConfig.start, windowConfig.end)); return; }
        }
        setSubmitError(null); setSaving(true);
        try {
            const orderItems = selections.map(s => {
                const def = items.find(i => i.id === s.menuItemId);
                const cat = categories.find(c => c.id === def?.categoryId);
                const unit = def?.price || 0;
                let notes = "";
                if (cat?.selectionTarget === "individual") { notes = `Para: ${s.guestName || "Hóspede"}`; if (s.flavor) notes += ` | Sabor: ${s.flavor}`; }
                else if (cat?.selectionTarget === "group_portion") notes = `Para ${s.quantity} pessoa(s)`;
                return { menuItemId: s.menuItemId, name: def?.name || "Item", quantity: s.quantity, unitPrice: unit, totalPrice: unit * s.quantity, flavor: s.flavor, guestName: s.guestName, notes };
            });
            if (observations.trim()) orderItems.push({ menuItemId: "guest_observations", name: "Observações Gerais", quantity: 1, unitPrice: 0, totalPrice: 0, flavor: undefined, guestName: undefined, notes: observations.trim() });
            const totalPrice = orderItems.reduce((a, c) => a + c.totalPrice, 0);
            const isoDate = new Date(Date.now() + 86400000).toISOString().split("T")[0];

            if (existingOrder) {
                const r = await fetch("/api/guest/breakfast-orders", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: existingOrder.id, stayId: stay.id, propertyId: stay.propertyId, items: orderItems, totalPrice, deliveryTime }) });
                if (!r.ok) throw new Error((await r.json()).error || "PATCH");
            } else {
                const r = await fetch("/api/guest/breakfast-orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ propertyId: stay.propertyId, stayId: stay.id, modality: "delivery", items: orderItems, totalPrice, deliveryTime, deliveryDate: isoDate }) });
                if (!r.ok) throw new Error((await r.json()).error || "POST");
            }
            setSuccess(true);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "";
            if (msg.startsWith("ORDER_WINDOW_CLOSED")) { const p = msg.split("|"); setSubmitError(t.closedMsg(p[1], p[2])); }
            else if (msg.startsWith("ORDER_EXISTS")) setSubmitError(lang === "en" ? "You already have an order for tomorrow." : lang === "es" ? "Ya tienes un pedido para mañana." : "Você já tem um pedido para amanhã.");
            else setSubmitError(lang === "en" ? "Failed to send order." : lang === "es" ? "Error al enviar el pedido." : "Erro ao enviar pedido.");
        } finally { setSaving(false); }
    };

    if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><Icon n="refresh" s={26} c="var(--faint)" /></div>;

    if (success) {
        return (
            <Card pad={20} style={{ textAlign: "center" }}>
                <div className="portal-pop" style={{ width: 72, height: 72, borderRadius: 22, background: "var(--green-soft)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}><Icon n="checkcircle" s={38} c="var(--green)" /></div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "var(--ink)" }}>{t.confirmed}</h3>
                <p style={{ margin: "6px 0 16px", fontSize: 13.5, color: "var(--muted)" }}>{t.scheduledAt} {deliveryTime}</p>
                <button onClick={() => setSuccess(false)} style={{ border: "1px solid var(--line)", background: "var(--surface-alt)", color: "var(--brand-deep)", borderRadius: 12, padding: "9px 16px", fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}><Icon n="edit" s={15} c="var(--brand)" />{t.edit}</button>
            </Card>
        );
    }

    if (!windowOpen && !existingOrder) {
        return (
            <Card pad={22} style={{ textAlign: "center" }}>
                <Icon n="coffee" s={32} c="var(--faint)" style={{ margin: "0 auto 10px" }} />
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "var(--ink)" }}>{t.closed}</h3>
                <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--muted)", lineHeight: 1.45 }}>{t.standardBasket(totalGuests)}</p>
            </Card>
        );
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingBottom: 8 }}>
            {/* Hero */}
            <div style={{ borderRadius: 22, padding: 18, color: "#fff", position: "relative", overflow: "hidden", background: "linear-gradient(145deg,var(--brand),var(--brand-deep))" }}>
                <div style={{ position: "absolute", right: -16, top: -16, opacity: .16 }}><Icon n="coffee" s={110} c="#fff" w={1.2} /></div>
                <div style={{ position: "relative" }}>
                    <span style={{ fontSize: 11.5, fontWeight: 700, opacity: .85, letterSpacing: ".06em", textTransform: "uppercase" }}>{t.deliverTomorrow}</span>
                    <h2 style={{ margin: "3px 0 7px", fontFamily: "var(--font-portal-display), serif", fontSize: 25, fontWeight: 400 }}>{t.title}</h2>
                    <p style={{ margin: 0, fontSize: 12.5, opacity: .85, lineHeight: 1.4 }}>{t.build}{fb?.delivery?.orderWindowEnd ? ` ${t.deadline} ${fb.delivery.orderWindowEnd}.` : ""}</p>
                </div>
            </div>

            {/* Horário */}
            {deliveryTimes.length > 0 && (
                <Card>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}><Icon n="clock" s={18} c="var(--brand)" /><span style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>{t.time}</span></div>
                    <div style={{ display: "flex", gap: 8, overflowX: "auto" }} className="portal-noscroll">
                        {deliveryTimes.map(tm => <Chip key={tm} active={deliveryTime === tm} onClick={() => setDeliveryTime(tm)}>{tm}</Chip>)}
                    </div>
                </Card>
            )}

            {/* Categorias */}
            {categories.map(cat => {
                const catItems = items.filter(i => i.categoryId === cat.id);
                if (!catItems.length) return null;
                const isIndividual = cat.selectionTarget === "individual";

                return (
                    <div key={cat.id}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "2px 2px 11px" }}>
                            <Icon n="fork" s={17} c="var(--brand)" />
                            <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: "var(--ink)" }}>{loc(cat)}</h3>
                            <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: "auto" }}>{isIndividual ? t.maxGuest(cat.maxPerGuest || 1) : cat.selectionTarget === "group_unit" ? t.perPerson(cat.maxPerGuest || 1) : t.group}</span>
                        </div>

                        {isIndividual ? (
                            <IndividualCategory cat={cat} catItems={catItems} guestNames={guestNames} active={activeGuest[cat.id] || 0} setActive={(idx) => setActiveGuest(p => ({ ...p, [cat.id]: idx }))} selections={selections} addSel={addSel} removeSel={removeSel} loc={loc} locD={locD} skipLabel={t.skip} />
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                                {catItems.map(item => (
                                    <GroupItem key={item.id} item={item} selections={selections} qty={qtyOf(item.id)} addSel={addSel} removeSel={removeSel} loc={loc} locD={locD} addFlavor={t.addFlavor} selectedLabel={t.selected} />
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}

            {/* Observações */}
            <Card>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}><Icon n="info" s={16} c="var(--brand)" /><span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{t.obs}</span></div>
                <textarea value={observations} onChange={e => setObservations(e.target.value)} rows={3} placeholder={t.obsPh} style={{ width: "100%", boxSizing: "border-box", background: "var(--surface-alt)", border: "1px solid var(--line)", borderRadius: 12, padding: 12, fontFamily: "inherit", fontSize: 13.5, color: "var(--ink)", resize: "none", outline: "none" }} />
            </Card>

            {submitError && <div style={{ background: "var(--clay-soft)", color: "#8a3c1c", borderRadius: 12, padding: "11px 13px", fontSize: 12.5, fontWeight: 600 }}>{submitError}</div>}

            <PrimaryBtn icon="checkcircle" tone="ink" onClick={submit} disabled={totalItems === 0 || saving || !deliveryTime}>
                {saving ? t.sending : t.confirm(totalItems, Math.round(extras))}
            </PrimaryBtn>
        </div>
    );
}

/* ---- categoria de grupo (porção/unidade) ---- */
function GroupItem({ item, selections, qty, addSel, removeSel, loc, locD, addFlavor, selectedLabel }: {
    item: FBMenuItem; selections: OrderSelection[]; qty: number;
    addSel: (id: string, g?: string, f?: string) => void; removeSel: (id: string) => void;
    loc: (o: { name: string; name_en?: string; name_es?: string }) => string;
    locD: (o: { description?: string; description_en?: string; description_es?: string }) => string | undefined;
    addFlavor: string; selectedLabel: (n: number) => string;
}) {
    const hasFlavors = !!item.flavors?.length;
    const itemSels = selections.filter(s => s.menuItemId === item.id);
    return (
        <Card pad={13}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>{loc(item)}</span>
                        {item.price > 0 && <span style={{ fontSize: 10.5, fontWeight: 800, color: "#8a6512", background: "var(--gold-soft)", borderRadius: 999, padding: "2px 7px" }}>+R$ {item.price}</span>}
                    </div>
                    {locD(item) && <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>{locD(item)}</div>}
                    {qty > 0 && !hasFlavors && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>{selectedLabel(qty)}</div>}
                </div>
                {!hasFlavors && (
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 2, background: "var(--surface-alt)", borderRadius: 12, padding: 3, border: "1px solid var(--line)" }}>
                        <button onClick={() => { const s = itemSels[0]; if (s) removeSel(s.id); }} disabled={qty === 0} style={{ width: 32, height: 32, borderRadius: 9, border: "none", background: qty === 0 ? "transparent" : "var(--surface)", cursor: qty === 0 ? "default" : "pointer", color: "var(--ink)", opacity: qty === 0 ? .35 : 1 }}><Icon n="minus" s={16} /></button>
                        <span style={{ minWidth: 22, textAlign: "center", fontSize: 15, fontWeight: 800, color: "var(--ink)" }}>{qty}</span>
                        <button onClick={() => addSel(item.id)} style={{ width: 32, height: 32, borderRadius: 9, border: "none", background: "var(--surface)", cursor: "pointer", color: "var(--brand)" }}><Icon n="plus" s={16} w={2.2} /></button>
                    </div>
                )}
            </div>
            {hasFlavors && (
                <div style={{ marginTop: 11, display: "flex", flexDirection: "column", gap: 7 }}>
                    {itemSels.map(sel => (
                        <div key={sel.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--brand-soft)", borderRadius: 10, padding: "7px 10px" }}>
                            <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--brand-deep)" }}>{sel.quantity}× {sel.flavor}</span>
                            <div style={{ display: "flex", gap: 6 }}>
                                <button onClick={() => addSel(item.id, undefined, sel.flavor)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--brand-deep)" }}><Icon n="plus" s={15} /></button>
                                <button onClick={() => removeSel(sel.id)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--brand-deep)" }}><Icon n="minus" s={15} /></button>
                            </div>
                        </div>
                    ))}
                    <select defaultValue="" onChange={e => { if (e.target.value) { addSel(item.id, undefined, e.target.value); e.currentTarget.value = ""; } }} style={{ background: "var(--surface-alt)", border: "1px solid var(--line)", borderRadius: 10, padding: "9px 11px", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, color: "var(--ink)", outline: "none" }}>
                        <option value="" disabled>{addFlavor}</option>
                        {item.flavors!.map(f => <option key={f.name} value={f.name}>{loc(f)}</option>)}
                    </select>
                </div>
            )}
        </Card>
    );
}

/* ---- categoria individual (por hóspede) ---- */
function IndividualCategory({ cat, catItems, guestNames, active, setActive, selections, addSel, removeSel, loc, locD, skipLabel }: {
    cat: FBCategory; catItems: FBMenuItem[]; guestNames: string[]; active: number; setActive: (i: number) => void;
    selections: OrderSelection[]; addSel: (id: string, g?: string, f?: string) => void; removeSel: (id: string) => void;
    loc: (o: { name: string; name_en?: string; name_es?: string }) => string;
    locD: (o: { description?: string; description_en?: string; description_es?: string }) => string | undefined;
    skipLabel: string;
}) {
    const guest = guestNames[active] || `Hóspede ${active + 1}`;
    const guestQty = selections.filter(s => s.guestName === guest && catItems.some(i => i.id === s.menuItemId)).reduce((a, s) => a + s.quantity, 0);
    const atLimit = guestQty >= (cat.maxPerGuest || 1);
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", gap: 7, overflowX: "auto" }} className="portal-noscroll">
                {guestNames.map((g, i) => {
                    const done = selections.some(s => s.guestName === g && catItems.some(it => it.id === s.menuItemId));
                    return <Chip key={i} active={active === i} icon={done ? "check" : undefined} onClick={() => setActive(i)}>{g}</Chip>;
                })}
            </div>
            <Card pad={13}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)" }}>{guest}</span>
                    {atLimit && <span style={{ fontSize: 10.5, fontWeight: 800, color: "#2c574f", background: "var(--green-soft)", borderRadius: 999, padding: "3px 9px" }}>OK</span>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {catItems.map(item => {
                        const hasFlavors = !!item.flavors?.length;
                        const sels = selections.filter(s => s.menuItemId === item.id && s.guestName === guest);
                        return (
                            <div key={item.id} style={{ border: sels.length ? "1.5px solid var(--brand)" : "1px solid var(--line)", background: sels.length ? "var(--brand-soft)" : "var(--surface-alt)", borderRadius: 12, padding: "10px 12px" }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: 13.5, fontWeight: 600, color: sels.length ? "var(--brand-deep)" : "var(--ink)" }}>{loc(item)}</div>
                                        {locD(item) && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>{locD(item)}</div>}
                                    </div>
                                    {!hasFlavors && (
                                        sels.length ? (
                                            <button onClick={() => removeSel(sels[0].id)} style={{ border: "none", background: "var(--surface)", borderRadius: 9, width: 30, height: 30, cursor: "pointer", color: "var(--clay)" }}><Icon n="x" s={15} c="var(--clay)" /></button>
                                        ) : (
                                            <button onClick={() => addSel(item.id, guest)} disabled={atLimit} style={{ border: "none", background: atLimit ? "transparent" : "var(--brand)", borderRadius: 9, width: 30, height: 30, cursor: atLimit ? "default" : "pointer", opacity: atLimit ? .3 : 1 }}><Icon n="plus" s={16} c="#fff" w={2.2} /></button>
                                        )
                                    )}
                                </div>
                                {hasFlavors && (
                                    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                                        {sels.map(s => (
                                            <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--surface)", borderRadius: 9, padding: "5px 9px" }}>
                                                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--brand-deep)" }}>{s.flavor}</span>
                                                <button onClick={() => removeSel(s.id)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--muted)" }}><Icon n="x" s={13} /></button>
                                            </div>
                                        ))}
                                        {!atLimit && (
                                            <select defaultValue="" onChange={e => { if (e.target.value) { addSel(item.id, guest, e.target.value); e.currentTarget.value = ""; } }} style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 9, padding: "7px 9px", fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: "var(--ink)", outline: "none" }}>
                                                <option value="" disabled>+ {loc(item)}…</option>
                                                {item.flavors!.map(f => <option key={f.name} value={f.name}>{loc(f)}</option>)}
                                            </select>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </Card>
        </div>
    );
}
