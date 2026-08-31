import type { Event } from "@/types/aura";
import { eventOverlaps, eventSpansDay, localIso, todayIso } from "@/lib/event-dates";
import type { Lang } from "./context";
import { formatBRL } from "@/lib/money";

/* Helpers de evento compartilhados (ExploreScreen + EventSheet).
   Portados da página de eventos existente. */

const LOCALES: Record<Lang, string> = { pt: "pt-BR", en: "en-US", es: "es-ES" };
const FREE: Record<Lang, string> = { pt: "Gratuito", en: "Free", es: "Gratis" };

export function formatEventDate(startDate: string, endDate: string | undefined, lang: Lang): string {
    if (!startDate) return "";
    const [y, m, d] = startDate.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    const locale = LOCALES[lang] || "pt-BR";
    const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" };
    const formatted = date.toLocaleDateString(locale, opts);
    if (endDate && endDate !== startDate) {
        const [y2, m2, d2] = endDate.split("-").map(Number);
        const date2 = new Date(y2, m2 - 1, d2);
        return `${formatted} – ${date2.toLocaleDateString(locale, opts)}`;
    }
    return formatted;
}

/* Multi-dia: perguntam se o evento COBRE o período, não se ele começa nele —
   senão um evento de sexta a domingo perde o selo "hoje" no sábado. */
export function isToday(event: Event): boolean {
    if (!event?.startDate) return false;
    return eventSpansDay(event, todayIso());
}

export function isThisWeek(event: Event): boolean {
    if (!event?.startDate) return false;
    const today = new Date();
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);
    return eventOverlaps(event, localIso(today), localIso(nextWeek));
}

export function eventTitle(event: Event, lang: Lang): string {
    if (lang === "en" && event.titleEn) return event.titleEn;
    if (lang === "es" && event.titleEs) return event.titleEs;
    return event.title;
}

export function eventDesc(event: Event, lang: Lang): string | undefined {
    if (lang === "en" && event.descriptionEn) return event.descriptionEn;
    if (lang === "es" && event.descriptionEs) return event.descriptionEs;
    return event.description;
}

export function eventPrice(event: Event, lang: Lang): string {
    if (event.priceDescription) return event.priceDescription;
    if (!event.price || event.price === 0) return FREE[lang] || FREE.pt;
    return formatBRL(event.price);
}
