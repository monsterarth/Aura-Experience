// Autorização de gerente para operações sensíveis (server-side).
//
// Regra: se quem está logado já é gerência, passa direto. Se não é (ex.: a
// recepção editando o valor de uma diária), a operação exige que um gerente
// digite e-mail e senha num modal — e a verificação acontece AQUI, no servidor.
//
// Por que não verificar no browser: `signInWithPassword` no client do navegador
// SUBSTITUI a sessão ativa. A recepcionista seria deslogada e o gerente entraria
// no lugar dela. Aqui usamos um cliente EFÊMERO (sem persistir sessão, sem
// refresh) só para conferir a credencial e descartá-la em seguida.
//
// A senha nunca é gravada nem logada; o audit registra quem operou e quem
// autorizou.
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { hasRole } from '@/lib/api-auth';
import { UserRole } from '@/types/aura';

export const MANAGER_ROLES: UserRole[] = ['super_admin', 'admin', 'manager'];

/** Tentativas erradas por IP na janela — trava o brute force no modal. */
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const FAILURE_DELAY_MS = 1200;

export interface ManagerOverrideInput {
  email?: string;
  password?: string;
}

export interface Approval {
  /** Quem autorizou (o próprio operador, quando já é gerência). */
  approvedById: string;
  approvedByName: string;
  /** true quando a autorização veio do modal de gerente. */
  viaOverride: boolean;
}

async function tooManyAttempts(ip: string): Promise<boolean> {
  if (!supabaseAdmin) return false;
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const { count } = await supabaseAdmin
    .from('login_attempts')
    .select('*', { count: 'exact', head: true })
    .eq('ip', ip)
    .eq('success', false)
    .gte('attempted_at', windowStart);
  return (count || 0) >= RATE_LIMIT_MAX;
}

async function logAttempt(ip: string, success: boolean): Promise<void> {
  if (!supabaseAdmin) return;
  await supabaseAdmin
    .from('login_attempts')
    .insert({ ip, attempted_at: new Date().toISOString(), success })
    .then(() => {}, () => {});
}

/**
 * Garante que a operação está autorizada por alguém de gerência.
 *
 * @param operator  staff logado (de requireAuth)
 * @param override  credenciais digitadas no modal, quando o operador não é gerência
 * @param ip        IP da request (rate limit)
 */
export async function requireManagerApproval(
  operator: { id: string; fullName: string; role: UserRole; secondaryRoles: UserRole[]; propertyId: string | null },
  override: ManagerOverrideInput | undefined,
  ip: string
): Promise<Approval | NextResponse> {
  // Já é gerência: autoriza a si mesmo.
  if (hasRole(operator.role, operator.secondaryRoles, MANAGER_ROLES)) {
    return { approvedById: operator.id, approvedByName: operator.fullName, viaOverride: false };
  }

  const email = override?.email?.trim().toLowerCase();
  const password = override?.password;
  if (!email || !password) {
    return NextResponse.json(
      { error: 'MANAGER_APPROVAL_REQUIRED', message: 'Esta operação precisa da autorização de um gerente.' },
      { status: 403 }
    );
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Erro de configuração do servidor.' }, { status: 500 });
  }

  if (await tooManyAttempts(ip)) {
    return NextResponse.json(
      { error: 'RATE_LIMITED', message: 'Muitas tentativas. Aguarde alguns minutos.' },
      { status: 429 }
    );
  }

  // Cliente EFÊMERO: não persiste nem atualiza sessão — a sessão de quem está
  // operando no navegador continua intacta.
  const ephemeral = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  );

  const { data, error } = await ephemeral.auth.signInWithPassword({ email, password });
  // Descarta a sessão recém-criada de imediato.
  await ephemeral.auth.signOut().catch(() => {});

  if (error || !data?.user) {
    await logAttempt(ip, false);
    await new Promise((r) => setTimeout(r, FAILURE_DELAY_MS));
    return NextResponse.json(
      { error: 'INVALID_CREDENTIALS', message: 'E-mail ou senha inválidos.' },
      { status: 401 }
    );
  }

  const { data: manager } = await supabaseAdmin
    .from('staff')
    .select('id, fullName, role, propertyId, secondaryRoles')
    .eq('id', data.user.id)
    .single();

  if (!manager) {
    await logAttempt(ip, false);
    return NextResponse.json({ error: 'Autorizador não encontrado.' }, { status: 403 });
  }

  const secondaryRoles = ((manager as { secondaryRoles?: UserRole[] }).secondaryRoles ?? []) as UserRole[];
  if (!hasRole(manager.role as UserRole, secondaryRoles, MANAGER_ROLES)) {
    await logAttempt(ip, false);
    return NextResponse.json(
      { error: 'NOT_A_MANAGER', message: `${manager.fullName} não tem cargo de gerência.` },
      { status: 403 }
    );
  }

  // Gerente de outra propriedade não autoriza operação nesta.
  if (operator.propertyId && manager.propertyId && manager.propertyId !== operator.propertyId
      && manager.role !== 'super_admin') {
    await logAttempt(ip, false);
    return NextResponse.json(
      { error: 'WRONG_PROPERTY', message: 'Gerente de outra propriedade.' },
      { status: 403 }
    );
  }

  await logAttempt(ip, true);
  return { approvedById: manager.id, approvedByName: manager.fullName, viaOverride: true };
}

/** IP da request para o rate limit (proxy da Vercel). */
export function requestIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim()
    || req.headers.get('x-real-ip')
    || 'unknown';
}
