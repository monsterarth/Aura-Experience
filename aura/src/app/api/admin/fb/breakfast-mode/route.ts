// src/app/api/admin/fb/breakfast-mode/route.ts
//
// Modalidade do café DO DIA (fbSettings.breakfast.dailyMode) — decisão operacional
// da recepção, não configuração de sistema.
//
// Por que uma rota própria em vez de liberar `fbSettings` para o cargo `reception`
// em /api/admin/properties/settings: aquela allowlist é por CHAVE de topo, e
// `fbSettings` carrega o cardápio, horários, modalidade contratada etc. Dar a chave
// inteira à recepção abriria tudo isso junto. Aqui o corpo do request só tem `mode`
// e o servidor monta o patch — a recepção não consegue tocar em mais nada.
import { NextRequest, NextResponse } from "next/server";
import { requirePropertyAccess, isAuthError } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { mergePropertySettings } from "@/lib/property-settings";
import { AuditService } from "@/services/audit-service";
import { FBSettings, UserRole } from "@/types/aura";

const ROLES: UserRole[] = ["super_admin", "admin", "manager", "kitchen", "reception"];

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const propertyId: string | undefined = body?.propertyId;
  const mode = body?.mode;

  if (mode !== "delivery" && mode !== "buffet") {
    return NextResponse.json({ error: "mode deve ser 'delivery' ou 'buffet'." }, { status: 400 });
  }

  const auth = await requirePropertyAccess(propertyId, ROLES);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

  try {
    // Merge de settings é RASO: para trocar um campo aninhado é preciso remontar
    // o `fbSettings` inteiro — por isso a leitura acontece aqui, no servidor.
    const { data: prop, error: readError } = await supabaseAdmin
      .from("properties").select("settings").eq("id", propertyId!).single();
    if (readError) throw new Error(readError.message);

    const current = ((prop?.settings as any)?.fbSettings ?? {}) as FBSettings;
    const fbSettings: FBSettings = {
      ...current,
      breakfast: { ...current.breakfast, dailyMode: mode } as FBSettings["breakfast"],
    };

    await mergePropertySettings(propertyId!, { fbSettings });

    await AuditService.log({
      propertyId: propertyId!, userId: auth.staff.id, userName: auth.staff.fullName,
      action: "UPDATE", entity: "PROPERTY", entityId: propertyId!,
      details: `Modalidade do café do dia alterada para ${mode === "delivery" ? "Cesta Delivery" : "Buffet Salão"}.`,
    });

    // Propriedade fresca para o cliente alimentar o PropertyContext — sem isso a tela
    // volta ao valor velho no próximo render que lê `property.settings`.
    const { data: property } = await supabaseAdmin
      .from("properties").select("*").eq("id", propertyId!).single();
    return NextResponse.json({ ok: true, property });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
