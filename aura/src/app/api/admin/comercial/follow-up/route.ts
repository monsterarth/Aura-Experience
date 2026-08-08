// Hub Comercial — registrar contato com o lead: renova follow-up/validade dos
// DOIS funis (delega ao service certo por entityType).
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError, assertPropertyAccess } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { CrmService } from "@/services/crm-service";
import { WeddingService } from "@/services/wedding-service";
import { AuditService } from "@/services/audit-service";

export const dynamic = "force-dynamic";

const ROLES = ["super_admin", "admin", "manager", "reception"] as const;

export async function POST(req: NextRequest) {
  const auth = await requireAuth([...ROLES]);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

  const body = await req.json().catch(() => null);
  const propertyId: string | undefined = body?.propertyId || auth.staff.propertyId;
  const denied = assertPropertyAccess(auth, propertyId);
  if (denied) return denied;
  if (!propertyId) return NextResponse.json({ error: "propertyId ausente" }, { status: 400 });

  const { entityType, entityId } = body ?? {};
  const note = typeof body?.note === "string" ? body.note : undefined;
  if ((entityType !== "quote" && entityType !== "wedding") || !entityId) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  try {
    const actor = { id: auth.staff.id, name: auth.staff.fullName };
    const dates = entityType === "quote"
      ? await CrmService.registerQuoteFollowUp(propertyId, String(entityId), note, actor)
      : await WeddingService.registerFollowUp(propertyId, String(entityId), note);

    if (entityType === "wedding") {
      // O registerFollowUp de casamento loga a interação; audit segue o padrão
      // da rota antiga de follow-up.
      await AuditService.log({
        propertyId, userId: actor.id, userName: actor.name,
        action: "WEDDING_FOLLOW_UP", entity: "WEDDING", entityId: String(entityId),
        details: `Follow-up via hub Comercial${note?.trim() ? `: ${note.trim()}` : ""}. Próximo ${dates.followUpAt}, validade ${dates.expiresAt}.`,
      });
    }

    return NextResponse.json({ ok: true, ...dates });
  } catch (e) {
    console.error("Erro ao registrar follow-up:", e);
    const msg = e instanceof Error ? e.message : "Falha ao registrar o contato.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
