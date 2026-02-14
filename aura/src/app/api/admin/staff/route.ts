// src/app/api/admin/staff/route.ts
import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { Staff, UserRole } from "@/types/aura";
import { FieldValue } from "firebase-admin/firestore";

/**
 * POST /api/admin/staff
 * Cria um novo utilizador no Firebase Auth e no Firestore.
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

    // 2. Criar o utilizador no Firebase Authentication
    // O Admin SDK permite criar utilizadores sem que eles precisem de fazer login
    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: fullName,
      disabled: false,
    });

    const uid = userRecord.uid;

    // 3. Criar o documento do funcionário no Firestore
    const staffData: Omit<Staff, "id"> = {
      propertyId: propertyId || null, // null apenas para super_admin
      fullName,
      email,
      role: role as UserRole,
      active: true,
      createdAt: FieldValue.serverTimestamp(),
    };

    await adminDb.collection("users").doc(uid).set(staffData);

    // 4. Gerar Log de Auditoria (Direto via Admin SDK para garantir consistência)
    const auditLog = {
      propertyId: propertyId || "SYSTEM",
      userId: actorId,
      userName: actorName,
      action: "USER_CREATE",
      entity: "USER",
      entityId: uid,
      newData: {
        email,
        role,
        fullName
      },
      timestamp: FieldValue.serverTimestamp(),
      details: `Novo utilizador ${fullName} criado com o cargo ${role}.`
    };

    await adminDb.collection("audit_logs").add(auditLog);

    console.log(`[Aura API] Utilizador criado com sucesso: ${uid}`);

    return NextResponse.json({ 
      success: true, 
      uid: uid 
    }, { status: 201 });

  } catch (error: any) {
    console.error("[Aura API Error] Falha ao criar staff:", error);
    
    // Tratamento de erros comuns do Firebase Auth
    if (error.code === 'auth/email-already-exists') {
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
    let query = adminDb.collection("users");
    
    // Se não for super_admin, filtra pela propriedade
    let snapshot;
    if (propertyId) {
      snapshot = await query.where("propertyId", "==", propertyId).get();
    } else {
      snapshot = await query.get();
    }

    const staffList = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return NextResponse.json(staffList);
  } catch (error) {
    return NextResponse.json({ error: "Erro ao listar staff." }, { status: 500 });
  }
}