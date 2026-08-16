import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { serverError } from '@/lib/api-error';

// Retorna contagem de ações de um usuário para exibição no card de perfil.
// Qualquer role autenticada pode consultar. Usuários comuns só podem ver
// a contagem do próprio userId ou de colegas da mesma propriedade.
// Admin/hr podem ver de qualquer usuário.
export async function GET(request: NextRequest) {
    const auth = await requireAuth();
    if (isAuthError(auth)) return auth;

    if (!supabaseAdmin) return NextResponse.json({ error: 'Server error' }, { status: 500 });

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate') || '';
    const requestedUserId = searchParams.get('userId') || auth.userId;

    const isPrivileged = ['super_admin', 'admin', 'manager'].includes(auth.staff.role);

    // Usuários comuns só podem ver colegas da mesma propriedade
    if (!isPrivileged && requestedUserId !== auth.userId) {
        const { data: targetStaff } = await supabaseAdmin
            .from('staff')
            .select('propertyId')
            .eq('id', requestedUserId)
            .single();
        if (!targetStaff || targetStaff.propertyId !== auth.staff.propertyId) {
            return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
        }
    }

    let query = supabaseAdmin
        .from('audit_logs')
        .select('*', { count: 'exact', head: true })
        .eq('userId', requestedUserId);

    if (startDate) query = query.gte('timestamp', startDate);

    const { count, error } = await query;
    if (error) return serverError('audit-logs/my-count', error);

    return NextResponse.json({ count: count ?? 0 });
}
