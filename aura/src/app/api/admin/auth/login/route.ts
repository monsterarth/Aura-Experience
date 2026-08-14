// src/app/api/admin/auth/login/route.ts
//
// LOGIN DO STAFF — SERVER-SIDE, com rate limit por IP + log de tentativas.
//
// Antes o navegador chamava supabase.auth.signInWithPassword direto contra o
// Auth do Supabase: sem trava adicional de brute force e sem NENHUM registro de
// tentativa falha — um ataque de força bruta/credential stuffing contra contas
// de staff passava invisível. Aqui a sessão é estabelecida via cookies (mesmo
// esquema de /api/admin/auth/signout), cada tentativa é limitada e logada, e a
// resposta de falha é genérica (anti-enumeração: não distingue e-mail
// inexistente de senha errada, nem vaza o motivo do Supabase).
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { supabaseAdmin } from '@/lib/supabase';
import { clientIp, isRateLimited, logAttempt } from '@/lib/login-attempts';

const MAX_FAILED = 15;           // falhas por IP / 15 min (contagem compartilhada)
const FAILURE_DELAY_MS = 1000;   // atrito artificial contra brute force

export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);

  if (await isRateLimited(ip, MAX_FAILED)) {
    return NextResponse.json(
      { error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' },
      { status: 429 },
    );
  }

  let email = '';
  let password = '';
  try {
    const body = await req.json();
    email = String(body?.email ?? '').trim();
    password = String(body?.password ?? '');
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }
  if (!email || !password) {
    return NextResponse.json({ error: 'Credenciais inválidas.' }, { status: 400 });
  }

  // Coletor dos cookies de sessão que o client do Supabase quer gravar — aplicados
  // depois na resposta que efetivamente retornarmos (sucesso ou signOut de limpeza).
  const cookiesToSet: { name: string; value: string; options: any }[] = [];
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list) => { cookiesToSet.push(...list); },
      },
    },
  );

  const withCookies = (res: NextResponse) => {
    cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
    return res;
  };

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    await logAttempt(ip, false);
    await new Promise((r) => setTimeout(r, FAILURE_DELAY_MS));
    return NextResponse.json({ error: 'Credenciais inválidas.' }, { status: 401 });
  }

  // Perfil precisa existir e estar ativo — senão desfaz a sessão recém-criada.
  const { data: staff } = supabaseAdmin
    ? await supabaseAdmin
        .from('staff')
        .select('id, active, role, fullName')
        .eq('id', data.user.id)
        .maybeSingle()
    : { data: null };

  if (!staff || (staff as any).active === false) {
    await supabase.auth.signOut();
    await logAttempt(ip, false);
    return withCookies(NextResponse.json(
      { error: !staff ? 'Usuário autenticado, mas perfil não encontrado no Aura.' : 'Esta conta foi desativada pela administração.' },
      { status: 403 },
    ));
  }

  await logAttempt(ip, true);

  return withCookies(NextResponse.json({
    ok: true,
    role: (staff as any).role,
    fullName: (staff as any).fullName,
  }));
}
