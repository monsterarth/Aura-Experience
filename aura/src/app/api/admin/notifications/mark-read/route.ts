// src/app/api/admin/notifications/mark-read/route.ts
// Marca mensagens WhatsApp inbound como lidas pelo admin.
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError, scopedPropertyId } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { serverError } from '@/lib/api-error';

export async function PATCH(request: NextRequest) {
    const auth = await requireAuth();
    if (isAuthError(auth)) return auth;

    if (!supabaseAdmin) return NextResponse.json({ error: 'Server error' }, { status: 500 });

    const body = await request.json();
    const { messageIds, markAll, propertyId: bodyPropertyId } = body as {
        messageIds?: string[];
        markAll?: boolean;
        propertyId?: string;
    };

    // Era `auth.staff.propertyId || (super_admin ? bodyPropertyId : null)`, e o `||` nunca
    // caía para o segundo termo: o super_admin tem `propertyId = 'default'` no cadastro, que
    // é truthy e não é propriedade nenhuma (as reais são estanciadovale, fazenda-do-rosa e
    // fazenda-modelo-aura). Resultado: ao clicar em "Limpar mensagens" o UPDATE rodava contra
    // 'default', atingia ZERO linhas, devolvia 200 — e o painel limpava só o estado local.
    // Ficava "18 novas mensagens / 0 conversas" na tela, e nada era marcado no banco.
    // O helper resolve na ordem certa: quem pode trocar de propriedade usa a que está
    // selecionada; os demais seguem presos à do próprio cadastro (não dá para escapar do
    // escopo mandando outro id no corpo). Esta era a última rota que não usava o helper —
    // as outras 35 já tinham sido migradas na rodada de escopo.
    const propertyId = scopedPropertyId(auth, bodyPropertyId);
    if (!propertyId) {
        return NextResponse.json({ error: 'Sem propriedade associada' }, { status: 403 });
    }

    let query = supabaseAdmin
        .from('messages')
        .update({ isReadByAdmin: true })
        .eq('propertyId', propertyId)
        .eq('direction', 'inbound')
        .eq('isReadByAdmin', false);

    if (!markAll) {
        if (!Array.isArray(messageIds) || messageIds.length === 0) {
            return NextResponse.json({ error: 'messageIds array required' }, { status: 400 });
        }
        query = query.in('id', messageIds);
    }

    const { error } = await query;
    if (error) return serverError('notifications/mark-read', error);

    return NextResponse.json({ ok: true });
}
