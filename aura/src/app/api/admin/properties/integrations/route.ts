// src/app/api/admin/properties/integrations/route.ts
//
// Única porta para as integrações (Evolution/WhatsApp e Chatwoot) de uma propriedade.
//
// Contrato dos SEGREDOS (apiKey/token) — write-only:
//   • GET  nunca devolve o valor, só `has*` + máscara dos 4 últimos dígitos.
//   • PUT  campo AUSENTE = mantém · "" = limpa · valor = substitui.
// Isso é o que permite a UI mostrar "••••1234 (inalterado)" sem nunca ter o segredo
// em memória no navegador.
import { NextRequest, NextResponse } from "next/server";
import { requirePropertyAccess, isAuthError } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { PropertySecretsService } from "@/services/property-secrets-service";
import { mergePropertySettings } from "@/lib/property-settings";
import { AuditService } from "@/services/audit-service";

const ROLES = ["super_admin", "admin"] as const;

/** O teste é interativo: um operador está esperando a resposta na tela. */
const TEST_TIMEOUT_MS = 8000;

/** Campos não secretos que continuam em settings.whatsappConfig (o navegador lê alguns). */
const PUBLIC_FIELDS = [
  "apiUrl", "instanceName", "chatwootUrl", "chatwootAccountId", "chatwootInboxId",
] as const;
type PublicField = (typeof PUBLIC_FIELDS)[number];

function db() {
  if (!supabaseAdmin) throw new Error("Server configuration error");
  return supabaseAdmin;
}

/**
 * O merge do RPC é RASO: mandar `whatsappConfig` substitui o objeto inteiro. Por isso
 * a leitura do atual continua necessária — o que o merge resolve é a corrida no resto
 * de `settings`, que antes era reescrito por completo a cada save.
 */
async function patchWhatsappConfig(propertyId: string, patch: Partial<Record<PublicField, unknown>>) {
  const { data: prop, error: readErr } = await db()
    .from("properties").select("settings").eq("id", propertyId).maybeSingle();
  if (readErr) throw readErr;

  const current = (((prop?.settings ?? {}) as any).whatsappConfig ?? {}) as Record<string, unknown>;
  const next = { ...current };
  for (const f of PUBLIC_FIELDS) if (patch[f] !== undefined) next[f] = patch[f];

  await mergePropertySettings(propertyId, { whatsappConfig: next });
}

export async function GET(request: NextRequest) {
  const propertyId = new URL(request.url).searchParams.get("propertyId");
  const auth = await requirePropertyAccess(propertyId, [...ROLES]);
  if (isAuthError(auth)) return auth;

  try {
    const { data: prop } = await db()
      .from("properties").select("settings").eq("id", propertyId!).maybeSingle();
    const settings = (prop?.settings ?? {}) as Record<string, any>;
    const wc = (settings.whatsappConfig ?? {}) as Record<string, unknown>;

    const config: Record<string, unknown> = {};
    for (const f of PUBLIC_FIELDS) config[f] = wc[f] ?? null;

    return NextResponse.json({
      config,
      whatsappEnabled: settings.whatsappEnabled ?? false,
      whatsappNumber: settings.whatsappNumber ?? null,
      ...(await PropertySecretsService.describe(propertyId!)),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const propertyId: string | undefined = body?.propertyId;
  const auth = await requirePropertyAccess(propertyId, [...ROLES]);
  if (isAuthError(auth)) return auth;

  try {
    if (body.config && typeof body.config === "object") {
      await patchWhatsappConfig(propertyId!, body.config);
    }
    if (body.secrets && typeof body.secrets === "object") {
      await PropertySecretsService.set(propertyId!, {
        evolutionApiKey: body.secrets.evolutionApiKey,
        chatwootApiToken: body.secrets.chatwootApiToken,
      });
    }

    // O log registra QUAIS chaves mudaram, nunca o valor.
    const touched = [
      ...Object.keys(body.config ?? {}),
      ...Object.keys(body.secrets ?? {}).map((k) => `${k} (segredo)`),
    ];
    await AuditService.log({
      propertyId: propertyId!, userId: auth.staff.id, userName: auth.staff.fullName,
      action: "UPDATE", entity: "PROPERTY", entityId: propertyId!,
      details: `Integrações atualizadas: ${touched.join(", ") || "(nada)"}.`,
    });

    return NextResponse.json({ ok: true, ...(await PropertySecretsService.describe(propertyId!)) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/**
 * Teste de credencial — o operador confere sem nunca ver a chave.
 *
 * Só prova que a credencial foi ACEITA. NÃO prova que a instância envia: sessão
 * zumbi da Evolution responde `open` no connectionState e mesmo assim não entrega.
 * Só um envio real prova envio.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const propertyId: string | undefined = body?.propertyId;
  const target: "evolution" | "chatwoot" = body?.target;
  const auth = await requirePropertyAccess(propertyId, [...ROLES]);
  if (isAuthError(auth)) return auth;

  try {
    const { data: prop } = await db()
      .from("properties").select("settings").eq("id", propertyId!).maybeSingle();
    const wc = (((prop?.settings ?? {}) as any).whatsappConfig ?? {}) as Record<string, string>;
    const secrets = await PropertySecretsService.get(propertyId!);

    if (target === "evolution") {
      const apiUrl = (wc.apiUrl || "").replace(/\/+$/, "");
      const instance = wc.instanceName;
      if (!apiUrl || !instance || !secrets.evolutionApiKey) {
        return NextResponse.json({ ok: false, message: "Falta apiUrl, instância ou chave." });
      }
      // Timeout curto: sem ele, uma Evolution travada pendura este fetch até a Vercel
      // matar a função — a trava viraria silêncio em vez de mensagem para o operador.
      const r = await fetch(`${apiUrl}/instance/connectionState/${encodeURIComponent(instance)}`, {
        headers: { apikey: secrets.evolutionApiKey }, cache: "no-store",
        signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
      });
      if (r.status === 401 || r.status === 403) {
        return NextResponse.json({ ok: false, message: "Chave recusada pela Evolution (401/403)." });
      }
      if (!r.ok) return NextResponse.json({ ok: false, message: `Evolution respondeu ${r.status}.` });
      const j = await r.json().catch(() => ({}));
      const state = j?.instance?.state ?? j?.state ?? "desconhecido";
      return NextResponse.json({
        ok: true,
        message: `Credencial aceita. Estado relatado: "${state}" — só um envio real prova que entrega.`,
      });
    }

    if (target === "chatwoot") {
      const base = (wc.chatwootUrl || "").replace(/\/+$/, "");
      if (!base || !wc.chatwootAccountId || !secrets.chatwootApiToken) {
        return NextResponse.json({ ok: false, message: "Falta URL, accountId ou token." });
      }
      const r = await fetch(`${base}/api/v1/accounts/${wc.chatwootAccountId}/inboxes`, {
        headers: { api_access_token: secrets.chatwootApiToken }, cache: "no-store",
        signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
      });
      if (r.status === 401 || r.status === 403) {
        return NextResponse.json({ ok: false, message: "Token recusado pelo Chatwoot (401/403)." });
      }
      if (!r.ok) return NextResponse.json({ ok: false, message: `Chatwoot respondeu ${r.status}.` });
      return NextResponse.json({ ok: true, message: "Token aceito pelo Chatwoot." });
    }

    return NextResponse.json({ error: "target inválido (evolution | chatwoot)." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, message: `Falha ao testar: ${(e as Error).message}` });
  }
}
