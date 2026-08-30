// src/app/api/field/concierge-requests/route.ts
// Fila de pedidos do Concierge (hóspede) para o app do mensageiro — leitura e
// mutações server-side. O houseman era o último app de campo escrevendo no
// Supabase pelo browser (padrão que pendura no lock frio; ver
// field-app-browser-write-hangs). As precondições de status no ConciergeService
// transformam o "assumir"/"entregar" duplo em 409 em vez de corrida silenciosa.
import { NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { isFolioClosedError } from '@/lib/folio-guard';
import { supabaseAdmin } from '@/lib/supabase';
import { ConciergeService } from '@/services/concierge-service';
import { UserRole } from '@/types/aura';

export const dynamic = 'force-dynamic';

const ADMIN_TIER: UserRole[] = ['super_admin', 'admin', 'manager'];
const ROLES: UserRole[] = ['houseman', 'governance', ...ADMIN_TIER];

export async function GET(req: Request) {
  const auth = await requireAuth(ROLES);
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const requested = searchParams.get('propertyId');
  const isAdminTier = ADMIN_TIER.includes(auth.staff.role);
  const propertyId = isAdminTier && requested ? requested : auth.staff.propertyId;
  if (!propertyId) return NextResponse.json([]);

  try {
    // Pendentes + em andamento, já enriquecidos (item, cabana) — o mesmo shape
    // que o app consumia do listenToPendingRequests.
    return NextResponse.json(await ConciergeService.getPendingRequests(propertyId));
  } catch (e: any) {
    console.error('[field/concierge-requests GET]', e?.message ?? e);
    return NextResponse.json({ error: 'Erro ao carregar pedidos.' }, { status: 500 });
  }
}

type Action = 'assign' | 'deliver' | 'not_delivered';

export async function POST(req: Request) {
  const auth = await requireAuth(ROLES);
  if (isAuthError(auth)) return auth;

  let body: { action?: Action; requestId?: string; reason?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 });
  }
  if (!body.action || !body.requestId) {
    return NextResponse.json({ error: 'action e requestId são obrigatórios.' }, { status: 400 });
  }

  // service-role ignora RLS → valida a posse do pedido manualmente.
  const { data: reqRow } = await supabaseAdmin!
    .from('concierge_requests')
    .select('propertyId')
    .eq('id', body.requestId)
    .maybeSingle();
  if (!reqRow?.propertyId) return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 });

  const isAdminTier = ADMIN_TIER.includes(auth.staff.role);
  if (!isAdminTier && auth.staff.propertyId !== reqRow.propertyId) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
  }
  const propertyId = reqRow.propertyId as string;
  const { id: actorId, fullName: actorName } = auth.staff;

  try {
    switch (body.action) {
      case 'assign':
        await ConciergeService.assignRequest(propertyId, body.requestId, actorId, actorName);
        break;
      case 'deliver':
        await ConciergeService.deliverRequest(propertyId, body.requestId, actorId, actorName);
        break;
      case 'not_delivered':
        await ConciergeService.notDeliverRequest(propertyId, body.requestId, body.reason ?? 'Não informado');
        break;
      default:
        return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
    }
  } catch (e: any) {
    if (e?.code === 'CONFLICT' || isFolioClosedError(e)) return NextResponse.json({ error: e.message }, { status: 409 });
    console.error('[field/concierge-requests POST]', e?.message ?? e);
    return NextResponse.json({ error: 'Erro ao processar a ação.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
