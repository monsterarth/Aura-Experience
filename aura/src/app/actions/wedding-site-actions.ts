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

// Retorna um resultado discriminado em vez de LANÇAR: em produção o Next
// mascara a mensagem de erro de server actions ("An error occurred…"), então
// `error.message === 'RATE_LIMITED'` nunca casaria e o usuário veria sempre a
// mensagem genérica. O objeto de retorno atravessa o masking intacto.
export type WeddingCodeResult =
  | { ok: true; code: string }
  | { ok: false; reason: 'rate_limited' | 'invalid' };

export async function validateWeddingCode(code: string): Promise<WeddingCodeResult> {
  const headersList = await headers();
  const ip = clientIp(headersList);

  if (await isRateLimited(ip, RATE_LIMIT_MAX)) {
    return { ok: false, reason: 'rate_limited' };
  }

  const clean = (code || '').replace(/\D/g, '').slice(0, 6);
  const resolved = await WeddingSiteService.resolveCode(clean);

  if (!resolved) {
    await logAttempt(ip, false);
    // O delay é o que torna força bruta impraticável mesmo em alta vazão.
    await new Promise((r) => setTimeout(r, FAILURE_DELAY_MS));
    return { ok: false, reason: 'invalid' };
  }

  await logAttempt(ip, true);
  return { ok: true, code: clean };
}
