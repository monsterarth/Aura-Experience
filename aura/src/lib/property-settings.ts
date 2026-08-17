// src/lib/property-settings.ts
//
// Escrita em properties.settings — SERVER-ONLY. Ponto único por onde toda alteração
// passa, para que o merge aconteça no banco (ver migrations/merge_property_settings.sql)
// e não por read-modify-write do objeto inteiro em cinco lugares diferentes.
//
// O merge é RASO: mandar `fbSettings` substitui o objeto `fbSettings` inteiro. Quem
// altera um campo aninhado carrega o subobjeto completo.
import { supabaseAdmin } from "@/lib/supabase";
import { UserRole } from "@/types/aura";

/**
 * Allowlist de chaves de `settings` + quem pode escrever cada uma.
 *
 * Chave fora desta lista é recusada — é o que impede um `manager` de virar o
 * customDomain (que roteia o portal) ou desligar um módulo pago.
 */
export const SETTINGS_KEY_ROLES: Record<string, UserRole[]> = {
  // Plataforma: mexe em roteamento de domínio e em módulo contratado.
  customDomain: ["super_admin"],
  hasStock: ["super_admin"],
  hasBreakfast: ["super_admin"],
  hasKDS: ["super_admin"],

  // Identidade e integrações.
  slogan: ["super_admin", "admin"],
  logoFullUrl: ["super_admin", "admin"],
  whatsappEnabled: ["super_admin", "admin"],
  whatsappNumber: ["super_admin", "admin"],
  whatsappConfig: ["super_admin", "admin"],
  mapConfig: ["super_admin", "admin"],
  areaReviews: ["super_admin", "admin", "manager"],

  // Políticas (texto que o hóspede lê).
  generalPolicyText: ["super_admin", "admin"],
  privacyPolicyText: ["super_admin", "admin"],
  petPolicyText: ["super_admin", "admin"],

  // Operação do dia a dia.
  checkInTime: ["super_admin", "admin", "manager"],
  checkOutTime: ["super_admin", "admin", "manager"],
  receptionStartTime: ["super_admin", "admin", "manager"],
  receptionEndTime: ["super_admin", "admin", "manager"],
  acceptsPets: ["super_admin", "admin", "manager"],
  petMinWeight: ["super_admin", "admin", "manager"],
  petMaxWeight: ["super_admin", "admin", "manager"],
  maxPets: ["super_admin", "admin", "manager"],
  petPolicyAlert: ["super_admin", "admin", "manager"],
  earlyCheckInMessage: ["super_admin", "admin", "manager"],
  lateCheckInMessage: ["super_admin", "admin", "manager"],
  fbSettings: ["super_admin", "admin", "manager", "kitchen"],
  weddingLead: ["super_admin", "admin", "manager"],
  crmChannels: ["super_admin", "admin", "manager"],
  crmQuoteLead: ["super_admin", "admin", "manager"],

  // Chaves LEGADAS saíram desta lista junto com a tela antiga que as escrevia:
  //   govStartTime · govEndTime · maintenanceStartTime · maintenanceEndTime
  //     → eram gravadas e nunca lidas por ninguém.
  //   breakfastModality · buffetStartTime/EndTime · deliveryStartTime/EndTime
  //     → substituídas por `fbSettings`, que é quem o portal lê de verdade.
  // Os valores continuam no banco (inofensivos); o que acabou foi a escrita. Fora
  // da allowlist, tentar gravá-las agora devolve 400 em vez de ressuscitar o legado.
};

/**
 * Remove segredos de integração de um objeto `property` antes de devolvê-lo ao
 * NAVEGADOR. A fonte única dos segredos é o cofre `property_secrets` (service-role,
 * fora de `settings`) — o texto puro em `settings.whatsappConfig` foi apagado em
 * migrations/property_secrets_cleanup.sql. Esta função é a trava de garantia: caso
 * um resíduo legado sobreviva (ou seja reintroduzido por bug), a chave nunca chega
 * ao cliente. O navegador só precisa dos campos públicos (apiUrl/instanceName/…),
 * que continuam intactos.
 */
export function sanitizePropertyForClient<T extends Record<string, any> | null | undefined>(property: T): T {
  const settings = (property as any)?.settings;
  const wa = settings?.whatsappConfig;
  if (!wa || typeof wa !== 'object') return property;
  if (!('apiKey' in wa) && !('chatwootApiToken' in wa)) return property;
  const { apiKey, chatwootApiToken, ...safeWa } = wa;
  return {
    ...(property as any),
    settings: { ...settings, whatsappConfig: safeWa },
  };
}

export interface SettingsPatchRejection {
  unknown: string[];
  forbidden: string[];
}

/** Separa o que pode ser gravado do que deve ser recusado, dado o cargo. */
export function validateSettingsPatch(
  patch: Record<string, unknown>,
  role: UserRole,
  secondaryRoles: UserRole[] = [],
): { allowed: Record<string, unknown>; rejected: SettingsPatchRejection } {
  const allowed: Record<string, unknown> = {};
  const rejected: SettingsPatchRejection = { unknown: [], forbidden: [] };
  const roles = [role, ...secondaryRoles];

  for (const [key, value] of Object.entries(patch)) {
    const permitted = SETTINGS_KEY_ROLES[key];
    if (!permitted) { rejected.unknown.push(key); continue; }
    if (!roles.some((r) => permitted.includes(r))) { rejected.forbidden.push(key); continue; }
    allowed[key] = value;
  }
  return { allowed, rejected };
}

/**
 * Aplica o patch via RPC (merge dentro do UPDATE). Devolve o `settings` resultante.
 * Diferente do antigo PropertyService.updateProperty, **lança** em erro — a falha
 * silenciosa era a raiz de "salvei e não gravou".
 */
export async function mergePropertySettings(
  propertyId: string,
  patch: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!supabaseAdmin) throw new Error("mergePropertySettings é server-only.");
  if (Object.keys(patch).length === 0) return {};

  const { data, error } = await supabaseAdmin.rpc("merge_property_settings", {
    p_id: propertyId,
    p_patch: patch,
  });
  if (error) throw new Error(error.message);
  return (data ?? {}) as Record<string, unknown>;
}
