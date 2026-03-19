// src/app/api/admin/staff/route.ts
import { NextResponse } from "next/server";
import { UserRole } from "@/types/aura";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAuth, isAuthError } from "@/lib/api-auth";

/**
 * POST /api/admin/staff
 * Cria um novo utilizador no Supabase Auth e no Banco de Dados.
 * Requer role: super_admin ou admin.
 */
export async function POST(request: Request) {
  // Auth: apenas super_admin e admin podem criar staff
  const auth = await requireAuth(['super_admin', 'admin']);
  if (isAuthError(auth)) return auth;

  try {
    const body = await request.json();
    const { email, password, fullName, role, propertyId } = body;

    if (!email || !password || !fullName || !role) {
      return NextResponse.json(
        { error: "Campos obrigatórios em falta." },
        { status: 400 }
      );
    }

    // Admin só pode criar staff para a sua própria property
    if (auth.staff.role === 'admin') {
      if (propertyId && propertyId !== auth.staff.propertyId) {
        return NextResponse.json(
          { error: "Admins só podem criar staff para a sua própria propriedade." },
          { status: 403 }
        );
      }
    }

    // 2. Criar o utilizador no Supabase Authentication
    const { data: userResponse, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { fullName, role }
    });

    if (createError || !userResponse.user) {
      console.error("[Aura API Error] Falha na criação de Auth:", createError);
      throw createError;
    }

    const uid = userResponse.user.id;

    const staffData = {
      id: uid,
      propertyId: auth.staff.role === 'admin' ? auth.staff.propertyId : (propertyId || null),
      fullName,
      email,
      role: role as UserRole,
      active: true,
      createdAt: new Date().toISOString(),
    };

    await supabaseAdmin.from("staff").insert(staffData);

    // Audit log — actorId vem da sessão, não do body
    const auditLog = {
      id: crypto.randomUUID(),
      propertyId: staffData.propertyId || "SYSTEM",
      userId: auth.staff.id,
      userName: auth.staff.fullName,
      action: "USER_CREATE",
      entity: "USER",
      entityId: uid,
      newData: { email, role, fullName },
      timestamp: new Date().toISOString(),
      details: `Novo utilizador ${fullName} criado com o cargo ${role}.`
    };

    await supabaseAdmin.from("audit_logs").insert(auditLog);

    console.log(`[Aura API] Utilizador criado com sucesso: ${uid}`);

    return NextResponse.json({ success: true, uid }, { status: 201 });

  } catch (error: any) {
    console.error("[Aura API Error] Falha ao criar staff:", error);

    if (error?.message?.includes('User already registered') || error?.code === 'auth/email-already-exists') {
      return NextResponse.json(
        { error: "Este e-mail já está registado no sistema." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Erro interno ao processar a criação do utilizador." },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/staff?propertyId=...
 * Lista o staff de uma propriedade.
 * Requer autenticação. Non-super_admin só vê staff da sua property.
 */
export async function GET(request: Request) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(request.url);
  const requestedPropertyId = searchParams.get('propertyId');

  try {
    let query = supabaseAdmin.from('staff').select('*');

    // Super admin pode listar qualquer property; outros só a própria
    if (auth.staff.role === 'super_admin') {
      if (requestedPropertyId) query = query.eq('propertyId', requestedPropertyId);
    } else {
      query = query.eq('propertyId', auth.staff.propertyId);
    }

    const { data: staffList } = await query;
    return NextResponse.json(staffList || []);
  } catch (error) {
    return NextResponse.json({ error: "Erro ao listar staff." }, { status: 500 });
  }
}
