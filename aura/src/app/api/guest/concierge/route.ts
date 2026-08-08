// src/app/api/guest/concierge/route.ts
//
// Catálogo e pedidos do concierge para o PORTAL DO HÓSPEDE (superfície anônima).
//
// Existia um caminho pelo navegador (ConciergeService direto), mas a RLS de
// concierge_items só libera `authenticated` — e o hóspede é anon. Resultado: o
// catálogo chegava VAZIO, sem erro nenhum, e a tela mostrava "nenhum item".
// Aqui a leitura roda com service-role e a posse é validada pelo trio
// stayId + accessCode + propertyId, mesma regra de /api/guest/today.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { ConciergeService } from "@/services/concierge-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const stayId = searchParams.get("stayId");
  const propertyId = searchParams.get("propertyId");
  const accessCode = searchParams.get("accessCode");

  if (!stayId || !propertyId || !accessCode) {
    return NextResponse.json({ error: "Missing required params" }, { status: 400 });
  }

  // Posse: o código de acesso é a senha do hóspede. Sem ele, nada sai.
  const { data: stay } = await supabaseAdmin
    .from("stays").select("id")
    .eq("id", stayId).eq("accessCode", accessCode).eq("propertyId", propertyId)
    .maybeSingle();
  if (!stay) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  try {
    const [items, requests] = await Promise.all([
      ConciergeService.getConciergeItemsForGuest(propertyId),
      ConciergeService.getConciergeRequestsForStay(propertyId, stayId),
    ]);
    return NextResponse.json({ items, requests });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
