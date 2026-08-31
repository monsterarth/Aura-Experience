// src/app/api/admin/whatsapp/session/route.ts
//
// Estado da sessão de WhatsApp e reconexão (QR) sem sair da Aura.
//
// POR QUE ESTA ROTA EXISTE
// ------------------------
// A Evolution é um único processo Node: o mesmo event loop serve o /manager, todas as
// instâncias e os handlers `connection.update` do Baileys. Quando ele enrosca (pressão de
// memória, tempestade de reconexão), os três param juntos — e um processo travado não
// consegue relatar que está travado. Qualquer indicador confiável precisa observar de FORA,
// que é o que esta rota faz.
//
// A regra de ouro do diagnóstico: os indicadores baratos da Evolution só mentem para o lado
// OTIMISTA. `connectionState` e `fetchInstances` respondem "open" com o socket fechado, e o
// cache de contatos responde 200 com a sessão morta. Por isso:
//
//   • TIMEOUT é sinal POSITIVO de trava — se não respondeu em segundos, enroscou. Confiável.
//   • "open" NÃO é sinal de saúde — só um envio real prova entrega. Rotulado como tal na UI.
//
// Sem o timeout curto abaixo, um fetch contra a Evolution travada fica pendurado até a Vercel
// matar a função: a trava viraria silêncio em vez de informação.
import { NextRequest, NextResponse } from "next/server";
import { requirePropertyAccess, isAuthError } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { PropertySecretsService } from "@/services/property-secrets-service";
import { CoolifyService } from "@/services/coolify-service";
import { resolveEvolutionConfig } from "@/lib/evolution";

const ROLES = ["super_admin", "admin", "manager"] as const;

/** Curto de propósito: a Evolution saudável responde em milissegundos. */
const PROBE_TIMEOUT_MS = 8000;
const CONNECT_TIMEOUT_MS = 20000;

export type SessionStatus =
  | "travada"        // não respondeu no prazo — processo enroscado
  | "inacessivel"    // rede/DNS/proxy: não chegou na Evolution
  | "credencial"     // 401/403 — chave recusada
  | "erro"           // respondeu, mas com erro
  | "desconectada"   // relatou close/connecting — quando ela admite, é verdade
  | "conectada";     // relatou open — otimista, NÃO prova entrega

interface Diagnosis {
  status: SessionStatus;
  detail: string;
  reportedState?: string;
  /** Histórico do fetchInstances: um 401 "device_removed" antigo explica sessão zumbi. */
  disconnectionReasonCode?: number | null;
  ownerNumber?: string | null;
  elapsedMs: number;
}

function db() {
  if (!supabaseAdmin) throw new Error("Server configuration error");
  return supabaseAdmin;
}

/** Delega para @/lib/evolution; só renomeia `instanceName` -> `instance`, que é como o resto deste arquivo chama. */
async function resolveConfig(propertyId: string) {
  const res = await resolveEvolutionConfig(propertyId);
  if (!res.ok) return { baseUrl: "", instance: "", apiKey: "" };
  return { baseUrl: res.config.baseUrl, instance: res.config.instanceName, apiKey: res.config.apiKey };
}

/** Espaço no nome da instância precisa virar %20 — há instâncias com nome composto. */
const path = (instance: string) => encodeURIComponent(instance);

/**
 * Distingue "estourou o prazo" de "erro de rede". Só o primeiro prova trava:
 * DNS/proxy fora do ar é outro problema e merece outra mensagem.
 */
async function probe(url: string, apiKey: string, timeoutMs: number, init?: RequestInit) {
  try {
    const r = await fetch(url, {
      ...init,
      headers: { apikey: apiKey, ...(init?.headers ?? {}) },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { ok: true as const, response: r };
  } catch (e) {
    const err = e as Error;
    const timedOut = err.name === "TimeoutError" || err.name === "AbortError";
    return { ok: false as const, timedOut, message: err.message };
  }
}

/** Só informativo — falha aqui não muda o diagnóstico principal. */
async function fetchHistory(baseUrl: string, apiKey: string, instance: string) {
  const r = await probe(`${baseUrl}/instance/fetchInstances`, apiKey, PROBE_TIMEOUT_MS);
  if (!r.ok || !r.response.ok) return {};
  const list = await r.response.json().catch(() => null);
  if (!Array.isArray(list)) return {};

  const found = list
    .map((item: any) => item?.instance ?? item)
    .find((i: any) => i?.instanceName === instance || i?.name === instance);
  if (!found) return {};

  return {
    disconnectionReasonCode: found.disconnectionReasonCode ?? null,
    ownerNumber: found.ownerJid?.split("@")[0] ?? found.owner?.split("@")[0] ?? null,
  };
}

async function diagnose(baseUrl: string, apiKey: string, instance: string): Promise<Diagnosis> {
  const startedAt = Date.now();
  const r = await probe(`${baseUrl}/instance/connectionState/${path(instance)}`, apiKey, PROBE_TIMEOUT_MS);
  const elapsedMs = Date.now() - startedAt;

  if (!r.ok) {
    return r.timedOut
      ? {
          status: "travada",
          detail:
            `A Evolution não respondeu em ${PROBE_TIMEOUT_MS / 1000}s. O processo está enroscado — ` +
            `o /manager também não vai abrir. Só um restart do container destrava.`,
          elapsedMs,
        }
      : { status: "inacessivel", detail: `Não foi possível alcançar a Evolution: ${r.message}`, elapsedMs };
  }

  const res = r.response;
  if (res.status === 401 || res.status === 403) {
    return { status: "credencial", detail: "Chave recusada pela Evolution (401/403).", elapsedMs };
  }
  if (!res.ok) {
    return { status: "erro", detail: `A Evolution respondeu ${res.status}.`, elapsedMs };
  }

  const body = await res.json().catch(() => ({} as any));
  const reportedState: string = body?.instance?.state ?? body?.state ?? "desconhecido";
  const history = await fetchHistory(baseUrl, apiKey, instance);

  if (reportedState !== "open") {
    return {
      status: "desconectada",
      detail: `A instância relatou "${reportedState}". Quando ela admite que caiu, é verdade — leia o QR para reconectar.`,
      reportedState,
      ...history,
      elapsedMs,
    };
  }

  return {
    status: "conectada",
    detail:
      'A instância relatou "open" e o processo responde. Atenção: "open" é otimista — ' +
      "a Evolution relata isso mesmo com o socket fechado. Só um envio real prova entrega.",
    reportedState,
    ...history,
    elapsedMs,
  };
}

/** GET ?propertyId=… — diagnóstico, sem efeito colateral. */
export async function GET(request: NextRequest) {
  const propertyId = request.nextUrl.searchParams.get("propertyId") ?? undefined;
  const auth = await requirePropertyAccess(propertyId, [...ROLES]);
  if (isAuthError(auth)) return auth;

  try {
    const { baseUrl, instance, apiKey } = await resolveConfig(propertyId!);
    if (!baseUrl || !instance || !apiKey) {
      return NextResponse.json({
        status: "erro" as SessionStatus,
        detail: "Falta URL, nome da instância ou chave da Evolution nesta propriedade.",
        elapsedMs: 0,
      });
    }
    return NextResponse.json({
      instance,
      restartAvailable: CoolifyService.isConfigured(),
      ...(await diagnose(baseUrl, apiKey, instance)),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/**
 * POST { propertyId, action } — ações de reconexão.
 *
 *   "reconnect" pede o QR. Se a sessão estiver zumbi, a Evolution devolve `state: open`
 *   em vez de um QR: nesse caso o operador precisa do "logout" antes.
 *
 *   "logout" DERRUBA a sessão atual de propósito. É o único jeito de forçar QR novo numa
 *   sessão zumbi — e é destrutivo se a sessão estiver de pé, por isso a UI confirma antes.
 *
 *   "restart" recria o container da Evolution via API do Coolify — o único remédio quando
 *   o processo trava ou quando a sessão zumbi nem desconecta. Passa por FORA da Evolution,
 *   então funciona justamente quando nada dentro dela responde.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const propertyId: string | undefined = body?.propertyId;
  const action: "reconnect" | "logout" | "restart" = body?.action;
  const auth = await requirePropertyAccess(propertyId, [...ROLES]);
  if (isAuthError(auth)) return auth;

  if (action !== "reconnect" && action !== "logout" && action !== "restart") {
    return NextResponse.json({ error: "action inválida (reconnect | logout | restart)." }, { status: 400 });
  }

  if (action === "restart") {
    const result = await CoolifyService.restartEvolution();
    await db().from("audit_logs").insert({
      id: crypto.randomUUID(),
      propertyId: propertyId!,
      userId: auth.staff.id,
      userName: auth.staff.fullName,
      action: "WHATSAPP_RESTART_MANUAL",
      entity: "WHATSAPP",
      entityId: "evolution",
      details: `Reinício manual da Evolution via Coolify: ${result.message}`,
      newData: result,
      timestamp: new Date().toISOString(),
    });
    return NextResponse.json({
      ok: result.ok,
      message: result.ok
        ? "Reinício disparado no Coolify. A Evolution recria em ~1 minuto — verifique de novo e, se a sessão não voltar sozinha, gere o QR."
        : result.message,
    });
  }

  try {
    const { baseUrl, instance, apiKey } = await resolveConfig(propertyId!);
    if (!baseUrl || !instance || !apiKey) {
      return NextResponse.json({ ok: false, message: "Falta URL, instância ou chave da Evolution." });
    }

    if (action === "logout") {
      const r = await probe(`${baseUrl}/instance/logout/${path(instance)}`, apiKey, PROBE_TIMEOUT_MS, {
        method: "DELETE",
      });
      if (!r.ok) {
        return NextResponse.json({
          ok: false,
          message: r.timedOut
            ? "A Evolution não respondeu: o processo está travado. Só o restart do container resolve."
            : `Não foi possível alcançar a Evolution: ${r.message}`,
        });
      }
      // 500 aqui é esperado com socket já morto ("Connection Closed") — não impede o QR.
      return NextResponse.json({
        ok: true,
        message: r.response.ok
          ? "Sessão encerrada. Peça o QR para reconectar."
          : `A Evolution respondeu ${r.response.status} ao deslogar (comum com o socket já morto). Tente o QR mesmo assim.`,
      });
    }

    const r = await probe(`${baseUrl}/instance/connect/${path(instance)}`, apiKey, CONNECT_TIMEOUT_MS);
    if (!r.ok) {
      return NextResponse.json({
        ok: false,
        message: r.timedOut
          ? "A Evolution não respondeu: o processo está travado. Só o restart do container resolve."
          : `Não foi possível alcançar a Evolution: ${r.message}`,
      });
    }
    if (!r.response.ok) {
      return NextResponse.json({ ok: false, message: `A Evolution respondeu ${r.response.status}.` });
    }

    const data = await r.response.json().catch(() => ({} as any));
    const qr: string | null = data?.base64 ?? null;
    const pairingCode: string | null = data?.pairingCode ?? null;

    if (!qr && !pairingCode) {
      // Sintoma clássico da sessão zumbi: pede QR, recebe "open" de volta.
      const state = data?.instance?.state ?? data?.state;
      return NextResponse.json({
        ok: false,
        needsLogout: true,
        message:
          state === "open"
            ? 'A Evolution devolveu "open" em vez de um QR — sessão zumbi. Encerre a sessão e peça o QR de novo.'
            : "A Evolution não devolveu QR nem código de pareamento.",
      });
    }

    return NextResponse.json({ ok: true, qr, pairingCode });
  } catch (e) {
    return NextResponse.json({ ok: false, message: (e as Error).message });
  }
}
