// Personalização do site pelos NOIVOS — pública, mas só o coupleCode passa
// (o service recusa guestCode com a mesma resposta de código inexistente).
// Allowlist estrita no service: foto (https), mensagem (600) e 3 cores hex.
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

  const result = await WeddingSiteService.saveCoupleConfig(code, {
    ...(('coverPhotoUrl' in body) ? { coverPhotoUrl: body.coverPhotoUrl } : {}),
    ...(('welcomeMessage' in body) ? { welcomeMessage: body.welcomeMessage } : {}),
    ...(('colors' in body) ? { colors: body.colors } : {}),
  });

  if (!result.ok && result.error === 'not_found') {
    await logAttempt(ip, false);
    await new Promise((r) => setTimeout(r, FAILURE_DELAY_MS));
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
