// src/app/api/guest/structure-slots/route.ts
// Leitura server-side das reservas existentes para calcular slots disponíveis.
// Usa supabaseAdmin para não inicializar sessão de auth no browser do hóspede.
//
// SEGURANÇA: valida posse pelo trio stayId + accessCode + propertyId antes de
// ler, e NUNCA devolve identidade de terceiro. Cada reserva sai só com o que o
// cálculo de slot precisa (horário, status, unidade); o `stayId` só é ecoado na
// reserva DA PRÓPRIA estadia, para o cliente distinguir "minha reserva" e poder
// cancelar/remarcar (structures/page.tsx compara `b.stayId === stay.id`).
// Sem isso a rota entregava `select("*")` — stayId, guestId e guestName de todo
// hóspede que já agendou — sem pedir nenhuma credencial.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get("propertyId");
    const structureId = searchParams.get("structureId");
    const date = searchParams.get("date");
    const stayId = searchParams.get("stayId");
    const accessCode = searchParams.get("accessCode");

    if (!propertyId || !structureId || !date || !stayId || !accessCode) {
        return NextResponse.json({ error: "Missing required params" }, { status: 400 });
    }

    if (!supabaseAdmin) {
        return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    // Posse: o stay precisa existir com esse accessCode nesta propriedade.
    const { data: stay } = await supabaseAdmin
        .from("stays")
        .select("id")
        .eq("id", stayId)
        .eq("accessCode", accessCode.toUpperCase())
        .eq("propertyId", propertyId)
        .maybeSingle();

    if (!stay) {
        return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin
        .from("structure_bookings")
        .select("id, structureId, propertyId, date, startTime, endTime, status, unitId, type, stayId")
        .eq("propertyId", propertyId)
        .eq("structureId", structureId)
        .eq("date", date);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Anonimiza: só a reserva da própria estadia mantém o stayId. As demais saem
    // sem nenhum identificador de hóspede — o cliente só precisa do horário ocupado.
    const bookings = (data || []).map((b) => ({
        id: b.id,
        structureId: b.structureId,
        propertyId: b.propertyId,
        date: b.date,
        startTime: b.startTime,
        endTime: b.endTime,
        status: b.status,
        unitId: b.unitId,
        type: b.type,
        stayId: b.stayId === stayId ? b.stayId : undefined,
    }));

    return NextResponse.json(bookings);
}
