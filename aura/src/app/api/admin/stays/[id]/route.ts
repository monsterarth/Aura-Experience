// src/app/api/admin/stays/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { AuditService } from '@/services/audit-service';
import { applyOnCheckout } from '@/lib/housekeeping-rule-engine';
import { AutomationService } from '@/services/automation-service';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
    const auth = await requireAuth(['super_admin', 'admin', 'reception', 'governance', 'manager']);
    if (isAuthError(auth)) return auth;
    if (!supabaseAdmin) return NextResponse.json(null, { status: 500 });

    const { data: stay } = await supabaseAdmin
        .from('stays')
        .select('*')
        .eq('id', params.id)
        .single();

    if (!stay) return NextResponse.json(null, { status: 404 });

    // Escopo de propriedade (service-role ignora RLS): reception/governance só veem a própria;
    // admin-tier pode cross-property. 404 (não 403) para não vazar existência.
    const isAdminTier = ['super_admin', 'admin', 'manager'].includes(auth.staff.role);
    if (!isAdminTier && stay.propertyId !== auth.staff.propertyId) {
        return NextResponse.json(null, { status: 404 });
    }

    const [gRes, cRes] = await Promise.all([
        stay.guestId
            ? supabaseAdmin.from('guests').select('*').eq('id', stay.guestId).eq('propertyId', stay.propertyId).maybeSingle()
            : Promise.resolve({ data: null }),
        stay.cabinId
            ? supabaseAdmin.from('cabins').select('*').eq('id', stay.cabinId).maybeSingle()
            : Promise.resolve({ data: null }),
    ]);

    return NextResponse.json({
        stay,
        guest: gRes.data ?? null,
        cabin: cRes.data ?? null,
    });
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
    const auth = await requireAuth(['super_admin', 'admin', 'reception', 'governance', 'manager']);
    if (isAuthError(auth)) return auth;
    if (!supabaseAdmin) return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });

    const { action, propertyId, actorId, actorName, keyLocation } = await request.json();

    if (action !== 'checkout') {
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    const stayId = params.id;

    const { data: stay } = await supabaseAdmin.from('stays').select('cabinId, guestId').eq('id', stayId).single();
    const cabinId = stay?.cabinId;
    if (!cabinId) return NextResponse.json({ error: 'Acomodação não encontrada na reserva.' }, { status: 400 });

    const now = new Date().toISOString();

    // ── Trava do check-out ────────────────────────────────────────────────────
    //
    // Encerrar a conta é a PRIMEIRA coisa, e por UPDATE condicional: `status <> 'finished'`
    // faz o próprio Postgres eleger um vencedor. Quem não atualizar nenhuma linha perdeu a
    // corrida e sai daqui sem efeito nenhum.
    //
    // Ler o status antes e decidir no Node não resolveria: em produção houve check-out da
    // MESMA estadia por duas pessoas com 3 segundos de diferença (e a mesma pessoa clicando
    // de novo 30–50s depois, quando a tela demorava a responder). Os dois passariam pela
    // leitura antes de qualquer um gravar. O resultado eram duas mensagens de NPS e de
    // agradecimento para o hóspede, além de audit e faxinas em duplicidade.
    // A chave vira estado da conta já aqui: devolvida no balcão fecha o chip na
    // hora; ficou na cabana (ou ninguém sabe) espera a conferência da governança.
    const keyStatus = keyLocation === 'reception' ? 'reception' : 'awaiting_conference';

    const { data: claimed, error: claimError } = await supabaseAdmin.from('stays')
        .update({ status: 'finished', checkOutActual: now, keyLocation, keyStatus, keyStatusAt: now, keyStatusBy: auth.staff.id, updatedAt: now })
        .eq('id', stayId)
        .neq('status', 'finished')
        .select('id');

    if (claimError) {
        console.error('[Checkout] falha ao encerrar a estadia:', claimError.message);
        return NextResponse.json({ error: 'Não foi possível encerrar a conta.' }, { status: 500 });
    }

    if (!claimed?.length) {
        // Já encerrada por outra chamada. Responde sucesso (o resultado desejado está lá),
        // mas sem repetir automações, auditoria ou faxinas.
        console.log(`[Checkout] estadia ${stayId} já estava encerrada — nada refeito.`);
        return NextResponse.json({ success: true, alreadyFinished: true });
    }

    // Cancel pending daily tasks
    await supabaseAdmin.from('housekeeping_tasks')
        .update({
            status: 'cancelled',
            observations: 'Cancelada automaticamente por Check-out (Substituída por Faxina).',
            updatedAt: now,
        })
        .eq('propertyId', propertyId)
        .eq('cabinId', cabinId)
        .eq('type', 'daily')
        .eq('status', 'pending');

    // Free cabin
    await supabaseAdmin.from('cabins')
        .update({ status: 'cleaning', currentStayId: null })
        .eq('id', cabinId);

    // Apply on_checkout housekeeping rules
    await applyOnCheckout(propertyId, cabinId, stayId, keyLocation ?? 'unknown');

    // Build audit label
    let checkoutCabinLabel = cabinId;
    try {
        const [{ data: cabinData }, { data: guestData }] = await Promise.all([
            supabaseAdmin.from('cabins').select('number').eq('id', cabinId).single(),
            stay.guestId
                ? supabaseAdmin.from('guests').select('fullName').eq('id', stay.guestId).eq('propertyId', propertyId).single()
                : Promise.resolve({ data: null }),
        ]);
        const cabinNum = cabinData?.number || cabinId;
        const firstName = (guestData as any)?.fullName?.split(' ')[0] || '';
        checkoutCabinLabel = firstName ? `cabana ${cabinNum} - ${firstName}` : `cabana ${cabinNum}`;
    } catch { /* silent */ }

    await AuditService.log({
        propertyId,
        userId: actorId,
        userName: actorName,
        action: 'CHECKOUT',
        entity: 'STAY',
        entityId: stayId,
        details: `Check-out da ${checkoutCabinLabel} realizado.`,
    });

    // Trigger post-checkout automations (server-side via supabaseAdmin — RLS-safe)
    const [checkoutResult, npsResult] = await Promise.allSettled([
        AutomationService.triggerAutomationAdmin(propertyId, stayId, 'checkout_thanks'),
        AutomationService.triggerAutomationAdmin(propertyId, stayId, 'nps_survey'),
    ]);
    console.log('[Checkout] automations:', {
        checkout_thanks: checkoutResult.status === 'fulfilled' ? checkoutResult.value : checkoutResult.reason,
        nps_survey: npsResult.status === 'fulfilled' ? npsResult.value : npsResult.reason,
    });

    return NextResponse.json({ success: true });
}
