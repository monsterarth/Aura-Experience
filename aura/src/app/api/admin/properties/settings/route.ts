// src/app/api/admin/properties/settings/route.ts
//
// Gargalo único de escrita da configuração da propriedade.
//
// Antes: cinco telas/serviços escreviam `properties.settings` direto pelo navegador,
// cada uma reescrevendo o objeto inteiro (uma sobrescrevia a outra) e uma delas
// engolindo o erro e ainda assim dizendo "salvo com sucesso".
//
// Aqui: merge no banco (RPC), allowlist de chaves por cargo, posse da propriedade
// verificada no servidor, auditoria, e erro que sobe como não-2xx.
import { NextRequest, NextResponse } from "next/server";
import { requirePropertyAccess, isAuthError } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { mergePropertySettings, validateSettingsPatch, sanitizePropertyForClient } from "@/lib/property-settings";
import { AuditService } from "@/services/audit-service";
import { UserRole } from "@/types/aura";

const ROLES: UserRole[] = ["super_admin", "admin", "manager", "kitchen"];

/** Colunas reais de `properties` (não são JSONB, não precisam de merge). */
const COLUMN_ROLES: Record<string, UserRole[]> = {
  name: ["super_admin", "admin"],
  logoUrl: ["super_admin", "admin"],
  theme: ["super_admin", "admin"],
};

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const propertyId: string | undefined = body?.propertyId;
  const auth = await requirePropertyAccess(propertyId, ROLES);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

  const patch = (body?.patch ?? {}) as Record<string, unknown>;
  const columns = (body?.columns ?? {}) as Record<string, unknown>;
  const roles = [auth.staff.role, ...auth.staff.secondaryRoles];

  const { allowed, rejected } = validateSettingsPatch(patch, auth.staff.role, auth.staff.secondaryRoles);
  if (rejected.unknown.length) {
    return NextResponse.json(
      { error: `Chave de configuração desconhecida: ${rejected.unknown.join(", ")}.` },
      { status: 400 },
    );
  }
  if (rejected.forbidden.length) {
    return NextResponse.json(
      { error: `Seu cargo não pode alterar: ${rejected.forbidden.join(", ")}.` },
      { status: 403 },
    );
  }

  const columnPatch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(columns)) {
    const permitted = COLUMN_ROLES[k];
    if (!permitted) return NextResponse.json({ error: `Campo desconhecido: ${k}.` }, { status: 400 });
    if (!roles.some((r) => permitted.includes(r))) {
      return NextResponse.json({ error: `Seu cargo não pode alterar: ${k}.` }, { status: 403 });
    }
    columnPatch[k] = v;
  }

  try {
    if (Object.keys(columnPatch).length) {
      const { error } = await supabaseAdmin.from("properties").update(columnPatch).eq("id", propertyId!);
      if (error) throw new Error(error.message);
    }
    await mergePropertySettings(propertyId!, allowed);

    const touched = [...Object.keys(allowed), ...Object.keys(columnPatch)];
    if (touched.length) {
      await AuditService.log({
        propertyId: propertyId!, userId: auth.staff.id, userName: auth.staff.fullName,
        action: "UPDATE", entity: "PROPERTY", entityId: propertyId!,
        details: `Configurações alteradas: ${touched.join(", ")}.`,
      });
    }

    // Devolve a propriedade fresca para o cliente alimentar o PropertyContext —
    // sem isso a sidebar e o tema ficam mostrando o valor velho até dar F5.
    const { data: property } = await supabaseAdmin
      .from("properties").select("*").eq("id", propertyId!).single();
    return NextResponse.json({ ok: true, property: sanitizePropertyForClient(property) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
