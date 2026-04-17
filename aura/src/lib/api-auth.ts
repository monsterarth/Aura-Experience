// src/lib/api-auth.ts
// Helper de autenticação server-side para API Routes.
// Extrai sessão do cookie, valida role e retorna dados do staff.
import { createServerClient } from '@supabase/ssr';
import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { UserRole } from '@/types/aura';

export interface AuthResult {
    userId: string;
    email: string;
    staff: {
        id: string;
        fullName: string;
        role: UserRole;
        propertyId: string | null;
    };
}

/**
 * Extrai o user autenticado a partir dos cookies da request.
 * Fast-path: lê x-user-id injetado pelo middleware (evita round-trip ao Supabase Auth).
 * Fallback: chama getUser() diretamente (para casos sem middleware).
 */
async function getAuthenticatedUser(): Promise<{ userId: string; email: string } | null> {
    // Fast-path: middleware already validated the session and injected the userId.
    // This eliminates the duplicate getUser() network call that caused intermittent 401s.
    try {
        const headerStore = headers();
        const userId = headerStore.get('x-user-id');
        if (userId) return { userId, email: '' };
    } catch {
        // headers() throws outside request context — fall through to cookie fallback
    }

    // Fallback: read session from cookies directly (e.g. when middleware didn't run)
    try {
        const cookieStore = cookies();
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() { return cookieStore.getAll(); },
                    setAll() {},
                },
            }
        );

        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) return null;

        return { userId: user.id, email: user.email || '' };
    } catch {
        return null;
    }
}

/**
 * Valida autenticação e (opcionalmente) role do staff.
 *
 * @param allowedRoles - Se fornecido, apenas essas roles são aceitas.
 *                       Se não fornecido, qualquer staff autenticado é aceito.
 * @returns AuthResult com dados do staff, ou NextResponse com erro 401/403.
 */
export async function requireAuth(allowedRoles?: UserRole[]): Promise<AuthResult | NextResponse> {
    const user = await getAuthenticatedUser();

    if (!user) {
        return NextResponse.json(
            { error: 'Não autenticado. Faça login para continuar.' },
            { status: 401 }
        );
    }

    if (!supabaseAdmin) {
        return NextResponse.json(
            { error: 'Erro de configuração do servidor.' },
            { status: 500 }
        );
    }

    // Buscar dados do staff (role, propertyId)
    const { data: staff, error } = await supabaseAdmin
        .from('staff')
        .select('id, fullName, role, propertyId')
        .eq('id', user.userId)
        .single();

    if (error || !staff) {
        return NextResponse.json(
            { error: 'Staff não encontrado no sistema.' },
            { status: 403 }
        );
    }

    // Verificar role se especificado
    if (allowedRoles && !allowedRoles.includes(staff.role as UserRole)) {
        return NextResponse.json(
            { error: `Acesso negado. Cargo '${staff.role}' não tem permissão para esta operação.` },
            { status: 403 }
        );
    }

    return {
        userId: user.userId,
        email: user.email,
        staff: {
            id: staff.id,
            fullName: staff.fullName,
            role: staff.role as UserRole,
            propertyId: staff.propertyId,
        },
    };
}

/**
 * Type guard: verifica se o resultado é um NextResponse (erro) ou AuthResult (sucesso).
 */
export function isAuthError(result: AuthResult | NextResponse): result is NextResponse {
    return result instanceof NextResponse;
}
