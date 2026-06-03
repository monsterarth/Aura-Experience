// src/app/api/admin/stays/route.ts
// Server-side stays list — bypasses browser navigator.locks entirely.
// Uses supabaseAdmin (service role, no auth lock) to fetch stays + guest/cabin names.
//
// ── Perf fix (2026-05-26) ──────────────────────────────────────────────────────
// Anterior: N×3 queries paralelas (uma por estadia) → até 705 conexões simultâneas
//           para encerradas/conta → pool do Supabase saturava → 10–15s de resposta.
// Agora:    4 queries batch totais (stays + guests + cabins + folio_items) →
//           join em memória → < 500ms esperado para qualquer volume.
// "encerradas" é limitado a 100 mais recentes (checkOut desc) para evitar crescimento.
// "conta" (status=finished only) filtra server-side e só retorna as que têm saldo.
// ──────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase';
import { stayDisplayName } from '@/lib/stay-display';

// Máximo de estadias encerradas retornadas (as mais recentes).
// Evita que o histórico cresça indefinidamente e quebre a rota.
const CLOSED_STAYS_LIMIT = 100;

export async function GET(request: NextRequest) {
    try {
        // Validate session server-side
        const cookieStore = cookies();
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() { return cookieStore.getAll(); },
                    setAll() {},
                },
            }
        );
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) return NextResponse.json(null, { status: 401 });

        if (!supabaseAdmin) return NextResponse.json(null, { status: 500 });

        const { searchParams } = new URL(request.url);
        const propertyId = searchParams.get('propertyId');
        const statusParam = searchParams.get('status'); // comma-separated

        if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });

        const statusList = statusParam ? statusParam.split(',').map(s => s.trim()).filter(Boolean) : [];

        // Detecta aba pelo conjunto de status:
        //   "encerradas" → ['finished','cancelled']  → limita + ordena por checkOut desc
        //   "conta"      → ['finished']              → filtra server-side por saldo pendente
        //   demais       → sem limite, ordena por checkIn asc
        const isEncerradas = statusList.includes('cancelled');
        const isContaOnly  = statusList.length === 1 && statusList[0] === 'finished';

        // ── 1. Busca as estadias ──────────────────────────────────────────────
        let query = supabaseAdmin
            .from('stays')
            .select('*')
            .eq('propertyId', propertyId);

        if (statusList.length > 0) {
            query = query.in('status', statusList);
        }

        if (isEncerradas) {
            // Mais recentes primeiro; LIMIT evita carga irrestrita do histórico
            query = query.order('checkOut', { ascending: false }).limit(CLOSED_STAYS_LIMIT);
        } else {
            query = query.order('checkIn', { ascending: true });
        }

        const { data: stays, error } = await query;
        if (error || !stays || stays.length === 0) return NextResponse.json([], { status: 200 });

        // ── 2. Coleta IDs únicos para busca em lote ───────────────────────────
        const guestIds = Array.from(new Set(stays.filter((s: any) => s.guestId).map((s: any) => s.guestId as string)));
        const cabinIds = Array.from(new Set(stays.filter((s: any) => s.cabinId).map((s: any) => s.cabinId as string)));
        const stayIds  = stays.map((s: any) => s.id as string);

        // ── 3. Três queries batch em paralelo (antes eram N×3) ────────────────
        const [guestsRes, cabinsRes, folioRes] = await Promise.all([
            guestIds.length > 0
                ? supabaseAdmin.from('guests').select('id, fullName').in('id', guestIds)
                : Promise.resolve({ data: [] as any[], error: null }),
            cabinIds.length > 0
                ? supabaseAdmin.from('cabins').select('id, name').in('id', cabinIds)
                : Promise.resolve({ data: [] as any[], error: null }),
            supabaseAdmin
                .from('folio_items')
                .select('id, stayId, description, quantity, unitPrice, totalPrice, status, category')
                .in('stayId', stayIds),
        ]);

        // ── 4. Mapas de lookup O(1) ───────────────────────────────────────────
        const guestMap = new Map<string, string>(
            (guestsRes.data ?? []).map((g: any) => [g.id, g.fullName])
        );
        const cabinMap = new Map<string, string>(
            (cabinsRes.data ?? []).map((c: any) => [c.id, c.name])
        );

        const folioByStay = new Map<string, any[]>();
        for (const item of (folioRes.data ?? [])) {
            const sid: string = item.stayId;
            if (!folioByStay.has(sid)) folioByStay.set(sid, []);
            folioByStay.get(sid)!.push(item);
        }

        // ── 5. Join em memória ────────────────────────────────────────────────
        const enriched = stays.map((stay: any) => {
            const folioItems       = folioByStay.get(stay.id) ?? [];
            const pendingFolioCount = folioItems.filter((f: any) => f.status === 'pending').length;
            return {
                ...stay,
                guestName:       stayDisplayName(stay, guestMap.get(stay.guestId), 'Hóspede desconhecido'),
                cabinName:       cabinMap.get(stay.cabinId) ?? 'Sem Cabana',
                folioItems,
                pendingFolioCount,
                hasOpenFolio:    pendingFolioCount > 0,
            };
        });

        // ── 6. Aba "Conta": filtra server-side (antes era client-side sobre 190 stays) ──
        if (isContaOnly) {
            return NextResponse.json(
                enriched.filter((s: any) => s.pendingFolioCount > 0 || !!s.lostItemsDescription)
            );
        }

        return NextResponse.json(enriched);
    } catch {
        return NextResponse.json(null, { status: 500 });
    }
}
