import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Rota pública — fora de /api/admin para não ser bloqueada pelo middleware
export async function POST() {
    const cookieStore = await cookies();
    const response = NextResponse.json({ ok: true });

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll: () => cookieStore.getAll(),
                setAll: (cookiesToSet) => {
                    cookiesToSet.forEach(({ name, value, options }) => {
                        response.cookies.set(name, value, options);
                    });
                },
            },
        }
    );

    // Limpa os cookies ANTES do await — garante que mesmo se signOut travar,
    // os cookies sb- já foram apagados na resposta e o middleware não redireciona de volta
    cookieStore.getAll().forEach(({ name }) => {
        if (name.startsWith('sb-')) {
            response.cookies.set(name, '', { maxAge: 0, path: '/' });
        }
    });

    // Revoga no Supabase Auth (best-effort, 2s timeout — não bloqueia a resposta)
    await Promise.race([
        supabase.auth.signOut({ scope: 'local' }),
        new Promise<void>(resolve => setTimeout(resolve, 2000)),
    ]).catch(() => {});

    return response;
}
