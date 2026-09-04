// src/app/api/guest/today/route.ts
// "Sua jornada hoje" — agrega a agenda do dia do hóspede a partir das fontes
// existentes e devolve itens SEMÂNTICOS já ranqueados (texto/i18n fica no cliente).
// Usa supabaseAdmin (hóspede anônimo); valida posse via stayId + accessCode.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { notEndedBefore } from "@/lib/event-dates";

type TodayItem = {
    id: string;
    kind: "breakfast" | "booking" | "event" | "concierge" | "checkout" | "dnd" | "house" | "survey";
    icon: string;
    tone: string;
    urgent?: boolean;
    sortKey: number;
    data: Record<string, unknown>;
};

const toMin = (hhmm?: string) => {
    if (!hhmm || !/^\d{1,2}:\d{2}/.test(hhmm)) return 0;
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
};
const addDay = (iso: string, days: number) => {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + days));
    return dt.toISOString().split("T")[0];
};
// Horário curto e neutro de idioma: "24h", "08:00 – 22:00", ou "" se não configurado.
const formatHours = (oh?: { openTime?: string; closeTime?: string }): string => {
    const o = oh?.openTime, c = oh?.closeTime;
    if (!o || !c) return "";
    if (o === "00:00" && (c === "23:59" || c === "00:00")) return "24h";
    return `${o} – ${c}`;
};

export async function GET(req: NextRequest) {
    if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    const { searchParams } = new URL(req.url);
    const stayId = searchParams.get("stayId");
    const propertyId = searchParams.get("propertyId");
    const accessCode = searchParams.get("accessCode");
    const date = searchParams.get("date"); // hoje (YYYY-MM-DD, local do hóspede)

    if (!stayId || !propertyId || !accessCode || !date) {
        return NextResponse.json({ error: "Missing required params" }, { status: 400 });
    }
    // `date` vem do navegador do hóspede e é interpolado no filtro `.or()` dos
    // eventos — sem validar, dá para reescrever o filtro do PostgREST.
    const spansToday = notEndedBefore(date);
    if (!spansToday) return NextResponse.json({ error: "Invalid date" }, { status: 400 });

    // Validação de posse
    const { data: stay } = await supabaseAdmin
        .from("stays")
        .select("id, checkOut, dnd_enabled, dnd_until, cestaBreakfastEnabled, status, hasSurvey")
        .eq("id", stayId).eq("accessCode", accessCode).eq("propertyId", propertyId)
        .single();
    if (!stay) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

    const tomorrow = addDay(date, 1);
    const items: TodayItem[] = [];

    // ONDA 2 do carregamento: quatro leituras que não dependem uma da outra.
    // Eram sequenciais — seis idas ao banco antes da primeira pintura do portal,
    // cada uma com a latência cheia de serverless + Postgres remoto.
    // (A checagem de posse acima continua ANTES de tudo: ela é quem autoriza.)
    const [propertyRes, bookingsRes, eventsRes, conciergeRes, houseRes] = await Promise.all([
        supabaseAdmin.from("properties").select("settings").eq("id", propertyId).maybeSingle(),
        supabaseAdmin
            .from("structure_bookings").select("id, structureId, startTime, status")
            .eq("stayId", stayId).eq("propertyId", propertyId).eq("date", date)
            .in("status", ["pending", "approved"]).order("startTime", { ascending: true }),
        supabaseAdmin
            .from("events").select("id, title, titleEn, titleEs, startDate, endDate, startTime, location")
            .eq("propertyId", propertyId).eq("status", "published")
            // Cobre o dia, não começa no dia: com `.eq` o evento de vários dias
            // aparecia só na abertura e sumia da agenda em todos os dias do meio.
            .lte("startDate", date).or(spansToday)
            .order("startTime", { ascending: true }),
        supabaseAdmin
            .from("concierge_requests").select("id", { count: "exact", head: true })
            .eq("propertyId", propertyId).eq("stayId", stayId).in("status", ["pending", "in_progress"]),
        // NÚCLEO: áreas informativas da casa (mapa) com horário — não depende de módulo.
        supabaseAdmin
            .from("structures").select("id, name, name_en, name_es, operatingHours")
            .eq("propertyId", propertyId).eq("showOnMap", true),
    ]);

    const property = propertyRes.data;
    const bookings = bookingsRes.data;
    const events = eventsRes.data;
    const conciergeCount = conciergeRes.count;
    const houseAreas = houseRes.data;

    const fb = property?.settings?.fbSettings?.breakfast;
    const resolved = fb?.modality === "both" ? (fb?.dailyMode ?? "delivery") : fb?.modality;
    const effective = stay.cestaBreakfastEnabled === true ? "delivery" : resolved;

    // ONDA 3: só o que depende do que veio acima — o pedido de café depende da
    // modalidade, e o nome das estruturas depende dos ids das reservas. Fora
    // dessas condições, nenhuma das duas chega a ser consultada.
    const [orderRes, structsRes] = await Promise.all([
        fb?.enabled && effective === "delivery"
            ? supabaseAdmin
                .from("fb_orders")
                .select("delivery_time, status")
                .eq("stay_id", stayId).eq("property_id", propertyId)
                .eq("delivery_date", tomorrow).eq("type", "breakfast").neq("status", "cancelled")
                .maybeSingle()
            : Promise.resolve({ data: null }),
        bookings?.length
            ? supabaseAdmin.from("structures").select("id, name")
                .in("id", Array.from(new Set(bookings.map((b: { structureId: string }) => b.structureId))))
            : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);

    // 1) Café (entrega) de amanhã
    if (fb?.enabled && effective === "delivery") {
        const order = orderRes.data as { delivery_time?: string; status?: string } | null;
        if (order) {
            items.push({ id: "breakfast", kind: "breakfast", icon: "coffee", tone: "brand", sortKey: 60, data: { state: "ordered", time: order.delivery_time } });
        } else {
            items.push({ id: "breakfast", kind: "breakfast", icon: "coffee", tone: "brand", urgent: true, sortKey: 0, data: { state: "none", deadline: fb?.delivery?.orderWindowEnd } });
        }
    }

    // 2) Reservas de hoje
    if (bookings?.length) {
        const nameMap: Record<string, string> = {};
        for (const st of ((structsRes.data || []) as { id: string; name: string }[])) nameMap[st.id] = st.name;
        for (const b of bookings as { id: string; structureId: string; startTime: string; status: string }[]) {
            items.push({ id: `booking-${b.id}`, kind: "booking", icon: "calendar", tone: "green", sortKey: 100 + toMin(b.startTime), data: { name: nameMap[b.structureId] || "", time: b.startTime, status: b.status } });
        }
    }

    // 3) Eventos de hoje
    for (const e of ((events || []) as { id: string; title: string; titleEn?: string; titleEs?: string; startTime?: string; location?: string }[]).slice(0, 2)) {
        items.push({ id: `event-${e.id}`, kind: "event", icon: "ticket", tone: "gold", sortKey: 120 + toMin(e.startTime || "12:00"), data: { title: e.title, titleEn: e.titleEn, titleEs: e.titleEs, time: e.startTime, location: e.location } });
    }

    // 4) Concierge em andamento
    if ((conciergeCount ?? 0) > 0) {
        items.push({ id: "concierge", kind: "concierge", icon: "bell", tone: "gold", sortKey: 600, data: { count: conciergeCount } });
    }

    // 5) Check-out (hoje ou amanhã)
    if (stay.checkOut) {
        const co = new Date(stay.checkOut);
        const coDate = co.toISOString().split("T")[0];
        if (coDate === date || coDate === tomorrow) {
            items.push({ id: "checkout", kind: "checkout", icon: "clock", tone: "neutral", sortKey: 700, data: { iso: stay.checkOut, today: coDate === date } });
        }
    }

    // 6) Não Perturbe ativo
    if (stay.dnd_enabled) {
        items.push({ id: "dnd", kind: "dnd", icon: "moon", tone: "gold", sortKey: 800, data: { until: stay.dnd_until } });
    }

    // ── PRODUTORES DE NÚCLEO ────────────────────────────────────────────────
    // A agenda tinha 6 fontes e 5 eram de módulo: sem módulo contratado a seção
    // sumia (docs/PORTAL-NUCLEO.md §1). Estes dois produtores nascem de dado que
    // o núcleo já tem — não dependem de nenhum módulo. São PREENCHIMENTO: recebem
    // as MAIORES sortKeys (acima de dnd=800) para só ocuparem folga — nunca
    // empurram cartão operacional (café, reserva, concierge, check-out) para fora
    // do corte de 6. Quando a agenda está vazia, são os únicos e aparecem.

    // 7) A casa hoje — áreas informativas do mapa e seus horários.
    const areas = ((houseAreas || []) as { id: string; name: string; name_en?: string; name_es?: string; operatingHours?: { openTime?: string; closeTime?: string } }[])
        .map((s) => ({ name: s.name, nameEn: s.name_en, nameEs: s.name_es, hours: formatHours(s.operatingHours) }))
        .filter((a) => a.hours) // só entra quem tem horário configurado
        .slice(0, 6);
    if (areas.length > 0) {
        items.push({ id: "house", kind: "house", icon: "compass", tone: "brand", sortKey: 900, data: { areas } });
    }

    // 8) Convite à pesquisa — só no último dia e só se ainda não respondeu.
    if (stay.checkOut) {
        const coDate = new Date(stay.checkOut).toISOString().split("T")[0];
        if (coDate === date && stay.hasSurvey !== true) {
            items.push({ id: "survey", kind: "survey", icon: "star", tone: "gold", sortKey: 950, data: {} });
        }
    }

    items.sort((a, b) => a.sortKey - b.sortKey);
    return NextResponse.json({ items: items.slice(0, 6) });
}
