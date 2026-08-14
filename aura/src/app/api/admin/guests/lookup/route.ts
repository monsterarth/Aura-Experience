// src/app/api/admin/guests/lookup/route.ts
// Busca de hóspede por documento (CPF/passaporte/...) para a tela de Nova Hospedagem.
// Roda no servidor com service-role: o client do browser pendura no lock frio de auth e
// deixava o spinner do campo de CPF girando pra sempre.
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError, scopedPropertyId } from '@/lib/api-auth';
import { GuestService } from '@/services/guest-service';

export async function GET(request: NextRequest) {
    const auth = await requireAuth(['super_admin', 'admin', 'manager', 'reception', 'governance']);
    if (isAuthError(auth)) return auth;

    const { searchParams } = new URL(request.url);
    const propertyId = scopedPropertyId(auth, searchParams.get('propertyId'));
    const doc = searchParams.get('doc');

    if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });
    if (!doc) return NextResponse.json({ guest: null });

    const guest = await GuestService.findByDocument(propertyId, doc);
    return NextResponse.json({ guest });
}
