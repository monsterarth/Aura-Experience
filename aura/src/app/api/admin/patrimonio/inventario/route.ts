// src/app/api/admin/patrimonio/inventario/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { AssetInventoryService } from '@/services/asset-inventory-service';

const ROLES = ['super_admin', 'admin', 'manager', 'compras'] as const;

export async function GET(request: NextRequest) {
  const auth = await requireAuth([...ROLES]);
  if (isAuthError(auth)) return auth;
  const url = new URL(request.url);
  const propertyId = url.searchParams.get('propertyId');
  if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });

  try {
    const id = url.searchParams.get('id');
    if (id) {
      const count = await AssetInventoryService.getCount(propertyId, id);
      if (!count) return NextResponse.json({ error: 'Conferência não encontrada.' }, { status: 404 });
      return NextResponse.json(count);
    }
    return NextResponse.json(await AssetInventoryService.getCounts(propertyId));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth([...ROLES]);
  if (isAuthError(auth)) return auth;
  const { propertyId, action, ...body } = await request.json();
  if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });
  const actor = { id: auth.staff.id, name: auth.staff.fullName };

  try {
    switch (action) {
      case 'create': {
        const id = await AssetInventoryService.createCount(propertyId, body, actor);
        return NextResponse.json({ id });
      }
      case 'saveItems': {
        await AssetInventoryService.saveItems(propertyId, body.countId, body.items ?? [], actor);
        return NextResponse.json({ ok: true });
      }
      case 'markByCode': {
        return NextResponse.json(
          await AssetInventoryService.markByCode(propertyId, body.countId, body.code ?? '', actor),
        );
      }
      case 'close': {
        return NextResponse.json(await AssetInventoryService.closeCount(propertyId, body.countId, actor));
      }
      default:
        return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth([...ROLES]);
  if (isAuthError(auth)) return auth;
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const propertyId = url.searchParams.get('propertyId');
  if (!id || !propertyId) return NextResponse.json({ error: 'id and propertyId required' }, { status: 400 });
  try {
    await AssetInventoryService.deleteCount(propertyId, id, { id: auth.staff.id, name: auth.staff.fullName });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
