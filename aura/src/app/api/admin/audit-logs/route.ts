// src/app/api/admin/audit-logs/route.ts
// Retorna logs de auditoria paginados para a propriedade do usuário logado.
// Super admins veem todos os logs (filtráveis por propriedade).
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { serverError } from '@/lib/api-error';

export async function GET(request: NextRequest) {
    const auth = await requireAuth();
    if (isAuthError(auth)) return auth;

    if (!supabaseAdmin) return NextResponse.json({ error: 'Server error' }, { status: 500 });

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');
    const entity = searchParams.get('entity') || '';
    const action = searchParams.get('action') || '';
    const search = searchParams.get('search') || '';
    const startDate = searchParams.get('startDate') || '';
    const endDate = searchParams.get('endDate') || '';
    const requestedUserId = searchParams.get('userId') || '';

    const isPrivileged = ['super_admin', 'admin', 'manager'].includes(auth.staff.role);
    const isSuperAdmin = auth.staff.role === 'super_admin';

    // Usuários comuns só podem ver os próprios logs — forçar userId
    const userId = isPrivileged ? requestedUserId : auth.userId;

    const propertyId = isSuperAdmin
        ? (searchParams.get('propertyId') || null)
        : auth.staff.propertyId;

    let query = supabaseAdmin
        .from('audit_logs')
        .select('*', { count: 'exact' })
        .order('timestamp', { ascending: false })
        .range(offset, offset + limit - 1);

    if (propertyId) query = query.eq('propertyId', propertyId);
    if (userId) query = query.eq('userId', userId);
    if (entity) query = query.eq('entity', entity);
    if (action) query = query.eq('action', action);
    const excludePrefix = searchParams.get('excludePrefix') || '';
    if (excludePrefix) query = query.not('action', 'like', `${excludePrefix}%`);
    if (search) {
        // Neutraliza a sintaxe de filtro do PostgREST: vírgula e parênteses SEPARAM e
        // ANINHAM condições dentro do .or(), e '*' é curinga. Sem isto, um termo com
        // ',' ou '()' reescreve o filtro (ex.: injetar uma condição sempre-verdadeira).
        // Não é SQLi (PostgREST parametriza), mas é injeção de sintaxe de filtro.
        const safe = search.replace(/[,()*\\]/g, ' ').trim();
        if (safe) query = query.or(`userName.ilike.%${safe}%,details.ilike.%${safe}%`);
    }
    if (startDate) query = query.gte('timestamp', startDate);
    if (endDate) {
        // Include the full end day
        const end = new Date(endDate);
        end.setDate(end.getDate() + 1);
        query = query.lt('timestamp', end.toISOString());
    }

    const { data, error, count } = await query;
    if (error) return serverError('audit-logs', error);

    return NextResponse.json({ logs: data, total: count });
}
