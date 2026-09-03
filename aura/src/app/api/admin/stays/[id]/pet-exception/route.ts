// src/app/api/admin/stays/[id]/pet-exception/route.ts
//
// Decide um pedido de exceção à Política Pet. Rota própria (e não um PATCH na
// estadia) porque a decisão tem regra própria: só a recepção para cima decide, o
// pedido tem que existir, e o registro vai para a auditoria com quem autorizou.
//
// Ver docs/PET-POLICY.md.
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { StayService } from '@/services/stay-service';

/** Escopo de propriedade: 404 em vez de 403, para não vazar existência da estadia. */
async function scopedStay(id: string, auth: { staff: { role: string; propertyId: string | null } }) {
  const { data } = await supabaseAdmin!
    .from('stays').select('propertyId, checkIn, checkOut, petException').eq('id', id).maybeSingle();
  if (!data) return null;
  const isAdminTier = ['super_admin', 'admin', 'manager'].includes(auth.staff.role);
  if (!isAdminTier && data.propertyId !== auth.staff.propertyId) return null;
  return data;
}

/**
 * GET — os dois critérios INTERNOS que a recepção vê antes de decidir: se as datas
 * tocam a alta temporada e se já há exceção aprovada com datas sobrepostas.
 *
 * Nenhum dos dois recusa sozinho. A direção libera exceção várias vezes por mês, e
 * automatizar a recusa só tiraria a decisão do sistema de novo — o que muda é que
 * agora quem libera contra o critério fica registrado.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(['super_admin', 'admin', 'manager', 'reception']);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  const stay = await scopedStay(params.id, auth);
  if (!stay) return NextResponse.json({ error: 'Estadia não encontrada.' }, { status: 404 });
  if ((stay.petException as any)?.status !== 'pending') {
    return NextResponse.json({ inBlackout: false, overlapping: [] });
  }

  const { data: propRow } = await supabaseAdmin
    .from('properties').select('settings').eq('id', stay.propertyId).maybeSingle();
  const pend = await StayService.listPendingPetExceptions(
    stay.propertyId, (propRow?.settings as any)?.petExceptionBlackout ?? null,
  );
  const mine = pend.find((p) => p.stayId === params.id);
  return NextResponse.json({
    inBlackout: mine?.inBlackout ?? false,
    overlapping: mine?.overlapping ?? [],
  });
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  // A recepção decide: a direção não opera a plataforma, ela manda fazer — e o
  // nome de quem mandou vai no campo `authorizedBy`.
  const auth = await requireAuth(['super_admin', 'admin', 'manager', 'reception']);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const decision = body?.decision;
  if (decision !== 'approved' && decision !== 'refused') {
    return NextResponse.json({ error: 'Decisão inválida.' }, { status: 400 });
  }

  const stay = await scopedStay(params.id, auth);
  if (!stay) return NextResponse.json({ error: 'Estadia não encontrada.' }, { status: 404 });

  try {
    await StayService.decidePetException(
      stay.propertyId, params.id,
      auth.staff.id, auth.staff.fullName || 'Equipe',
      decision,
      typeof body.authorizedBy === 'string' ? body.authorizedBy.slice(0, 120) : null,
      typeof body.note === 'string' ? body.note.slice(0, 500) : null,
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
