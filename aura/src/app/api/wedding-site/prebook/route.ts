// Pré-reserva do convidado — pública, autorizada pelo código de 6 dígitos.
// O service recalcula o preço no servidor, revalida a vaga (soft-block) e
// grava o rate_quote no funil com weddingId + alarme para a recepção.
// Anti-robô: honeypot + tempo mínimo de formulário (engolidos em silêncio).
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

  const result = await WeddingSiteService.createPreReservation({
    code,
    checkIn: String(body.checkIn || ''),
    checkOut: String(body.checkOut || ''),
    adults: Number(body.adults) || 0,
    children: Number(body.children) || 0,
    babies: Number(body.babies) || 0,
    pets: Number(body.pets) || 0,
    categoryId: String(body.categoryId || ''),
    clientName: String(body.clientName || ''),
    clientPhone: String(body.clientPhone || ''),
    clientEmail: body.clientEmail ? String(body.clientEmail) : null,
    lang: body.lang ? String(body.lang) : null,
    policyAccepted: body.policyAccepted === true,
    elapsedMs: Number(body.elapsedMs) || 0,
    website: body.website ? String(body.website) : undefined,
    ip,
    userAgent: request.headers.get('user-agent'),
  });

  if (!result.ok && result.error === 'not_found') {
    await logAttempt(ip, false);
    await new Promise((r) => setTimeout(r, FAILURE_DELAY_MS));
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
