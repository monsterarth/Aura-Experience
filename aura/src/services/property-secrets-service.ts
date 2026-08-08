// src/services/property-secrets-service.ts
//
// SEGREDOS DE INTEGRAÇÃO POR PROPRIEDADE — apiKey da Evolution, token do Chatwoot.
//
// Regra do arquivo: nada aqui pode ser importado por componente de cliente. A tabela
// `property_secrets` tem RLS sem policy e GRANT revogado, então só a service-role lê —
// se este módulo cair no bundle do navegador, ele não vaza segredo (não tem como ler),
// mas quebra em runtime. Use a rota /api/admin/properties/integrations no cliente.
//
// O cofre é a ÚNICA fonte. Existiu um fallback que lia `settings.whatsappConfig`
// enquanto a cópia em texto puro sobrevivia lá; ela foi apagada em
// migrations/property_secrets_cleanup.sql e o fallback saiu junto. Não reintroduzir:
// ele mascararia um cofre vazio, transformando "segredo faltando" em "segredo velho".
import { supabaseAdmin } from "@/lib/supabase";

export interface PropertySecrets {
  evolutionApiKey: string | null;
  chatwootApiToken: string | null;
}

const EMPTY: PropertySecrets = { evolutionApiKey: null, chatwootApiToken: null };

/** Cache curto por instância: o cron de mensagens resolve segredo por mensagem em loop. */
const TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: PropertySecrets }>();

function db() {
  if (!supabaseAdmin) {
    throw new Error("PropertySecretsService é server-only (supabaseAdmin ausente no browser).");
  }
  return supabaseAdmin;
}

function maskOf(value: string | null): string | null {
  if (!value) return null;
  return value.length <= 4 ? "••••" : `••••${value.slice(-4)}`;
}

export const PropertySecretsService = {
  async get(propertyId: string): Promise<PropertySecrets> {
    if (!propertyId) return { ...EMPTY };
    const hit = cache.get(propertyId);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

    const { data } = await db()
      .from("property_secrets").select("secrets").eq("propertyId", propertyId).maybeSingle();
    const stored = (data?.secrets ?? {}) as Partial<PropertySecrets>;

    const value: PropertySecrets = {
      evolutionApiKey: stored.evolutionApiKey ?? null,
      chatwootApiToken: stored.chatwootApiToken ?? null,
    };

    cache.set(propertyId, { at: Date.now(), value });
    return value;
  },

  /**
   * Grava só as chaves PRESENTES no patch (semântica write-only do formulário):
   * ausente = mantém, "" = limpa, valor = substitui.
   */
  async set(propertyId: string, patch: Partial<Record<keyof PropertySecrets, string>>): Promise<void> {
    const entries = Object.entries(patch).filter(([, v]) => v !== undefined) as [keyof PropertySecrets, string][];
    if (entries.length === 0) return;

    const { data } = await db()
      .from("property_secrets").select("secrets").eq("propertyId", propertyId).maybeSingle();
    const next: Record<string, string> = { ...((data?.secrets ?? {}) as Record<string, string>) };
    for (const [k, v] of entries) {
      if (v === "") delete next[k]; else next[k] = v;
    }

    const { error } = await db().from("property_secrets")
      .upsert({ propertyId, secrets: next, updatedAt: new Date().toISOString() });
    if (error) throw error;
    cache.delete(propertyId);
  },

  /**
   * Versão segura para a UI: diz SE existe e mostra os 4 últimos dígitos. Nunca o valor.
   *
   * Havia aqui um par `secure*` que distinguia "está no cofre" de "está em settings" —
   * a distinção existia só para decidir quando era seguro apagar o texto puro. Com o
   * texto puro apagado e o fallback removido, as duas respostas viraram a mesma.
   */
  async describe(propertyId: string) {
    const s = await this.get(propertyId);
    return {
      hasEvolutionApiKey: !!s.evolutionApiKey,
      evolutionApiKeyMask: maskOf(s.evolutionApiKey),
      hasChatwootApiToken: !!s.chatwootApiToken,
      chatwootApiTokenMask: maskOf(s.chatwootApiToken),
    };
  },
};
