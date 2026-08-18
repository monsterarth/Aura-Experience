// Cotação do simulador de convidados — pública, autorizada pelo código de 6
// dígitos. Pula requireAuth DE PROPÓSITO (mesmo contrato de /api/guest/*):
// o service valida o código, recalcula tudo server-side e devolve só a
// allowlist. Código inválido paga rate-limit + delay (login_attempts).
import { NextRequest, NextResponse } from 'next/server';
import { clientIp, isRateLimited, logAttempt } from '@/lib/login-attempts';
import { WeddingSiteService } from '@/services/wedding-site-service';

export const dynamic = 'force-dynamic';

const RATE_LIMIT_MAX = 10;
const FAILURE_DELAY_MS = 1500;

export async function POST(request: NextRequest) {
  const ip = clientIp(request.headers);
  if (await isRateLimited(ip, RATE_LIMIT_MAX)) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const code = String(body.code || '').replace(/\D/g, '').slice(0, 6);

  const result = await WeddingSiteService.quoteForGuest(code, {
    checkIn: String(body.checkIn || ''),
    checkOut: String(body.checkOut || ''),
    adults: Number(body.adults) || 0,
    children: Number(body.children) || 0,
    babies: Number(body.babies) || 0,
    pets: Number(body.pets) || 0,
  });

  if (!result.ok && result.error === 'not_found') {
    await logAttempt(ip, false);
    await new Promise((r) => setTimeout(r, FAILURE_DELAY_MS));
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
