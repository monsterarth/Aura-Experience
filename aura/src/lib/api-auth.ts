// src/lib/api-auth.ts
// Helper de autenticação server-side para API Routes.
// Extrai sessão do cookie, valida role e retorna dados do staff.
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
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
        secondaryRoles: UserRole[];
    };
}

/**
 * Extrai o user autenticado validando a sessão pelos COOKIES (server-side).
 * NÃO confia em header de identidade do request: x-user-id é forjável pelo cliente e não chega
 * validado às rotas — validar sempre pelo cookie fecha o vetor de impersonação/escalonamento.
 */
async function getAuthenticatedUser(): Promise<{ userId: string; email: string } | null> {
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

    // Buscar dados do staff (role + secondaryRoles + propertyId)
    const { data: staff, error } = await supabaseAdmin
        .from('staff')
        .select('id, fullName, role, propertyId, secondaryRoles')
        .eq('id', user.userId)
        .single();

    if (error || !staff) {
        return NextResponse.json(
            { error: 'Staff não encontrado no sistema.' },
            { status: 403 }
        );
    }

    const secondaryRoles = ((staff as any).secondaryRoles ?? []) as UserRole[];

    // Verificar role se especificado — aceita cargo PRIMÁRIO ou SECUNDÁRIO (mesma regra do
    // middleware e do RoleGuard). Antes só checava o primário, barrando ex.: camareira com
    // cargo secundário de governanta numa rota gated por ['governance'].
    if (allowedRoles && !hasRole(staff.role as UserRole, secondaryRoles, allowedRoles)) {
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
            secondaryRoles,
        },
    };
}

/**
 * Valida autenticação, cargo E **posse da propriedade**.
 *
 * `requireAuth` sozinho checa só o cargo: ele devolve `staff.propertyId` mas nunca compara
 * com o recurso sendo lido/escrito. Numa rota de CONFIGURAÇÃO isso significa que qualquer
 * admin poderia mandar o propertyId de outra pousada no corpo do request.
 *
 * Quem atravessa tenant é explícito e, por padrão, **só super_admin** — mais apertado que a
 * convenção `ADMIN_TIER` de /api/admin/weddings e /api/field/cabins de propósito: no produto,
 * só o super_admin tem seletor de propriedade (PropertyContext prende os demais ao
 * staff.propertyId), então um admin nunca manda propertyId alheio por caminho legítimo.
 * Rotas operacionais que precisem da regra frouxa passam `crossTenantRoles` explicitamente.
 */
export async function requirePropertyAccess(
    propertyId: string | null | undefined,
    allowedRoles?: UserRole[],
    crossTenantRoles: UserRole[] = ['super_admin'],
): Promise<AuthResult | NextResponse> {
    const auth = await requireAuth(allowedRoles);
    if (isAuthError(auth)) return auth;

    if (!propertyId) {
        return NextResponse.json({ error: 'propertyId é obrigatório.' }, { status: 400 });
    }
    if (hasRole(auth.staff.role, auth.staff.secondaryRoles, crossTenantRoles)) return auth;
    if (auth.staff.propertyId !== propertyId) {
        return NextResponse.json(
            { error: 'Acesso negado: esta propriedade não é a sua.' },
            { status: 403 }
        );
    }
    return auth;
}

/**
 * Type guard: verifica se o resultado é um NextResponse (erro) ou AuthResult (sucesso).
 */
export function isAuthError(result: AuthResult | NextResponse): result is NextResponse {
    return result instanceof NextResponse;
}

/**
 * Acesso por cargo: true se o cargo PRIMÁRIO ou QUALQUER cargo secundário está na lista permitida.
 * Fonte única de verdade usada por requireAuth — espelha o middleware (supabase-middleware.ts:134)
 * e o RoleGuard (components/auth/RoleGuard.tsx). Function declaration → hoisted, pode ser usada acima.
 */
export function hasRole(
    role: UserRole | null | undefined,
    secondaryRoles: (UserRole | string)[] | null | undefined,
    allowed: UserRole[]
): boolean {
    if (role && allowed.includes(role)) return true;
    return (secondaryRoles ?? []).some(r => allowed.includes(r as UserRole));
}
