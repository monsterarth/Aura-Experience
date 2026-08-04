// Tarifário — bundle inicial da página: tabelas, regras, config, categorias de
// cabana e casamentos vinculáveis.
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { RateService } from "@/services/rate-service";

export const dynamic = "force-dynamic";

const READ_ROLES = ["super_admin", "admin", "manager", "reception"] as const;

export async function GET(req: NextRequest) {
  const auth = await requireAuth([...READ_ROLES]);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

  const requested = new URL(req.url).searchParams.get("propertyId");
  const propertyId = requested || auth.staff.propertyId;
  if (!propertyId) return NextResponse.json({ error: "propertyId ausente" }, { status: 400 });

  try {
    const bundle = await RateService.getBundle(propertyId);
    return NextResponse.json(bundle);
  } catch (e) {
    console.error("Erro ao carregar tarifário:", e);
    return NextResponse.json({ error: "Falha ao carregar o tarifário." }, { status: 500 });
  }
}
