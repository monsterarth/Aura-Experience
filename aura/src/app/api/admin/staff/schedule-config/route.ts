import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAuth, isAuthError } from "@/lib/api-auth";
import { ScheduleType, ScheduleConfig } from "@/types/aura";

/**
 * PUT /api/admin/staff/schedule-config
 * Body: { staffId, scheduleType, scheduleConfig }
 * Salva o tipo de escala e configuração (horários, data de referência) no registro do staff.
 */
export async function PUT(request: Request) {
  const auth = await requireAuth(['super_admin', 'admin', 'hr']);
  if (isAuthError(auth)) return auth;

  try {
    const body = await request.json();
    const { staffId, scheduleType, scheduleConfig } = body as {
      staffId: string;
      scheduleType: ScheduleType;
      scheduleConfig: ScheduleConfig;
    };

    if (!staffId || !scheduleType) {
      return NextResponse.json({ error: "staffId e scheduleType são obrigatórios." }, { status: 400 });
    }

    const validTypes: ScheduleType[] = ['5x2', '12x36', '6x1', 'custom'];
    if (!validTypes.includes(scheduleType)) {
      return NextResponse.json({ error: "scheduleType inválido." }, { status: 400 });
    }

    // Verifica que o staff pertence à property do requester
    if (auth.staff.role !== 'super_admin') {
      const { data: staffRow } = await supabaseAdmin
        .from('staff')
        .select('propertyId')
        .eq('id', staffId)
        .single();

      if (!staffRow || staffRow.propertyId !== auth.staff.propertyId) {
        return NextResponse.json({ error: "Sem permissão para este funcionário." }, { status: 403 });
      }
    }

    const { error } = await supabaseAdmin
      .from('staff')
      .update({ scheduleType, scheduleConfig })
      .eq('id', staffId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Aura API Error] PUT staff/schedule-config:", error);
    return NextResponse.json({ error: error.message || "Erro interno." }, { status: 500 });
  }
}
