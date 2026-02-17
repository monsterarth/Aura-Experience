// src/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware do Aura: Proteção de rotas a nível de infraestrutura.
 */
export function middleware(request: NextRequest) {
  const session = request.cookies.get('aura-session');
  const { pathname } = request.nextUrl;

  // 1. Se tentar acessar admin sem sessão -> Login
  if (pathname.startsWith('/admin') && !pathname.includes('/login') && !session) {
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }

  // 2. Se já estiver logado e tentar ir ao login -> Stays (Painel Operacional)
  // Mudado de /admin/dashboard para /admin/stays que sabemos que existe
  if (pathname.includes('/admin/login') && session) {
    return NextResponse.redirect(new URL('/admin/stays', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};