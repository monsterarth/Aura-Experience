// Helpers de horário de funcionamento (derivados de Structure.operatingHours).
// Tudo no cliente, comparando com o horário atual do dispositivo.

export interface OperatingHours {
    openTime?: string;   // "HH:mm"
    closeTime?: string;  // "HH:mm"
}

function parseHM(s?: string): number | null {
    if (!s) return null;
    const [h, m] = s.split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
}

// 24h quando 00:00–23:59 (ou 00:00–00:00), convenção usada no admin.
export function is24h(oh?: OperatingHours | null): boolean {
    if (!oh) return false;
    const o = parseHM(oh.openTime), c = parseHM(oh.closeTime);
    if (o == null || c == null) return false;
    return (o === 0 && (c === 1439 || c === 0));
}

// true = aberto agora, false = fechado, null = sem horário configurado.
export function isOpenNow(oh?: OperatingHours | null, nowMinutes?: number): boolean | null {
    if (!oh) return null;
    const o = parseHM(oh.openTime), c = parseHM(oh.closeTime);
    if (o == null || c == null) return null;
    if (is24h(oh)) return true;
    const now = nowMinutes ?? (new Date().getHours() * 60 + new Date().getMinutes());
    if (o === c) return true;            // janela degenerada → tratamos como sempre aberto
    if (c > o) return now >= o && now < c;
    return now >= o || now < c;          // cruza a meia-noite
}

// Texto curto do horário: "24h" ou "08:00 – 22:00". Vazio se não configurado.
export function formatHours(oh?: OperatingHours | null, label24h = "24h"): string {
    if (!oh || !oh.openTime || !oh.closeTime) return "";
    if (is24h(oh)) return label24h;
    return `${oh.openTime} – ${oh.closeTime}`;
}
