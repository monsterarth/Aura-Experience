// src/app/api/admin/patrimonio/reports/route.ts
// POST e não GET pelo mesmo motivo do relatório de estoque: com dezenas de
// categorias e locais marcados, a lista de ids não cabe numa query string.
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError, scopedPropertyId } from '@/lib/api-auth';
import { AssetReportService } from '@/services/asset-report-service';

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['super_admin', 'admin', 'manager', 'compras']);
  if (isAuthError(auth)) return auth;
  const { propertyId: requestedPropertyId, kind, filters } = await request.json();
  const propertyId = scopedPropertyId(auth, requestedPropertyId);
  if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });
  try {
    return NextResponse.json(await AssetReportService.build(propertyId, kind, filters ?? {}));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
