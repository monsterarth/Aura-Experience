import { NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// Leitura server-side das estruturas da propriedade do staff autenticado.
// A app da camareira lia estruturas via StructureService.getStructures (client do browser):
// no lock frio do refresh mobile a query pendurava/voltava vazia, deixando o mapa de estruturas
// vazio — a faxina de estrutura caía no fallback do UUID cru ("vê pelo ID e não pelo nome").
// Aqui a sessão vem dos cookies já validados pelo middleware e roda com service-role.
// select('*') porque a app precisa de `units` para resolver o nome da unidade.
export async function GET(req: Request) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const requested = searchParams.get('propertyId');
  const isAdminTier = ['super_admin', 'admin', 'manager'].includes(auth.staff.role);
  const propertyId = isAdminTier && requested ? requested : auth.staff.propertyId;

  if (!propertyId) return NextResponse.json([]);

  const { data, error } = await supabaseAdmin
    .from('structures')
    .select('*')
    .eq('propertyId', propertyId);

  if (error) {
    console.error('[field/structures]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
