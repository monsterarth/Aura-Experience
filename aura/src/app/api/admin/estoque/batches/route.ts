// src/app/api/admin/estoque/batches/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { StockService } from '@/services/stock-service';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(['super_admin', 'admin', 'manager', 'compras']);
  if (isAuthError(auth)) return auth;
  const url = new URL(request.url);
  const propertyId = url.searchParams.get('propertyId');
  if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });
  const expiring = url.searchParams.get('expiring');
  if (expiring !== null) {
    return NextResponse.json(await StockService.getExpiringBatches(propertyId, Number(expiring) || 30));
  }
  const productId = url.searchParams.get('productId') ?? undefined;
  return NextResponse.json(await StockService.getBatches(propertyId, productId));
}
