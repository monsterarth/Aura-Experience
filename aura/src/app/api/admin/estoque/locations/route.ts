// src/app/api/admin/estoque/locations/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { StockService } from '@/services/stock-service';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(['super_admin', 'admin', 'manager', 'compras']);
  if (isAuthError(auth)) return auth;
  const url = new URL(request.url);
  const propertyId = url.searchParams.get('propertyId');
  if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });
  // ?cabins=1 → reconciliação cabanas × locais (somente leitura)
  if (url.searchParams.get('cabins')) {
    return NextResponse.json(await StockService.getCabinLinkReport(propertyId));
  }
  return NextResponse.json(await StockService.getLocations(propertyId));
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['super_admin', 'admin', 'manager', 'compras']);
  if (isAuthError(auth)) return auth;
  const { propertyId, action, ...payload } = await request.json();
  if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });
  const actor = { id: auth.staff.id, name: auth.staff.fullName };
  try {
    if (action === 'linkCabins') {
      const result = await StockService.applyCabinLinks(propertyId, payload.links ?? [], actor);
      return NextResponse.json(result);
    }
    const id = await StockService.upsertLocation(propertyId, payload, actor);
    return NextResponse.json({ id });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(['super_admin', 'admin', 'manager', 'compras']);
  if (isAuthError(auth)) return auth;
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const propertyId = url.searchParams.get('propertyId');
  if (!id || !propertyId) return NextResponse.json({ error: 'id and propertyId required' }, { status: 400 });
  try {
    await StockService.deleteLocation(propertyId, id, { id: auth.staff.id, name: auth.staff.fullName });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
