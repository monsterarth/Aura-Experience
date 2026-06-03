import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function updateSession(request: NextRequest) {
    const pathname = request.nextUrl.pathname;

    // ── Rotas públicas do hóspede: não exigem sessão ───────────────────────────
    // /check-in e /feedback são acessadas por hóspedes não autenticados. Pular o
    // supabase.auth.getUser() (round-trip ao servidor de Auth do Supabase) reduz a
    // latência de cada navegação no portal. A única necessidade aqui é injetar
    // x-property-id quando a propriedade usa um domínio customizado.
    const isPublicGuestRoute = pathname.startsWith('/check-in') || pathname.startsWith('/feedback');
    if (isPublicGuestRoute) {
        const response = NextResponse.next({ request });
        const host = request.headers.get('host') ?? '';
        const knownHosts = ['aaura.app.br', 'localhost', '127.0.0.1'];
        const isCustomDomain = !knownHosts.some(h => host.includes(h));

        if (isCustomDomain) {
            const { data } = await supabaseAdmin
                .from('properties')
                .select('id')
                .eq('settings->>customDomain', host)
                .maybeSingle();

            if (data?.id) {
                response.headers.set('x-property-id', data.id);
            }
        }

        return response;
    }

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

    // Propagate validated userId to API routes so they skip a redundant getUser() call.
    // API routes read x-user-id from headers() — eliminates double round-trip to Supabase Auth.
    if (user) {
        supabaseResponse.headers.set('x-user-id', user.id);
    }

    const isAdminPage = pathname.startsWith('/admin') && !pathname.includes('/login');
    const isAdminApi = pathname.startsWith('/api/admin');
    const isStaffApp = pathname.startsWith('/governanta') || pathname.startsWith('/maid') || pathname.startsWith('/houseman') || pathname.startsWith('/maintenance') || pathname.startsWith('/waiter');

    // Proteger páginas de staff — redireciona para login se não autenticado
    if (isStaffApp && !user) {
        const url = request.nextUrl.clone();
        url.pathname = '/admin/login';
        return NextResponse.redirect(url);
    }

    // Proteger rotas de staff por role — server-side, antes de renderizar qualquer JS
    if (isStaffApp && user) {
        const { data: staffRow } = await supabaseAdmin
            .from('staff')
            .select('role, "secondaryRoles"')
            .eq('id', user.id)
            .maybeSingle();

        const role = staffRow?.role as string | undefined;
        const secondaryRoles: string[] = (staffRow as any)?.secondaryRoles ?? [];

        const roleForRoute: Record<string, string[]> = {
            '/maid': ['maid'],
            '/governanta': ['governance'],
            '/waiter': ['waiter'],
            '/houseman': ['houseman'],
            '/maintenance': ['maintenance', 'technician'],
        };

        const ADMIN_BYPASS = ['super_admin', 'admin', 'manager'];

        for (const [route, allowed] of Object.entries(roleForRoute)) {
            if (pathname.startsWith(route)) {
                const hasAccess = role && (
                    ADMIN_BYPASS.includes(role) ||
                    allowed.includes(role) ||
                    secondaryRoles.some(r => allowed.includes(r))
                );
                if (!hasAccess) {
                    const url = request.nextUrl.clone();
                    url.pathname = '/admin/login';
                    return NextResponse.redirect(url);
                }
            }
        }
    }

    // Mapa de roles móveis para as suas apps
    const mobileRoleApp: Record<string, string> = {
        maid: '/maid',
        governance: '/governanta',
        waiter: '/waiter',
        houseman: '/houseman',
        maintenance: '/maintenance',
        technician: '/maintenance',
        porter: '/porter',
    };

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

    // Roles móveis não devem aceder rotas admin — redireciona para a sua app
    if (isAdminPage && user) {
        const { data: staffRow } = await supabaseAdmin
            .from('staff')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();
        const role = staffRow?.role as string | undefined;
        if (role && mobileRoleApp[role]) {
            const url = request.nextUrl.clone();
            url.pathname = mobileRoleApp[role];
            return NextResponse.redirect(url);
        }
    }

    // Redirect to dashboard if logged in and on login page
    if (pathname.includes('/admin/login') && user) {
        const { data: staffRow } = await supabaseAdmin
            .from('staff')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();
        const role = staffRow?.role as string | undefined;
        const url = request.nextUrl.clone();
        url.pathname = (role && mobileRoleApp[role]) ? mobileRoleApp[role] : '/admin/stays';
        return NextResponse.redirect(url);
    }

    // Prevent 304 caching for admin pages — garante que cookies de auth
    // renovados pelo middleware sempre cheguem ao browser (não ficam presos em 304)
    if (request.nextUrl.pathname.startsWith('/admin')) {
        supabaseResponse.headers.set('Cache-Control', 'private, no-store')
    }

    return supabaseResponse
}
