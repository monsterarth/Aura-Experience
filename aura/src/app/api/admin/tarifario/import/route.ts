// Tarifário — importação do backup JSON do SIT (substitui tabelas e regras da
// propriedade; casamentos e eventos do backup são ignorados de propósito).
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { RateService } from "@/services/rate-service";

export const dynamic = "force-dynamic";

const IMPORT_ROLES = ["super_admin", "admin", "manager"] as const;

export async function POST(req: NextRequest) {
  const auth = await requireAuth([...IMPORT_ROLES]);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

  const body = await req.json().catch(() => null);
  const propertyId: string | undefined = body?.propertyId || auth.staff.propertyId;
  const backup = body?.backup;

  if (!propertyId || !backup || typeof backup !== "object") {
    return NextResponse.json({ error: "Backup inválido" }, { status: 400 });
  }
  if (!Array.isArray(backup.tabelas) && !Array.isArray(backup.periodos)) {
    return NextResponse.json(
      { error: "O arquivo não parece ser um backup do SIT (sem 'tabelas'/'periodos')." },
      { status: 400 }
    );
  }

  try {
    const result = await RateService.importSitBackup(
      propertyId,
      backup,
      auth.staff.id,
      auth.staff.fullName
    );
    return NextResponse.json(result);
  } catch (e) {
    console.error("Erro ao importar backup do SIT:", e);
    return NextResponse.json({ error: "Falha ao importar o backup." }, { status: 500 });
  }
}
