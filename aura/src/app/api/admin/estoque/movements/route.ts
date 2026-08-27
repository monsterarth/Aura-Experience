// src/app/api/admin/estoque/movements/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError, scopedPropertyId } from '@/lib/api-auth';
import { StockService } from '@/services/stock-service';
import { StockMovementType, StockReferenceType } from '@/types/aura';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(['super_admin', 'admin', 'manager', 'compras']);
  if (isAuthError(auth)) return auth;
  const url = new URL(request.url);
  const propertyId = scopedPropertyId(auth, url.searchParams.get('propertyId'));
  if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });
  // ?bootstrap=1 → tudo que a tela de Movimentações precisa numa requisição só.
  // Eram seis chamadas, cada uma pagando round-trip + auth.getUser() de rede.
  if (url.searchParams.get('bootstrap')) {
    const limit = Number(url.searchParams.get('limit') ?? 80);
    return NextResponse.json(await StockService.getMovementsBootstrap(propertyId, limit));
  }
  // ?staff=1 → colaboradores selecionáveis em locais do tipo 'staff'
  if (url.searchParams.get('staff')) {
    return NextResponse.json(await StockService.getStaffOptions(propertyId));
  }
  // ?history=1 → histórico paginado com filtros (tela "Histórico")
  if (url.searchParams.get('history')) {
    const p = url.searchParams;
    const types = p.get('types')?.split(',').filter(Boolean) as StockMovementType[] | undefined;
    return NextResponse.json(await StockService.getMovementHistory(propertyId, {
      from: p.get('from') ?? undefined,
      to: p.get('to') ?? undefined,
      types: types?.length ? types : undefined,
      productId: p.get('productId') ?? undefined,
      locationId: p.get('locationId') ?? undefined,
      responsibleId: p.get('responsibleId') ?? undefined,
      referenceType: (p.get('referenceType') as StockReferenceType | null) ?? undefined,
      search: p.get('search') ?? undefined,
      onlyWithNotes: p.get('onlyWithNotes') === '1',
      page: Number(p.get('page') ?? 1),
      pageSize: Number(p.get('pageSize') ?? 50),
    }));
  }
  // ?batch=<ref> → todas as movimentações do lote (sem limite), para o painel de detalhe
  const batchRef = url.searchParams.get('batch');
  if (batchRef) {
    return NextResponse.json(await StockService.getBatchMovements(propertyId, batchRef));
  }
  const limit = Number(url.searchParams.get('limit') ?? 100);
  return NextResponse.json(await StockService.getMovements(propertyId, limit));
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['super_admin', 'admin', 'manager', 'compras']);
  if (isAuthError(auth)) return auth;
  const { propertyId: requestedPropertyId, action, ...input } = await request.json();
  const propertyId = scopedPropertyId(auth, requestedPropertyId);
  if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });
  const actor = { id: auth.staff.id, name: auth.staff.fullName };
  try {
    if (action === 'adjustBalance') {
      return NextResponse.json(await StockService.adjustBalance(propertyId, input, actor));
    }
    if (action === 'batch') {
      return NextResponse.json(await StockService.registerMovementBatch(propertyId, input, actor));
    }
    if (action === 'revertBatch') {
      return NextResponse.json(await StockService.revertBatch(propertyId, input.batchRef, actor));
    }
    const id = await StockService.registerMovement(propertyId, input, actor);
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
