// src/app/api/admin/estoque/movements/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { StockService } from '@/services/stock-service';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(['super_admin', 'admin', 'manager']);
  if (isAuthError(auth)) return auth;
  const url = new URL(request.url);
  const propertyId = url.searchParams.get('propertyId');
  if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });
  const limit = Number(url.searchParams.get('limit') ?? 100);
  return NextResponse.json(await StockService.getMovements(propertyId, limit));
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['super_admin', 'admin', 'manager']);
  if (isAuthError(auth)) return auth;
  const { propertyId, ...input } = await request.json();
  if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });
  try {
    const id = await StockService.registerMovement(propertyId, input, { id: auth.staff.id, name: auth.staff.fullName });
    return NextResponse.json({ id });
  } catch (e) {
    const err = e as Error & { code?: string; available?: number; requested?: number; resulting?: number };
    if (err.code === 'NEGATIVE_STOCK') {
      return NextResponse.json({
        error: err.message, code: 'NEGATIVE_STOCK',
        available: err.available, requested: err.requested, resulting: err.resulting,
      }, { status: 409 });
    }
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
