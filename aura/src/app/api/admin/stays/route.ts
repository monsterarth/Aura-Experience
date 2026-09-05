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

// Varredura para achar a última saída de cada cabana numa consulta só.
const LAST_EXITS_SWEEP = 400;

/**
 * Junta a cada estadia o que a lista precisa mostrar: nome do titular, cabana,
 * fólio e avaliação — tudo em queries em lote, nunca uma por estadia.
 *
 * A avaliação entrou aqui em 24/08/2026 e conserta uma coluna morta: a lista
 * mostrava "Avaliação" desde sempre lendo `stay.nps`, um campo que NADA no
 * sistema grava (o NPS vive em `survey_responses.metrics.npsScore`). Resultado:
 * "Sem avaliação" para todo mundo, e buscar por "promotor"/"detrator" nunca
 * achava nada.
 */
async function enrichStays(propertyId: string, stays: any[]) {
    if (!supabaseAdmin || stays.length === 0) return [];

    const guestIds = Array.from(new Set(stays.filter((s: any) => s.guestId).map((s: any) => s.guestId as string)));
    const cabinIds = Array.from(new Set(stays.filter((s: any) => s.cabinId).map((s: any) => s.cabinId as string)));
    const stayIds  = stays.map((s: any) => s.id as string);

    const [guestsRes, cabinsRes, folioRes, surveyRes] = await Promise.all([
        guestIds.length > 0
            ? supabaseAdmin.from('guests').select('id, fullName, document').in('id', guestIds).eq('propertyId', propertyId)
            : Promise.resolve({ data: [] as any[], error: null }),
        cabinIds.length > 0
            ? supabaseAdmin.from('cabins').select('id, name').in('id', cabinIds)
            : Promise.resolve({ data: [] as any[], error: null }),
        supabaseAdmin
            .from('folio_items')
            .select('id, stayId, description, quantity, unitPrice, totalPrice, status, category, type')
            .in('stayId', stayIds),
        supabaseAdmin
            .from('survey_responses')
            .select('id, stayId, metrics, createdAt')
            .in('stayId', stayIds),
    ]);

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

    // Mais de uma resposta por estadia é raro, mas acontece — fica a mais recente.
    const surveyByStay = new Map<string, { id: string; nps: number | null; overall: number | null }>();
    for (const r of (surveyRes.data ?? [])) {
        const prev = surveyByStay.get(r.stayId);
        if (prev) continue;
        surveyByStay.set(r.stayId, {
            id: r.id,
            nps: typeof r.metrics?.npsScore === 'number' ? r.metrics.npsScore : null,
            overall: typeof r.metrics?.overall === 'number' ? r.metrics.overall : null,
        });
    }

    return stays.map((stay: any) => {
        const folioItems        = folioByStay.get(stay.id) ?? [];
        const pendingFolioCount = folioItems.filter((f: any) => f.status === 'pending').length;
        const guest             = stay.guestId ? guestMap.get(stay.guestId) : undefined;
        const survey            = surveyByStay.get(stay.id);
        return {
            ...stay,
            guestName:       stayDisplayName(stay, guest?.fullName, 'Hóspede desconhecido'),
            // Uso da casa não tem titular; fora isso, sem ficha ou sem documento = pendente.
            docPending:      !stay.internalUse && !guest?.hasDoc,
            cabinName:       cabinMap.get(stay.cabinId) ?? 'Sem Cabana',
            folioItems,
            pendingFolioCount,
            hasOpenFolio:    pendingFolioCount > 0,
            nps:             survey?.nps ?? null,
            surveyOverall:   survey?.overall ?? null,
            surveyId:        survey?.id ?? null,
        };
    });
}

/**
 * A última saída de CADA cabana ativa — a grade fixa do topo de "Encerradas".
 *
 * Antes o histórico era um monte indistinto de 100 linhas e a pergunta mais
 * comum ("quem saiu por último da 7?") exigia rolar e procurar. Aqui cada cabana
 * ocupa um card até outro check-out sobrepor.
 *
 * Regras: só estadia que aconteceu de fato (`checkOutActual`) — cancelada nunca
 * ocupa o card; cabana inativa ou ignorada na ocupação fica de fora; cabana sem
 * saída registrada volta com `stay: null` para a grade não ficar com buracos.
 */
async function lastExitsByCabin(propertyId: string) {
    if (!supabaseAdmin) return [];

    const { data: cabins } = await supabaseAdmin
        .from('cabins')
        .select('id, name, number, active, ignoreInOccupancy')
        .eq('propertyId', propertyId);

    const eligible = (cabins ?? []).filter((c: any) => c.active !== false && !c.ignoreInOccupancy);
    if (eligible.length === 0) return [];

    // Uma varredura só resolve o caso comum; as cabanas que ficarem sem saída
    // dentro dela levam uma consulta dirigida (raro — cabana parada há meses).
    const { data: recent } = await supabaseAdmin
        .from('stays')
        .select('*')
        .eq('propertyId', propertyId)
        .eq('status', 'finished')
        .not('checkOutActual', 'is', null)
        .order('checkOutActual', { ascending: false })
        .limit(LAST_EXITS_SWEEP);

    const lastByCabin = new Map<string, any>();
    for (const stay of (recent ?? [])) {
        if (!stay.cabinId || lastByCabin.has(stay.cabinId)) continue;
        lastByCabin.set(stay.cabinId, stay);
    }

    const missing = eligible.filter((c: any) => !lastByCabin.has(c.id));
    if (missing.length > 0) {
        const found = await Promise.all(missing.map(async (c: any) => {
            const { data } = await supabaseAdmin!
                .from('stays')
                .select('*')
                .eq('propertyId', propertyId)
                .eq('cabinId', c.id)
                .eq('status', 'finished')
                .not('checkOutActual', 'is', null)
                .order('checkOutActual', { ascending: false })
                .limit(1);
            return data?.[0] ?? null;
        }));
        for (const stay of found) if (stay?.cabinId) lastByCabin.set(stay.cabinId, stay);
    }

    const enriched = await enrichStays(propertyId, Array.from(lastByCabin.values()));
    const byId = new Map(enriched.map((s: any) => [s.id, s]));

    return eligible
        .map((c: any) => ({
            cabinId: c.id,
            cabinName: c.name,
            cabinNumber: c.number,
            stay: lastByCabin.has(c.id) ? byId.get(lastByCabin.get(c.id).id) ?? null : null,
        }))
        .sort((a: any, b: any) => String(a.cabinNumber ?? a.cabinName).localeCompare(String(b.cabinNumber ?? b.cabinName), 'pt-BR', { numeric: true }));
}

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

        // ── Últimas saídas por cabana ─────────────────────────────────────────
        // Uma cabana parada há seis meses tem que aparecer do mesmo jeito, então
        // esta consulta é própria e não passa pelo limite do histórico.
        if (searchParams.get('view') === 'last-exits') {
            return NextResponse.json(await lastExitsByCabin(propertyId));
        }

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
            // Mais recentes primeiro; LIMIT evita carga irrestrita do histórico.
            // `before` é o "carregar mais": a página manda a saída mais antiga que
            // já tem e recebe a página seguinte.
            const before = searchParams.get('before');
            if (before) query = query.lt('checkOut', before);
            query = query.order('checkOut', { ascending: false }).limit(CLOSED_STAYS_LIMIT);
        } else {
            query = query.order('checkIn', { ascending: true });
        }

        const { data: stays, error } = await query;
        if (error || !stays || stays.length === 0) return NextResponse.json([], { status: 200 });

        const enriched = await enrichStays(propertyId, stays);

        return NextResponse.json(enriched);
    } catch {
        return NextResponse.json(null, { status: 500 });
    }
}
