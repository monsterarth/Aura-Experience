// src/lib/property-settings-client.ts
// Cliente da configuração da propriedade (molde de src/lib/stock-client.ts).
// Toda tela de configuração escreve por aqui — nunca com supabase direto do navegador.
import { Property } from "@/types/aura";

async function handle(res: Response) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Falha na requisição (${res.status}).`);
  return json;
}

export interface IntegrationsView {
  config: Record<string, string | number | null>;
  whatsappEnabled: boolean;
  whatsappNumber: string | null;
  hasEvolutionApiKey: boolean;
  evolutionApiKeyMask: string | null;
  hasChatwootApiToken: boolean;
  chatwootApiTokenMask: string | null;
  secureEvolutionApiKey: boolean;
  secureChatwootApiToken: boolean;
}

/** Ver o comentário de cabeçalho de `api/admin/whatsapp/session/route.ts` para o porquê de cada estado. */
export type WhatsAppSessionStatus =
  | "travada" | "inacessivel" | "credencial" | "erro" | "desconectada" | "conectada";

export interface WhatsAppSessionView {
  instance?: string;
  status: WhatsAppSessionStatus;
  detail: string;
  reportedState?: string;
  disconnectionReasonCode?: number | null;
  ownerNumber?: string | null;
  elapsedMs: number;
}

export const PropertySettingsClient = {
  /**
   * Grava um pedaço de `settings` (merge raso no banco) e/ou colunas reais.
   * Devolve a Property fresca — passe para `setProperty()` do PropertyContext.
   *
   * Merge RASO: para alterar um campo aninhado, mande o subobjeto inteiro
   * (ex.: `{ fbSettings: {...tudo} }`, não `{ "fbSettings.breakfast": ... }`).
   */
  async patch(
    propertyId: string,
    patch: Record<string, unknown>,
    columns?: { name?: string; logoUrl?: string; theme?: unknown },
  ): Promise<Property> {
    const json = await handle(await fetch("/api/admin/properties/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId, patch, columns }),
    }));
    return json.property as Property;
  },

  async getIntegrations(propertyId: string): Promise<IntegrationsView> {
    return handle(await fetch(`/api/admin/properties/integrations?propertyId=${encodeURIComponent(propertyId)}`));
  },

  /** Segredos são write-only: chave ausente mantém, "" limpa, valor substitui. */
  async saveIntegrations(body: {
    propertyId: string;
    config?: Record<string, unknown>;
    secrets?: { evolutionApiKey?: string; chatwootApiToken?: string };
  }) {
    return handle(await fetch("/api/admin/properties/integrations", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }));
  },

  /** Só prova que a credencial foi aceita — não prova que a instância entrega. */
  async testIntegration(propertyId: string, target: "evolution" | "chatwoot"): Promise<{ ok: boolean; message: string }> {
    return handle(await fetch("/api/admin/properties/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId, target }),
    }));
  },

  /**
   * Diagnóstico da sessão de WhatsApp, observado de FORA da Evolution — é o único
   * ponto de vista que enxerga o processo travado (ele não relata a própria trava).
   */
  async whatsappSession(propertyId: string): Promise<WhatsAppSessionView> {
    return handle(await fetch(
      `/api/admin/whatsapp/session?propertyId=${encodeURIComponent(propertyId)}`,
      { cache: "no-store" },
    ));
  },

  /** `logout` derruba a sessão de propósito (necessário quando ela está zumbi). */
  async whatsappReconnect(propertyId: string, action: "reconnect" | "logout"): Promise<{
    ok: boolean; message?: string; qr?: string | null; pairingCode?: string | null; needsLogout?: boolean;
  }> {
    return handle(await fetch("/api/admin/whatsapp/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId, action }),
    }));
  },
};
