import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { AuditService } from '@/services/audit-service';
import { WeddingService } from '@/services/wedding-service';

// Cargos que gerenciam Casamentos (mesma lista da nav em Sidebar.tsx).
const WEDDING_ROLES = ['super_admin', 'admin', 'reception', 'manager'] as const;
// Cargos multi-propriedade (mesma convenção de /api/field/cabins): podem passar propertyId livre.
const ADMIN_TIER = ['super_admin', 'admin', 'manager'];

export async function GET(request: NextRequest) {
  const auth = await requireAuth([...WEDDING_ROLES]);
  if (isAuthError(auth)) return auth;

  const isAdminTier = ADMIN_TIER.includes(auth.staff.role);
  const requested = new URL(request.url).searchParams.get('propertyId');
  const propertyId = isAdminTier && requested ? requested : auth.staff.propertyId;
  if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });

  const { data, error } = await supabaseAdmin!
    .from('weddings')
    .select('*, vendors:wedding_vendors(*), cabinAssignments:wedding_cabin_assignments(*)')
    .eq('propertyId', propertyId)
    .order('weddingDate', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth([...WEDDING_ROLES]);
  if (isAuthError(auth)) return auth;

  const body = await request.json();
  const isAdminTier = ADMIN_TIER.includes(auth.staff.role);
  const propertyId = isAdminTier && body.propertyId ? body.propertyId : auth.staff.propertyId;
  if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });

  // Whitelist: cliente não reescreve campos de identidade/sistema.
  const rest = { ...body };
  delete rest.id; delete rest.propertyId; delete rest.createdAt; delete rest.updatedAt;

  // Negociação nova nasce com prazo: sem isso o lead fica aberto até a data do
  // evento, que pode estar a anos de distância.
  if (rest.status === 'tentative' && !rest.expiresAt) {
    const dates = await WeddingService.initialLeadDates(propertyId, rest.weddingDate);
    rest.followUpAt = rest.followUpAt ?? dates.followUpAt;
    rest.expiresAt = dates.expiresAt;
  }

  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin!
    .from('weddings')
    .insert({ ...rest, propertyId, id: crypto.randomUUID(), createdAt: now, updatedAt: now })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await AuditService.log({
    propertyId,
    userId: auth.staff.id,
    userName: auth.staff.fullName,
    action: 'CREATE',
    entity: 'WEDDING',
    entityId: data.id,
    details: `Casamento ${data.bride} & ${data.groom} (${data.weddingDate}) criado.`,
  });

  return NextResponse.json(data, { status: 201 });
}
