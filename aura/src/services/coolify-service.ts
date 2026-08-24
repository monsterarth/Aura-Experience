// src/services/coolify-service.ts
//
// Cliente mínimo da API do Coolify — o painel que orquestra o VPS onde a Evolution roda.
//
// Existe por um único motivo: quando o processo da Evolution enrosca ou a sessão vira
// zumbi, nada DENTRO dela funciona (nem /manager, nem logout, nem QR — é o mesmo event
// loop). A única saída é recriar o container, e o jeito programável de fazer isso é o
// restart do *service* no Coolify — equivale ao botão Restart do painel: regenera
// compose + .env e recria os containers. NÃO puxa imagem nova (a tag da Evolution é
// pinada), então é seguro disparar sem supervisão.
//
// A infra é compartilhada entre propriedades (um processo Evolution serve todas as
// instâncias), por isso a configuração vem de env — não de property_secrets.
//
// Env necessária (server-only):
//   COOLIFY_API_URL                 ex.: http://187.77.57.154:8000 (sem /api/v1)
//   COOLIFY_API_TOKEN               Coolify → Security → API Tokens
//   COOLIFY_EVOLUTION_SERVICE_UUID  uuid do service da Evolution (GET /api/v1/services)

import { isSafeMode, logSuppressedSend } from "@/lib/safe-mode";

const TIMEOUT_MS = 15000;

export interface CoolifyActionResult {
  ok: boolean;
  message: string;
}

function config() {
  return {
    base: (process.env.COOLIFY_API_URL ?? "").replace(/\/+$/, ""),
    token: process.env.COOLIFY_API_TOKEN ?? "",
    uuid: process.env.COOLIFY_EVOLUTION_SERVICE_UUID ?? "",
  };
}

async function call(method: "POST" | "GET", path: string): Promise<Response> {
  const { base, token } = config();
  return fetch(`${base}/api/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

export const CoolifyService = {
  /** Sem as três envs não há reinício remoto — a UI esconde o botão e o vigia só alerta. */
  isConfigured(): boolean {
    const { base, token, uuid } = config();
    return Boolean(base && token && uuid);
  },

  /**
   * Dispara o restart do service da Evolution. A chamada só ENFILEIRA o restart no
   * Coolify (volta em milissegundos); os containers levam ~1 minuto para recriar.
   * O método tenta POST e cai para GET se o Coolify da casa (v4 beta) responder 405 —
   * as betas divergem nisso e um 405 não pode virar "não deu".
   */
  async restartEvolution(): Promise<CoolifyActionResult> {
    // As envs do Coolify são as mesmas em qualquer ambiente: um vigia rodando no DEV
    // derrubaria e recriaria o container da Evolution que atende produção.
    if (isSafeMode()) {
      logSuppressedSend("coolify", "restart Evolution");
      return { ok: false, message: "Modo seguro: restart da Evolution não é disparado fora de produção." };
    }

    const { uuid } = config();
    if (!this.isConfigured()) {
      return {
        ok: false,
        message: "Reinício remoto não configurado (COOLIFY_API_URL / COOLIFY_API_TOKEN / COOLIFY_EVOLUTION_SERVICE_UUID).",
      };
    }

    try {
      let res = await call("POST", `/services/${uuid}/restart`);
      if (res.status === 405) res = await call("GET", `/services/${uuid}/restart`);

      const body = (await res.text().catch(() => "")).slice(0, 200);
      if (!res.ok) {
        return { ok: false, message: `Coolify respondeu ${res.status} ao reiniciar: ${body || "sem corpo"}` };
      }
      return { ok: true, message: "Restart da Evolution enfileirado no Coolify." };
    } catch (e) {
      const err = e as Error;
      const timedOut = err.name === "TimeoutError" || err.name === "AbortError";
      return {
        ok: false,
        message: timedOut
          ? `Coolify não respondeu em ${TIMEOUT_MS / 1000}s — painel fora do ar ou VPS asfixiado.`
          : `Não foi possível alcançar o Coolify: ${err.message}`,
      };
    }
  },
};
