// src/app/api/admin/hsystem/route.ts
//
// Status + configuração do módulo Hsystem.
//   GET → config pública, máscaras das credenciais (nunca o valor), logs de sync,
//         reservas espelhadas e categorias para a UI de mapeamento.
//   PUT → { propertyId, settings?: { hasHsystem?, hsystemConfig? }, secrets?: { hunitUserName?, hunitPassword? } }
//         Settings passam pela allowlist por cargo (hasHsystem = só super_admin);
//         segredos seguem o contrato write-only do cofre (ausente=mantém, ""=limpa).
import { NextRequest, NextResponse } from "next/server";
import { requirePropertyAccess, isAuthError } from "@/lib/api-auth";
import { validateSettingsPatch, mergePropertySettings } from "@/lib/property-settings";
import { PropertySecretsService } from "@/services/property-secrets-service";
import { HsystemService } from "@/services/hsystem-service";
import { AuditService } from "@/services/audit-service";

const READ_ROLES = ["super_admin", "admin", "manager"] as const;
const WRITE_ROLES = ["super_admin", "admin"] as const;

export async function GET(request: NextRequest) {
  const propertyId = new URL(request.url).searchParams.get("propertyId");
  const auth = await requirePropertyAccess(propertyId, [...READ_ROLES]);
  if (isAuthError(auth)) return auth;

  try {
    const status = await HsystemService.getStatus(propertyId!);
    return NextResponse.json(status);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const propertyId: string | undefined = body?.propertyId;
  const auth = await requirePropertyAccess(propertyId, [...WRITE_ROLES]);
  if (isAuthError(auth)) return auth;

  try {
    const touched: string[] = [];

    if (body.settings && typeof body.settings === "object") {
      const { allowed, rejected } = validateSettingsPatch(
        body.settings,
        auth.staff.role,
        auth.staff.secondaryRoles,
      );
      if (rejected.forbidden.length > 0) {
        return NextResponse.json(
          { error: `Sem permissão para alterar: ${rejected.forbidden.join(", ")}.` },
          { status: 403 },
        );
      }
      if (rejected.unknown.length > 0) {
        return NextResponse.json(
          { error: `Chaves não permitidas: ${rejected.unknown.join(", ")}.` },
          { status: 400 },
        );
      }
      if (Object.keys(allowed).length > 0) {
        await mergePropertySettings(propertyId!, allowed);
        touched.push(...Object.keys(allowed));
      }
    }

    if (body.secrets && typeof body.secrets === "object") {
      await PropertySecretsService.set(propertyId!, {
        hunitUserName: body.secrets.hunitUserName,
        hunitPassword: body.secrets.hunitPassword,
      });
      touched.push(...Object.keys(body.secrets).map((k) => `${k} (segredo)`));
    }

    await AuditService.log({
      propertyId: propertyId!,
      userId: auth.staff.id,
      userName: auth.staff.fullName,
      action: "UPDATE",
      entity: "PROPERTY",
      entityId: propertyId!,
      details: `Hsystem atualizado: ${touched.join(", ") || "(nada)"}.`,
    });

    const status = await HsystemService.getStatus(propertyId!);
    return NextResponse.json({ ok: true, ...status });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
