// src/app/api/admin/staff/route.ts
import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { Staff, UserRole } from "@/types/aura";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * POST /api/admin/staff
 * Cria um novo utilizador no Supabase Auth e no Banco de Dados.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      email,
      password,
      fullName,
      role,
      propertyId,
      actorId,
      actorName
    } = body;

    // 1. Validação básica de campos obrigatórios
    if (!email || !password || !fullName || !role || !actorId) {
      return NextResponse.json(
        { error: "Campos obrigatórios em falta." },
        { status: 400 }
      );
    }

    // 2. Criar o utilizador no Supabase Authentication
    const { data: userResponse, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        fullName,
        role
      }
    });

    if (createError || !userResponse.user) {
      console.error("[Aura API Error] Falha na criação de Auth:", createError);
      throw createError;
    }

    const uid = userResponse.user.id;

    const staffData = {
      id: uid,
      propertyId: propertyId || null,
      fullName,
      email,
      role: role as UserRole,
      active: true,
      createdAt: new Date().toISOString(),
    };

    await supabaseAdmin.from("staff").insert(staffData);

    const auditLog = {
      id: crypto.randomUUID(),
      propertyId: propertyId || "SYSTEM",
      userId: actorId,
      userName: actorName,
      action: "USER_CREATE",
      entity: "USER",
      entityId: uid,
      newData: { email, role, fullName },
      timestamp: new Date().toISOString(),
      details: `Novo utilizador ${fullName} criado com o cargo ${role}.`
    };

    await supabaseAdmin.from("audit_logs").insert(auditLog);

    console.log(`[Aura API] Utilizador criado com sucesso: ${uid}`);

    return NextResponse.json({
      success: true,
      uid: uid
    }, { status: 201 });

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
 * Lista o staff de uma propriedade (Opcional)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const propertyId = searchParams.get('propertyId');

  try {
    let query = supabaseAdmin.from('staff').select('*');
    if (propertyId) query = query.eq('propertyId', propertyId);

    const { data: staffList } = await query;
    return NextResponse.json(staffList || []);
  } catch (error) {
    return NextResponse.json({ error: "Erro ao listar staff." }, { status: 500 });
  }
}