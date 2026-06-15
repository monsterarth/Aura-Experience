// src/app/api/admin/estoque/purchases/receive/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { PurchaseService } from '@/services/purchase-service';

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['super_admin', 'admin', 'manager']);
  if (isAuthError(auth)) return auth;
  const { propertyId, purchaseId, overrides } = await request.json();
  if (!propertyId || !purchaseId) return NextResponse.json({ error: 'propertyId and purchaseId required' }, { status: 400 });
  try {
    await PurchaseService.receivePurchase(propertyId, purchaseId, { id: auth.staff.id, name: auth.staff.fullName }, overrides);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
