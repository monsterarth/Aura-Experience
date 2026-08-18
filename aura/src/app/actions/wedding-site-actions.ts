'use server';

// Validação do código de 6 dígitos na tela /casamento — molde exato do
// validateAccessCode do portal do hóspede: rate-limit por IP compartilhado
// (tabela login_attempts) + delay artificial no erro. Sucesso devolve só o
// próprio código validado; a página /casamento/[code] refaz a resolução.
import { headers } from 'next/headers';
import { clientIp, isRateLimited, logAttempt } from '@/lib/login-attempts';
import { WeddingSiteService } from '@/services/wedding-site-service';

const RATE_LIMIT_MAX = 10;
const FAILURE_DELAY_MS = 1500;

export async function validateWeddingCode(code: string): Promise<{ code: string }> {
  const headersList = await headers();
  const ip = clientIp(headersList);

  if (await isRateLimited(ip, RATE_LIMIT_MAX)) {
    throw new Error('RATE_LIMITED');
  }

  const clean = (code || '').replace(/\D/g, '').slice(0, 6);
  const resolved = await WeddingSiteService.resolveCode(clean);

  if (!resolved) {
    await logAttempt(ip, false);
    // O delay é o que torna força bruta impraticável mesmo em alta vazão.
    await new Promise((r) => setTimeout(r, FAILURE_DELAY_MS));
    throw new Error('INVALID_CODE');
  }

  await logAttempt(ip, true);
  return { code: clean };
}
