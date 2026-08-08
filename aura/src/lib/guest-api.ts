// src/lib/guest-api.ts
//
// Cliente das rotas do PORTAL DO HÓSPEDE (equivalente ao field-api.ts dos apps de campo).
//
// Por que existe: o portal é anônimo, e ler o banco direto do navegador só funciona
// enquanto a tabela não tiver RLS. Quando tem, a leitura volta VAZIA — sem erro — e a
// tela mostra "nada por aqui" em vez de falhar. Foi o que aconteceu com o catálogo do
// concierge. Toda leitura do portal deve passar por aqui.
//
// Toda rota valida posse pelo trio stayId + accessCode + propertyId.
import { Cabin, ConciergeItem, ConciergeRequest, FBCategory, FBMenuItem, Guest, Property, Stay } from "@/types/aura";

export interface GuestScope {
  propertyId: string;
  stayId: string;
  accessCode: string;
}

async function getJson<T>(path: string, scope: GuestScope, extra?: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams({
    propertyId: scope.propertyId,
    stayId: scope.stayId,
    accessCode: scope.accessCode,
    ...(extra ?? {}),
  });
  const res = await fetch(`/api/guest/${path}?${qs}`, { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Falha ao carregar (${res.status}).`);
  return json as T;
}

export interface GuestSession {
  stays: Stay[];
  stay: Stay;
  guest: Guest | null;
  cabin: Cabin | null;
  /** Propriedade com allowlist de chaves — não traz credenciais nem config interna. */
  property: Pick<Property, "id" | "name" | "slug" | "logoUrl" | "theme" | "settings"> | null;
  /** true = o hóspede já respondeu a pesquisa desta estadia. */
  hasSurvey: boolean;
}

export const GuestApi = {
  /**
   * Bootstrap do portal: estadia (+ grupo), hóspede, cabana e propriedade.
   * Substitui o trio que 8 telas repetiam lendo o banco pelo navegador.
   */
  async session(code: string, stayId?: string): Promise<GuestSession> {
    const qs = new URLSearchParams({ code, ...(stayId ? { stayId } : {}) });
    const res = await fetch(`/api/guest/session?${qs}`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Falha ao carregar a estadia (${res.status}).`);
    return json as GuestSession;
  },

  /** Catálogo + pedidos da estadia. */
  concierge(scope: GuestScope) {
    return getJson<{ items: ConciergeItem[]; requests: ConciergeRequest[] }>("concierge", scope);
  },

  /**
   * Cardápio do café. Só precisa de propertyId (o cardápio não é dado de hóspede),
   * por isso não usa o helper com validação de posse.
   */
  async breakfastMenu(propertyId: string): Promise<{ categories: FBCategory[]; menuItems: FBMenuItem[] }> {
    const res = await fetch(`/api/guest/breakfast-menu?propertyId=${encodeURIComponent(propertyId)}`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Falha ao carregar o cardápio (${res.status}).`);
    return json;
  },
};
