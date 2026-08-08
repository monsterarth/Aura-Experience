// src/app/api/admin/estoque/settings/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError, assertPropertyAccess } from '@/lib/api-auth';
import { StockService } from '@/services/stock-service';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(['super_admin', 'admin', 'manager', 'compras']);
  if (isAuthError(auth)) return auth;
  const propertyId = new URL(request.url).searchParams.get('propertyId');
  const denied = assertPropertyAccess(auth, propertyId);
  if (denied) return denied;
  return NextResponse.json(await StockService.getSettings(propertyId!));
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['super_admin', 'admin', 'manager', 'compras']);
  if (isAuthError(auth)) return auth;
  const { propertyId, ...payload } = await request.json();
  const denied = assertPropertyAccess(auth, propertyId);
  if (denied) return denied;
  try {
    await StockService.saveSettings(propertyId, payload, { id: auth.staff.id, name: auth.staff.fullName });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
