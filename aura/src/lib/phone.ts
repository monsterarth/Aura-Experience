// src/lib/phone.ts
// Telefone com código de país (DDI) explícito nas telas de captura.
//
// O banco guarda SÓ DÍGITOS já com o DDI (ex.: "554891797015"). O `to` do
// WhatsApp é esse valor cru — sem o DDI a Evolution devolve 400. Como não há
// (nem deve haver) auto-55 escondido no servidor, a captura passou a ter um
// campo de DDI separado; estas funções dividem/juntam os dois lados.

/** DDI padrão pelo idioma: só pt (Brasil) nasce preenchido; demais, vazio. */
export function defaultCountryForLang(lang: string | null | undefined): string {
  return lang === "pt" ? "55" : "";
}

/**
 * Divide um telefone salvo (dígitos ou formatado) em { country, number }.
 * Heurística BR: começa com 55 e sobram 10–11 dígitos → separa o 55. Caso
 * contrário o valor inteiro é o número local e o DDI vem do idioma (para o
 * número quebrado sem 55 nascer já com o campo pré-preenchido em pt).
 */
export function splitPhone(
  raw: string | null | undefined,
  lang: string | null | undefined
): { country: string; number: string; hadCountry: boolean } {
  const d = (raw || "").replace(/\D/g, "");
  if (!d) return { country: defaultCountryForLang(lang), number: "", hadCountry: false };
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) {
    // DDI EXTRAÍDO do número salvo (não é palpite do idioma).
    return { country: "55", number: d.slice(2), hadCountry: true };
  }
  return { country: defaultCountryForLang(lang), number: d, hadCountry: false };
}

/** Junta DDI + número em dígitos puros — o que vai para o banco. */
export function joinPhone(
  country: string | null | undefined,
  number: string | null | undefined
): string {
  return `${(country || "").replace(/\D/g, "")}${(number || "").replace(/\D/g, "")}`;
}

/**
 * Valida o número LOCAL (sem DDI). Em BR (DDI 55) exige 10–11 dígitos
 * (DDD + 8/9); para outros países é mais tolerante (linha internacional
 * varia), deixando o aviso fino para a checagem da Meta no envio.
 */
export function isLocalNumberValid(country: string, localNumber: string): boolean {
  const c = (country || "").replace(/\D/g, "");
  const n = (localNumber || "").replace(/\D/g, "");
  if (c === "55") return n.length === 10 || n.length === 11;
  return n.length >= 6;
}

/**
 * O número está mandável pelo WhatsApp? Devolve o motivo quando não está.
 *
 * NÃO conserta nada — o auto-55 escondido continua fora de questão (ver o topo
 * deste arquivo). Serve para a falha dizer a verdade: 22 mensagens morreram como
 * "Bad Request" ao longo de cinco meses porque o número tinha ido sem o DDI, e
 * ninguém ligou uma coisa à outra. Com isto o erro guardado já nomeia a causa.
 *
 * Passa intacto o que não é telefone nosso: internacional real (54 Argentina,
 * 595 Paraguai, 49 Alemanha) e JID de grupo do WhatsApp (18 dígitos, começa com
 * 120363). Só barra o que é reconhecidamente inenviável.
 */
export function whatsappNumberProblem(raw: string | null | undefined): string | null {
  const d = (raw || "").replace(/\D/g, "");
  if (!d) return "sem telefone";
  if (d.length === 10 || d.length === 11) {
    return `telefone sem o DDI (${d}) — falta o 55 no cadastro`;
  }
  if (d.length < 10) return `telefone curto demais (${d})`;
  return null;
}
