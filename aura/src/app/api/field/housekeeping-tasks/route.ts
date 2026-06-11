// src/app/api/field/housekeeping-tasks/route.ts
// Leitura server-side das tarefas de governança da propriedade do staff autenticado.
// Substitui a query RLS do browser nas apps de campo (maid/governanta): aquela retornava
// [] quando o access token do browser estava brevemente expirado (refresh mobile),
// apagando o quadro de faxinas mesmo havendo tarefas. Aqui a sessão vem dos cookies já
// validados/renovados pelo middleware, então o resultado reflete a verdade do banco.
import { NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  // Staff de campo: usa SEMPRE a própria propriedade (segurança — ignora query do cliente).
  // Admin-tier (que pode visualizar qualquer propriedade): honra o propertyId pedido.
  const { searchParams } = new URL(req.url);
  const requested = searchParams.get('propertyId');
  const isAdminTier = ['super_admin', 'admin', 'manager'].includes(auth.staff.role);
  const propertyId = isAdminTier && requested ? requested : auth.staff.propertyId;

  if (!propertyId) return NextResponse.json([]);

  const { data, error } = await supabaseAdmin
    .from('housekeeping_tasks')
    .select('*')
    .eq('propertyId', propertyId)
    .neq('status', 'cancelled');

  if (error) {
    console.error('[field/housekeeping-tasks]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
