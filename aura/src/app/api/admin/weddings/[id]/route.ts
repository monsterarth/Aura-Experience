import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';

const WEDDING_ROLES = ['super_admin', 'admin', 'reception', 'manager'] as const;
const ADMIN_TIER = ['super_admin', 'admin', 'manager'];

// service-role ignora RLS → validamos posse (propertyId) manualmente antes de mutar.
async function assertOwnership(
  id: string,
  staff: { role: string; propertyId: string | null }
): Promise<NextResponse | null> {
  const { data: existing } = await supabaseAdmin!.from('weddings').select('propertyId').eq('id', id).single();
  if (!existing) return NextResponse.json({ error: 'Casamento não encontrado.' }, { status: 404 });
  if (!ADMIN_TIER.includes(staff.role) && existing.propertyId !== staff.propertyId) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
  }
  return null;
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth([...WEDDING_ROLES]);
  if (isAuthError(auth)) return auth;

  const denied = await assertOwnership(params.id, auth.staff);
  if (denied) return denied;

  const body = await request.json();
  const safe = { ...body };
  delete safe.id; delete safe.propertyId; delete safe.createdAt;

  const { error } = await supabaseAdmin!
    .from('weddings')
    .update({ ...safe, updatedAt: new Date().toISOString() })
    .eq('id', params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth([...WEDDING_ROLES]);
  if (isAuthError(auth)) return auth;

  const denied = await assertOwnership(params.id, auth.staff);
  if (denied) return denied;

  const { error } = await supabaseAdmin!.from('weddings').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
