// src/app/api/admin/guests/stays/route.ts
// Histórico de estadias de uma ficha, no servidor com service-role.
// Pelo client do browser a leitura dependia da RLS de `stays`/`cabins` e voltava vazia:
// a aba "Histórico de Estadias" dizia "nenhuma estadia registrada" para quem tinha.
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { GuestService } from '@/services/guest-service';

export async function GET(request: NextRequest) {
    const auth = await requireAuth(['super_admin', 'admin', 'manager', 'reception', 'governance']);
    if (isAuthError(auth)) return auth;

    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get('propertyId');
    const guestId = searchParams.get('guestId');

    if (!propertyId) return NextResponse.json({ error: 'propertyId obrigatório.' }, { status: 400 });
    if (!guestId) return NextResponse.json({ error: 'guestId obrigatório.' }, { status: 400 });

    try {
        const stays = await GuestService.getGuestStaysDirect(propertyId, guestId);
        return NextResponse.json({ stays });
    } catch (e: any) {
        console.error('[guests/stays] falha ao ler estadias:', e);
        return NextResponse.json(
            { error: e?.message || 'Falha ao carregar o histórico de estadias.' },
            { status: 500 },
        );
    }
}
