// src/app/api/admin/estoque/overview/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError, scopedPropertyId } from '@/lib/api-auth';
import { StockService } from '@/services/stock-service';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(['super_admin', 'admin', 'manager', 'compras']);
  if (isAuthError(auth)) return auth;
  const url = new URL(request.url);
  const propertyId = scopedPropertyId(auth, url.searchParams.get('propertyId'));
  if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });
  const days = Number(url.searchParams.get('days') ?? 30);
  return NextResponse.json(await StockService.getDashboard(propertyId, days));
}
