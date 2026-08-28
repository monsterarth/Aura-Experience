// src/app/api/admin/platform/route.ts
// Retrato da plataforma inteira para o painel do super admin.
//
// UMA rota, UM JSON. É deliberado: a versão antiga da página disparava cinco
// consultas do navegador direto ao Supabase (contagens + auditoria global) só
// para desenhar quatro números. Aqui tudo é agregado no banco e servido de uma
// vez, então o painel que vigia o consumo custa alguns kilobytes por carga.
//
// Só super_admin: isto atravessa TODAS as propriedades e expõe infraestrutura.
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { serverError } from '@/lib/api-error';
import { getPlatformSnapshot } from '@/services/platform-health-service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const auth = await requireAuth(['super_admin']);
    if (isAuthError(auth)) return auth;

    try {
        const days = Math.min(Math.max(parseInt(new URL(request.url).searchParams.get('days') || '30', 10) || 30, 7), 90);
        return NextResponse.json(await getPlatformSnapshot(days));
    } catch (e) {
        return serverError('admin/platform', e);
    }
}
