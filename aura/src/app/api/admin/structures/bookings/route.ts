// src/app/api/admin/structures/bookings/route.ts
// Agenda de estruturas server-side — bypasses browser navigator.locks entirely.
// Uses supabaseAdmin (service role, no auth lock) to fetch structures + bookings + active stays.
//
// Motivo: a página /admin/estruturas/bookings buscava via browser client
// (StructureService/StayService), e toda query do browser client serializa no
// navigator.locks. No F5 esse lock fica retido por até 10s → a tela congelava em
// "Carregando horários...". Esta rota segue o mesmo padrão de /api/admin/stays.
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';

// Estadias relevantes para a agenda do dia (mesma lista usada antes na página).
const STAY_STATUS = ['pending', 'pre_checkin_done', 'active', 'late_checkout'];

export async function GET(request: NextRequest) {
    try {
        // Sessão + cargo + escopo de propriedade. Antes só validava autenticação
        // inline: qualquer staff logado lia a agenda (com nome de hóspede/cabana) de
        // QUALQUER propriedade trocando o ?propertyId=. Mesmo fecho do /api/admin/stays.
        const auth = await requireAuth(['super_admin', 'admin', 'reception', 'governance', 'manager']);
        if (isAuthError(auth)) return auth;

        if (!supabaseAdmin) return NextResponse.json(null, { status: 500 });

        const { searchParams } = new URL(request.url);
        const requested = searchParams.get('propertyId');
        const date = searchParams.get('date'); // YYYY-MM-DD

        const isAdminTier = ['super_admin', 'admin', 'manager'].includes(auth.staff.role);
        const propertyId = isAdminTier && requested ? requested : auth.staff.propertyId;

        if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });
        if (!date) return NextResponse.json({ error: 'date required' }, { status: 400 });

        // Janela UTC de ±1 dia em torno da data — superset seguro do filtro local da
        // página (tolerante a fuso). Recorta as estadias na origem em vez de puxar
        // todas as reservas futuras (status 'pending').
        const dayMs = 86400000;
        const mid = new Date(`${date}T00:00:00.000Z`).getTime();
        const stayFrom = new Date(mid - dayMs).toISOString();         // D-1 00:00:00.000Z
        const stayTo = new Date(mid + 2 * dayMs - 1).toISOString();   // D+1 23:59:59.999Z

        // ── 1. Structures, bookings do dia e estadias da janela — em paralelo ──
        const [structuresRes, bookingsRes, staysRes] = await Promise.all([
            supabaseAdmin
                .from('structures')
                .select('*')
                .eq('propertyId', propertyId)
                .neq('visibility', 'map_only'),
            supabaseAdmin
                .from('structure_bookings')
                .select('*')
                .eq('propertyId', propertyId)
                .eq('date', date),
            supabaseAdmin
                .from('stays')
                .select('*')
                .eq('propertyId', propertyId)
                .in('status', STAY_STATUS)
                .lte('checkIn', stayTo)
                .gte('checkOut', stayFrom)
                .order('checkIn', { ascending: true }),
        ]);

        const structures = structuresRes.data ?? [];
        const bookings = bookingsRes.data ?? [];
        const stays = staysRes.data ?? [];

        // ── 2. Enriquece estadias com nome do hóspede e da cabana (batch) ──
        const guestIds = Array.from(new Set(stays.filter((s: any) => s.guestId).map((s: any) => s.guestId as string)));
        const cabinIds = Array.from(new Set(stays.filter((s: any) => s.cabinId).map((s: any) => s.cabinId as string)));

        const [guestsRes, cabinsRes] = await Promise.all([
            guestIds.length > 0
                ? supabaseAdmin.from('guests').select('id, fullName').in('id', guestIds).eq('propertyId', propertyId)
                : Promise.resolve({ data: [] as any[], error: null }),
            cabinIds.length > 0
                ? supabaseAdmin.from('cabins').select('id, name').in('id', cabinIds)
                : Promise.resolve({ data: [] as any[], error: null }),
        ]);

        const guestMap = new Map<string, string>((guestsRes.data ?? []).map((g: any) => [g.id, g.fullName]));
        const cabinMap = new Map<string, string>((cabinsRes.data ?? []).map((c: any) => [c.id, c.name]));

        const activeStays = stays.map((stay: any) => ({
            ...stay,
            guestName: guestMap.get(stay.guestId) ?? 'Hóspede desconhecido',
            cabinName: cabinMap.get(stay.cabinId) ?? 'Sem Cabana',
        }));

        return NextResponse.json({ structures, bookings, activeStays });
    } catch {
        return NextResponse.json(null, { status: 500 });
    }
}
