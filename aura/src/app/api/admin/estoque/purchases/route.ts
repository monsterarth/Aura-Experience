// src/app/api/admin/estoque/purchases/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError, scopedPropertyId } from '@/lib/api-auth';
import { PurchaseService } from '@/services/purchase-service';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(['super_admin', 'admin', 'manager', 'compras']);
  if (isAuthError(auth)) return auth;
  const propertyId = scopedPropertyId(auth, new URL(request.url).searchParams.get('propertyId'));
  if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });
  return NextResponse.json(await PurchaseService.getPurchases(propertyId));
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['super_admin', 'admin', 'manager', 'compras']);
  if (isAuthError(auth)) return auth;
  const { propertyId: requestedPropertyId, items, ...payload } = await request.json();
  const propertyId = scopedPropertyId(auth, requestedPropertyId);
  if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });
  try {
    const id = await PurchaseService.upsertPurchase(propertyId, payload, items ?? [], { id: auth.staff.id, name: auth.staff.fullName });
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
    await PurchaseService.deletePurchase(propertyId, id, { id: auth.staff.id, name: auth.staff.fullName });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
