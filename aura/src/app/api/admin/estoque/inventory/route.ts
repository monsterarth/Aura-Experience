// src/app/api/admin/estoque/inventory/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { InventoryService } from '@/services/inventory-service';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(['super_admin', 'admin', 'manager', 'compras']);
  if (isAuthError(auth)) return auth;
  const url = new URL(request.url);
  const propertyId = url.searchParams.get('propertyId');
  if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });
  const id = url.searchParams.get('id');
  if (id) return NextResponse.json(await InventoryService.getCount(propertyId, id));
  return NextResponse.json(await InventoryService.getCounts(propertyId));
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['super_admin', 'admin', 'manager', 'compras']);
  if (isAuthError(auth)) return auth;
  const body = await request.json();
  const { propertyId, action } = body;
  if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });
  const actor = { id: auth.staff.id, name: auth.staff.fullName };
  try {
    if (action === 'create') {
      const id = await InventoryService.createCount(propertyId, { locationId: body.locationId, scope: body.scope }, actor);
      return NextResponse.json({ id });
    }
    if (action === 'saveItems') {
      await InventoryService.saveItems(propertyId, body.countId, body.items ?? []);
      return NextResponse.json({ ok: true });
    }
    if (action === 'close') {
      const accuracy = await InventoryService.closeCount(propertyId, body.countId, actor);
      return NextResponse.json({ accuracy });
    }
    return NextResponse.json({ error: 'ação inválida' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
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
    await InventoryService.deleteCount(propertyId, id, { id: auth.staff.id, name: auth.staff.fullName });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
