// src/lib/safe-mode.ts
//
// Kill switch das saídas externas — é o que separa o "test server" do mundo real.
//
// O banco de DEV é um espelho do de produção: os mesmos hóspedes, os mesmos telefones e,
// dentro de `properties.settings.whatsappConfig`, a MESMA URL/instância da Evolution. Por
// isso zerar as envs não protege nada: a configuração de WhatsApp/Chatwoot vem do BANCO,
// não do ambiente. O corte precisa ser no código, e é aqui.
//
// Fail-closed de propósito. A regra não é "desliga quando alguém lembrar de marcar a
// flag" — é "só o banco de produção libera envio". Esquecer de configurar o DEV resulta
// em silêncio com log, nunca em mensagem para hóspede real.
//
// O que fica suprimido em modo seguro: WhatsApp (Evolution), Web Push, Chatwoot e o
// restart remoto da Evolution via Coolify. Leituras e o resto do app seguem normais.

/** Ref do projeto Supabase de produção. Se um dia produção mudar de projeto, troque aqui. */
const PROD_PROJECT_REF = "luihcsfvnfdshhqltjig";

function usingProductionDatabase(): boolean {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").includes(PROD_PROJECT_REF);
}

/**
 * `true` quando envios externos devem virar log.
 *
 * - `AURA_SAFE_MODE=true`  → força o modo seguro (útil para rodar local contra produção
 *                            sem risco de disparar mensagem).
 * - `AURA_SAFE_MODE=false` → escotilha de emergência; só faz sentido em produção.
 * - sem a env             → decide pelo banco: qualquer coisa que não seja produção é DEV.
 */
export function isSafeMode(): boolean {
  const flag = process.env.AURA_SAFE_MODE;
  if (flag === "true") return true;
  if (flag === "false") return false;
  return !usingProductionDatabase();
}

/**
 * Em qual ambiente a interface está rodando. Serve para avisar o usuário na tela.
 *
 * Pode ser chamada do navegador: olha só `NEXT_PUBLIC_SUPABASE_URL`, que é a única
 * variável que existe dos dois lados. Note que ela ignora `AURA_SAFE_MODE` de
 * propósito — a pergunta aqui é "qual banco estou vendo?", não "os envios estão
 * cortados?". Alguém rodando local contra produção com a trava ligada precisa ver
 * PRODUÇÃO na tela, porque os dados que aparecem são os reais.
 */
export function environmentName(): "producao" | "dev" {
  return usingProductionDatabase() ? "producao" : "dev";
}

/**
 * Registra o envio que NÃO aconteceu. O log é a entrega em modo seguro — dá para
 * conferir no terminal do `pnpm dev` ou nos logs da Vercel exatamente o que teria saído.
 */
export function logSuppressedSend(channel: string, target: string, detail?: string): void {
  const suffix = detail ? ` — ${detail}` : "";
  console.warn(`[SAFE-MODE] ${channel} → ${target}: envio suprimido (banco não é produção)${suffix}`);
}
