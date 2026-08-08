// src/app/api/guest/breakfast-salon/route.ts
//
// Estado do salão do café para o portal: a sessão de hoje (aberto/fechado) e,
// quando o hóspede se identifica, a presença dele.
//
// A sessão é informação de casa (o salão está aberto?) e não expõe hóspede — sai
// só com propertyId. A PRESENÇA é dado da estadia, então só sai com o código de
// acesso conferindo, como nas demais rotas do portal.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const propertyId = searchParams.get("propertyId");
  const stayId = searchParams.get("stayId");
  const accessCode = searchParams.get("accessCode");

  if (!propertyId) return NextResponse.json({ error: "Missing propertyId" }, { status: 400 });

  const today = new Date().toISOString().split("T")[0];

  const { data: session } = await supabaseAdmin
    .from("breakfast_sessions")
    .select("id, propertyId, date, status, openedAt, closedAt")
    .eq("propertyId", propertyId).eq("date", today).maybeSingle();

  let attendance = null;
  if (stayId && accessCode) {
    const { data: stay } = await supabaseAdmin
      .from("stays").select("id")
      .eq("id", stayId).eq("accessCode", accessCode).eq("propertyId", propertyId)
      .maybeSingle();
    if (!stay) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

    const { data } = await supabaseAdmin
      .from("breakfast_attendance").select("*")
      .eq("propertyId", propertyId).eq("stayId", stayId).eq("date", today)
      .maybeSingle();
    attendance = data ?? null;
  }

  return NextResponse.json({ session: session ?? null, attendance });
}
