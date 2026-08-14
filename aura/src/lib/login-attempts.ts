// src/lib/login-attempts.ts
// Rate limit por IP para autenticação, apoiado na tabela `login_attempts`
// (colunas: ip · attempted_at · success). SERVER-ONLY — usa service-role.
//
// A contagem é COMPARTILHADA entre os pontos de auth (login do staff, login do
// hóspede por código, bootstrap do portal): a semântica é "tentativas de auth
// FALHAS a partir deste IP", e é isso que queremos estrangular coletivamente.
// Só falhas são gravadas — carga por credencial válida nunca infla a tabela.
import { supabaseAdmin } from '@/lib/supabase';

const WINDOW_MS = 15 * 60 * 1000; // 15 minutos

/** Extrai o IP do cliente atrás do proxy da Vercel. */
export function clientIp(headers: Headers): string {
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || headers.get('x-real-ip')
    || 'unknown';
}

/** true se este IP já estourou `max` falhas na janela. IP desconhecido nunca trava. */
export async function isRateLimited(ip: string, max: number): Promise<boolean> {
  if (!supabaseAdmin || ip === 'unknown') return false;
  const windowStart = new Date(Date.now() - WINDOW_MS).toISOString();
  const { count } = await supabaseAdmin
    .from('login_attempts')
    .select('*', { count: 'exact', head: true })
    .eq('ip', ip)
    .eq('success', false)
    .gte('attempted_at', windowStart);
  return (count || 0) >= max;
}

/** Registra uma tentativa. Best-effort — nunca lança (não pode derrubar o login). */
export async function logAttempt(ip: string, success: boolean): Promise<void> {
  if (!supabaseAdmin || ip === 'unknown') return;
  try {
    await supabaseAdmin.from('login_attempts').insert({
      ip,
      attempted_at: new Date().toISOString(),
      success,
    });
  } catch {
    /* ignora: o log de tentativa não pode quebrar o fluxo de auth */
  }
}
