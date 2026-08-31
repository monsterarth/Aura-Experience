// Grupos do catálogo de Concierge — CAMINHO OFICIAL de leitura/escrita.
//
// Antes o catálogo era escrito pelo browser via ConciergeService, e estas rotas existiam sem
// nenhum chamador — duas metades da mesma operação, divergindo em silêncio (a rota não logava
// auditoria e a leitura não filtrava `active`). A escrita passou para cá: rota + service-role,
// como manda o padrão do admin e o histórico de write pelo browser pendurar no lock frio.
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError, scopedPropertyId } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { serverError } from '@/lib/api-error';
import { AuditService } from '@/services/audit-service';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(['super_admin', 'admin', 'reception', 'governance']);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json([], { status: 500 });

  const { searchParams } = new URL(request.url);
  const propertyId = scopedPropertyId(auth, searchParams.get('propertyId'));
  if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('concierge_groups')
    .select('*')
    .eq('propertyId', propertyId)
    .eq('active', true)
    .order('order', { ascending: true });

  if (error) return serverError('concierge/groups', error);
  return NextResponse.json(data ?? []);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['super_admin', 'admin']);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server error' }, { status: 500 });

  const body = await request.json();
  const { name, name_en, name_es, icon, color, order } = body;
  const propertyId = scopedPropertyId(auth, body.propertyId);
  if (!propertyId || !name) {
    return NextResponse.json({ error: 'propertyId and name required' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('concierge_groups')
    .insert({
      id: crypto.randomUUID(),
      propertyId,
      name,
      name_en: name_en || null,
      name_es: name_es || null,
      icon: icon || null,
      color: color || null,
      order: order ?? 0,
      active: true,
      createdAt: now,
      updatedAt: now,
    })
    .select()
    .single();

  if (error) return serverError('concierge/groups', error);

  await AuditService.log({
    propertyId,
    userId: auth.staff.id,
    userName: auth.staff.fullName,
    action: 'CREATE',
    entity: 'CONCIERGE',
    entityId: data.id,
    details: `Grupo de concierge criado: ${name}`,
  });

  return NextResponse.json(data);
}
