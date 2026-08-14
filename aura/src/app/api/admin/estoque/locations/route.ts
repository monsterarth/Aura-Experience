// src/app/api/admin/estoque/locations/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError, scopedPropertyId } from '@/lib/api-auth';
import { StockService } from '@/services/stock-service';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(['super_admin', 'admin', 'manager', 'compras']);
  if (isAuthError(auth)) return auth;
  const url = new URL(request.url);
  const propertyId = scopedPropertyId(auth, url.searchParams.get('propertyId'));
  if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });
  // ?cabins=1 → reconciliação cabanas × locais (somente leitura)
  if (url.searchParams.get('cabins')) {
    return NextResponse.json(await StockService.getCabinLinkReport(propertyId));
  }
  // ?cabinOptions=1 → cabanas escolhíveis no seletor de dois passos
  if (url.searchParams.get('cabinOptions')) {
    return NextResponse.json(await StockService.getCabinOptions(propertyId));
  }
  // ?overview=1 → um card por estoque; ?detail=<id> → conteúdo de um estoque
  if (url.searchParams.get('overview')) {
    return NextResponse.json(await StockService.getLocationsOverview(propertyId));
  }
  const detail = url.searchParams.get('detail');
  if (detail) {
    try {
      return NextResponse.json(await StockService.getLocationDetail(propertyId, detail));
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 404 });
    }
  }
  return NextResponse.json(await StockService.getLocations(propertyId));
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['super_admin', 'admin', 'manager', 'compras']);
  if (isAuthError(auth)) return auth;
  const { propertyId: requestedPropertyId, action, ...payload } = await request.json();
  const propertyId = scopedPropertyId(auth, requestedPropertyId);
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
  const propertyId = scopedPropertyId(auth, url.searchParams.get('propertyId'));
  if (!id || !propertyId) return NextResponse.json({ error: 'id and propertyId required' }, { status: 400 });
  try {
    await StockService.deleteLocation(propertyId, id, { id: auth.staff.id, name: auth.staff.fullName });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
