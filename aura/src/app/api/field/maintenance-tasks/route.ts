// src/app/api/field/maintenance-tasks/route.ts
// Leitura server-side das tarefas de manutenção da propriedade do staff autenticado.
// Mesmo motivo da rota de housekeeping: evita o quadro vazio causado por token do
// browser brevemente expirado no refresh mobile (a query RLS direta retornava []).
import { NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const requested = searchParams.get('propertyId');
  const isAdminTier = ['super_admin', 'admin', 'manager'].includes(auth.staff.role);
  const propertyId = isAdminTier && requested ? requested : auth.staff.propertyId;

  if (!propertyId) return NextResponse.json([]);

  const { data, error } = await supabaseAdmin
    .from('maintenance_tasks')
    .select('*')
    .eq('propertyId', propertyId);

  if (error) {
    console.error('[field/maintenance-tasks]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
