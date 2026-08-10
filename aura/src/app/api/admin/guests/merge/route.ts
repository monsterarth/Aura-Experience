// src/app/api/admin/guests/merge/route.ts
// Unificação de cadastros duplicados: transfere as estadias e APAGA a ficha secundária.
// Destrutivo e cruzando duas tabelas — no browser dependia da RLS e podia parar no meio
// (estadias transferidas, ficha viva; ou pior, ficha apagada e estadias órfãs).
//
// Cargos: os mesmos do RoleGuard da /admin/guests. `governance` fica de fora de propósito —
// a governança não tem esse botão na tela.
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError, assertPropertyAccess } from '@/lib/api-auth';
import { GuestService } from '@/services/guest-service';

export async function POST(request: NextRequest) {
    const auth = await requireAuth(['super_admin', 'admin', 'manager', 'reception']);
    if (isAuthError(auth)) return auth;

    const body = await request.json().catch(() => null);
    const propertyId: string | undefined = body?.propertyId || auth.staff.propertyId;

    // Apagar ficha alheia é o pior caso de vazamento entre propriedades: valida a posse.
    const denied = assertPropertyAccess(auth, propertyId);
    if (denied) return denied;

    const primaryId = body?.primaryId ? String(body.primaryId) : '';
    const secondaryId = body?.secondaryId ? String(body.secondaryId) : '';
    if (!primaryId || !secondaryId) {
        return NextResponse.json({ error: 'Informe os dois cadastros.' }, { status: 400 });
    }
    if (primaryId === secondaryId) {
        return NextResponse.json({ error: 'Os cadastros são o mesmo.' }, { status: 400 });
    }

    try {
        // Autoria vem da sessão, não do corpo do request.
        const stayCount = await GuestService.mergeGuestsDirect(
            propertyId!,
            primaryId,
            secondaryId,
            auth.staff.id,
            auth.staff.fullName,
        );
        return NextResponse.json({ stayCount });
    } catch (e: any) {
        console.error('[guests/merge] falha ao unificar cadastros:', e);
        return NextResponse.json(
            { error: e?.message || 'Falha ao unificar os cadastros.' },
            { status: 500 },
        );
    }
}
