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
//
// ── Conta (2026-08-24) ────────────────────────────────────────────────────────
// A aba "Conta" deixou de existir: a conta é da estadia, e é `billClosedAt` que
// decide a aba. Quem pede a lista manda `?scope=ativas|futuras|encerradas` — o
// status sozinho não basta, já que uma estadia `finished` pode estar em Ativas
// (conta aberta) ou em Encerradas (conta fechada).
// ──────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { stayDisplayName } from '@/lib/stay-display';
import { hasValidDocument } from '@/lib/guest-doc';

// Máximo de estadias encerradas retornadas (as mais recentes).
// Evita que o histórico cresça indefinidamente e quebre a rota.
const CLOSED_STAYS_LIMIT = 100;

export async function GET(request: NextRequest) {
    try {
        // Sessão + cargo. Antes esta rota só validava autenticação inline (herança do
        // mutirão do navigator.locks): QUALQUER staff logado — inclusive cargos de
        // campo — podia ler estadias + nome de hóspede + fólio de QUALQUER propriedade
        // trocando o ?propertyId=. Agora: cargo restrito + escopo de propriedade.
        const auth = await requireAuth(['super_admin', 'admin', 'reception', 'governance', 'manager']);
        if (isAuthError(auth)) return auth;

        if (!supabaseAdmin) return NextResponse.json(null, { status: 500 });

        const { searchParams } = new URL(request.url);
        const requested = searchParams.get('propertyId');
        const statusParam = searchParams.get('status'); // comma-separated

        // admin-tier pode consultar a propriedade pedida (super_admin tem seletor);
        // os demais ficam presos à própria — fecha o IDOR cross-property.
        const isAdminTier = ['super_admin', 'admin', 'manager'].includes(auth.staff.role);
        const propertyId = isAdminTier && requested ? requested : auth.staff.propertyId;

        if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });

        const statusList = statusParam ? statusParam.split(',').map(s => s.trim()).filter(Boolean) : [];

        // ── Aba pedida ────────────────────────────────────────────────────────
        //
        // Quem manda agora é `scope`, e não mais o conjunto de status: desde que a
        // conta virou o portão entre "Ativas" e "Encerradas", o status sozinho não
        // diz mais em que aba a estadia mora. Uma estadia `finished` com a conta
        // ABERTA continua em Ativas — a cabana só sai da vista de quem opera
        // quando alguém encerra a conta.
        //
        // `status=` continua aceito para não quebrar chamada antiga.
        const scope = searchParams.get('scope');
        const isEncerradas = scope ? scope === 'encerradas' : statusList.includes('cancelled');

        // ── 1. Busca as estadias ──────────────────────────────────────────────
        let query = supabaseAdmin
            .from('stays')
            .select('*')
            .eq('propertyId', propertyId);

        if (scope === 'ativas') {
            // Hóspede na casa + quem já saiu mas deixou a conta aberta.
            query = query
                .in('status', ['active', 'finished'])
                .or('status.eq.active,billClosedAt.is.null');
        } else if (scope === 'futuras') {
            query = query.in('status', ['pending', 'pre_checkin_done']);
        } else if (scope === 'encerradas') {
            // Só o que fechou o ciclo (ou nunca aconteceu).
            query = query.or('and(status.eq.finished,billClosedAt.not.is.null),status.eq.cancelled');
        } else if (statusList.length > 0) {
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
                ? supabaseAdmin.from('guests').select('id, fullName, document').in('id', guestIds)
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
        // O documento NÃO vai para o browser — só o booleano derivado. A lista precisa
        // saber se falta documento (alerta "Doc pendente"), não qual é o CPF.
        const guestMap = new Map<string, { fullName: string; hasDoc: boolean }>(
            (guestsRes.data ?? []).map((g: any) => [g.id, { fullName: g.fullName, hasDoc: hasValidDocument(g.document) }])
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
            const guest             = stay.guestId ? guestMap.get(stay.guestId) : undefined;
            return {
                ...stay,
                guestName:       stayDisplayName(stay, guest?.fullName, 'Hóspede desconhecido'),
                // Uso da casa não tem titular; fora isso, sem ficha ou sem documento = pendente.
                docPending:      !stay.internalUse && !guest?.hasDoc,
                cabinName:       cabinMap.get(stay.cabinId) ?? 'Sem Cabana',
                folioItems,
                pendingFolioCount,
                hasOpenFolio:    pendingFolioCount > 0,
            };
        });

        return NextResponse.json(enriched);
    } catch {
        return NextResponse.json(null, { status: 500 });
    }
}
