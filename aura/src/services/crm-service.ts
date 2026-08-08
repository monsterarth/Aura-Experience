// CRM — base compartilhada dos dois funis (orçamentos de reserva + casamentos):
// histórico de interações, canais de origem e prazos padrão de orçamento.
// Server-only (supabaseAdmin + mergePropertySettings).
import { supabaseAdmin } from "@/lib/supabase";
import { mergePropertySettings } from "@/lib/property-settings";
import {
  CrmChannel,
  CrmEntityType,
  CrmInteraction,
  CrmInteractionKind,
  DEFAULT_CRM_CHANNELS,
  DEFAULT_QUOTE_LEAD,
  WeddingLeadSettings,
} from "@/types/aura";

function localToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Slug de canal: minúsculo, sem acento, só [a-z0-9-]. */
function slugify(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

export const CrmService = {
  /**
   * Registra uma linha no histórico comercial. NUNCA lança: o histórico é
   * complemento — a falha dele não pode derrubar a operação principal.
   */
  async logInteraction(
    propertyId: string,
    entityType: CrmEntityType,
    entityId: string,
    kind: CrmInteractionKind,
    opts?: { note?: string | null; payload?: Record<string, unknown>; actorId?: string | null; actorName?: string | null }
  ): Promise<void> {
    try {
      await supabaseAdmin.from("crm_interactions").insert({
        id: crypto.randomUUID(),
        propertyId,
        entityType,
        entityId,
        kind,
        note: opts?.note ?? null,
        payload: opts?.payload ?? {},
        actorId: opts?.actorId ?? null,
        actorName: opts?.actorName ?? null,
        createdAt: new Date().toISOString(),
      });
    } catch (e) {
      console.error(`[CRM] Falha ao registrar interação ${kind} em ${entityType}/${entityId}:`, e);
    }
  },

  async getInteractions(
    propertyId: string,
    entityType: CrmEntityType,
    entityId: string
  ): Promise<CrmInteraction[]> {
    const { data, error } = await supabaseAdmin
      .from("crm_interactions")
      .select("*")
      .eq("propertyId", propertyId)
      .eq("entityType", entityType)
      .eq("entityId", entityId)
      .order("createdAt", { ascending: false })
      .limit(200);
    if (error) { console.error("[CRM] Falha ao ler interações:", error.message); return []; }
    return (data || []) as CrmInteraction[];
  },

  // ── Canais de origem ───────────────────────────────────────────────────────

  async getChannels(propertyId: string): Promise<CrmChannel[]> {
    const { data } = await supabaseAdmin
      .from("properties").select("settings").eq("id", propertyId).maybeSingle();
    const saved = (data?.settings as { crmChannels?: CrmChannel[] } | null)?.crmChannels;
    if (Array.isArray(saved) && saved.length > 0) {
      const clean = saved.filter((c) => c && typeof c.id === "string" && typeof c.label === "string");
      if (clean.length > 0) return clean;
    }
    return DEFAULT_CRM_CHANNELS;
  },

  /** Sanitiza (slug estável, sem duplicata) e grava via allowlist central. */
  async saveChannels(propertyId: string, channels: CrmChannel[]): Promise<CrmChannel[]> {
    const seen = new Set<string>();
    const clean: CrmChannel[] = [];
    for (const c of channels || []) {
      const label = String(c?.label ?? "").trim().slice(0, 40);
      if (!label) continue;
      const id = slugify(String(c?.id ?? "").trim() || label);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      clean.push({ id, label });
      if (clean.length >= 30) break;
    }
    if (clean.length === 0) throw new Error("Informe ao menos um canal.");
    await mergePropertySettings(propertyId, { crmChannels: clean });
    return clean;
  },

  // ── Prazos padrão dos orçamentos ───────────────────────────────────────────

  async getQuoteLeadSettings(propertyId: string): Promise<WeddingLeadSettings> {
    const { data } = await supabaseAdmin
      .from("properties").select("settings").eq("id", propertyId).maybeSingle();
    const saved = (data?.settings as { crmQuoteLead?: Partial<WeddingLeadSettings> } | null)?.crmQuoteLead;
    return {
      followUpDays: Number(saved?.followUpDays) > 0 ? Number(saved!.followUpDays) : DEFAULT_QUOTE_LEAD.followUpDays,
      expiryDays:   Number(saved?.expiryDays)   > 0 ? Number(saved!.expiryDays)   : DEFAULT_QUOTE_LEAD.expiryDays,
      renewDays:    Number(saved?.renewDays)    > 0 ? Number(saved!.renewDays)    : DEFAULT_QUOTE_LEAD.renewDays,
    };
  },

  async saveQuoteLeadSettings(propertyId: string, lead: WeddingLeadSettings): Promise<void> {
    await mergePropertySettings(propertyId, { crmQuoteLead: lead });
  },

  /**
   * Prazos iniciais de um orçamento novo. A validade nunca passa do check-in:
   * cotação para daqui a 5 dias não pode ter lead válido por 30.
   */
  async initialQuoteLeadDates(
    propertyId: string,
    checkIn?: string | null
  ): Promise<{ followUpAt: string; expiresAt: string }> {
    const s = await this.getQuoteLeadSettings(propertyId);
    const today = localToday();
    let expiresAt = addDays(today, s.expiryDays);
    if (checkIn && checkIn < expiresAt) expiresAt = checkIn;
    let followUpAt = addDays(today, s.followUpDays);
    if (followUpAt > expiresAt) followUpAt = expiresAt;
    return { followUpAt, expiresAt };
  },
};
