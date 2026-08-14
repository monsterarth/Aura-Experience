// src/app/api/admin/estoque/reports/route.ts
// POST (não GET): com dezenas de estoques e centenas de itens marcados, a lista
// de ids não cabe numa query string.
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError, scopedPropertyId } from '@/lib/api-auth';
import { StockReportService } from '@/services/stock-report-service';

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['super_admin', 'admin', 'manager', 'compras']);
  if (isAuthError(auth)) return auth;
  const { propertyId: requestedPropertyId, kind, filters } = await request.json();
  const propertyId = scopedPropertyId(auth, requestedPropertyId);
  if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });
  try {
    return NextResponse.json(await StockReportService.build(propertyId, kind ?? 'position', filters ?? {}));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
