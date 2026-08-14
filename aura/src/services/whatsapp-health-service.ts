// src/services/whatsapp-health-service.ts
//
// Vigia do WhatsApp: detecta sessão morta/processo travado e reage sozinho.
//
// A REGRA DE OURO (aprendida a caro): os indicadores baratos da Evolution só mentem para
// o lado otimista — `connectionState` e `fetchInstances` respondem "open" com o socket
// fechado. Os únicos sinais honestos são:
//
//   1. o RESULTADO dos envios reais (falha com "Connection Closed" = sessão morta, certeza);
//   2. TIMEOUT na sonda de fora (= event loop enroscado, certeza);
//   3. a Evolution ADMITINDO "close"/"connecting" (quando ela admite, é verdade).
//
// Por isso o vigia mora aqui e é chamado de carona pelo `process-messages` (o ponto onde
// o sinal 1 existe de graça) e pelo cron opcional `whatsapp-watchdog` (que cobre 2 e 3
// com a fila vazia).
//
// Reação em escada, com memória em `audit_logs` (estado derivado, sem migration):
//   caiu → restart automático via Coolify (cooldown de 30 min) + push aos admins;
//   continua caída após restart → push "precisa de QR novo";
//   voltou a enviar → push de recuperação, uma vez por incidente.
import { supabaseAdmin } from "@/lib/supabase";
import { fanOutByRole } from "@/lib/push-notify";
import { isSessionDownError } from "@/lib/evolution-error";
import { CoolifyService } from "@/services/coolify-service";

/** Janela que o veredito olha para trás na tabela `messages`. */
const WINDOW_MIN = 90;
/** Falhas de sessão na janela para declarar queda — 1 só pode ser soluço de rede. */
const MIN_SESSION_FAILURES = 2;
/** Não reiniciar de novo antes disso — restart em loop só esconde o problema. */
const RESTART_COOLDOWN_MIN = 30;
/** Não repetir o MESMO alerta antes disso. */
const ALERT_COOLDOWN_MIN = 60;
/** Incidente mais velho que isso não ganha push de "voltou". */
const RECOVERY_LOOKBACK_MIN = 12 * 60;
/** A Evolution saudável responde em milissegundos; estourar isso prova trava. */
const PROBE_TIMEOUT_MS = 8000;

/** Quem é acordado: quem consegue agir (reiniciar/ler QR). */
const ALERT_ROLES = ["super_admin", "admin", "manager"];
const ALERT_URL = "/admin/configuracoes/integracoes";

export type WhatsAppVerdict =
  | "ok"          // houve envio com sucesso mais recente que qualquer falha
  | "caida"       // envios reais falhando com assinatura de sessão morta (ou a Evolution admitiu)
  | "travada"     // sonda estourou o timeout — processo enroscado
  | "indefinida"; // sem sinal honesto na janela (fila parada e sonda otimista)

type AlertKind = "reiniciada" | "precisa-qr" | "manual" | "voltou";

export interface WatchdogResult {
  verdict: WhatsAppVerdict;
  detail: string;
  acted: "restart" | "alerta" | "nada";
  restartOk?: boolean;
}

const RESTART_ACTIONS = ["WHATSAPP_WATCHDOG_RESTART", "WHATSAPP_RESTART_MANUAL"];

function db() {
  if (!supabaseAdmin) throw new Error("Vigia do WhatsApp é server-only (supabaseAdmin ausente).");
  return supabaseAdmin;
}

function minutesSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 60000;
}

async function logEvent(action: string, details: string, newData: object) {
  try {
    await db().from("audit_logs").insert({
      id: crypto.randomUUID(),
      propertyId: "system",
      userId: "watchdog",
      userName: "Vigia do WhatsApp",
      action,
      entity: "WHATSAPP",
      entityId: "watchdog",
      details,
      newData,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[whatsapp-watchdog] falha ao auditar:", e);
  }
}

async function lastEvent(actions: string[]) {
  // Corte temporal para a consulta não varrer o histórico inteiro do audit_logs —
  // nenhum uso (cooldown de 30 min, recuperação em 12h) olha mais longe que isso.
  const since = new Date(Date.now() - RECOVERY_LOOKBACK_MIN * 60000).toISOString();
  const { data } = await db()
    .from("audit_logs")
    .select("action, timestamp, newData")
    .eq("entity", "WHATSAPP")
    .in("action", actions)
    .gte("timestamp", since)
    .order("timestamp", { ascending: false })
    .limit(1);
  return data?.[0] ?? null;
}

/** Propriedades com WhatsApp ligado — o fan-out de push é por propriedade. */
async function whatsappPropertyIds(): Promise<string[]> {
  const { data } = await db().from("properties").select("id, settings");
  return (data ?? [])
    .filter((p) => Boolean((p.settings as { whatsappEnabled?: boolean } | null)?.whatsappEnabled))
    .map((p) => p.id as string);
}

/**
 * Sonda de fora, com timeout curto. Só dois desfechos são conclusivos:
 * timeout (travada) e estado != "open" (caída admitida). "open" não prova nada.
 */
async function probeEvolution(): Promise<"travada" | "caida" | "inconclusiva"> {
  const base = (process.env.EVOLUTION_API_URL ?? "").replace(/\/+$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY ?? "";
  const instance = process.env.EVOLUTION_INSTANCE ?? "";
  if (!base || !apiKey || !instance) return "inconclusiva";

  try {
    const res = await fetch(`${base}/instance/connectionState/${encodeURIComponent(instance)}`, {
      headers: { apikey: apiKey },
      cache: "no-store",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!res.ok) return "inconclusiva";
    const body = (await res.json().catch(() => null)) as { instance?: { state?: string }; state?: string } | null;
    const state = body?.instance?.state ?? body?.state;
    return state && state !== "open" ? "caida" : "inconclusiva";
  } catch (e) {
    const err = e as Error;
    return err.name === "TimeoutError" || err.name === "AbortError" ? "travada" : "inconclusiva";
  }
}

async function assess(): Promise<{ verdict: WhatsAppVerdict; detail: string; propertyIds: string[] }> {
  const probe = await probeEvolution();
  if (probe === "travada") {
    return {
      verdict: "travada",
      detail: `A Evolution não respondeu a sonda em ${PROBE_TIMEOUT_MS / 1000}s — processo enroscado.`,
      propertyIds: [],
    };
  }

  // Sinal 1: o que os envios REAIS da janela dizem.
  const cutoff = new Date(Date.now() - WINDOW_MIN * 60000).toISOString();
  const { data: rows } = await db()
    .from("messages")
    .select("status, errorMessage, lastAttemptAt, propertyId")
    .gte("lastAttemptAt", cutoff)
    .order("lastAttemptAt", { ascending: false })
    .limit(100);

  const lastOk = (rows ?? []).find((r) => r.status === "sent");
  const downRows = (rows ?? []).filter((r) => isSessionDownError(r.errorMessage));
  const lastDown = downRows[0];

  const sessionDead =
    downRows.length >= MIN_SESSION_FAILURES &&
    Boolean(lastDown) &&
    (!lastOk || String(lastDown.lastAttemptAt) > String(lastOk.lastAttemptAt));

  if (sessionDead) {
    return {
      verdict: "caida",
      detail: `${downRows.length} envio(s) reais falharam com sessão morta nos últimos ${WINDOW_MIN} min, nenhum sucesso depois.`,
      propertyIds: Array.from(new Set(downRows.map((r) => r.propertyId as string).filter(Boolean))),
    };
  }
  if (probe === "caida") {
    return { verdict: "caida", detail: "A própria Evolution relatou a sessão fora de 'open' — quando ela admite, é verdade.", propertyIds: [] };
  }
  if (lastOk && (!lastDown || String(lastOk.lastAttemptAt) > String(lastDown.lastAttemptAt))) {
    return { verdict: "ok", detail: "Último envio real da janela saiu com sucesso.", propertyIds: [] };
  }
  return { verdict: "indefinida", detail: "Sem envio real na janela e sonda otimista — nada honesto para afirmar.", propertyIds: [] };
}

/** Push aos admins, deduplicado por tipo: o mesmo aviso não repete dentro do cooldown. */
async function alert(kind: AlertKind, propertyIds: string[], body: string) {
  const { data: recent } = await db()
    .from("audit_logs")
    .select("timestamp, newData")
    .eq("entity", "WHATSAPP")
    .eq("action", "WHATSAPP_WATCHDOG_ALERT")
    .gte("timestamp", new Date(Date.now() - ALERT_COOLDOWN_MIN * 60000).toISOString())
    .order("timestamp", { ascending: false })
    .limit(5);

  const sameKind = (recent ?? []).find((r) => (r.newData as { kind?: string } | null)?.kind === kind);
  if (sameKind && minutesSince(sameKind.timestamp as string) < ALERT_COOLDOWN_MIN) return;

  const targets = propertyIds.length ? propertyIds : await whatsappPropertyIds();
  for (const propertyId of targets) {
    try {
      await fanOutByRole(propertyId, ALERT_ROLES, {
        title: "WhatsApp",
        body,
        url: ALERT_URL,
        tag: "whatsapp-watchdog", // tag estável: o aviso novo substitui o anterior, não empilha
        role: "admin",
      });
    } catch (e) {
      console.error("[whatsapp-watchdog] falha no push:", e);
    }
  }
  await logEvent("WHATSAPP_WATCHDOG_ALERT", body, { kind, properties: targets });
}

export const WhatsAppHealthService = {
  assess,

  /**
   * Avalia e reage. `hintPropertyIds` vem do process-messages (as propriedades cujos
   * envios acabaram de falhar) — poupa a consulta e mira o push em quem sofreu.
   */
  async checkAndRecover(trigger: "fila" | "vigia", hintPropertyIds: string[] = []): Promise<WatchdogResult> {
    const a = await assess();
    if (a.verdict === "ok" || a.verdict === "indefinida") {
      return { verdict: a.verdict, detail: a.detail, acted: "nada" };
    }

    const propertyIds = hintPropertyIds.length ? hintPropertyIds : a.propertyIds;
    const lastRestart = await lastEvent(RESTART_ACTIONS);
    const cooledDown = !lastRestart || minutesSince(lastRestart.timestamp as string) >= RESTART_COOLDOWN_MIN;

    if (!CoolifyService.isConfigured()) {
      await alert(
        "manual",
        propertyIds,
        "WhatsApp caiu e o reinício automático não está configurado. Reinicie a Evolution no Coolify e depois leia o QR em Configurações → Integrações.",
      );
      return { verdict: a.verdict, detail: a.detail, acted: "alerta" };
    }

    if (cooledDown) {
      const r = await CoolifyService.restartEvolution();
      await logEvent(
        "WHATSAPP_WATCHDOG_RESTART",
        `Restart automático da Evolution (${trigger}): ${a.detail}`,
        { trigger, verdict: a.verdict, ok: r.ok, message: r.message },
      );
      await alert(
        "reiniciada",
        propertyIds,
        r.ok
          ? "WhatsApp caiu — reinício automático da Evolution disparado. Se em ~2 minutos não voltar, leia o QR em Configurações → Integrações."
          : `WhatsApp caiu e o reinício automático falhou (${r.message}). Reinicie pelo Coolify e leia o QR.`,
      );
      return { verdict: a.verdict, detail: a.detail, acted: "restart", restartOk: r.ok };
    }

    // Já houve restart há pouco e segue caída: a essa altura o problema não é o processo,
    // é a sessão — e sessão nova só com um humano lendo o QR.
    await alert(
      "precisa-qr",
      propertyIds,
      "WhatsApp continua fora mesmo após o reinício automático — a sessão precisa de QR novo. Configurações → Integrações → Gerar QR.",
    );
    return { verdict: a.verdict, detail: a.detail, acted: "alerta" };
  },

  /**
   * Chamado quando um ciclo teve envio com SUCESSO: se havia incidente aberto (último
   * evento do vigia não é a recuperação), fecha com um push de "voltou". Uma vez só.
   */
  async notifyRecoveredIfNeeded(propertyIds: string[] = []) {
    const last = await lastEvent([...RESTART_ACTIONS, "WHATSAPP_WATCHDOG_ALERT", "WHATSAPP_WATCHDOG_RECOVERED"]);
    if (!last || last.action === "WHATSAPP_WATCHDOG_RECOVERED") return;
    if (minutesSince(last.timestamp as string) > RECOVERY_LOOKBACK_MIN) return;

    await logEvent("WHATSAPP_WATCHDOG_RECOVERED", "Envio real voltou a sair com sucesso.", { properties: propertyIds });
    const targets = propertyIds.length ? propertyIds : await whatsappPropertyIds();
    for (const propertyId of targets) {
      try {
        await fanOutByRole(propertyId, ALERT_ROLES, {
          title: "WhatsApp",
          body: "WhatsApp voltou a enviar mensagens normalmente. ✅",
          url: ALERT_URL,
          tag: "whatsapp-watchdog",
          role: "admin",
        });
      } catch (e) {
        console.error("[whatsapp-watchdog] falha no push de recuperação:", e);
      }
    }
  },
};
