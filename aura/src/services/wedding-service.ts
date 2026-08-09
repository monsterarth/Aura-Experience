import { supabaseAdmin } from "@/lib/supabase";
import { mergePropertySettings } from "@/lib/property-settings";
import { AuditService } from "./audit-service";
import { CrmService } from "./crm-service";
import {
  Wedding, WeddingVendor, WeddingCabinAssignment, WeddingInstallment,
  WeddingStatus, WeddingLeadSettings, DEFAULT_WEDDING_LEAD,
} from "@/types/aura";

/** Data local da pousada — o servidor roda em UTC e viraria o dia às 21h. */
function localToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const WeddingService = {

  async getWeddings(propertyId: string): Promise<Wedding[]> {
    const { data, error } = await supabaseAdmin
      .from("weddings")
      .select("*, vendors:wedding_vendors(*), cabinAssignments:wedding_cabin_assignments(*), installments:wedding_installments(*)")
      .eq("propertyId", propertyId)
      .order("weddingDate", { ascending: true });

    if (error) { console.error("Error fetching weddings:", error); return []; }
    return (data ?? []) as Wedding[];
  },

  async getWeddingById(propertyId: string, id: string): Promise<Wedding | null> {
    const { data, error } = await supabaseAdmin
      .from("weddings")
      .select("*, vendors:wedding_vendors(*), cabinAssignments:wedding_cabin_assignments(*), installments:wedding_installments(*)")
      .eq("id", id)
      .eq("propertyId", propertyId)
      .single();

    if (error || !data) return null;
    return data as Wedding;
  },

  async createWedding(
    propertyId: string,
    payload: Omit<Wedding, "id" | "createdAt" | "updatedAt" | "vendors" | "cabinAssignments">
  ): Promise<string> {
    const { data, error } = await supabaseAdmin
      .from("weddings")
      .insert({ ...payload, propertyId })
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return data.id;
  },

  async updateWedding(
    id: string,
    payload: Partial<Omit<Wedding, "id" | "createdAt" | "updatedAt" | "vendors" | "cabinAssignments">>
  ): Promise<void> {
    const { error } = await supabaseAdmin
      .from("weddings")
      .update({ ...payload, updatedAt: new Date().toISOString() })
      .eq("id", id);

    if (error) throw new Error(error.message);
  },

  async deleteWedding(id: string): Promise<void> {
    const { error } = await supabaseAdmin.from("weddings").delete().eq("id", id);
    if (error) throw new Error(error.message);
  },

  /**
   * Marca como 'completed' os casamentos CONFIRMADOS cuja data já passou.
   *
   * Só mexe em 'confirmed': um 'tentative' que passou é negociação perdida, não
   * casamento realizado — vira receita fantasma no total se for promovido.
   * 'cancelled' e 'completed' ficam como estão.
   */
  async completePastWeddings(propertyId?: string): Promise<{ updated: number; couples: string[] }> {
    // Data local da pousada: às 21h em BRT o UTC já virou e anteciparia um dia.
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

    let query = supabaseAdmin
      .from("weddings")
      .select("id, propertyId, bride, groom, weddingDate")
      .eq("status", "confirmed")
      .lt("weddingDate", today);
    if (propertyId) query = query.eq("propertyId", propertyId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as { id: string; bride: string; groom: string; weddingDate: string }[];
    if (rows.length === 0) return { updated: 0, couples: [] };

    const { error: upErr } = await supabaseAdmin
      .from("weddings")
      .update({ status: "completed", updatedAt: new Date().toISOString() })
      .in("id", rows.map((r) => r.id));
    if (upErr) throw new Error(upErr.message);

    for (const r of rows as (typeof rows[number] & { propertyId?: string })[]) {
      if (r.propertyId) {
        await CrmService.logInteraction(r.propertyId, "wedding", r.id, "stage_change", {
          actorId: "cron", actorName: "Sistema (Cron)",
          payload: { from: "confirmed", to: "completed" },
        });
      }
    }

    return { updated: rows.length, couples: rows.map((r) => `${r.bride} & ${r.groom}`) };
  },

  /**
   * Arquiva negociações vencidas: 'tentative' cuja data já passou vira 'lost'.
   *
   * Aqui a perda é fato consumado — a data do casamento passou e o contrato
   * nunca foi fechado. Diferente de promover para 'completed', que seria
   * inventar um casamento que não aconteceu.
   */
  async archiveLapsedNegotiations(propertyId?: string): Promise<{ updated: number; couples: string[] }> {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

    let query = supabaseAdmin
      .from("weddings")
      .select("id, propertyId, bride, groom, weddingDate")
      .eq("status", "tentative")
      .lt("weddingDate", today);
    if (propertyId) query = query.eq("propertyId", propertyId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as { id: string; bride: string; groom: string }[];
    if (rows.length === 0) return { updated: 0, couples: [] };

    const now = new Date().toISOString();
    const { error: upErr } = await supabaseAdmin
      .from("weddings")
      .update({
        status: "lost",
        lostReason: "Data passou sem confirmação",
        lostAt: now,
        updatedAt: now,
      })
      .in("id", rows.map((r) => r.id));
    if (upErr) throw new Error(upErr.message);

    for (const r of rows as (typeof rows[number] & { propertyId?: string })[]) {
      if (r.propertyId) {
        await CrmService.logInteraction(r.propertyId, "wedding", r.id, "lost", {
          actorId: "cron", actorName: "Sistema (Cron)",
          payload: { reason: "Data passou sem confirmação" },
        });
      }
    }

    return { updated: rows.length, couples: rows.map((r) => `${r.bride} & ${r.groom}`) };
  },

  // ── Validade do lead ────────────────────────────────────────────────────────

  /** Prazos padrão da propriedade (com fallback nos defaults do sistema). */
  async getLeadSettings(propertyId: string): Promise<WeddingLeadSettings> {
    const { data } = await supabaseAdmin
      .from("properties").select("settings").eq("id", propertyId).maybeSingle();
    const saved = (data?.settings as { weddingLead?: Partial<WeddingLeadSettings> } | null)?.weddingLead;
    return {
      followUpDays: Number(saved?.followUpDays) > 0 ? Number(saved!.followUpDays) : DEFAULT_WEDDING_LEAD.followUpDays,
      expiryDays:   Number(saved?.expiryDays)   > 0 ? Number(saved!.expiryDays)   : DEFAULT_WEDDING_LEAD.expiryDays,
      renewDays:    Number(saved?.renewDays)    > 0 ? Number(saved!.renewDays)    : DEFAULT_WEDDING_LEAD.renewDays,
    };
  },

  /** Grava os prazos padrão. O merge acontece no banco — ver lib/property-settings. */
  async saveLeadSettings(propertyId: string, lead: WeddingLeadSettings): Promise<void> {
    await mergePropertySettings(propertyId, { weddingLead: lead });
  },

  /**
   * Prazos iniciais de uma negociação nova. A validade nunca passa da data do
   * evento: um casamento em 10 dias não pode ter lead válido por 45.
   */
  async initialLeadDates(propertyId: string, weddingDate?: string): Promise<{ followUpAt: string; expiresAt: string }> {
    const s = await this.getLeadSettings(propertyId);
    const today = localToday();
    let expiresAt = addDays(today, s.expiryDays);
    if (weddingDate && weddingDate < expiresAt) expiresAt = weddingDate;
    let followUpAt = addDays(today, s.followUpDays);
    if (followUpAt > expiresAt) followUpAt = expiresAt;
    return { followUpAt, expiresAt };
  },

  /**
   * Registra que houve contato: empurra o próximo follow-up e renova a validade.
   * É o que impede um lead ativo de expirar só porque o prazo original venceu.
   */
  async registerFollowUp(
    propertyId: string,
    id: string,
    note?: string
  ): Promise<{ followUpAt: string; expiresAt: string }> {
    const s = await this.getLeadSettings(propertyId);
    const { data } = await supabaseAdmin
      .from("weddings").select("weddingDate").eq("id", id).single();

    const today = localToday();
    let expiresAt = addDays(today, s.renewDays);
    if (data?.weddingDate && data.weddingDate < expiresAt) expiresAt = data.weddingDate;
    let followUpAt = addDays(today, s.followUpDays);
    if (followUpAt > expiresAt) followUpAt = expiresAt;

    const { error } = await supabaseAdmin
      .from("weddings")
      .update({ followUpAt, expiresAt, updatedAt: new Date().toISOString() })
      .eq("id", id)
      .eq("propertyId", propertyId);
    if (error) throw new Error(error.message);

    // A nota vive SÓ no histórico agora: a timeline do hub Comercial é a casa
    // dela (o dual-write com append em `notes` era ponte até o hub existir).
    await CrmService.logInteraction(propertyId, "wedding", id, "follow_up", {
      note: note?.trim() || null,
      payload: { followUpAt, expiresAt },
    });

    return { followUpAt, expiresAt };
  },

  /**
   * Arquiva negociações VENCIDAS (passou a validade do lead, não a data do
   * evento). É o que evita segurar por dois anos um lead de casamento em 2028.
   */
  async archiveExpiredLeads(propertyId?: string): Promise<{ updated: number; couples: string[] }> {
    const today = localToday();

    let query = supabaseAdmin
      .from("weddings")
      .select("id, propertyId, bride, groom, expiresAt")
      .eq("status", "tentative")
      .not("expiresAt", "is", null)
      .lt("expiresAt", today);
    if (propertyId) query = query.eq("propertyId", propertyId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as { id: string; bride: string; groom: string }[];
    if (rows.length === 0) return { updated: 0, couples: [] };

    const now = new Date().toISOString();
    const { error: upErr } = await supabaseAdmin
      .from("weddings")
      .update({
        status: "lost",
        lostReason: "Prazo da negociação vencido sem retorno",
        lostAt: now,
        updatedAt: now,
      })
      .in("id", rows.map((r) => r.id));
    if (upErr) throw new Error(upErr.message);

    for (const r of rows as (typeof rows[number] & { propertyId?: string })[]) {
      if (r.propertyId) {
        await CrmService.logInteraction(r.propertyId, "wedding", r.id, "lost", {
          actorId: "cron", actorName: "Sistema (Cron)",
          payload: { reason: "Prazo da negociação vencido sem retorno" },
        });
      }
    }

    return { updated: rows.length, couples: rows.map((r) => `${r.bride} & ${r.groom}`) };
  },

  /** Marca a negociação como perdida, com motivo. */
  async markAsLost(
    propertyId: string,
    id: string,
    reason: string,
    actor?: { id: string; name: string }
  ): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("weddings")
      .update({ status: "lost", lostReason: reason.trim() || null, lostAt: now, updatedAt: now })
      .eq("id", id)
      .eq("propertyId", propertyId); // defesa em profundidade (a rota já valida posse)
    if (error) throw new Error(error.message);

    await CrmService.logInteraction(propertyId, "wedding", id, "lost", {
      actorId: actor?.id, actorName: actor?.name, payload: { reason: reason.trim() || null },
    });
  },

  // ── Parcelas (wedding_installments) ──────────────────────────────────────────

  async listInstallments(weddingId: string): Promise<WeddingInstallment[]> {
    const { data, error } = await supabaseAdmin
      .from("wedding_installments")
      .select("*")
      .eq("weddingId", weddingId)
      .order("sortOrder", { ascending: true })
      .order("createdAt", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as WeddingInstallment[];
  },

  /** Cria/edita uma parcela. Valor > 0 obrigatório; vencimento é opcional. */
  async saveInstallment(
    weddingId: string,
    input: { id?: string; label: string; value: number; dueDate?: string | null; sortOrder?: number }
  ): Promise<void> {
    const label = input.label?.trim();
    const value = Number(input.value);
    if (!label) throw new Error("Nome da parcela obrigatório.");
    if (!Number.isFinite(value) || value <= 0) throw new Error("Valor da parcela inválido.");
    const dueDate = input.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(input.dueDate) ? input.dueDate : null;

    if (input.id) {
      const { error } = await supabaseAdmin
        .from("wedding_installments")
        .update({ label, value, dueDate, sortOrder: input.sortOrder ?? undefined })
        .eq("id", input.id)
        .eq("weddingId", weddingId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("wedding_installments")
        .insert({ weddingId, label, value, dueDate, sortOrder: input.sortOrder ?? 99 });
      if (error) throw new Error(error.message);
    }
  },

  async deleteInstallment(weddingId: string, id: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from("wedding_installments")
      .delete()
      .eq("id", id)
      .eq("weddingId", weddingId);
    if (error) throw new Error(error.message);
  },

  /**
   * Marca paga/pendente com carimbo (paidAt) e auditoria. Usada pela aba
   * financeiro E pela fila de alarmes (parcela vencida = cobrança virtual;
   * concluir lá cai aqui). A posse é validada pelo join com weddings.
   */
  async setInstallmentPaid(
    propertyId: string,
    installmentId: string,
    paid: boolean,
    actor?: { id: string; name: string }
  ): Promise<WeddingInstallment> {
    const { data: inst } = await supabaseAdmin
      .from("wedding_installments")
      .select("*, wedding:weddings!inner(id, propertyId, bride, groom)")
      .eq("id", installmentId)
      .maybeSingle();
    const parent = (inst as { wedding?: { propertyId?: string; bride?: string; groom?: string } } | null)?.wedding;
    if (!inst || parent?.propertyId !== propertyId) throw new Error("Parcela não encontrada.");

    const { data, error } = await supabaseAdmin
      .from("wedding_installments")
      .update({ paid, paidAt: paid ? new Date().toISOString() : null })
      .eq("id", installmentId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    if (actor) {
      await AuditService.log({
        propertyId, userId: actor.id, userName: actor.name,
        action: "UPDATE", entity: "WEDDING", entityId: (inst as { weddingId: string }).weddingId,
        details: `Parcela "${(inst as { label: string }).label}" de ${parent?.bride} & ${parent?.groom} marcada como ${paid ? "paga" : "pendente"}.`,
      });
    }
    return data as WeddingInstallment;
  },

  /**
   * Parcelas padrão 30/35/35 de um contrato novo (a última absorve o
   * arredondamento). Sem vencimento: data não se inventa.
   */
  async seedDefaultInstallments(weddingId: string, contractTotal: number): Promise<void> {
    const total = Number(contractTotal);
    if (!Number.isFinite(total) || total <= 0) return;
    const v1 = Math.round(total * 0.30 * 100) / 100;
    const v2 = Math.round(total * 0.35 * 100) / 100;
    const v3 = Math.round((total - v1 - v2) * 100) / 100;

    const { error } = await supabaseAdmin.from("wedding_installments").insert([
      { weddingId, label: "1ª parcela — Sinal (30%)",         value: v1, sortOrder: 1 },
      { weddingId, label: "2ª parcela — Intermediária (35%)", value: v2, sortOrder: 2 },
      { weddingId, label: "3ª parcela — Saldo final (35%)",   value: v3, sortOrder: 3 },
    ]);
    if (error) throw new Error(error.message);
  },

  /**
   * Cobranças pendentes: parcelas vencidas e não pagas da propriedade.
   * Alimentam a fila de alarmes do funil de casamentos como linhas virtuais.
   * Casamento cancelado/perdido sai da conta — contrato que caiu não se
   * cobra (senão a parcela vira cobrança perpétua na fila e no badge).
   */
  async listOverdueInstallments(
    propertyId: string
  ): Promise<Array<WeddingInstallment & { couple: string }>> {
    const today = localToday();
    const { data, error } = await supabaseAdmin
      .from("wedding_installments")
      .select("*, wedding:weddings!inner(propertyId, bride, groom, status)")
      .eq("wedding.propertyId", propertyId)
      .not("wedding.status", "in", "(cancelled,lost)")
      .eq("paid", false)
      .not("dueDate", "is", null)
      .lte("dueDate", today)
      .order("dueDate", { ascending: true });
    // Tabela pode não existir antes da migration — a fila segue sem as parcelas.
    if (error) return [];
    return (data ?? []).map((r) => {
      const { wedding, ...inst } = r as WeddingInstallment & { wedding?: { bride?: string; groom?: string } };
      return { ...inst, couple: `${wedding?.bride ?? "?"} & ${wedding?.groom ?? "?"}` };
    });
  },

  // ── Vendors ──────────────────────────────────────────────────────────────────

  async upsertVendor(vendor: Omit<WeddingVendor, "id" | "createdAt"> & { id?: string }): Promise<void> {
    const { error } = await supabaseAdmin
      .from("wedding_vendors")
      .upsert(vendor, { onConflict: "id" });
    if (error) throw new Error(error.message);
  },

  async deleteVendor(id: string): Promise<void> {
    const { error } = await supabaseAdmin.from("wedding_vendors").delete().eq("id", id);
    if (error) throw new Error(error.message);
  },

  // ── Cabin assignments ─────────────────────────────────────────────────────────

  async upsertCabinAssignment(assignment: Omit<WeddingCabinAssignment, "id"> & { id?: string }): Promise<void> {
    const { error } = await supabaseAdmin
      .from("wedding_cabin_assignments")
      .upsert(assignment, { onConflict: "id" });
    if (error) throw new Error(error.message);
  },

  async deleteCabinAssignment(id: string): Promise<void> {
    const { error } = await supabaseAdmin.from("wedding_cabin_assignments").delete().eq("id", id);
    if (error) throw new Error(error.message);
  },
};
