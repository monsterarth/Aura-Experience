// Gestão do site dos noivos de UM casamento: estado + pré-reservas (GET) e
// ativar/desativar/regenerar códigos (POST). A superfície PÚBLICA é outra
// (/api/wedding-site/* + /casamento) — aqui é só o back-office.
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { serverError } from '@/lib/api-error';
import { WeddingService } from '@/services/wedding-service';
import { resolveQuoteValue } from '@/lib/rate-engine';
import { RateQuoteRecord } from '@/types/aura';

export const dynamic = 'force-dynamic';

const WEDDING_ROLES = ['super_admin', 'admin', 'reception', 'manager'] as const;
const ADMIN_TIER = ['super_admin', 'admin', 'manager'];

// service-role ignora RLS → posse validada manualmente (padrão weddings/[id]).
async function loadOwned(id: string, staff: { role: string; propertyId: string | null }) {
  const { data } = await supabaseAdmin!
    .from('weddings')
    .select('id, propertyId, bride, groom, status, checkin, checkout, guestCode, coupleCode, rateTableId, maxExtendNights, siteEnabled, siteConfig')
    .eq('id', id)
    .maybeSingle();
  if (!data) return { error: NextResponse.json({ error: 'Casamento não encontrado.' }, { status: 404 }) };
  if (!ADMIN_TIER.includes(staff.role) && data.propertyId !== staff.propertyId) {
    return { error: NextResponse.json({ error: 'Acesso negado.' }, { status: 403 }) };
  }
  return { wedding: data };
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth([...WEDDING_ROLES]);
  if (isAuthError(auth)) return auth;

  const owned = await loadOwned(params.id, auth.staff);
  if ('error' in owned) return owned.error;
  const w = owned.wedding;

  // Pré-reservas do casamento — a lista da aba Site (allowlist de campos:
  // a linha crua de rate_quotes carrega CPF/notas que não interessam aqui).
  const { data: quotes, error } = await supabaseAdmin!
    .from('rate_quotes')
    .select('id, clientName, clientPhone, status, checkIn, checkOut, adults, children, babies, pets, selectedCategory, finalValue, negotiatedValue, snapshot, rooms, stayId, createdAt, createdBy')
    .eq('weddingId', params.id)
    .order('createdAt', { ascending: false })
    .limit(200);
  if (error) return serverError('weddings/[id]/site', error);

  const preReservations = ((quotes || []) as RateQuoteRecord[]).map((q) => {
    const resolved = resolveQuoteValue(q);
    const chosen = q.rooms?.[0]?.selectedCategory ?? q.selectedCategory ?? null;
    const categoryName =
      (q.snapshot || []).find((c) => c.categoryId === chosen || c.category === chosen)?.category
      ?? chosen ?? '—';
    return {
      id: q.id,
      clientName: q.clientName ?? null,
      clientPhone: q.clientPhone ?? null,
      status: q.status,
      checkIn: q.checkIn,
      checkOut: q.checkOut,
      pax: (q.adults || 0) + (q.children || 0) + (q.babies || 0),
      categoryName,
      value: resolved.value,
      stayId: q.stayId ?? null,
      fromSite: q.createdBy === 'wedding-site',
      createdAt: q.createdAt,
    };
  });

  return NextResponse.json({
    site: {
      enabled: !!w.siteEnabled,
      guestCode: w.guestCode ?? null,
      coupleCode: w.coupleCode ?? null,
      rateTableId: w.rateTableId ?? null,
      maxExtendNights: w.maxExtendNights ?? 2,
      status: w.status,
      checkin: w.checkin,
      checkout: w.checkout,
    },
    preReservations,
  });
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth([...WEDDING_ROLES]);
  if (isAuthError(auth)) return auth;

  const owned = await loadOwned(params.id, auth.staff);
  if ('error' in owned) return owned.error;
  const w = owned.wedding;

  const body = await request.json().catch(() => ({}));
  const actor = { id: auth.staff.id, name: auth.staff.fullName };

  try {
    if (body.action === 'activate') {
      const codes = await WeddingService.activateSite(w.propertyId, params.id, actor);
      return NextResponse.json({ ok: true, ...codes });
    }
    if (body.action === 'deactivate') {
      await WeddingService.deactivateSite(w.propertyId, params.id, actor);
      return NextResponse.json({ ok: true });
    }
    if (body.action === 'regenerate') {
      const which = body.which === 'guest' || body.which === 'couple' ? body.which : 'both';
      const codes = await WeddingService.regenerateSiteCodes(w.propertyId, params.id, which, actor);
      return NextResponse.json({ ok: true, ...codes });
    }
    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  } catch (e) {
    // Mensagens do service são de negócio (pré-condições) — podem ir ao admin.
    const msg = e instanceof Error ? e.message : 'Erro na operação.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
