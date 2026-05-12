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

    const [gRes, cRes] = await Promise.all([
        stay.guestId
            ? supabaseAdmin.from('guests').select('*').eq('id', stay.guestId).maybeSingle()
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

    // Cancel pending daily tasks
    await supabaseAdmin.from('housekeeping_tasks')
        .update({
            status: 'cancelled',
            observations: 'Cancelada automaticamente por Check-out (Substituída por Faxina de Troca).',
            updatedAt: now,
        })
        .eq('propertyId', propertyId)
        .eq('cabinId', cabinId)
        .eq('type', 'daily')
        .eq('status', 'pending');

    // Finish stay
    await supabaseAdmin.from('stays')
        .update({ status: 'finished', checkOutActual: now, keyLocation, updatedAt: now })
        .eq('id', stayId);

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
                ? supabaseAdmin.from('guests').select('fullName').eq('id', stay.guestId).single()
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
        details: `Check-out da ${checkoutCabinLabel} realizado. Regras de automação de governança aplicadas.`,
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
