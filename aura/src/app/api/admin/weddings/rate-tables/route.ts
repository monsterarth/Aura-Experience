// Tabelas de preço ATIVAS da propriedade — alimenta o select "tabela do
// simulador de convidados" no formulário de casamento, sem carregar o bundle
// inteiro do tarifário (que traz orçamentos e regras que o form não usa).
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { serverError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

const WEDDING_ROLES = ['super_admin', 'admin', 'reception', 'manager'] as const;
const ADMIN_TIER = ['super_admin', 'admin', 'manager'];

export async function GET(request: NextRequest) {
  const auth = await requireAuth([...WEDDING_ROLES]);
  if (isAuthError(auth)) return auth;

  const isAdminTier = ADMIN_TIER.includes(auth.staff.role);
  const requested = new URL(request.url).searchParams.get('propertyId');
  const propertyId = isAdminTier && requested ? requested : auth.staff.propertyId;
  if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });

  const { data, error } = await supabaseAdmin!
    .from('rate_tables')
    .select('id, name, "archivedAt"')
    .eq('propertyId', propertyId)
    .order('name');
  if (error) return serverError('weddings/rate-tables', error);

  return NextResponse.json({
    tables: (data || [])
      .filter((t) => !t.archivedAt)
      .map((t) => ({ id: t.id, name: t.name })),
  });
}
