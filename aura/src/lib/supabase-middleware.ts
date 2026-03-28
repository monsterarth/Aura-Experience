import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function updateSession(request: NextRequest) {
    let supabaseResponse = NextResponse.next({
        request,
    })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
                    supabaseResponse = NextResponse.next({
                        request,
                    })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                },
            },
            global: {
                fetch: (...args) => {
                    const options = args[1] || {};
                    // Crucial: Bypass Next.js aggressive caching em API Routes para o Supabase
                    options.cache = 'no-store';
                    return fetch(args[0], options);
                }
            }
        }
    )

    // This will refresh session if expired - required for Server Components
    // https://supabase.com/docs/guides/auth/server-side/nextjs
    const { data: { user } } = await supabase.auth.getUser()

    const pathname = request.nextUrl.pathname;
    const isAdminPage = pathname.startsWith('/admin') && !pathname.includes('/login');
    const isAdminApi = pathname.startsWith('/api/admin');

    // Proteger páginas admin e API routes admin — redireciona/bloqueia se não autenticado
    if ((isAdminPage || isAdminApi) && !user) {
        if (isAdminApi) {
            // API routes retornam 401 em vez de redirect
            return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
        }
        const url = request.nextUrl.clone()
        url.pathname = '/admin/login'
        return NextResponse.redirect(url)
    }

    // Redirect to dashboard if logged in and on login page
    if (pathname.includes('/admin/login') && user) {
        const url = request.nextUrl.clone()
        url.pathname = '/admin/stays'
        return NextResponse.redirect(url)
    }

    // Prevent 304 caching for admin pages — garante que cookies de auth
    // renovados pelo middleware sempre cheguem ao browser (não ficam presos em 304)
    if (request.nextUrl.pathname.startsWith('/admin')) {
        supabaseResponse.headers.set('Cache-Control', 'private, no-store')
    }

    // Domínio customizado: injeta x-property-id para rotas públicas do hóspede
    const isPublicGuestRoute = pathname.startsWith('/check-in') || pathname.startsWith('/feedback');
    if (isPublicGuestRoute) {
        const host = request.headers.get('host') ?? '';
        const knownHosts = ['aaura.app', 'localhost', '127.0.0.1'];
        const isCustomDomain = !knownHosts.some(h => host.includes(h));

        if (isCustomDomain) {
            const { data } = await supabaseAdmin
                .from('properties')
                .select('id')
                .eq('settings->>customDomain', host)
                .maybeSingle();

            if (data?.id) {
                supabaseResponse.headers.set('x-property-id', data.id);
            }
        }
    }

    return supabaseResponse
}
