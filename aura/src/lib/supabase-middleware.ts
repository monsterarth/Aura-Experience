import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { roleHome, isMobileOnlyRole } from '@/lib/role-routes'

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function updateSession(request: NextRequest) {
    const pathname = request.nextUrl.pathname;

    // ── Plaqueta de patrimônio: URL pública e permanente ───────────────────────
    // O QR gravado na plaqueta física resolve /p/<code>. Não há sessão e não há
    // domínio custom a resolver (o próprio código identifica a propriedade), então
    // o retorno é seco: sem esta linha, cada escaneada pagaria um round-trip ao
    // servidor de Auth do Supabase. A barra final evita capturar um futuro
    // /patrimonio de primeiro nível.
    if (pathname.startsWith('/p/')) {
        return NextResponse.next({ request });
    }

    // ── Proposta comercial: link público que o vendedor manda ao cliente ───────
    // Mesma razão do /p/: o id (uuid) já identifica a propriedade, não há sessão
    // e o cliente costuma abrir no celular, fora de casa — sem este retorno seco
    // cada abertura pagaria um round-trip ao Auth do Supabase.
    if (pathname.startsWith('/cotacao/')) {
        return NextResponse.next({ request });
    }

    // ── Home institucional (/aura): pública, nunca redireciona ─────────────────
    // É a página que se mostra em feira/prospecção — precisa abrir rápido e
    // funcionar logado ou não. Sem sessão a validar, retorno seco: evita o
    // round-trip ao servidor de Auth do Supabase em cada visita.
    if (pathname === '/aura' || pathname.startsWith('/aura/')) {
        return NextResponse.next({ request });
    }

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

    // (Removido: a injeção de x-user-id no response. Ele ia pro RESPONSE — nunca chegava às rotas
    // como request header — e o header de entrada não era removido, então o cliente podia forjá-lo
    // e se passar por qualquer staff. As rotas validam sempre pela sessão do cookie agora.)

    // PWA start_url = "/" — redirecionar autenticados para a tela inicial do cargo
    if (pathname === '/' && user) {
        const { data: staffRow } = await supabaseAdmin
            .from('staff')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();
        const role = staffRow?.role as string | undefined;
        const url = request.nextUrl.clone();
        url.pathname = roleHome(role);
        return NextResponse.redirect(url);
    }

    const isAdminPage = pathname.startsWith('/admin') && !pathname.includes('/login');
    // /api/admin/auth/* é o FLUXO de autenticação (login/me/signout) e precisa ser
    // alcançável SEM sessão — senão o login fica atrás da própria parede que abre: o
    // POST em /api/admin/auth/login voltava 401 "Não autenticado" antes de rodar.
    // Cada rota de auth se autoprotege (login valida credenciais; me/signout tratam
    // a ausência de sessão sozinhas), então tirá-las do gate não abre buraco.
    const isAdminApi = pathname.startsWith('/api/admin') && !pathname.startsWith('/api/admin/auth/');
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
            '/maintenance-ops': ['maintenance'], // console do coordenador
            '/maintenance': ['maintenance', 'technician'],
        };

        const ADMIN_BYPASS = ['super_admin', 'admin', 'manager'];

        // Match por SEGMENTO (não startsWith cru — '/maintenance-ops' não é '/maintenance')
        // e vence só o prefixo mais longo: a ordem das chaves do mapa é irrelevante.
        let allowed: string[] | null = null;
        let allowedLen = -1;
        for (const [route, roles] of Object.entries(roleForRoute)) {
            const hit = pathname === route || pathname.startsWith(route + '/');
            if (hit && route.length > allowedLen) { allowed = roles; allowedLen = route.length; }
        }

        if (allowed) {
            const routeRoles = allowed;
            const hasAccess = role && (
                ADMIN_BYPASS.includes(role) ||
                routeRoles.includes(role) ||
                secondaryRoles.some(r => routeRoles.includes(r))
            );
            if (!hasAccess) {
                const url = request.nextUrl.clone();
                url.pathname = '/admin/login';
                return NextResponse.redirect(url);
            }
        }
    }

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

    // Roles móveis operacionais não acessam /admin — redireciona para a sua app de campo
    if (isAdminPage && user) {
        const { data: staffRow } = await supabaseAdmin
            .from('staff')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();
        const role = staffRow?.role as string | undefined;
        if (isMobileOnlyRole(role)) {
            const url = request.nextUrl.clone();
            url.pathname = roleHome(role);
            return NextResponse.redirect(url);
        }
    }

    // Já logado e na página de login → vai para a tela inicial do seu cargo
    // (fonte única em role-routes.ts — nunca mais despeja todo mundo em /admin/stays)
    if (pathname.includes('/admin/login') && user) {
        const { data: staffRow } = await supabaseAdmin
            .from('staff')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();
        const role = staffRow?.role as string | undefined;
        const url = request.nextUrl.clone();
        url.pathname = roleHome(role);
        return NextResponse.redirect(url);
    }

    // Prevent 304 caching for admin pages — garante que cookies de auth
    // renovados pelo middleware sempre cheguem ao browser (não ficam presos em 304)
    if (request.nextUrl.pathname.startsWith('/admin')) {
        supabaseResponse.headers.set('Cache-Control', 'private, no-store')
    }

    return supabaseResponse
}
