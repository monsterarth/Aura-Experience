// Hub Comercial — pipeline unificado: os dois funis (orçamentos + casamentos)
// normalizados para CrmLead no service, nunca no client.
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError, assertPropertyAccess } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { CrmService } from "@/services/crm-service";

export const dynamic = "force-dynamic";

// marketing lê o pipeline (KPIs por canal na página de Marketing) — leitura só.
const READ_ROLES = ["super_admin", "admin", "manager", "reception", "marketing"] as const;

export async function GET(req: NextRequest) {
  const auth = await requireAuth([...READ_ROLES]);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

  const params = new URL(req.url).searchParams;
  const propertyId = params.get("propertyId") || auth.staff.propertyId;
  const denied = assertPropertyAccess(auth, propertyId);
  if (denied) return denied;
  if (!propertyId) return NextResponse.json({ error: "propertyId ausente" }, { status: 400 });

  const funnelParam = params.get("funnel");
  const funnel = funnelParam === "quote" || funnelParam === "wedding" ? funnelParam : undefined;
  const id = params.get("id");

  try {
    // ?id= devolve UM lead sem o recorte de 60d — deep-links e alarmes antigos.
    if (id) {
      const lead = await CrmService.getLeadById(propertyId, funnel ?? "quote", id);
      if (!lead) return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 });
      return NextResponse.json({ lead });
    }
    const pipeline = await CrmService.getPipeline(propertyId, funnel);
    return NextResponse.json(pipeline);
  } catch (e) {
    console.error("Erro ao carregar pipeline comercial:", e);
    return NextResponse.json({ error: "Falha ao carregar o pipeline." }, { status: 500 });
  }
}
