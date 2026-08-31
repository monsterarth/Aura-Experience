// Um grupo do catálogo de Concierge. Ver o cabeçalho de ../route.ts para o porquê da escrita
// ter vindo do browser para cá.
//
// DELETE é desativação (`active: false`) — os itens continuam no catálogo, só perdem o
// agrupamento. O nome é lido ANTES do update para o log sair legível.
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError, scopedPropertyId } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { serverError } from '@/lib/api-error';
import { AuditService } from '@/services/audit-service';

/** Nome do grupo para logs legíveis (null se não encontrado). */
async function groupName(id: string): Promise<string | null> {
  const { data } = await supabaseAdmin!
    .from('concierge_groups').select('name').eq('id', id).maybeSingle();
  return (data as { name?: string } | null)?.name ?? null;
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(['super_admin', 'admin']);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server error' }, { status: 500 });

  const body = await request.json();
  const { propertyId: rawPropertyId, ...updates } = body;
  const propertyId = scopedPropertyId(auth, rawPropertyId);
  if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('concierge_groups')
    .update({ ...updates, updatedAt: new Date().toISOString() })
    .eq('id', params.id)
    .eq('propertyId', propertyId)
    .select()
    .single();

  if (error) return serverError('concierge/groups/[id]', error);

  await AuditService.log({
    propertyId,
    userId: auth.staff.id,
    userName: auth.staff.fullName,
    action: 'UPDATE',
    entity: 'CONCIERGE',
    entityId: params.id,
    details: `Grupo de concierge atualizado: ${updates.name ?? (await groupName(params.id)) ?? params.id}`,
  });

  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(['super_admin', 'admin']);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server error' }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const propertyId = scopedPropertyId(auth, searchParams.get('propertyId'));
  if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });

  const name = (await groupName(params.id)) ?? params.id;

  const { error } = await supabaseAdmin
    .from('concierge_groups')
    .update({ active: false, updatedAt: new Date().toISOString() })
    .eq('id', params.id)
    .eq('propertyId', propertyId);

  if (error) return serverError('concierge/groups/[id]', error);

  await AuditService.log({
    propertyId,
    userId: auth.staff.id,
    userName: auth.staff.fullName,
    action: 'DELETE',
    entity: 'CONCIERGE',
    entityId: params.id,
    details: `Grupo de concierge desativado: ${name}`,
  });

  return NextResponse.json({ success: true });
}
