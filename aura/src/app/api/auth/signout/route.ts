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

    await supabase.auth.signOut();

    // Apaga todos os cookies de sessão do Supabase no browser
    cookieStore.getAll().forEach(({ name }) => {
        if (name.startsWith('sb-')) {
            response.cookies.set(name, '', { maxAge: 0, path: '/' });
        }
    });

    return response;
}
