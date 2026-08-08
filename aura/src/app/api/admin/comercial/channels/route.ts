// CRM — canais de origem de lead da propriedade (padrão + editáveis).
// Espelho de weddings/lead-settings: GET lê (com canEdit), PUT grava via
// mergePropertySettings (allowlist SETTINGS_KEY_ROLES valida a chave).
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError, assertPropertyAccess } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { CrmService } from '@/services/crm-service';
import { CrmChannel } from '@/types/aura';

export const dynamic = 'force-dynamic';

const READ_ROLES = ['super_admin', 'admin', 'reception', 'manager'] as const;
const WRITE_ROLES = ['super_admin', 'admin', 'manager'] as const;

export async function GET(request: NextRequest) {
  const auth = await requireAuth([...READ_ROLES]);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  const propertyId = new URL(request.url).searchParams.get('propertyId') || auth.staff.propertyId;
  const denied = assertPropertyAccess(auth, propertyId);
  if (denied) return denied;
  if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });

  const channels = await CrmService.getChannels(propertyId);
  const canEdit = (WRITE_ROLES as readonly string[]).includes(auth.staff.role);
  return NextResponse.json({ channels, canEdit });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth([...WRITE_ROLES]);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const propertyId = body?.propertyId || auth.staff.propertyId;
  const denied = assertPropertyAccess(auth, propertyId);
  if (denied) return denied;
  if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });

  try {
    const channels = await CrmService.saveChannels(propertyId, (body?.channels ?? []) as CrmChannel[]);
    return NextResponse.json({ ok: true, channels });
  } catch (e) {
    console.error('Erro ao salvar canais do CRM:', e);
    const msg = e instanceof Error ? e.message : 'Falha ao salvar os canais.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
