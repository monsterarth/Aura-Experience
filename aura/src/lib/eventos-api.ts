// src/lib/eventos-api.ts
//
// Cliente das telas de Eventos e Calendário para `/api/admin/eventos`. Existe
// para que nenhum componente volte a importar `EventService` (server-only) e
// para que a mensagem de erro da rota chegue ao toast: o formulário mostrava
// "Erro ao salvar evento" para qualquer causa, inclusive validação — agora o
// motivo real aparece ("A data de fim é anterior à de início").
import type { Event } from "@/types/aura";

async function parse(res: Response) {
  const json = await res.json().catch(() => ({} as Record<string, unknown>));
  if (!res.ok) throw new Error((json as { error?: string }).error || `Falha na requisição (${res.status}).`);
  return json as Record<string, unknown>;
}

export const EventosApi = {
  async list(propertyId: string): Promise<Event[]> {
    const res = await fetch(`/api/admin/eventos?propertyId=${encodeURIComponent(propertyId)}`, { cache: "no-store" });
    return ((await parse(res)).events ?? []) as Event[];
  },

  /** Recorte do mês para o calendário — inclui o evento que atravessa a virada. */
  async month(propertyId: string, year: number, month: number): Promise<Event[]> {
    const qs = new URLSearchParams({ propertyId, scope: "month", year: String(year), month: String(month) });
    const res = await fetch(`/api/admin/eventos?${qs}`, { cache: "no-store" });
    return ((await parse(res)).events ?? []) as Event[];
  },

  async create(propertyId: string, form: Partial<Event>): Promise<string> {
    const res = await fetch("/api/admin/eventos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, propertyId }),
    });
    return (await parse(res)).id as string;
  },

  async update(propertyId: string, id: string, patch: Partial<Event>): Promise<void> {
    const res = await fetch("/api/admin/eventos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...patch, id, propertyId }),
    });
    await parse(res);
  },

  /** Exclusão lógica — o evento vira `cancelled`. */
  async remove(propertyId: string, id: string): Promise<void> {
    const qs = new URLSearchParams({ id, propertyId });
    const res = await fetch(`/api/admin/eventos?${qs}`, { method: "DELETE" });
    await parse(res);
  },
};
