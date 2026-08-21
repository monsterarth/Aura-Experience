// src/app/api/field/restock-requests/route.ts
// Reposição (camareira/governanta → mensageiro) — leitura e mutações server-side.
// Apps de campo NUNCA leem/escrevem o Supabase pelo browser (penduram no lock
// frio; ver field-app-browser-write-hangs): o realtime só dispara o refetch e
// tudo passa por aqui via postFieldAction / fetch.
import { NextResponse } from 'next/server';
import { requireAuth, isAuthError, hasRole } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { RestockService } from '@/services/restock-service';
import { notifyRestockRequested } from '@/lib/push-notify';
import { UserRole } from '@/types/aura';

export const dynamic = 'force-dynamic';

const ADMIN_TIER: UserRole[] = ['super_admin', 'admin', 'manager'];
const CAN_CREATE: UserRole[] = ['maid', 'governance', ...ADMIN_TIER];
const CAN_HANDLE: UserRole[] = ['houseman', 'governance', ...ADMIN_TIER];

function scopedProperty(auth: { staff: { role: UserRole; propertyId: string | null } }, requested: string | null) {
  const isAdminTier = ADMIN_TIER.includes(auth.staff.role);
  return isAdminTier && requested ? requested : auth.staff.propertyId;
}

export async function GET(req: Request) {
  const auth = await requireAuth(['maid', 'governance', 'houseman', ...ADMIN_TIER]);
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const propertyId = scopedProperty(auth, searchParams.get('propertyId'));
  if (!propertyId) return NextResponse.json([]);

  try {
    if (searchParams.get('catalog') === '1') {
      return NextResponse.json(await RestockService.getCatalog(propertyId));
    }
    return NextResponse.json(await RestockService.queue(propertyId));
  } catch (e: any) {
    console.error('[field/restock-requests GET]', e?.message ?? e);
    return NextResponse.json({ error: 'Erro ao carregar reposições.' }, { status: 500 });
  }
}

type RestockAction = 'create' | 'assign' | 'deliver' | 'not_delivered' | 'cancel';

export async function POST(req: Request) {
  const auth = await requireAuth(['maid', 'governance', 'houseman', ...ADMIN_TIER]);
  if (isAuthError(auth)) return auth;

  let body: {
    action?: RestockAction; requestId?: string; propertyId?: string;
    cabinId?: string | null; items?: { productId: string; quantity: number }[];
    notes?: string | null; reason?: string;
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 });
  }
  if (!body.action) return NextResponse.json({ error: 'action é obrigatória.' }, { status: 400 });

  const { id: actorId, fullName: actorName, role, secondaryRoles } = auth.staff;
  const actor = { id: actorId, name: actorName };

  // ── create: camareira/governanta montam o pedido ──────────────────────────
  if (body.action === 'create') {
    if (!hasRole(role, secondaryRoles, CAN_CREATE)) {
      return NextResponse.json({ error: 'Sem permissão para solicitar reposição.' }, { status: 403 });
    }
    const propertyId = scopedProperty(auth, body.propertyId ?? null);
    if (!propertyId) return NextResponse.json({ error: 'Sem propriedade.' }, { status: 400 });
    // O cargo PRIMÁRIO decide o selo do pedido (camareira × governanta/gestão).
    const requestedRole: 'maid' | 'governance' = role === 'maid' ? 'maid' : 'governance';
    try {
      const ids = await RestockService.createRequests(
        propertyId,
        { cabinId: body.cabinId ?? null, items: body.items ?? [], notes: body.notes ?? null },
        actor,
        requestedRole,
      );
      // Push in-code para os mensageiros (sem webhook externo). Best-effort.
      try {
        let cabinLabel: string | null = null;
        if (body.cabinId) {
          const { data: cabin } = await supabaseAdmin!.from('cabins').select('name').eq('id', body.cabinId).maybeSingle();
          cabinLabel = (cabin?.name as string | undefined) ?? null;
        }
        await notifyRestockRequested(propertyId, ids, cabinLabel);
      } catch (e) { console.error('[field/restock-requests POST create] push:', e); }
      return NextResponse.json({ ok: true, ids });
    } catch (e: any) {
      if (e?.code === 'OUT_OF_STOCK') return NextResponse.json({ error: e.message }, { status: 422 });
      console.error('[field/restock-requests POST create]', e?.message ?? e);
      return NextResponse.json({ error: e?.message ?? 'Erro ao criar o pedido.' }, { status: 500 });
    }
  }

  // ── Demais ações operam sobre um pedido existente ─────────────────────────
  if (!body.requestId) return NextResponse.json({ error: 'requestId é obrigatório.' }, { status: 400 });

  // service-role ignora RLS → valida a posse do pedido manualmente.
  const { data: reqRow } = await supabaseAdmin!
    .from('restock_requests')
    .select('propertyId, requestedById, status')
    .eq('id', body.requestId)
    .maybeSingle();
  if (!reqRow?.propertyId) return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 });

  const isAdminTier = ADMIN_TIER.includes(role);
  if (!isAdminTier && auth.staff.propertyId !== reqRow.propertyId) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
  }
  const propertyId = reqRow.propertyId as string;

  try {
    switch (body.action) {
      case 'assign':
      case 'deliver':
      case 'not_delivered': {
        if (!hasRole(role, secondaryRoles, CAN_HANDLE)) {
          return NextResponse.json({ error: 'Sem permissão para atender reposições.' }, { status: 403 });
        }
        if (body.action === 'assign') await RestockService.assign(propertyId, body.requestId, actor);
        else if (body.action === 'deliver') await RestockService.deliver(propertyId, body.requestId, actor);
        else await RestockService.notDeliver(propertyId, body.requestId, body.reason ?? '', actor);
        break;
      }
      case 'cancel': {
        // Quem pediu cancela o próprio pedido pendente; governança/admin cancelam qualquer um.
        const canCancelAny = isAdminTier || hasRole(role, secondaryRoles, ['governance']);
        if (!canCancelAny && reqRow.requestedById !== actorId) {
          return NextResponse.json({ error: 'Só quem pediu pode cancelar.' }, { status: 403 });
        }
        await RestockService.cancel(propertyId, body.requestId);
        break;
      }
      default:
        return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
    }
  } catch (e: any) {
    if (e?.code === 'CONFLICT') return NextResponse.json({ error: e.message }, { status: 409 });
    if (e?.code === 'NOT_FOUND') return NextResponse.json({ error: e.message }, { status: 404 });
    console.error('[field/restock-requests POST]', e?.message ?? e);
    return NextResponse.json({ error: 'Erro ao processar a ação.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
