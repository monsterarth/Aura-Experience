// Prazos padrão das negociações de casamento (por propriedade).
// Guardados em properties.settings.weddingLead — mesma convenção dos demais
// parâmetros de propriedade (checkInTime, hasStock…).
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { WeddingService } from '@/services/wedding-service';

const READ_ROLES = ['super_admin', 'admin', 'reception', 'manager'] as const;
const WRITE_ROLES = ['super_admin', 'admin', 'manager'] as const;

const clampDays = (v: unknown, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= 3650 ? n : fallback;
};

export async function GET(request: NextRequest) {
  const auth = await requireAuth([...READ_ROLES]);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  const propertyId = new URL(request.url).searchParams.get('propertyId') || auth.staff.propertyId;
  if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });

  const settings = await WeddingService.getLeadSettings(propertyId);
  const canEdit = (WRITE_ROLES as readonly string[]).includes(auth.staff.role);
  return NextResponse.json({ ...settings, canEdit });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth([...WRITE_ROLES]);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const propertyId = body?.propertyId || auth.staff.propertyId;
  if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });

  const current = await WeddingService.getLeadSettings(propertyId);
  const next = {
    followUpDays: clampDays(body?.followUpDays, current.followUpDays),
    expiryDays:   clampDays(body?.expiryDays,   current.expiryDays),
    renewDays:    clampDays(body?.renewDays,    current.renewDays),
  };

  try {
    await WeddingService.saveLeadSettings(propertyId, next);
    return NextResponse.json({ ok: true, ...next });
  } catch (e) {
    console.error('Erro ao salvar prazos de negociação:', e);
    return NextResponse.json({ error: 'Falha ao salvar os prazos.' }, { status: 500 });
  }
}
