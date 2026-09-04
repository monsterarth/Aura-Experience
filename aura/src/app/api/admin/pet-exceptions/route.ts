// src/app/api/admin/pet-exceptions/route.ts
//
// A fila de pedidos de exceção à Política Pet, com o contexto da decisão junto.
// Existe para o sino e para o modal poderem abrir a fila sem passar pelo painel
// da recepção — antes era preciso entrar na estadia para decidir.
//
// Ver docs/PET-POLICY.md.
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { StayService } from '@/services/stay-service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(['super_admin', 'admin', 'manager', 'reception']);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  const asked = new URL(request.url).searchParams.get('propertyId');
  // Recepção só enxerga a própria propriedade, independente do que pedir.
  const isAdminTier = ['super_admin', 'admin', 'manager'].includes(auth.staff.role);
  const propertyId = isAdminTier ? (asked || auth.staff.propertyId) : auth.staff.propertyId;
  if (!propertyId) return NextResponse.json({ items: [] });

  try {
    const { data: propRow } = await supabaseAdmin
      .from('properties').select('settings').eq('id', propertyId).maybeSingle();

    const pend = await StayService.listPendingPetExceptions(
      propertyId, (propRow?.settings as any)?.petExceptionBlackout ?? null,
    );
    if (pend.length === 0) return NextResponse.json({ items: [] });

    // Nomes em lote: a fila é curta, mas uma consulta por pedido seria o começo
    // do mesmo problema que a lista de estadias já resolveu.
    const guestIds = Array.from(new Set(pend.map((p) => p.guestId).filter(Boolean) as string[]));
    const cabinIds = Array.from(new Set(pend.map((p) => p.cabinId).filter(Boolean) as string[]));
    const [gRes, cRes] = await Promise.all([
      guestIds.length ? supabaseAdmin.from('guests').select('id, fullName').in('id', guestIds) : Promise.resolve({ data: [] }),
      cabinIds.length ? supabaseAdmin.from('cabins').select('id, name').in('id', cabinIds) : Promise.resolve({ data: [] }),
    ]);
    const gMap: Record<string, string> = {};
    (gRes.data ?? []).forEach((g: any) => { gMap[g.id] = g.fullName; });
    const cMap: Record<string, string> = {};
    (cRes.data ?? []).forEach((c: any) => { cMap[c.id] = c.name; });

    return NextResponse.json({
      items: pend.map((p) => ({
        ...p,
        guestName: (p.guestId && gMap[p.guestId]) || 'Hóspede',
        cabinName: (p.cabinId && cMap[p.cabinId]) || null,
      })),
    });
  } catch (e) {
    // Antes da migration a coluna não existe: a fila vazia não pode derrubar o sino.
    console.error('[pet-exceptions]', e);
    return NextResponse.json({ items: [] });
  }
}
