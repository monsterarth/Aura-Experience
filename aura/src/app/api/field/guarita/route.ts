// src/app/api/field/guarita/route.ts
//
// A porta do app da guarita. GET traz o painel inteiro num request (mesmo
// motivo do governanta-bootstrap: leitura pelo client do browser pendura no
// lock frio); POST faz as ações — consultar placa, registrar entrada e saída,
// fechar o turno.
import { NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { GuaritaService } from '@/services/guarita-service';
import { UserRole, VehicleKind } from '@/types/aura';

export const dynamic = 'force-dynamic';

const ADMIN_TIER: UserRole[] = ['super_admin', 'admin', 'manager'];
const ROLES: UserRole[] = ['porter', 'reception', ...ADMIN_TIER];

function resolveProperty(auth: any, requested: string | null): string | null {
  return ADMIN_TIER.includes(auth.staff.role) && requested ? requested : auth.staff.propertyId;
}

export async function GET(req: Request) {
  const auth = await requireAuth(ROLES);
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const propertyId = resolveProperty(auth, searchParams.get('propertyId'));
  if (!propertyId) return NextResponse.json({ error: 'Sem propriedade.' }, { status: 400 });

  try {
    return NextResponse.json(await GuaritaService.getDashboard(propertyId));
  } catch (e: any) {
    console.error('[field/guarita GET]', e?.message ?? e);
    return NextResponse.json({ error: 'Erro ao carregar o painel.' }, { status: 500 });
  }
}

type Action = 'lookup' | 'entry' | 'exit' | 'close_shift' | 'set_rate';

export async function POST(req: Request) {
  const auth = await requireAuth(ROLES);
  if (isAuthError(auth)) return auth;

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 });
  }

  const propertyId = resolveProperty(auth, body?.propertyId ?? null);
  if (!propertyId) return NextResponse.json({ error: 'Sem propriedade.' }, { status: 400 });

  const actor = { id: auth.staff.id, name: auth.staff.fullName || 'Guarita' };
  const action: Action = body?.action;

  try {
    if (action === 'lookup') {
      if (!body.plate) return NextResponse.json({ error: 'Informe a placa.' }, { status: 400 });
      return NextResponse.json(await GuaritaService.lookupPlate(propertyId, body.plate));
    }

    if (action === 'entry') {
      if (!body.plate || !body.kind) {
        return NextResponse.json({ error: 'Placa e tipo são obrigatórios.' }, { status: 400 });
      }
      const movement = await GuaritaService.registerEntry(propertyId, {
        plate: body.plate,
        kind: body.kind as VehicleKind,
        amount: body.amount,
        paymentMethod: body.paymentMethod ?? null,
        cardBrand: body.cardBrand ?? null,
        installments: body.installments ?? null,
        nsu: body.nsu ?? null,
        stayId: body.stayId ?? null,
        ownerName: body.ownerName ?? null,
        ownerPhone: body.ownerPhone ?? null,
        marketingOptIn: body.marketingOptIn === true,
        model: body.model ?? null,
        notes: body.notes ?? null,
      }, actor);
      return NextResponse.json({ ok: true, movement });
    }

    if (action === 'exit') {
      if (!body.movementId) return NextResponse.json({ error: 'movementId é obrigatório.' }, { status: 400 });
      return NextResponse.json({ ok: true, movement: await GuaritaService.registerExit(propertyId, body.movementId, actor) });
    }

    if (action === 'close_shift') {
      const shift = await GuaritaService.closeShift(propertyId, actor, body.notes);
      if (!shift) return NextResponse.json({ error: 'Não há turno aberto.' }, { status: 409 });
      return NextResponse.json({ ok: true, shift });
    }

    // A tarifa do dia pode ser definida pela recepção/gestão — e pelo guarita
    // quando ninguém definiu ainda, senão o turno começa travado.
    if (action === 'set_rate') {
      const rate = await GuaritaService.setRate(
        propertyId,
        body.date || undefined,
        { amount: body.amount, closed: body.closed },
        actor,
      );
      return NextResponse.json({ ok: true, rate });
    }

    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  } catch (e: any) {
    const code = e?.code;
    const status = code === 'ALREADY_INSIDE' || code === 'ALREADY_OUT' ? 409 : 500;
    if (status === 500) console.error('[field/guarita POST]', e?.message ?? e);
    return NextResponse.json({ error: e?.message ?? 'Erro ao registrar.' }, { status });
  }
}
