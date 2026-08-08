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
  CrmLead,
  DEFAULT_CRM_CHANNELS,
  DEFAULT_QUOTE_LEAD,
  RateQuoteRecord,
  Wedding,
  WeddingLeadSettings,
} from "@/types/aura";
import { resolveQuoteValue } from "@/lib/rate-engine";

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

  // ── Pipeline do Hub Comercial ──────────────────────────────────────────────

  /**
   * Os dois funis normalizados para CrmLead. Ativos sempre; fechados
   * (won/lost/completed/cancelled) só dos últimos 60 dias — o hub é operação,
   * não arquivo (histórico completo fica nas telas de origem e nos KPIs).
   */
  async getPipeline(propertyId: string): Promise<{ leads: CrmLead[]; channels: CrmChannel[] }> {
    const cutoff = new Date(Date.now() - 60 * 86400000).toISOString();

    const [quotesRes, weddingsRes, channels] = await Promise.all([
      supabaseAdmin
        .from("rate_quotes").select("*")
        .eq("propertyId", propertyId)
        .or(`status.in.(open,sent,negotiating),updatedAt.gte.${cutoff}`)
        .order("createdAt", { ascending: false })
        .limit(500),
      supabaseAdmin
        .from("weddings").select("*")
        .eq("propertyId", propertyId)
        .or(`status.in.(tentative,confirmed),updatedAt.gte.${cutoff}`)
        .order("weddingDate", { ascending: true })
        .limit(500),
      this.getChannels(propertyId),
    ]);

    const quoteLeads: CrmLead[] = ((quotesRes.data || []) as RateQuoteRecord[]).map((q) => {
      const v = resolveQuoteValue(q);
      return {
        entityType: "quote",
        id: q.id,
        title: q.clientName || "Sem nome",
        phone: q.clientPhone,
        email: q.clientEmail,
        source: q.source,
        stage: q.status,
        value: v.value,
        valueApproximate: v.approximate,
        dateRef: q.checkIn,
        followUpAt: q.followUpAt,
        expiresAt: q.expiresAt,
        lostReason: q.lostReason,
        guestId: q.guestId,
        stayId: q.stayId,
        weddingId: q.weddingId,
        createdAt: q.createdAt,
      };
    });

    const weddingLeads: CrmLead[] = ((weddingsRes.data || []) as Wedding[]).map((w) => ({
      entityType: "wedding",
      id: w.id,
      title: `${w.bride} & ${w.groom}`,
      phone: w.couplePhone,
      email: w.coupleEmail,
      source: w.source,
      stage: w.status,
      value: Number(w.contractTotal) || 0,
      valueApproximate: false,
      dateRef: w.weddingDate,
      followUpAt: w.followUpAt,
      expiresAt: w.expiresAt,
      lostReason: w.lostReason,
      guestId: null,
      stayId: null,
      weddingId: w.id,
      createdAt: w.createdAt,
    }));

    return { leads: [...quoteLeads, ...weddingLeads], channels };
  },

  /**
   * Follow-up de ORÇAMENTO: renova prazos com crmQuoteLead (o de casamento
   * vive em WeddingService.registerFollowUp). Teto: check-in.
   */
  async registerQuoteFollowUp(
    propertyId: string,
    id: string,
    note: string | undefined,
    actor: { id: string; name: string }
  ): Promise<{ followUpAt: string; expiresAt: string }> {
    const s = await this.getQuoteLeadSettings(propertyId);
    const { data } = await supabaseAdmin
      .from("rate_quotes").select("checkIn").eq("id", id).eq("propertyId", propertyId).maybeSingle();
    if (!data) throw new Error("Orçamento não encontrado.");

    const today = localToday();
    let expiresAt = addDays(today, s.renewDays);
    if (data.checkIn && data.checkIn < expiresAt) expiresAt = data.checkIn;
    let followUpAt = addDays(today, s.followUpDays);
    if (followUpAt > expiresAt) followUpAt = expiresAt;

    const { error } = await supabaseAdmin
      .from("rate_quotes")
      .update({ followUpAt, expiresAt, updatedAt: new Date().toISOString() })
      .eq("id", id)
      .eq("propertyId", propertyId);
    if (error) throw new Error(error.message);

    await this.logInteraction(propertyId, "quote", id, "follow_up", {
      note: note?.trim() || null,
      actorId: actor.id, actorName: actor.name,
      payload: { followUpAt, expiresAt },
    });

    return { followUpAt, expiresAt };
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
