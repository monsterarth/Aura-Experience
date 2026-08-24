// src/lib/instagram.ts
//
// @usuário do Instagram no lead comercial. Quem chega por DM não tem telefone
// nem e-mail — o handle é o único meio de contato, e precisa ser guardado num
// formato só: SEM '@', minúsculo, sem URL em volta.
//
// O vendedor cola de tudo: "@fulano", "fulano", "instagram.com/fulano/",
// "https://www.instagram.com/fulano?igsh=abc". Tudo vira "fulano".

/** Regras do Instagram: letras, números, ponto e underline, até 30. */
const HANDLE_RE = /^[A-Za-z0-9._]{1,30}$/;

/**
 * Normaliza o que foi digitado/colado para o handle puro. Devolve `null`
 * quando não sobra nada válido — o chamador decide se isso é erro.
 */
export function normalizeInstagram(raw?: string | null): string | null {
  if (!raw) return null;
  let v = String(raw).trim();
  if (!v) return null;

  // URL colada (com ou sem protocolo/www): fica só o primeiro segmento.
  const url = v.match(/instagram\.com\/([^/?#\s]+)/i);
  if (url) v = url[1];

  v = v.replace(/^@+/, "").split(/[/?#\s]/)[0].trim().toLowerCase();
  if (!v) return null;
  return HANDLE_RE.test(v) ? v : null;
}

/** Exibição: sempre com '@' na frente. */
export function instagramDisplay(handle?: string | null): string {
  const h = normalizeInstagram(handle);
  return h ? `@${h}` : "";
}

/** Link do perfil — o botão do drawer/card abre daqui. */
export function instagramUrl(handle?: string | null): string | null {
  const h = normalizeInstagram(handle);
  return h ? `https://instagram.com/${h}` : null;
}
