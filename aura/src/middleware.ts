// src/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware do Aura: Proteção de rotas a nível de infraestrutura.
 * Verifica se existe um token de sessão nos cookies para permitir acesso às áreas admin.
 */
export function middleware(request: NextRequest) {
  const session = request.cookies.get('aura-session');
  const { pathname } = request.nextUrl;

  // 1. Se tentar aceder ao admin sem sessão, redireciona para o login
  if (pathname.startsWith('/admin') && !pathname.includes('/login') && !session) {
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }

  // 2. Se já estiver logado e tentar ir ao login, manda para o dashboard
  if (pathname.includes('/admin/login') && session) {
    return NextResponse.redirect(new URL('/admin/dashboard', request.url));
  }

  return NextResponse.next();
}

// Configurar quais as rotas que o middleware deve observar
export const config = {
  matcher: ['/admin/:path*'],
};