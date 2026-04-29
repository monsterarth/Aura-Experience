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
  // Auth: super_admin, admin e hr podem criar staff
  const auth = await requireAuth(['super_admin', 'admin', 'hr']);
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

    // Admin e HR só podem criar staff para a sua própria property
    if (auth.staff.role === 'admin' || auth.staff.role === 'hr') {
      if (propertyId && propertyId !== auth.staff.propertyId) {
        return NextResponse.json(
          { error: "Admins só podem criar staff para a sua própria propriedade." },
          { status: 403 }
        );
      }
      // HR não pode criar admin ou super_admin
      if (auth.staff.role === 'hr' && (role === 'admin' || role === 'super_admin')) {
        return NextResponse.json(
          { error: "RH não pode criar staff com cargo de Admin ou Super Admin." },
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
 * PATCH /api/admin/staff
 * Altera o email ou a senha de um utilizador.
 * - changeEmail: requer confirmação via e-mail para o endereço anterior
 * - changePassword: admin/super_admin podem mudar direto; o próprio utilizador precisa da senha atual
 * Requer role: super_admin ou admin.
 */
export async function PATCH(request: Request) {
  const auth = await requireAuth(['super_admin', 'admin', 'hr']);
  if (isAuthError(auth)) return auth;

  try {
    const body = await request.json();
    const { staffId, action, newEmail, newPassword, currentPassword } = body;

    if (!staffId || !action) {
      return NextResponse.json({ error: "Campos obrigatórios em falta." }, { status: 400 });
    }

    // Buscar o utilizador alvo
    const { data: targetUser, error: fetchError } = await supabaseAdmin
      .from('staff')
      .select('id, propertyId, email, fullName, role')
      .eq('id', staffId)
      .single();

    if (fetchError || !targetUser) {
      return NextResponse.json({ error: "Utilizador não encontrado." }, { status: 404 });
    }

    // Admin e HR só podem alterar staff da sua própria property
    if ((auth.staff.role === 'admin' || auth.staff.role === 'hr') && targetUser.propertyId !== auth.staff.propertyId) {
      return NextResponse.json({ error: "Sem permissão para alterar este utilizador." }, { status: 403 });
    }

    // Ninguém pode alterar um super_admin (a não ser ele próprio ou outro super_admin)
    if (targetUser.role === 'super_admin' && auth.staff.role !== 'super_admin' && auth.staff.id !== staffId) {
      return NextResponse.json({ error: "Não tem permissão para alterar um Super Admin." }, { status: 403 });
    }

    // HR não pode alterar senha de admin ou super_admin
    if (auth.staff.role === 'hr' && (targetUser.role === 'admin' || targetUser.role === 'super_admin') && auth.staff.id !== staffId) {
      return NextResponse.json({ error: "RH não tem permissão para alterar Admin ou Super Admin." }, { status: 403 });
    }

    if (action === 'changeEmail') {
      if (!newEmail) {
        return NextResponse.json({ error: "Novo e-mail é obrigatório." }, { status: 400 });
      }

      const { error: emailError } = await supabaseAdmin.auth.admin.updateUserById(staffId, {
        email: newEmail,
        email_confirm: false, // força envio de confirmação para o email anterior
      });

      if (emailError) throw emailError;

      await supabaseAdmin.from('audit_logs').insert({
        id: crypto.randomUUID(),
        propertyId: targetUser.propertyId || 'SYSTEM',
        userId: auth.staff.id,
        userName: auth.staff.fullName,
        action: 'USER_EMAIL_CHANGE',
        entity: 'USER',
        entityId: staffId,
        newData: { newEmail },
        timestamp: new Date().toISOString(),
        details: `E-mail de ${targetUser.fullName} alterado para ${newEmail}. Confirmação enviada.`,
      });

      return NextResponse.json({ success: true, message: 'E-mail de confirmação enviado para o endereço anterior.' });
    }

    if (action === 'changePassword') {
      if (!newPassword) {
        return NextResponse.json({ error: "Nova senha é obrigatória." }, { status: 400 });
      }

      // Se o próprio utilizador está a alterar a senha, verificar a senha atual
      if (auth.staff.id === staffId) {
        if (!currentPassword) {
          return NextResponse.json({ error: "Senha atual é obrigatória." }, { status: 400 });
        }

        // Verificar senha atual via signInWithPassword
        const { error: signInError } = await supabaseAdmin.auth.signInWithPassword({
          email: targetUser.email,
          password: currentPassword,
        });

        if (signInError) {
          return NextResponse.json({ error: "Senha atual incorreta." }, { status: 400 });
        }
      }

      const { error: pwError } = await supabaseAdmin.auth.admin.updateUserById(staffId, {
        password: newPassword,
      });

      if (pwError) throw pwError;

      await supabaseAdmin.from('audit_logs').insert({
        id: crypto.randomUUID(),
        propertyId: targetUser.propertyId || 'SYSTEM',
        userId: auth.staff.id,
        userName: auth.staff.fullName,
        action: 'USER_PASSWORD_CHANGE',
        entity: 'USER',
        entityId: staffId,
        timestamp: new Date().toISOString(),
        details: `Senha de ${targetUser.fullName} alterada.`,
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Ação desconhecida." }, { status: 400 });

  } catch (error: any) {
    console.error("[Aura API Error] PATCH staff:", error);
    return NextResponse.json({ error: error.message || "Erro interno." }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/staff?staffId=...
 * Remove um utilizador do Supabase Auth e da tabela staff.
 * Requer role: super_admin ou admin.
 * Admin não pode excluir super_admin nem staff de outra property.
 */
export async function DELETE(request: Request) {
  const auth = await requireAuth(['super_admin', 'admin', 'hr']);
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(request.url);
  const staffId = searchParams.get('staffId');

  if (!staffId) {
    return NextResponse.json({ error: "staffId é obrigatório." }, { status: 400 });
  }

  // Não pode excluir a si próprio
  if (auth.staff.id === staffId) {
    return NextResponse.json({ error: "Não pode excluir a sua própria conta." }, { status: 400 });
  }

  try {
    const { data: targetUser, error: fetchError } = await supabaseAdmin
      .from('staff')
      .select('id, propertyId, fullName, email, role')
      .eq('id', staffId)
      .single();

    if (fetchError || !targetUser) {
      return NextResponse.json({ error: "Utilizador não encontrado." }, { status: 404 });
    }

    // Admin e HR só podem excluir staff da sua property
    if ((auth.staff.role === 'admin' || auth.staff.role === 'hr') && targetUser.propertyId !== auth.staff.propertyId) {
      return NextResponse.json({ error: "Sem permissão para excluir este utilizador." }, { status: 403 });
    }

    // Admin não pode excluir super_admin
    if (targetUser.role === 'super_admin' && auth.staff.role !== 'super_admin') {
      return NextResponse.json({ error: "Apenas um Super Admin pode excluir outro Super Admin." }, { status: 403 });
    }

    // HR não pode excluir admin ou super_admin
    if (auth.staff.role === 'hr' && (targetUser.role === 'admin' || targetUser.role === 'super_admin')) {
      return NextResponse.json({ error: "RH não tem permissão para excluir Admin ou Super Admin." }, { status: 403 });
    }

    // Remover da tabela staff primeiro
    await supabaseAdmin.from('staff').delete().eq('id', staffId);

    // Remover do Supabase Auth
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(staffId);
    if (authDeleteError) throw authDeleteError;

    await supabaseAdmin.from('audit_logs').insert({
      id: crypto.randomUUID(),
      propertyId: targetUser.propertyId || 'SYSTEM',
      userId: auth.staff.id,
      userName: auth.staff.fullName,
      action: 'USER_DELETE',
      entity: 'USER',
      entityId: staffId,
      timestamp: new Date().toISOString(),
      details: `Utilizador ${targetUser.fullName} (${targetUser.email}) excluído.`,
    });

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error("[Aura API Error] DELETE staff:", error);
    return NextResponse.json({ error: error.message || "Erro ao excluir utilizador." }, { status: 500 });
  }
}

/**
 * PUT /api/admin/staff
 * Atualiza perfil (fullName, phone, birthDate, bio, profilePictureUrl, active, role).
 * Regras de role:
 *   - Qualquer staff autenticado pode editar o próprio perfil (sem alterar role).
 *   - admin/super_admin podem editar outros da mesma property.
 *   - Apenas super_admin pode atribuir/remover role super_admin.
 *   - Ninguém pode alterar o próprio role.
 */
export async function PUT(request: Request) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const body = await request.json();
    const { staffId, updates } = body as { staffId: string; updates: Record<string, unknown> };

    if (!staffId || !updates || typeof updates !== 'object') {
      return NextResponse.json({ error: "Campos obrigatórios em falta." }, { status: 400 });
    }

    // Buscar o alvo
    const { data: targetUser, error: fetchError } = await supabaseAdmin
      .from('staff')
      .select('id, propertyId, fullName, role')
      .eq('id', staffId)
      .single();

    if (fetchError || !targetUser) {
      return NextResponse.json({ error: "Utilizador não encontrado." }, { status: 404 });
    }

    const isSelf = auth.staff.id === staffId;
    const isAdmin = auth.staff.role === 'admin' || auth.staff.role === 'super_admin' || auth.staff.role === 'hr';
    const isSuperAdmin = auth.staff.role === 'super_admin';
    const sameProperty = auth.staff.propertyId === targetUser.propertyId;

    // Preferências de UI são sempre permitidas pelo próprio utilizador (bypass de permissões)
    const UI_PREFS = ['uiTheme', 'sidebarDefaultCollapsed'] as const;
    const isSelfPreferenceOnly = isSelf && Object.keys(updates).every(k => (UI_PREFS as readonly string[]).includes(k));
    if (isSelfPreferenceOnly) {
      const safePrefs: Record<string, unknown> = {};
      for (const key of UI_PREFS) {
        if (key in updates) safePrefs[key] = updates[key];
      }
      const { error: prefError } = await supabaseAdmin.from('staff').update(safePrefs).eq('id', staffId);
      if (prefError) throw prefError;
      return NextResponse.json({ success: true });
    }

    // Apenas pode editar a si próprio, ou ser super_admin, ou (admin/hr da mesma property)
    if (!isSelf && !isSuperAdmin && !(isAdmin && sameProperty)) {
      return NextResponse.json({ error: "Sem permissão para editar este utilizador." }, { status: 403 });
    }

    // HR não pode editar admin ou super_admin
    if (auth.staff.role === 'hr' && !isSelf && (targetUser.role === 'admin' || targetUser.role === 'super_admin')) {
      return NextResponse.json({ error: "RH não tem permissão para editar Admin ou Super Admin." }, { status: 403 });
    }

    // Ninguém pode alterar o próprio role
    if (isSelf && 'role' in updates) {
      return NextResponse.json({ error: "Não pode alterar o seu próprio cargo." }, { status: 403 });
    }

    // Apenas super_admin pode atribuir/remover super_admin
    if ('role' in updates) {
      const newRole = updates['role'] as string;
      if (newRole === 'super_admin' && !isSuperAdmin) {
        return NextResponse.json({ error: "Apenas um Super Admin pode promover outro Super Admin." }, { status: 403 });
      }
      if (targetUser.role === 'super_admin' && !isSuperAdmin) {
        return NextResponse.json({ error: "Apenas um Super Admin pode alterar o cargo de outro Super Admin." }, { status: 403 });
      }
      // admin não pode promover além de si (não pode criar admin ou super_admin)
      if (auth.staff.role === 'admin' && (newRole === 'admin' || newRole === 'super_admin')) {
        return NextResponse.json({ error: "Admins não podem atribuir cargos de Admin ou Super Admin." }, { status: 403 });
      }
    }

    // Campos permitidos — role só chega aqui se passou nas guards acima
    const allowedFields = ['fullName', 'phone', 'birthDate', 'hireDate', 'bio', 'profilePictureUrl', 'active', 'role', 'uiTheme', 'sidebarDefaultCollapsed'];
    const safeUpdates: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in updates) safeUpdates[key] = updates[key];
    }

    if (Object.keys(safeUpdates).length === 0) {
      return NextResponse.json({ error: "Nenhum campo válido para atualizar." }, { status: 400 });
    }

    const { error: updateError } = await supabaseAdmin
      .from('staff')
      .update(safeUpdates)
      .eq('id', staffId);

    if (updateError) throw updateError;

    await supabaseAdmin.from('audit_logs').insert({
      id: crypto.randomUUID(),
      propertyId: targetUser.propertyId || 'SYSTEM',
      userId: auth.staff.id,
      userName: auth.staff.fullName,
      action: 'USER_UPDATE',
      entity: 'USER',
      entityId: staffId,
      newData: safeUpdates,
      timestamp: new Date().toISOString(),
      details: `Perfil de ${targetUser.fullName} atualizado.`,
    });

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error("[Aura API Error] PUT staff:", error);
    return NextResponse.json({ error: error.message || "Erro interno." }, { status: 500 });
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
  const staffId = searchParams.get('staffId');

  try {
    // Single staff lookup by ID (for profile page)
    if (staffId) {
      const { data: target } = await supabaseAdmin.from('staff').select('*').eq('id', staffId).single();
      if (!target) return NextResponse.json({ error: 'Staff não encontrado.' }, { status: 404 });
      // Only allow same-property access (super_admin can see all)
      if (auth.staff.role !== 'super_admin' && target.propertyId !== auth.staff.propertyId) {
        return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });
      }
      return NextResponse.json({ staff: target });
    }

    let query = supabaseAdmin.from('staff').select('*');

    // Super admin pode listar qualquer property; outros só a própria
    if (auth.staff.role === 'super_admin') {
      if (requestedPropertyId) query = query.eq('propertyId', requestedPropertyId);
    } else {
      query = query.eq('propertyId', auth.staff.propertyId);
    }
    // HR não vê super_admin nem admin na listagem
    if (auth.staff.role === 'hr') {
      query = query.not('role', 'in', '("super_admin","admin")');
    }

    const { data: staffList } = await query;
    return NextResponse.json(staffList || []);
  } catch (error) {
    return NextResponse.json({ error: "Erro ao listar staff." }, { status: 500 });
  }
}
