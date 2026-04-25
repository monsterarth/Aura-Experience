import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAuth, isAuthError } from "@/lib/api-auth";

/**
 * GET /api/admin/staff/schedule-checkpoints
 * - ?staffId=               → todos os checkpoints do staff
 * - ?propertyId=            → todos os checkpoints da property
 * - ?staffId=&from=&to=     → checkpoints no intervalo de datas
 */
export async function GET(request: Request) {
  const auth = await requireAuth(['super_admin', 'admin', 'hr']);
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(request.url);
  const staffId = searchParams.get('staffId');
  const propertyId = searchParams.get('propertyId');
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  try {
    if (staffId) {
      let query = supabaseAdmin
        .from('staff_schedule_checkpoints')
        .select('*')
        .eq('staffId', staffId)
        .order('effectiveDate', { ascending: false });

      if (from) query = query.gte('effectiveDate', from);
      if (to) query = query.lte('effectiveDate', to);

      const { data, error } = await query;
      if (error) throw error;
      return NextResponse.json(data || []);
    }

    if (propertyId) {
      if (auth.staff.role !== 'super_admin' && auth.staff.propertyId !== propertyId) {
        return NextResponse.json({ error: "Sem permissão para esta propriedade." }, { status: 403 });
      }

      const { data, error } = await supabaseAdmin
        .from('staff_schedule_checkpoints')
        .select('*')
        .eq('propertyId', propertyId)
        .order('effectiveDate', { ascending: false });

      if (error) throw error;
      return NextResponse.json(data || []);
    }

    return NextResponse.json({ error: "staffId ou propertyId é obrigatório." }, { status: 400 });
  } catch (error: any) {
    console.error("[Aura API Error] GET schedule-checkpoints:", error);
    return NextResponse.json({ error: error.message || "Erro interno." }, { status: 500 });
  }
}

/**
 * POST /api/admin/staff/schedule-checkpoints
 * Body: { staffId, propertyId, effectiveDate, referenceDate, note? }
 * Upsert por (staffId, effectiveDate).
 */
export async function POST(request: Request) {
  const auth = await requireAuth(['super_admin', 'admin', 'hr']);
  if (isAuthError(auth)) return auth;

  try {
    const body = await request.json();
    const { staffId, propertyId, effectiveDate, referenceDate, note } = body;

    if (!staffId || !propertyId || !effectiveDate || !referenceDate) {
      return NextResponse.json(
        { error: "staffId, propertyId, effectiveDate e referenceDate são obrigatórios." },
        { status: 400 }
      );
    }

    if (auth.staff.role !== 'super_admin' && auth.staff.propertyId !== propertyId) {
      return NextResponse.json({ error: "Sem permissão para esta propriedade." }, { status: 403 });
    }

    const { error } = await supabaseAdmin
      .from('staff_schedule_checkpoints')
      .upsert(
        {
          staffId,
          propertyId,
          effectiveDate,
          referenceDate,
          note: note || null,
          createdBy: auth.staff.id,
        },
        { onConflict: 'staffId,effectiveDate' }
      );

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Aura API Error] POST schedule-checkpoints:", error);
    return NextResponse.json({ error: error.message || "Erro interno." }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/staff/schedule-checkpoints?id=...
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
      .from('staff_schedule_checkpoints')
      .select('propertyId')
      .eq('id', id)
      .single();

    if (row && auth.staff.role !== 'super_admin' && auth.staff.propertyId !== row.propertyId) {
      return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    }

    const { error } = await supabaseAdmin
      .from('staff_schedule_checkpoints')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Aura API Error] DELETE schedule-checkpoints:", error);
    return NextResponse.json({ error: error.message || "Erro interno." }, { status: 500 });
  }
}
