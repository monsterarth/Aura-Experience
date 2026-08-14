// src/app/api/admin/patrimonio/route.ts
// Idioma do módulo Estoque: sub-recursos por ?flag= no GET e despacho por
// `action` no POST (ver api/admin/estoque/inventory/route.ts).
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError, scopedPropertyId } from '@/lib/api-auth';
import { AssetService } from '@/services/asset-service';
import { AssetStatus } from '@/types/aura';

const ROLES = ['super_admin', 'admin', 'manager', 'compras'] as const;

export async function GET(request: NextRequest) {
  const auth = await requireAuth([...ROLES]);
  if (isAuthError(auth)) return auth;
  const url = new URL(request.url);
  const propertyId = scopedPropertyId(auth, url.searchParams.get('propertyId'));
  if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });

  try {
    const detail = url.searchParams.get('detail');
    if (detail) {
      const data = await AssetService.getAssetDetail(propertyId, detail);
      if (!data) return NextResponse.json({ error: 'Ativo não encontrado.' }, { status: 404 });
      return NextResponse.json(data);
    }

    const labels = url.searchParams.get('labels');
    if (labels !== null) {
      const ids = labels.split(',').map((s) => s.trim()).filter(Boolean);
      return NextResponse.json(await AssetService.getLabelData(propertyId, ids));
    }

    const statuses = url.searchParams.get('statuses');
    return NextResponse.json(await AssetService.getAssets(propertyId, {
      includeDisposed: url.searchParams.get('includeDisposed') === '1',
      statuses: statuses ? (statuses.split(',') as AssetStatus[]) : undefined,
      categoryId: url.searchParams.get('categoryId') ?? undefined,
      locationId: url.searchParams.get('locationId') ?? undefined,
      custodianId: url.searchParams.get('custodianId') ?? undefined,
    }));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth([...ROLES]);
  if (isAuthError(auth)) return auth;
  const { propertyId: requestedPropertyId, action, ...payload } = await request.json();
  const propertyId = scopedPropertyId(auth, requestedPropertyId);
  if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });
  const actor = { id: auth.staff.id, name: auth.staff.fullName };

  try {
    switch (action) {
      case 'dispose': {
        const { id, ...disposal } = payload;
        if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await AssetService.disposeAsset(propertyId, id, disposal, actor);
        return NextResponse.json({ ok: true });
      }
      case 'reinstate': {
        const { id, reason } = payload;
        if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await AssetService.reinstateAsset(propertyId, id, reason ?? '', actor);
        return NextResponse.json({ ok: true });
      }
      case 'move': {
        const { id, ...transfer } = payload;
        if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        const movementId = await AssetService.moveAsset(propertyId, id, transfer, actor);
        return NextResponse.json({ movementId });
      }
      default: {
        const id = await AssetService.upsertAsset(propertyId, payload, actor);
        return NextResponse.json({ id });
      }
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

/**
 * Exclusão física — só erro de cadastro, e só admin. Para tirar um ativo do
 * patrimônio existe a Baixa (POST action:'dispose'), que preserva o histórico.
 */
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(['super_admin', 'admin']);
  if (isAuthError(auth)) return auth;
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const propertyId = scopedPropertyId(auth, url.searchParams.get('propertyId'));
  if (!id || !propertyId) return NextResponse.json({ error: 'id and propertyId required' }, { status: 400 });
  try {
    await AssetService.deleteAsset(propertyId, id, { id: auth.staff.id, name: auth.staff.fullName });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
