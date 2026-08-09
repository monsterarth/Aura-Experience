// CRM — base compartilhada dos dois funis (orçamentos de reserva + casamentos):
// histórico de interações, canais de origem e prazos padrão de orçamento.
// Server-only (supabaseAdmin + mergePropertySettings).
import { supabaseAdmin } from "@/lib/supabase";
import { mergePropertySettings } from "@/lib/property-settings";
import {
  CrmAlarm,
  CrmAlarmKind,
  CrmChannel,
  CrmEntityType,
  CrmInteraction,
  CrmInteractionKind,
  CrmLead,
  DEFAULT_CRM_CHANNELS,
  DEFAULT_QUOTE_LEAD,
  Guest,
  RateQuoteRecord,
  WaitlistEntry,
  WaitlistStatus,
  Wedding,
  WeddingLeadSettings,
} from "@/types/aura";
import { resolveQuoteValue } from "@/lib/rate-engine";
import { GuestService } from "./guest-service";

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
   * Funis normalizados para CrmLead. Ativos sempre; fechados
   * (won/lost/completed/cancelled) só dos últimos 60 dias — o hub é operação,
   * não arquivo (histórico completo fica nas telas de origem e nos KPIs).
   * `funnel` limita a UM funil (as páginas agora são separadas) e pula a
   * query do outro.
   */
  async getPipeline(
    propertyId: string,
    funnel?: CrmEntityType,
  ): Promise<{ leads: CrmLead[]; channels: CrmChannel[] }> {
    const cutoff = new Date(Date.now() - 60 * 86400000).toISOString();
    const empty = Promise.resolve({ data: [] as unknown[] });

    const [quotesRes, weddingsRes, channels] = await Promise.all([
      funnel === "wedding" ? empty : supabaseAdmin
        .from("rate_quotes").select("*")
        .eq("propertyId", propertyId)
        .or(`status.in.(open,sent,negotiating),updatedAt.gte.${cutoff}`)
        .order("createdAt", { ascending: false })
        .limit(500),
      funnel === "quote" ? empty : supabaseAdmin
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
        negotiatedValue: q.negotiatedValue ?? null,
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

  // ── Titular do lead (cliente) ──────────────────────────────────────────────

  /**
   * Cotações de um cliente — por vínculo (guestId) e/ou telefone. O telefone
   * casa pelo sufixo (últimos 8 dígitos): DDI inconsistente entre épocas.
   * A query em rate_quotes fica aqui (e não no RateService) de propósito:
   * rate-service já importa crm-service e o inverso criaria ciclo.
   */
  async listQuotesByClient(
    propertyId: string,
    by: { guestId?: string | null; phone?: string | null }
  ): Promise<RateQuoteRecord[]> {
    const ors: string[] = [];
    if (by.guestId) ors.push(`guestId.eq.${by.guestId}`);
    const digits = (by.phone || "").replace(/\D/g, "");
    if (digits.length >= 8) ors.push(`clientPhone.like.*${digits.slice(-8)}`);
    if (ors.length === 0) return [];

    const { data } = await supabaseAdmin
      .from("rate_quotes")
      .select("*")
      .eq("propertyId", propertyId)
      .or(ors.join(","))
      .order("createdAt", { ascending: false })
      .limit(50);
    return (data || []) as RateQuoteRecord[];
  },

  /**
   * Contexto do titular numa chamada só (painel do cliente no drawer):
   * ficha vinculada, nº de estadias (recorrente vs novo), fichas com o mesmo
   * telefone (sugestão de vínculo) e as cotações do cliente.
   */
  async getClientContext(
    propertyId: string,
    by: { guestId?: string | null; phone?: string | null }
  ): Promise<{ guest: Guest | null; staysCount: number; phoneMatches: Guest[]; quotes: RateQuoteRecord[] }> {
    const [guestRes, phoneMatches, quotes] = await Promise.all([
      by.guestId
        ? supabaseAdmin.from("guests").select("*")
            .eq("id", by.guestId).eq("propertyId", propertyId).maybeSingle()
        : Promise.resolve({ data: null }),
      by.phone ? GuestService.findByPhone(propertyId, by.phone) : Promise.resolve([] as Guest[]),
      this.listQuotesByClient(propertyId, by),
    ]);

    const guest = (guestRes.data as Guest | null) ?? null;

    let staysCount = 0;
    if (guest) {
      const { count } = await supabaseAdmin
        .from("stays")
        .select("id", { count: "exact", head: true })
        .eq("propertyId", propertyId)
        .eq("guestId", guest.id);
      staysCount = count ?? 0;
    }

    // A ficha já vinculada não é "sugestão" — sai da lista de matches.
    return {
      guest,
      staysCount,
      phoneMatches: phoneMatches.filter((g) => g.id !== guest?.id),
      quotes,
    };
  },

  // ── Alarmes (follow-up, cobrança, lembrete) ────────────────────────────────

  /**
   * Alarmes abertos, mais urgente primeiro. `entityType` filtra a fila de um
   * funil; `entityId` filtra o drawer de um lead. Concluídos não voltam aqui —
   * viram 'alarm_done' na timeline do lead.
   */
  async listAlarms(
    propertyId: string,
    opts?: { entityType?: CrmEntityType; entityId?: string }
  ): Promise<CrmAlarm[]> {
    let q = supabaseAdmin
      .from("crm_alarms")
      .select("*")
      .eq("propertyId", propertyId)
      .eq("done", false)
      .order("dueAt", { ascending: true })
      .order("createdAt", { ascending: true })
      .limit(300);
    if (opts?.entityType) q = q.eq("entityType", opts.entityType);
    if (opts?.entityId) q = q.eq("entityId", opts.entityId);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data || []) as CrmAlarm[];
  },

  /** Criação NÃO loga na timeline — seria ruído; só a conclusão vira registro. */
  async createAlarm(
    propertyId: string,
    input: {
      entityType: CrmEntityType; entityId: string; entityLabel: string;
      kind: CrmAlarmKind; title: string; note?: string | null;
      dueAt: string; dueTime?: string | null;
    },
    actor: { id: string; name: string }
  ): Promise<CrmAlarm> {
    const KINDS: CrmAlarmKind[] = ["follow_up", "payment", "reminder", "other"];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueAt || "")) throw new Error("Data do alarme inválida.");
    if (!input.title?.trim()) throw new Error("Título do alarme obrigatório.");
    if (input.entityType !== "quote" && input.entityType !== "wedding") throw new Error("Tipo inválido.");
    if (!input.entityId) throw new Error("Lead do alarme ausente.");

    const { data, error } = await supabaseAdmin
      .from("crm_alarms")
      .insert({
        propertyId,
        entityType: input.entityType,
        entityId: input.entityId,
        entityLabel: input.entityLabel?.trim() || "Lead",
        kind: KINDS.includes(input.kind) ? input.kind : "reminder",
        title: input.title.trim(),
        note: input.note?.trim() || null,
        dueAt: input.dueAt,
        dueTime: input.dueTime && /^\d{2}:\d{2}$/.test(input.dueTime) ? input.dueTime : null,
        createdBy: actor.id,
        createdByName: actor.name,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as CrmAlarm;
  },

  async setAlarmDone(
    propertyId: string,
    id: string,
    done: boolean,
    actor: { id: string; name: string }
  ): Promise<CrmAlarm> {
    const { data, error } = await supabaseAdmin
      .from("crm_alarms")
      .update(done
        ? { done: true, doneAt: new Date().toISOString(), doneBy: actor.id, doneByName: actor.name }
        : { done: false, doneAt: null, doneBy: null, doneByName: null })
      .eq("id", id)
      .eq("propertyId", propertyId)
      .select("*")
      .single();
    if (error || !data) throw new Error(error?.message || "Alarme não encontrado.");

    const alarm = data as CrmAlarm;
    if (done) {
      await this.logInteraction(propertyId, alarm.entityType, alarm.entityId, "alarm_done", {
        actorId: actor.id, actorName: actor.name,
        payload: { title: alarm.title, kind: alarm.kind, dueAt: alarm.dueAt },
      });
    }
    return alarm;
  },

  async deleteAlarm(propertyId: string, id: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from("crm_alarms")
      .delete()
      .eq("id", id)
      .eq("propertyId", propertyId);
    if (error) throw new Error(error.message);
  },

  // ── Lista de espera ────────────────────────────────────────────────────────

  async listWaitlist(propertyId: string): Promise<WaitlistEntry[]> {
    const { data, error } = await supabaseAdmin
      .from("waitlist_entries")
      .select("*")
      .eq("propertyId", propertyId)
      .order("periodStart", { ascending: true })
      .order("createdAt", { ascending: true })
      .limit(300);
    if (error) throw new Error(error.message);
    return (data ?? []) as WaitlistEntry[];
  },

  async getWaitlistEntry(propertyId: string, id: string): Promise<WaitlistEntry | null> {
    const { data } = await supabaseAdmin
      .from("waitlist_entries")
      .select("*")
      .eq("id", id)
      .eq("propertyId", propertyId)
      .maybeSingle();
    return (data as WaitlistEntry | null) ?? null;
  },

  async createWaitlistEntry(
    propertyId: string,
    input: {
      name: string; phone?: string | null; email?: string | null;
      periodStart: string; periodEnd: string; guests?: number | null;
      notes?: string | null; source?: string | null;
    },
    actor: { id: string; name: string }
  ): Promise<WaitlistEntry> {
    const ISO = /^\d{4}-\d{2}-\d{2}$/;
    if (!input.name?.trim()) throw new Error("Nome obrigatório.");
    if (!ISO.test(input.periodStart || "") || !ISO.test(input.periodEnd || "")) {
      throw new Error("Período inválido.");
    }
    if (input.periodEnd < input.periodStart) throw new Error("Fim do período antes do início.");

    const { data, error } = await supabaseAdmin
      .from("waitlist_entries")
      .insert({
        propertyId,
        name: input.name.trim(),
        phone: input.phone ? input.phone.replace(/\D/g, "") || null : null,
        email: input.email?.trim() || null,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        guests: Number(input.guests) > 0 ? Number(input.guests) : null,
        notes: input.notes?.trim() || null,
        source: input.source || null,
        createdBy: actor.id,
        createdByName: actor.name,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as WaitlistEntry;
  },

  /** Transições carimbam contactedAt/convertedAt; quoteId fica de rastro. */
  async setWaitlistStatus(
    propertyId: string,
    id: string,
    status: WaitlistStatus,
    opts?: { quoteId?: string | null }
  ): Promise<WaitlistEntry> {
    const VALID: WaitlistStatus[] = ["waiting", "contacted", "converted", "archived"];
    if (!VALID.includes(status)) throw new Error("Status inválido.");

    const patch: Record<string, unknown> = { status };
    if (status === "contacted") patch.contactedAt = new Date().toISOString();
    if (status === "converted") {
      patch.convertedAt = new Date().toISOString();
      if (opts?.quoteId) patch.quoteId = opts.quoteId;
    }

    const { data, error } = await supabaseAdmin
      .from("waitlist_entries")
      .update(patch)
      .eq("id", id)
      .eq("propertyId", propertyId)
      .select("*")
      .single();
    if (error || !data) throw new Error(error?.message || "Entrada não encontrada.");
    return data as WaitlistEntry;
  },

  async deleteWaitlistEntry(propertyId: string, id: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from("waitlist_entries")
      .delete()
      .eq("id", id)
      .eq("propertyId", propertyId);
    if (error) throw new Error(error.message);
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
