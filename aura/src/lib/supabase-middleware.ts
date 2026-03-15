import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

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

    const isAuthRoute = request.nextUrl.pathname.startsWith('/admin') && !request.nextUrl.pathname.includes('/login');

    // Protect routes based on explicit user existence
    // Exclui a própria rota de login pra evitar loops infinitos
    if (isAuthRoute && !user) {
        const url = request.nextUrl.clone()
        url.pathname = '/admin/login'
        return NextResponse.redirect(url)
    }

    // Redirect to dashboard if logged in and on login page
    if (request.nextUrl.pathname.includes('/admin/login') && user) {
        const url = request.nextUrl.clone()
        url.pathname = '/admin/stays'
        return NextResponse.redirect(url)
    }

    // Prevent 304 caching for admin pages — garante que cookies de auth
    // renovados pelo middleware sempre cheguem ao browser (não ficam presos em 304)
    if (request.nextUrl.pathname.startsWith('/admin')) {
        supabaseResponse.headers.set('Cache-Control', 'private, no-store')
    }

    return supabaseResponse
}
