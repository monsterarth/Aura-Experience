import { NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// Leitura server-side do staff da propriedade do staff autenticado (para listas de atribuição
// nas apps de campo). Lendo por StaffService.getStaffByProperty (client do browser), o lock frio
// do refresh mobile devolvia [] e o loader (sem timeout) podia pendurar. Aqui roda service-role
// com sessão dos cookies já validados pelo middleware.
// Colunas explícitas (não select('*')): service-role ignora RLS, então só expomos o necessário
// p/ montar as listas — mesmo conjunto do governanta-bootstrap.
export async function GET(req: Request) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const requested = searchParams.get('propertyId');
  const isAdminTier = ['super_admin', 'admin', 'manager'].includes(auth.staff.role);
  const propertyId = isAdminTier && requested ? requested : auth.staff.propertyId;

  if (!propertyId) return NextResponse.json([]);

  const { data, error } = await supabaseAdmin
    .from('staff')
    .select('id, fullName, role, secondaryRoles, active, propertyId')
    .eq('propertyId', propertyId);

  if (error) {
    console.error('[field/staff]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
