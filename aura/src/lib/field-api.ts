// src/lib/field-api.ts
// POST padrão dos apps de campo para as rotas /api/field/*.
//
// - keepalive: o request sobrevive se o celular bloquear logo após o toque — o motivo nº 1
//   de essas rotas existirem (lock frio do client de browser). Mesma proteção do postAction
//   do app da camareira.
// - timeout defensivo: nunca deixa um spinner preso; em estouro, devolve ok:false.
// - erro estruturado: o corpo { error } da rota (ex.: 409 de conflito de estadia, 403 de
//   cargo) volta em `error` para o toast — em vez de sumir num catch genérico.
export async function postFieldAction(
  route: string,
  payload: unknown,
  timeoutMs = 15000,
): Promise<{ ok: boolean; error?: string; data?: any }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(route, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
      keepalive: true,
    });
    const data = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data };
    return { ok: false, error: typeof data?.error === 'string' ? data.error : undefined };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}
