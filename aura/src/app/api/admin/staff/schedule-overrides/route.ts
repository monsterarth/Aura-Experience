// src/app/api/admin/staff/schedule-overrides/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAuth, isAuthError } from "@/lib/api-auth";

/**
 * GET /api/admin/staff/schedule-overrides
 * - ?staffId=&from=YYYY-MM-DD&to=YYYY-MM-DD → overrides de um staff no período
 * - ?propertyId=&from=&to= → todos os overrides da property no período
 */
export async function GET(request: Request) {
  const auth = await requireAuth(['super_admin', 'admin', 'hr', 'reception', 'governance', 'kitchen', 'maintenance', 'marketing']);
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(request.url);
  const staffId = searchParams.get('staffId');
  const propertyId = searchParams.get('propertyId');
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  if (!from || !to) {
    return NextResponse.json({ error: "Parâmetros from e to são obrigatórios." }, { status: 400 });
  }

  try {
    let query = supabaseAdmin
      .from('staff_schedule_overrides')
      .select('*')
      .gte('date', from)
      .lte('date', to)
      .order('date');

    if (staffId) {
      query = query.eq('staffId', staffId);
    } else if (propertyId) {
      if (auth.staff.role !== 'super_admin' && auth.staff.propertyId !== propertyId) {
        return NextResponse.json({ error: "Sem permissão para esta propriedade." }, { status: 403 });
      }
      query = query.eq('propertyId', propertyId);
    } else {
      return NextResponse.json({ error: "Parâmetro staffId ou propertyId é obrigatório." }, { status: 400 });
    }

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json(data || []);
  } catch (error: any) {
    console.error("[Aura API Error] GET schedule-overrides:", error);
    return NextResponse.json({ error: error.message || "Erro interno." }, { status: 500 });
  }
}

/**
 * POST /api/admin/staff/schedule-overrides
 * Cria ou atualiza (upsert) um override de data específica.
 * Body: { staffId, propertyId, date, startTime?, endTime?, reason? }
 * startTime/endTime null = folga
 */
export async function POST(request: Request) {
  const auth = await requireAuth(['super_admin', 'admin', 'hr']);
  if (isAuthError(auth)) return auth;

  try {
    const body = await request.json();
    const { staffId, propertyId, date, startTime, endTime, reason } = body;

    if (!staffId || !propertyId || !date) {
      return NextResponse.json({ error: "Campos obrigatórios em falta." }, { status: 400 });
    }

    if (auth.staff.role !== 'super_admin' && auth.staff.propertyId !== propertyId) {
      return NextResponse.json({ error: "Sem permissão para esta propriedade." }, { status: 403 });
    }

    const { error } = await supabaseAdmin
      .from('staff_schedule_overrides')
      .upsert(
        {
          staffId,
          propertyId,
          date,
          startTime: startTime || null,
          endTime: endTime || null,
          reason: reason || null,
          createdBy: auth.staff.id,
        },
        { onConflict: 'staffId,date' }
      );

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Aura API Error] POST schedule-overrides:", error);
    return NextResponse.json({ error: error.message || "Erro interno." }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/staff/schedule-overrides?id=...
 * Remove um override de data específica.
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
    const { data: row } = await supabaseAdmin
      .from('staff_schedule_overrides')
      .select('propertyId')
      .eq('id', id)
      .single();

    if (row && auth.staff.role !== 'super_admin' && auth.staff.propertyId !== row.propertyId) {
      return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    }

    const { error } = await supabaseAdmin.from('staff_schedule_overrides').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Aura API Error] DELETE schedule-overrides:", error);
    return NextResponse.json({ error: error.message || "Erro interno." }, { status: 500 });
  }
}
