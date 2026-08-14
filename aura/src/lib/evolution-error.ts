/**
 * Extrai a mensagem útil de um erro da Evolution API.
 *
 * A Evolution devolve o motivo real em campos diferentes conforme a camada que falhou,
 * e o campo mais genérico (`error`) é o menos informativo — ler ele primeiro esconde a causa:
 *
 *   Sessão morta (Baileys):  { output: { statusCode: 428, payload: { error: "Precondition Required", message: "Connection Closed" } } }
 *   Erro interno/validação:  { status: 500, error: "Internal Server Error", response: { message: ["..."] } }
 *
 * O caso da sessão morta ganha um texto próprio porque é o único em que reenviar não
 * adianta: a instância continua respondendo `connectionStatus: "open"` no `fetchInstances`
 * — o socket é que está fechado — e só volta relendo o QR.
 */

function flatten(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const parts = value.map(flatten).filter(Boolean) as string[];
    return parts.length ? parts.join("; ") : null;
  }
  return null;
}

export function parseEvolutionError(httpStatus: number, rawBody: string): string {
  let parsed: any = null;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    // corpo não-JSON (HTML de proxy, timeout do gateway, etc.)
  }

  // Do mais específico para o mais genérico. O último recurso é o corpo cru
  // (HTML de proxy, por exemplo) — truncado, porque isso vai para `messages.errorMessage`.
  const detail =
    flatten(parsed?.output?.payload?.message) ??
    flatten(parsed?.response?.message) ??
    flatten(parsed?.message) ??
    flatten(parsed?.error) ??
    flatten(rawBody)?.slice(0, 200) ??
    "sem resposta da Evolution API";

  const baileysStatus = parsed?.output?.payload?.statusCode ?? parsed?.output?.statusCode;
  const sessionDown = baileysStatus === 428 || /connection closed|connection failure/i.test(detail);

  const codes = baileysStatus && baileysStatus !== httpStatus
    ? `HTTP ${httpStatus}/${baileysStatus}`
    : `HTTP ${httpStatus}`;

  return sessionDown
    ? `Sessão do WhatsApp desconectada (${detail}) — reconecte a instância lendo o QR novamente. [${codes}]`
    : `${detail} [${codes}]`;
}

/**
 * Reconhece em `messages.errorMessage` a assinatura de sessão morta — tanto o texto que
 * `parseEvolutionError` produz quanto os motivos crus do Baileys, caso a mensagem tenha
 * sido gravada por outro caminho. É o critério que o vigia usa para distinguir "a sessão
 * caiu" (restart + QR resolvem) de erros de conteúdo/número, que não justificam restart.
 */
export function isSessionDownError(message: string | null | undefined): boolean {
  if (!message) return false;
  return /sessão do whatsapp desconectada|connection closed|connection failure/i.test(message);
}
