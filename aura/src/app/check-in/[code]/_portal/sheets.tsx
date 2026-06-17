"use client";

import React from "react";
import { Icon, Card, PrimaryBtn, GhostBtn, IconBtn, SectionTitle, Photo } from "./ui";
import { usePortal, type SheetName, type Lang } from "./context";
import { ImageUpload } from "@/components/admin/ImageUpload";
import { reportCabinIssue, reportStructureIssue, reportAppBug } from "@/app/actions/issue-actions";
import { StructureService } from "@/services/structure-service";
import type { Structure, Event } from "@/types/aura";
import { formatEventDate, eventTitle, eventDesc, eventPrice } from "./eventHelpers";

/* ============================================================
   Portal do Hóspede — bottom sheets / modais (Fase 1)
   ============================================================ */

// TODO(fase futura): a senha do portão é fixa (igual ao hub antigo).
// Quando houver campo no schema (property/cabin), ler de lá.
const GATE_CODE = "1008#";

function waLink(number: string | undefined, text?: string): string | null {
    const digits = (number || "").replace(/\D/g, "");
    if (!digits) return null;
    return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

function localizedPolicy(rec: Record<string, string> | undefined, lang: string): string | null {
    if (!rec) return null;
    return rec[lang] || rec.pt || Object.values(rec)[0] || null;
}

export function Sheet({ children, onClose, title, icon, iconTone = "brand", maxH = "88%" }: {
    children?: React.ReactNode; onClose: () => void; title?: string; icon?: string;
    iconTone?: "brand" | "green" | "gold" | "clay"; maxH?: string;
}) {
    const toneC = { brand: "var(--brand)", green: "var(--green)", gold: "var(--gold)", clay: "var(--clay)" }[iconTone];
    const toneBg = { brand: "var(--brand-soft)", green: "var(--green-soft)", gold: "var(--gold-soft)", clay: "var(--clay-soft)" }[iconTone];
    return (
        <div onClick={onClose} className="portal-sheet-overlay" style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", background: "rgba(43,38,32,.42)", backdropFilter: "blur(2px)" }}>
            <div onClick={(e) => e.stopPropagation()} className="portal-sheet-pop" style={{ width: "100%", maxWidth: 448, background: "var(--bg)", borderRadius: "26px 26px 0 0", maxHeight: maxH, display: "flex", flexDirection: "column", boxShadow: "0 -20px 50px rgba(43,38,32,.3)", overflow: "hidden" }}>
                <div style={{ display: "flex", justifyContent: "center", paddingTop: 9 }}><div style={{ width: 38, height: 4.5, borderRadius: 99, background: "var(--line)" }} /></div>
                {title && (
                    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px 8px" }}>
                        {icon && <div style={{ width: 40, height: 40, borderRadius: 12, background: toneBg, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon n={icon} s={21} c={toneC} /></div>}
                        <h2 style={{ flex: 1, margin: 0, fontSize: 19, fontWeight: 800, letterSpacing: "-.02em", color: "var(--ink)" }}>{title}</h2>
                        <IconBtn n="x" tone="soft" size={34} s={18} onClick={onClose} />
                    </div>
                )}
                <div style={{ overflowY: "auto", padding: "6px 18px calc(20px + env(safe-area-inset-bottom))" }}>{children}</div>
            </div>
        </div>
    );
}

function CopyField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
    const { t } = usePortal();
    const [done, setDone] = React.useState(false);
    const copy = () => {
        try { navigator.clipboard?.writeText(value); } catch { /* noop */ }
        setDone(true); setTimeout(() => setDone(false), 1400);
    };
    return (
        <button onClick={copy} style={{ width: "100%", border: "1px solid var(--line)", background: "var(--surface)", borderRadius: 15, padding: "13px 15px", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 12, textAlign: "left" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10.5, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em" }}>{label}</div>
                <div style={{ fontSize: 17, fontWeight: 800, color: "var(--ink)", marginTop: 2, fontFamily: mono ? "ui-monospace, monospace" : "inherit", letterSpacing: mono ? ".04em" : "-.01em" }}>{value}</div>
            </div>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: done ? "var(--green)" : "var(--brand)", fontSize: 12, fontWeight: 700 }}>
                <Icon n={done ? "check" : "copy"} s={16} c={done ? "var(--green)" : "var(--brand)"} />{done ? t.copied : t.copy}
            </span>
        </button>
    );
}

// QR pseudo-determinístico (visual) a partir de uma seed.
function QR({ seed = "aura", size = 150 }: { seed?: string; size?: number }) {
    const n = 21;
    const cells = React.useMemo(() => {
        let s = 0; for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) >>> 0;
        const rand = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
        const arr: boolean[] = []; for (let i = 0; i < n * n; i++) arr.push(rand() > 0.5);
        return arr;
    }, [seed]);
    const isFinder = (r: number, c: number) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
    const px = size / n;
    return (
        <div style={{ width: size, height: size, background: "#fff", borderRadius: 14, padding: 10, boxSizing: "content-box", boxShadow: "var(--sh-sm)" }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                {cells.map((on, i) => { const r = Math.floor(i / n), c = i % n; if (isFinder(r, c) || !on) return null; return <rect key={i} x={c * px} y={r * px} width={px} height={px} fill="#2B2620" />; })}
                {[[0, 0], [0, n - 7], [n - 7, 0]].map(([r, c], k) => (
                    <g key={k}>
                        <rect x={c * px} y={r * px} width={px * 7} height={px * 7} fill="#2B2620" />
                        <rect x={(c + 1) * px} y={(r + 1) * px} width={px * 5} height={px * 5} fill="#fff" />
                        <rect x={(c + 2) * px} y={(r + 2) * px} width={px * 3} height={px * 3} fill="#8A5A2B" />
                    </g>
                ))}
            </svg>
        </div>
    );
}

/* ---------- ACCESS ---------- */
function AccessSheet() {
    const { closeSheet, t } = usePortal();
    return (
        <Sheet onClose={closeSheet} title={t.accessTitle} icon="key">
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Card pad={0} style={{ overflow: "hidden", textAlign: "center" }}>
                    <div style={{ background: "linear-gradient(145deg,var(--brand),var(--brand-deep))", padding: "22px 18px", color: "#fff" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, opacity: .8, textTransform: "uppercase", letterSpacing: ".08em" }}>{t.gatePassword}</div>
                        <div style={{ fontSize: 46, fontWeight: 800, letterSpacing: ".06em", marginTop: 4, fontFamily: "ui-monospace, monospace" }}>{GATE_CODE}</div>
                    </div>
                    <div style={{ padding: 13 }}>
                        <CopyField label={t.typeOnKeypad} value={GATE_CODE} mono />
                    </div>
                </Card>
                <Card pad={13} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 11, background: "var(--brand-soft)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon n="home" s={20} c="var(--brand)" /></div>
                    <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>{t.cabinAccess}</div><div style={{ fontSize: 12, color: "var(--muted)" }}>{t.cabinAccessSub}</div></div>
                    <Icon n="checkcircle" s={20} c="var(--green)" />
                </Card>
            </div>
        </Sheet>
    );
}

/* ---------- WIFI ---------- */
function WifiSheet() {
    const { closeSheet, t, stay } = usePortal();
    const wifi = (stay as unknown as { cabinWifi?: { ssid: string; password?: string } }).cabinWifi;
    return (
        <Sheet onClose={closeSheet} title={t.wifiTitle} icon="wifi" iconTone="green">
            {wifi ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "8px 0 4px" }}>
                        <QR seed={wifi.ssid + (wifi.password || "")} size={158} />
                        <p style={{ margin: 0, fontSize: 12.5, color: "var(--muted)", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}><Icon n="camera" s={15} c="var(--muted)" />{t.scanToConnect}</p>
                    </div>
                    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
                        <CopyField label={t.networkSSID} value={wifi.ssid} />
                        <CopyField label={t.wifiPassword} value={wifi.password || "—"} mono />
                    </div>
                </div>
            ) : (
                <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 16, padding: 22, textAlign: "center" }}>
                    <Icon n="wifi" s={32} c="var(--faint)" style={{ margin: "0 auto 10px" }} />
                    <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted)", fontWeight: 600 }}>{t.wifiNotSet}</p>
                </div>
            )}
        </Sheet>
    );
}

/* ---------- CONTACT ---------- */
function ContactSheet() {
    const { closeSheet, t, property, toast } = usePortal();
    const number = property?.settings?.whatsappNumber;
    const quick = [t.qTowels, t.qCheckout, t.qRestaurant, t.qDoubt];
    const send = (text?: string) => {
        const link = waLink(number, text);
        if (link) { window.open(link, "_blank"); toast(t.messageSent, "message"); }
        else toast(t.contactUnavailable, "info");
        closeSheet();
    };
    return (
        <Sheet onClose={closeSheet} title={t.contactTitle} icon="message" iconTone="green">
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 11, background: "var(--green-soft)", borderRadius: 16, padding: 14 }}>
                    <span className="portal-pulse-dot" style={{ width: 9, height: 9, borderRadius: 99, background: "var(--green)" }} />
                    <span style={{ fontSize: 13, color: "#2c574f", fontWeight: 600 }}>{t.teamOnline}</span>
                </div>
                <div>
                    <SectionTitle>{t.quickQuestions}</SectionTitle>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {quick.map((q) => (
                            <button key={q} onClick={() => send(q)} style={{ width: "100%", textAlign: "left", border: "1px solid var(--line)", background: "var(--surface)", borderRadius: 13, padding: "13px 15px", fontFamily: "inherit", fontSize: 13.5, fontWeight: 600, color: "var(--ink-soft)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                                {q}<Icon n="arrowright" s={16} c="var(--brand)" />
                            </button>
                        ))}
                    </div>
                </div>
                <PrimaryBtn icon="message" tone="ink" onClick={() => send()}>{t.openWhatsApp}</PrimaryBtn>
            </div>
        </Sheet>
    );
}

/* ---------- DND (escolher duração) ---------- */
function DndSheet() {
    const { closeSheet, t, stay, handleDnd } = usePortal();
    const hoursUntilCheckout = stay.checkOut ? (new Date(stay.checkOut).getTime() - Date.now()) / 3600000 : 999;
    const options: [number, string][] = [[1, t.opt1h], [24, t.opt24h]];
    if (hoursUntilCheckout >= 48) options.push([48, t.opt48h]);
    return (
        <Sheet onClose={closeSheet} title={t.dndSheetTitle} icon="moon" iconTone="gold" maxH="auto">
            <p style={{ margin: "0 0 14px", fontSize: 13.5, color: "var(--muted)" }}>{t.dndSheetBody}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {options.map(([h, l]) => (
                    <button key={h} onClick={() => { handleDnd(h); closeSheet(); }} style={{ width: "100%", border: "1px solid var(--gold)", background: "var(--gold-soft)", color: "#8a6512", borderRadius: 14, padding: "14px", fontFamily: "inherit", fontSize: 14.5, fontWeight: 700, cursor: "pointer" }}>{l}</button>
                ))}
            </div>
        </Sheet>
    );
}

/* ---------- REPORT ---------- */
function ReportSheet() {
    const { closeSheet, t, stay, dnd, setDnd, toast } = usePortal();
    const [type, setType] = React.useState<"cabin" | "area" | "bug" | null>(null);
    const [desc, setDesc] = React.useState("");
    const [canEnter, setCanEnter] = React.useState(false);
    const [structureId, setStructureId] = React.useState("");
    const [imageUrl, setImageUrl] = React.useState("");
    const [structures, setStructures] = React.useState<Structure[]>([]);
    const [loading, setLoading] = React.useState(false);

    React.useEffect(() => {
        if (type === "area" && structures.length === 0) {
            StructureService.getStructures(stay.propertyId)
                .then((d) => setStructures(d as Structure[]))
                .catch(() => { /* silently ignore */ });
        }
    }, [type, stay.propertyId, structures.length]);

    const types: { id: "cabin" | "area" | "bug"; label: string; icon: string; tone: string }[] = [
        { id: "cabin", label: t.typeCabin, icon: "home", tone: "brand" },
        { id: "area", label: t.typeArea, icon: "droplet", tone: "green" },
        { id: "bug", label: t.typeBug, icon: "info", tone: "gold" },
    ];

    const submit = async () => {
        if (!desc.trim()) return;
        if (type === "area" && !structureId) return;
        setLoading(true);
        try {
            let result: { success: boolean; error?: string };
            if (type === "cabin") {
                result = await reportCabinIssue(stay.id, stay.accessCode, desc, canEnter, imageUrl);
            } else if (type === "area") {
                result = await reportStructureIssue(stay.id, stay.accessCode, structureId, desc, imageUrl);
            } else {
                result = await reportAppBug(stay.id, stay.accessCode, desc, navigator.userAgent, imageUrl);
            }
            if (result.success) {
                if (type === "cabin" && canEnter && dnd.on) setDnd({ on: false, until: null });
                closeSheet();
                toast(t.reportSent, "checkcircle");
            } else {
                toast(result.error || "Erro ao enviar relatório.", "info");
            }
        } catch (e: unknown) {
            toast(e instanceof Error ? e.message : "Erro ao enviar relatório.", "info");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Sheet onClose={closeSheet} title={t.reportTitle} icon="flag" iconTone="clay">
            {!type ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <p style={{ margin: "0 0 4px", fontSize: 13.5, color: "var(--muted)" }}>{t.whatAttention}</p>
                    {types.map((ty) => (
                        <button key={ty.id} onClick={() => setType(ty.id)} style={{ width: "100%", border: "1px solid var(--line)", background: "var(--surface)", borderRadius: 15, padding: "14px 15px", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 13 }}>
                            <div style={{ width: 40, height: 40, borderRadius: 11, background: `var(--${ty.tone}-soft)`, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon n={ty.icon} s={20} c={`var(--${ty.tone})`} /></div>
                            <span style={{ flex: 1, textAlign: "left", fontSize: 14.5, fontWeight: 700, color: "var(--ink)" }}>{ty.label}</span>
                            <Icon n="chevright" s={17} c="var(--faint)" />
                        </button>
                    ))}
                </div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
                    <button onClick={() => setType(null)} style={{ alignSelf: "flex-start", border: "none", background: "transparent", color: "var(--brand)", fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}><Icon n="chevleft" s={15} c="var(--brand)" />{t.back}</button>

                    {type === "area" && (
                        <select value={structureId} onChange={(e) => setStructureId(e.target.value)} style={{ width: "100%", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 14, padding: "13px 14px", fontFamily: "inherit", fontSize: 14, color: "var(--ink)", outline: "none" }}>
                            <option value="">{t.selectArea}</option>
                            {structures.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    )}

                    <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={4} placeholder={t.describeIssue} style={{ width: "100%", boxSizing: "border-box", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 15, padding: 14, fontFamily: "inherit", fontSize: 14, color: "var(--ink)", resize: "none", outline: "none" }} />

                    <div style={{ height: 110, border: "1.5px dashed var(--line)", background: "var(--surface-alt)", borderRadius: 15, overflow: "hidden", position: "relative" }}>
                        <ImageUpload value={imageUrl} onUploadSuccess={(url: string) => setImageUrl(url)} stayId={stay.id} accessCode={stay.accessCode} />
                        {!imageUrl && (
                            <div style={{ position: "absolute", inset: 0, pointerEvents: "none", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, color: "var(--muted)" }}>
                                <Icon n="camera" s={24} c="var(--muted)" /><span style={{ fontSize: 12, fontWeight: 700 }}>{t.attachPhoto}</span>
                            </div>
                        )}
                    </div>

                    {type === "cabin" && dnd.on && (
                        <label style={{ display: "flex", alignItems: "center", gap: 11, background: "var(--gold-soft)", border: "1px solid var(--gold)", borderRadius: 14, padding: "12px 14px", cursor: "pointer" }}>
                            <input type="checkbox" checked={canEnter} onChange={(e) => setCanEnter(e.target.checked)} style={{ width: 20, height: 20, accentColor: "var(--gold)" }} />
                            <span style={{ fontSize: 13, fontWeight: 700, color: "#8a6512" }}>{t.canEnterNow}</span>
                        </label>
                    )}

                    <PrimaryBtn icon="arrowright" onClick={submit} disabled={loading || !desc.trim() || (type === "area" && !structureId)}>{t.sendReport}</PrimaryBtn>
                </div>
            )}
        </Sheet>
    );
}

/* ---------- GUIDE (políticas reais da propriedade) ---------- */
function GuideSheet({ which }: { which: "rules" | "pet" | "privacy" }) {
    const { closeSheet, t, lang, property } = usePortal();
    const meta = {
        rules: { title: t.guideRules, icon: "home", tone: "brand" as const, rec: property?.settings?.generalPolicyText },
        pet: { title: t.guidePet, icon: "paw", tone: "gold" as const, rec: property?.settings?.petPolicyText },
        privacy: { title: t.guidePrivacy, icon: "shield", tone: "green" as const, rec: property?.settings?.privacyPolicyText },
    }[which];
    const text = localizedPolicy(meta.rec, lang);
    return (
        <Sheet onClose={closeSheet} title={meta.title} icon={meta.icon} iconTone={meta.tone}>
            <Card pad={16}>
                <div style={{ fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.6, whiteSpace: "pre-line" }}>
                    {text || "—"}
                </div>
            </Card>
        </Sheet>
    );
}

/* ---------- LATE CHECKOUT ---------- */
function LateCheckoutSheet() {
    const { closeSheet, t, stay, property, toast } = usePortal();
    const [time, setTime] = React.useState<string | null>(null);
    const checkoutTime = stay.checkOut
        ? new Date(stay.checkOut).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
        : "12:00";
    const submit = () => {
        if (!time) return;
        // TODO(fase futura): canal dedicado de late check-out. Hoje encaminha
        // o pedido à recepção via WhatsApp (se configurado) ou apenas confirma.
        const link = waLink(property?.settings?.whatsappNumber, `Olá! Gostaria de solicitar late check-out até as ${time}.`);
        if (link) window.open(link, "_blank");
        closeSheet();
        toast(t.lateSent, "clock");
    };
    return (
        <Sheet onClose={closeSheet} title={t.lateTitle} icon="clock" maxH="auto">
            <p style={{ margin: "0 0 14px", fontSize: 13.5, color: "var(--muted)" }}>{t.lateBody.replace("{time}", checkoutTime)}</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 9, marginBottom: 16 }}>
                {["13:00", "14:00", "15:00"].map((tm) => (
                    <button key={tm} onClick={() => setTime(tm)} style={{ border: time === tm ? "1.5px solid var(--brand)" : "1px solid var(--line)", background: time === tm ? "var(--brand)" : "var(--surface)", color: time === tm ? "#fff" : "var(--ink)", borderRadius: 13, padding: "14px 4px", fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>{tm}</button>
                ))}
            </div>
            <PrimaryBtn icon="arrowright" onClick={submit} disabled={!time}>{t.requestReception}</PrimaryBtn>
        </Sheet>
    );
}

/* ---------- MAP (preview + link para a rota /map existente) ---------- */
function MapSheet() {
    const { closeSheet, t, code, push } = usePortal();
    return (
        <Sheet onClose={closeSheet} title={t.mapTitle} icon="map" iconTone="clay">
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ borderRadius: 18, overflow: "hidden", position: "relative", height: 200, background: "linear-gradient(160deg, #BFD0A8, #8FAE72)" }}>
                    <div style={{ position: "absolute", right: "8%", bottom: "8%", width: "42%", height: "44%", borderRadius: "46% 54% 60% 40%", background: "linear-gradient(160deg,#7FB0C9,#5E94B0)" }} />
                    <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: .55 }} viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M10 82 Q40 60 50 54 T92 28" stroke="#fff" strokeWidth="1.6" fill="none" strokeDasharray="3 3" /></svg>
                    {([[46, 54, true], [38, 40, false], [64, 58, false], [80, 60, false]] as [number, number, boolean][]).map(([x, y, you], i) => (
                        <div key={i} style={{ position: "absolute", left: `${x}%`, top: `${y}%`, transform: "translate(-50%,-50%)" }}>
                            {you ? <div style={{ width: 18, height: 18, borderRadius: 99, background: "var(--gold)", border: "3px solid #fff", boxShadow: "0 2px 6px rgba(0,0,0,.3)" }} /> : <div style={{ width: 9, height: 9, borderRadius: 99, background: "var(--brand)", border: "2px solid #fff" }} />}
                        </div>
                    ))}
                    <div style={{ position: "absolute", left: 14, bottom: 12, color: "#fff", fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", textShadow: "0 1px 6px rgba(0,0,0,.4)" }}>{t.youAreHere}</div>
                </div>
                <PrimaryBtn icon="route" onClick={() => { closeSheet(); push(`/check-in/${code}/map`); }}>{t.openFullMap}</PrimaryBtn>
            </div>
        </Sheet>
    );
}

/* ---------- EVENT (detalhe) ---------- */
const EVT_LABELS: Record<Lang, { when: string; where: string; price: string; maps: string; link: string }> = {
    pt: { when: "Quando", where: "Local", price: "Entrada", maps: "Ver no Maps", link: "Ver ingresso / site" },
    en: { when: "When", where: "Location", price: "Entry", maps: "View on Maps", link: "Get tickets / visit site" },
    es: { when: "Cuándo", where: "Lugar", price: "Entrada", maps: "Ver en Maps", link: "Entradas / sitio web" },
};

function EventSheet({ event }: { event: Event }) {
    const { closeSheet, lang } = usePortal();
    const L = EVT_LABELS[lang] || EVT_LABELS.pt;
    const tone = event.type === "external" ? "plum" : "brand";
    const when = `${formatEventDate(event.startDate, event.endDate, lang)}${event.startTime ? ` · ${event.startTime}` : ""}${event.endTime ? `–${event.endTime}` : ""}`;
    return (
        <Sheet onClose={closeSheet} title={eventTitle(event, lang)} icon="ticket" iconTone={tone === "plum" ? "brand" : "brand"}>
            <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
                {event.imageUrl ? (
                    <div style={{ height: 150, borderRadius: 16, overflow: "hidden" }}><img src={event.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /></div>
                ) : (
                    <Photo icon="ticket" h={130} tone={tone} label={when} />
                )}
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ flex: "1 1 45%", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 13, padding: "11px 13px", display: "flex", alignItems: "center", gap: 8 }}><Icon n="clock" s={17} c="var(--brand)" /><span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink)" }}>{when}</span></div>
                    {event.location && <div style={{ flex: "1 1 45%", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 13, padding: "11px 13px", display: "flex", alignItems: "center", gap: 8 }}><Icon n="pin" s={17} c="var(--brand)" /><span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink)" }}>{event.location}</span></div>}
                </div>
                {eventDesc(event, lang) && <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.5 }}>{eventDesc(event, lang)}</p>}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 2px" }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em" }}>{L.price}</span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: "var(--brand)" }}>{eventPrice(event, lang)}</span>
                </div>
                {event.locationUrl && (
                    <a href={event.locationUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                        <GhostBtn icon="pin">{L.maps}</GhostBtn>
                    </a>
                )}
                {event.externalUrl && (
                    <a href={event.externalUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                        <PrimaryBtn icon="arrowright" tone="ink">{L.link}</PrimaryBtn>
                    </a>
                )}
            </div>
        </Sheet>
    );
}

/* ---------- HOST ---------- */
export function SheetHost({ sheet }: { sheet: { name: SheetName; payload?: unknown } | null }) {
    if (!sheet) return null;
    switch (sheet.name) {
        case "access": return <AccessSheet />;
        case "wifi": return <WifiSheet />;
        case "contact": return <ContactSheet />;
        case "dnd": return <DndSheet />;
        case "report": return <ReportSheet />;
        case "guide": return <GuideSheet which={(sheet.payload as "rules" | "pet" | "privacy") || "rules"} />;
        case "latecheckout": return <LateCheckoutSheet />;
        case "map": return <MapSheet />;
        case "event": return sheet.payload ? <EventSheet event={sheet.payload as Event} /> : null;
        default: return null;
    }
}
