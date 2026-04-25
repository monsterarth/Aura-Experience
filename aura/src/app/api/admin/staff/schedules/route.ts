// src/app/api/admin/staff/schedules/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAuth, isAuthError } from "@/lib/api-auth";

/**
 * GET /api/admin/staff/schedules
 * - ?staffId=  → escalas de um staff específico
 * - ?propertyId= → visão completa da property (todos os staff com suas escalas)
 */
export async function GET(request: Request) {
  const auth = await requireAuth(['super_admin', 'admin', 'hr']);
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(request.url);
  const staffId = searchParams.get('staffId');
  const propertyId = searchParams.get('propertyId');

  try {
    if (staffId) {
      const { data, error } = await supabaseAdmin
        .from('staff_schedules')
        .select('*')
        .eq('staffId', staffId)
        .order('dayOfWeek');
      if (error) throw error;
      return NextResponse.json(data || []);
    }

    if (propertyId) {
      // Verifica que o requester tem acesso à property
      if (auth.staff.role !== 'super_admin' && auth.staff.propertyId !== propertyId) {
        return NextResponse.json({ error: "Sem permissão para esta propriedade." }, { status: 403 });
      }

      // Busca todos os staff ativos da property com suas escalas
      const { data: staffList, error: staffError } = await supabaseAdmin
        .from('staff')
        .select('id, fullName, role, active, profilePictureUrl, scheduleType, scheduleConfig')
        .eq('propertyId', propertyId)
        .eq('active', true)
        .order('fullName');
      if (staffError) throw staffError;

      const { data: schedules, error: schedError } = await supabaseAdmin
        .from('staff_schedules')
        .select('*')
        .eq('propertyId', propertyId)
        .eq('active', true);
      if (schedError) throw schedError;

      const result = (staffList || []).map(s => ({
        ...s,
        schedules: (schedules || []).filter(sc => sc.staffId === s.id),
      }));

      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Parâmetro staffId ou propertyId é obrigatório." }, { status: 400 });
  } catch (error: any) {
    console.error("[Aura API Error] GET staff/schedules:", error);
    return NextResponse.json({ error: error.message || "Erro interno." }, { status: 500 });
  }
}

/**
 * POST /api/admin/staff/schedules
 * Cria ou atualiza (upsert) uma escala semanal para um staff.
 * Body: { staffId, propertyId, dayOfWeek, startTime, endTime, active? }
 */
export async function POST(request: Request) {
  const auth = await requireAuth(['super_admin', 'admin', 'hr']);
  if (isAuthError(auth)) return auth;

  try {
    const body = await request.json();
    const { staffId, propertyId, dayOfWeek, startTime, endTime, active = true } = body;

    if (!staffId || !propertyId || dayOfWeek === undefined || !startTime || !endTime) {
      return NextResponse.json({ error: "Campos obrigatórios em falta." }, { status: 400 });
    }

    if (auth.staff.role !== 'super_admin' && auth.staff.propertyId !== propertyId) {
      return NextResponse.json({ error: "Sem permissão para esta propriedade." }, { status: 403 });
    }

    const { error } = await supabaseAdmin
      .from('staff_schedules')
      .upsert(
        { staffId, propertyId, dayOfWeek, startTime, endTime, active, updatedAt: new Date().toISOString() },
        { onConflict: 'staffId,dayOfWeek' }
      );

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Aura API Error] POST staff/schedules:", error);
    return NextResponse.json({ error: error.message || "Erro interno." }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/staff/schedules?id=...
 * Remove uma linha de escala semanal.
 */
export async function DELETE(request: Request) {
  const auth = await requireAuth(['super_admin', 'admin', 'hr']);
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: "id é obrigatório." }, { status: 400 });
  }

  try {
    // Verifica propriedade antes de deletar
    const { data: row } = await supabaseAdmin
      .from('staff_schedules')
      .select('propertyId')
      .eq('id', id)
      .single();

    if (row && auth.staff.role !== 'super_admin' && auth.staff.propertyId !== row.propertyId) {
      return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    }

    const { error } = await supabaseAdmin.from('staff_schedules').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Aura API Error] DELETE staff/schedules:", error);
    return NextResponse.json({ error: error.message || "Erro interno." }, { status: 500 });
  }
}
