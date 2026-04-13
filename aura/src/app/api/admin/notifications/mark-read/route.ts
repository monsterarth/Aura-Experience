// src/app/api/admin/notifications/mark-read/route.ts
// Marca mensagens WhatsApp inbound como lidas pelo admin.
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';

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

    const propertyId = auth.staff.propertyId || (auth.staff.role === 'super_admin' ? bodyPropertyId : null);
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
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
}
