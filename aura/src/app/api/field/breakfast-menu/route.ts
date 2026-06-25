import { NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// Leitura server-side do cardápio à la carte do café (app do garçom). Lendo fb_categories /
// fb_menu_items pelo client do browser, o lock frio do refresh mobile devolvia [] → cardápio
// vazio. Aqui roda service-role com sessão dos cookies já validados pelo middleware.
// Retorna as linhas CRUAS (snake_case das tabelas fb_*); o mapeamento snake→camel continua na
// página — mesma forma e mesmos filtros de antes, só muda a origem da leitura.
export async function GET(req: Request) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const requested = searchParams.get('propertyId');
  const isAdminTier = ['super_admin', 'admin', 'manager'].includes(auth.staff.role);
  const propertyId = isAdminTier && requested ? requested : auth.staff.propertyId;

  if (!propertyId) return NextResponse.json({ categories: [], menuItems: [] });

  const [catRes, itemRes] = await Promise.all([
    supabaseAdmin
      .from('fb_categories')
      .select('*')
      .eq('property_id', propertyId)
      .in('type', ['breakfast', 'both'])
      .eq('ala_carte', true),
    supabaseAdmin
      .from('fb_menu_items')
      .select('*')
      .eq('property_id', propertyId)
      .eq('active', true),
  ]);

  if (catRes.error || itemRes.error) {
    console.error('[field/breakfast-menu]', catRes.error?.message ?? itemRes.error?.message);
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }

  return NextResponse.json({ categories: catRes.data ?? [], menuItems: itemRes.data ?? [] });
}
