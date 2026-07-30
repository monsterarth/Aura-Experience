// src/app/api/admin/guests/upsert/route.ts
// Grava/atualiza a ficha do hóspede no servidor com service-role.
// A escrita pelo client do browser pendurava no lock frio de auth (mesma causa do spinner
// infinito na busca de CPF) — aqui a reserva não fica no meio do caminho.
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { GuestService } from '@/services/guest-service';

export async function POST(request: NextRequest) {
    const auth = await requireAuth(['super_admin', 'admin', 'manager', 'reception', 'governance']);
    if (isAuthError(auth)) return auth;

    const body = await request.json().catch(() => null);
    const propertyId = body?.propertyId;
    const guestData = body?.guestData;

    if (!propertyId) return NextResponse.json({ error: 'propertyId obrigatório.' }, { status: 400 });
    if (!guestData || !GuestService.normalizeDocument(guestData.id ?? '')) {
        return NextResponse.json({ error: 'Ficha do hóspede sem identificador válido.' }, { status: 400 });
    }

    try {
        // Autoria vem da sessão, não do corpo do request: o cliente não decide quem assinou o log.
        const id = await GuestService.upsertGuestDirect(
            propertyId,
            guestData,
            auth.staff.id,
            auth.staff.fullName,
        );
        return NextResponse.json({ id });
    } catch (e: any) {
        console.error('[guests/upsert] falha ao gravar hóspede:', e);
        return NextResponse.json(
            { error: e?.message || 'Falha ao gravar a ficha do hóspede.' },
            { status: 500 },
        );
    }
}
