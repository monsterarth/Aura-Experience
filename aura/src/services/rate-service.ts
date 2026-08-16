// Tarifário — CRUD das tabelas de preço, regras de calendário e config
// comercial, mais o contexto de orçamento (disponibilidade real + eventos) e a
// importação do backup do SIT (sistema offline que este módulo substitui).
import { supabaseAdmin } from "@/lib/supabase";
import {
  CabinCategory,
  CrmChannel,
  Guest,
  RateFluctuationRule,
  RatePeriod,
  RateQuoteInput,
  RateQuoteRecord,
  RateQuoteRoom,
  RateQuoteStatus,
  RateSettings,
  RateTable,
  RateTableVersion,
  RateAvailability,
} from "@/types/aura";
import {
  addDays, computeQuote, findOverlaps, MIN_OVER_CAPACITY_REASON, nightsBetween,
  offeredTotal, resolveFill, resolveOverwrite, resolveQuoteValue, resolveRoomValue,
} from "@/lib/rate-engine";
import { AuditService } from "./audit-service";
import { CrmService } from "./crm-service";
import { GuestService } from "./guest-service";

const QUOTE_STATUSES: RateQuoteStatus[] = ["open", "sent", "negotiating", "won", "lost"];

/** Campos de rate_quotes que o PATCH pode alterar (whitelist). */
const QUOTE_PATCH_FIELDS = [
  "clientName", "clientDocument", "clientPhone", "clientEmail",
  "guestId", "stayId", "weddingId", "source",
  "selectedCategory", "finalValue", "negotiatedValue",
  "status", "lostReason", "notes",
  "followUpAt", "expiresAt",
] as const;

const QUOTE_STAGE_LABEL: Record<RateQuoteStatus, string> = {
  open: "Aberto", sent: "Enviado", negotiating: "Negociando", won: "Ganho", lost: "Perdido",
};

/**
 * Assinatura da exceção de capacidade do orçamento (acomodações × categorias ×
 * motivo). Re-salvar sem mexer na exceção não repete a nota na timeline.
 */
function overCapacitySignature(rooms: RateQuoteRoom[] | null | undefined): string {
  return (rooms ?? [])
    .filter((r) => r.allowOverCapacity)
    .map((r) => [
      r.id,
      r.overCapacityReason ?? "",
      r.options.filter((c) => c.overCapacity).map((c) => c.categoryId).sort().join(","),
    ].join(":"))
    .join("|");
}

/** Uma linha legível por acomodação em exceção — vai para a nota e a auditoria. */
function overCapacityDetail(rooms: RateQuoteRoom[]): string {
  return rooms
    .filter((r) => r.allowOverCapacity)
    .map((r) => {
      const pax = r.adults + r.children;
      const exc = r.options
        .filter((c) => c.overCapacity)
        .map((c) => `${c.category} (tabela de ${c.overCapacity!.pricedPax}p para ${pax}p)`)
        .join(", ");
      return `${r.label || "Acomodação"}: ${exc}`;
    })
    .join(" · ");
}

export const DEFAULT_RATE_SETTINGS = (propertyId: string): RateSettings => ({
  propertyId,
  petFee: 50,
  fluctuations: [],
  discounts: [],
  promos: [],
  categoryLinks: {},
  msgTemplate: null,
  msgSingleTemplate: null,
  eventTemplate: null,
  inclusionsText: null,
});

export interface RateBundle {
  tables: RateTable[];
  periods: RatePeriod[];
  settings: RateSettings;
  /** Categorias canônicas da propriedade — chaves das tabelas de preço. */
  categories: CabinCategory[];
  /** Canais de origem de lead (padrão + editáveis por propriedade). */
  channels: CrmChannel[];
  /** Casamentos não-cancelados com saída futura (vínculo no orçamento). */
  weddings: { id: string; couple: string; checkin: string; checkout: string; status: string }[];
  /**
   * Regras de flutuação por período. `null` = migration tarifario_phase4
   * ausente — é O sinal de degradação: a UI esconde a aba/opção Automática
   * e nada tenta escrever nas colunas novas.
   */
  fluctuations: RateFluctuationRule[] | null;
}

export interface SavePeriodResult {
  conflict?: { id: string; name: string; startDate: string; endDate: string }[];
  created: number;
}

export interface SitImportResult {
  tables: number;
  periods: number;
  promos: number;
  discounts: number;
  fluctuations: number;
  skippedWeddings: number;
  skippedEvents: number;
  /** Categorias do backup sem correspondente cadastrado (preços descartados). */
  unmatchedCategories: string[];
}

export const RateService = {
  async getBundle(propertyId: string): Promise<RateBundle> {
    const admin = supabaseAdmin!;
    const today = new Date().toISOString().slice(0, 10);

    const [tablesRes, periodsRes, settingsRes, categoriesRes, channels, weddingsRes, fluctRes] = await Promise.all([
      admin.from("rate_tables").select("*").eq("propertyId", propertyId).order("createdAt"),
      admin.from("rate_periods").select("*").eq("propertyId", propertyId).order("startDate"),
      admin.from("rate_settings").select("*").eq("propertyId", propertyId).maybeSingle(),
      admin.from("cabin_categories").select("*").eq("propertyId", propertyId).order("order"),
      CrmService.getChannels(propertyId),
      admin
        .from("weddings")
        .select("id, bride, groom, checkin, checkout, status")
        .eq("propertyId", propertyId)
        .neq("status", "cancelled")
        .gte("checkout", today)
        .order("checkin"),
      admin.from("rate_fluctuations").select("*").eq("propertyId", propertyId).order("startDate"),
    ]);

    const settings = (settingsRes.data as RateSettings) || DEFAULT_RATE_SETTINGS(propertyId);
    const categories = (categoriesRes.data || []) as CabinCategory[];

    const weddings = ((weddingsRes.data || []) as {
      id: string; bride: string; groom: string; checkin: string; checkout: string; status: string;
    }[]).map((w) => ({
      id: w.id,
      couple: `${w.bride} & ${w.groom}`,
      checkin: w.checkin,
      checkout: w.checkout,
      status: w.status,
    }));

    return {
      tables: (tablesRes.data || []) as RateTable[],
      periods: (periodsRes.data || []) as RatePeriod[],
      settings: {
        ...DEFAULT_RATE_SETTINGS(propertyId),
        ...settings,
        fluctuations: settings.fluctuations || [],
        discounts: settings.discounts || [],
        promos: settings.promos || [],
        categoryLinks: settings.categoryLinks || {},
      },
      categories,
      channels,
      weddings,
      // error = tabela inexistente (migration pendente) → null, não [].
      fluctuations: fluctRes.error ? null : ((fluctRes.data || []) as RateFluctuationRule[]),
    };
  },

  // ── Tabelas de preço ───────────────────────────────────────────────────────

  /**
   * Snapshot best-effort da tabela em rate_table_versions — o histórico de
   * preços. try/catch de propósito: pré-migration a tabela de versões não
   * existe e salvar preço não pode quebrar por causa do histórico.
   */
  async snapshotTable(
    row: Pick<RateTable, "id" | "propertyId" | "name" | "prices">,
    actor?: { id: string; name: string }
  ): Promise<void> {
    try {
      const { error } = await supabaseAdmin!.from("rate_table_versions").insert({
        tableId: row.id,
        propertyId: row.propertyId,
        name: row.name,
        prices: row.prices || {},
        replacedBy: actor?.id ?? null,
        replacedByName: actor?.name ?? null,
      });
      if (error) console.warn("[rate] snapshot de versão falhou (migration phase4 aplicada?):", error.message);
    } catch (e) {
      console.warn("[rate] snapshot de versão falhou:", e);
    }
  },

  async saveTable(
    propertyId: string,
    table: { id?: string; name: string; prices: RateTable["prices"]; archived?: boolean },
    actor?: { id: string; name: string }
  ): Promise<string> {
    const admin = supabaseAdmin!;
    // Upsert por id: garante que um id existente pertence a ESTA propriedade
    // (senão o payload poderia sequestrar a linha de outra).
    let existing: RateTable | null = null;
    if (table.id) {
      const { data } = await admin
        .from("rate_tables")
        .select("*")
        .eq("id", table.id)
        .maybeSingle();
      existing = (data as RateTable) ?? null;
      if (existing && existing.propertyId !== propertyId) {
        throw new Error("Tabela pertence a outra propriedade.");
      }
    }

    // No-op: nada mudou → não escreve nem gera versão (mata o ruído de
    // histórico de quem abre o editor e clica salvar sem mexer).
    if (
      existing &&
      existing.name === table.name &&
      JSON.stringify(existing.prices || {}) === JSON.stringify(table.prices || {})
    ) {
      return existing.id;
    }

    // Mudança real numa tabela existente: a versão ANTIGA vai pro arquivo.
    if (existing) await this.snapshotTable(existing, actor);

    const id = table.id || crypto.randomUUID();
    const row: Record<string, unknown> = {
      id,
      propertyId,
      name: table.name,
      prices: table.prices || {},
      updatedAt: new Date().toISOString(),
    };
    // Import direto para o arquivo (tarifários de anos passados) — a coluna
    // só entra quando pedida, então pré-migration nada tenta escrevê-la.
    if (table.archived) {
      row.archivedAt = new Date().toISOString();
      row.archivedBy = actor?.id ?? null;
    }
    const { error } = await admin.from("rate_tables").upsert(row, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return id;
  },

  async deleteTable(propertyId: string, id: string, actorId: string, actorName: string): Promise<void> {
    const admin = supabaseAdmin!;
    // Último estado sobrevive no arquivo mesmo depois da exclusão.
    const { data: row } = await admin
      .from("rate_tables").select("*")
      .eq("id", id).eq("propertyId", propertyId).maybeSingle();
    if (row) {
      await this.snapshotTable(row as RateTable, { id: actorId, name: actorName });
    }

    const { error } = await admin
      .from("rate_tables")
      .delete()
      .eq("id", id)
      .eq("propertyId", propertyId);
    if (error) throw new Error(error.message);

    await AuditService.log({
      propertyId,
      userId: actorId,
      userName: actorName,
      action: "RATE_TABLE_DELETED",
      entity: "RATE_TABLE",
      entityId: id,
      details: `Tabela de preços "${(row as RateTable | null)?.name ?? id}" excluída (último estado no arquivo).`,
    });
  },

  /**
   * Arquiva/restaura uma tabela. Arquivada some das listas ativas e dos
   * selects de período, mas o MOTOR segue resolvendo regras antigas que
   * apontam para ela — por isso devolvemos `referencedBy` (regras vigentes)
   * para a UI avisar, sem bloquear.
   */
  async archiveTable(
    propertyId: string,
    id: string,
    archived: boolean,
    actor: { id: string; name: string }
  ): Promise<{ referencedBy: { id: string; name: string }[] }> {
    const admin = supabaseAdmin!;
    const today = new Date().toISOString().slice(0, 10);

    const { data: row } = await admin
      .from("rate_tables").select("id, name")
      .eq("id", id).eq("propertyId", propertyId).maybeSingle();
    if (!row) throw new Error("Tabela não encontrada.");

    const { error } = await admin
      .from("rate_tables")
      .update({
        archivedAt: archived ? new Date().toISOString() : null,
        archivedBy: archived ? actor.id : null,
        updatedAt: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("propertyId", propertyId);
    if (error) {
      throw new Error(/archived/i.test(error.message)
        ? "Arquivo indisponível — aplique a migration tarifario_phase4 no Supabase."
        : error.message);
    }

    const { data: refs } = await admin
      .from("rate_periods")
      .select("id, name, endDate")
      .eq("propertyId", propertyId)
      .gte("endDate", today)
      .or(`weekdayTableId.eq.${id},weekendTableId.eq.${id}`);

    await AuditService.log({
      propertyId, userId: actor.id, userName: actor.name,
      action: archived ? "RATE_TABLE_ARCHIVED" : "RATE_TABLE_RESTORED",
      entity: "RATE_TABLE", entityId: id,
      details: `Tabela "${row.name}" ${archived ? "arquivada" : "restaurada do arquivo"}.`,
    });

    return {
      referencedBy: ((refs || []) as { id: string; name: string }[]).map((r) => ({
        id: r.id, name: r.name,
      })),
    };
  },

  /** Linha do tempo de versões de uma tabela (mais recente primeiro). */
  async listTableVersions(propertyId: string, tableId: string): Promise<RateTableVersion[]> {
    const { data, error } = await supabaseAdmin!
      .from("rate_table_versions")
      .select("*")
      .eq("propertyId", propertyId)
      .eq("tableId", tableId)
      .order("replacedAt", { ascending: false })
      .limit(100);
    if (error) return [];   // migration pendente = sem histórico, não erro
    return (data || []) as RateTableVersion[];
  },

  // ── Regras de calendário ───────────────────────────────────────────────────

  /**
   * mode:
   * - 'strict'    → se houver sobreposição, NÃO salva e devolve os conflitos;
   * - 'overwrite' → apara/parte/remove as regras antigas e impõe a nova;
   * - 'fill'      → mantém as antigas e cria a nova só nos buracos livres.
   */
  async savePeriod(
    propertyId: string,
    period: Omit<RatePeriod, "propertyId" | "createdAt"> & { id?: string },
    mode: "strict" | "overwrite" | "fill"
  ): Promise<SavePeriodResult> {
    const admin = supabaseAdmin!;
    const { data } = await admin.from("rate_periods").select("*").eq("propertyId", propertyId);
    const existing = (data || []) as RatePeriod[];
    // id que não é desta propriedade não edita nada — vira criação nova.
    const ownId = period.id && existing.some((p) => p.id === period.id) ? period.id : undefined;
    const next = { ...period, id: ownId, propertyId };

    if (mode === "strict") {
      const overlaps = findOverlaps(existing, next);
      if (overlaps.length > 0) {
        return {
          conflict: overlaps.map((p) => ({
            id: p.id, name: p.name, startDate: p.startDate, endDate: p.endDate,
          })),
          created: 0,
        };
      }
      const { error } = await admin.from("rate_periods").upsert(
        { ...next, id: next.id || crypto.randomUUID() },
        { onConflict: "id" }
      );
      if (error) throw new Error(error.message);
      return { created: 1 };
    }

    const resolution =
      mode === "overwrite" ? resolveOverwrite(existing, next) : resolveFill(existing, next);

    if (resolution.insert.length === 0) return { created: 0 };

    if (resolution.removeIds.length > 0) {
      const { error } = await admin
        .from("rate_periods")
        .delete()
        .in("id", resolution.removeIds)
        .eq("propertyId", propertyId);
      if (error) throw new Error(error.message);
    }

    const rows = resolution.insert.map((p) => ({ ...p, id: crypto.randomUUID(), propertyId }));
    const { error } = await admin.from("rate_periods").insert(rows);
    if (error) throw new Error(error.message);
    return { created: rows.length };
  },

  async deletePeriod(propertyId: string, id: string): Promise<void> {
    const admin = supabaseAdmin!;
    const { error } = await admin
      .from("rate_periods")
      .delete()
      .eq("id", id)
      .eq("propertyId", propertyId);
    if (error) throw new Error(error.message);
  },

  // ── Flutuações por período ─────────────────────────────────────────────────

  /**
   * Atribui um PRESET de flutuação (settings.fluctuations) a um intervalo de
   * datas. O % e o nome do preset são CONGELADOS na regra — editar o preset
   * depois não reprecifica períodos já atribuídos. Mesmos modos de conflito
   * das regras de calendário. TODA escrita é auditada: é o rastro que
   * permite a recepção mexer aqui sem aval de gerente.
   */
  async saveFluctuation(
    propertyId: string,
    rule: { id?: string; presetId: string; startDate: string; endDate: string },
    mode: "strict" | "overwrite" | "fill",
    actor: { id: string; name: string }
  ): Promise<SavePeriodResult> {
    const admin = supabaseAdmin!;
    const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
    if (!ISO_DATE.test(rule.startDate) || !ISO_DATE.test(rule.endDate) || rule.startDate > rule.endDate) {
      throw new Error("Período inválido.");
    }

    const { settings } = await this.getRateData(propertyId);
    const preset = (settings.fluctuations || []).find((f) => f.id === rule.presetId);
    if (!preset) throw new Error("Flutuação não cadastrada — configure em Configurações → Comercial.");

    const { data, error: listError } = await admin
      .from("rate_fluctuations").select("*").eq("propertyId", propertyId);
    if (listError) {
      throw new Error("Flutuações por período indisponíveis — aplique a migration tarifario_phase4 no Supabase.");
    }
    const existing = (data || []) as RateFluctuationRule[];
    const ownId = rule.id && existing.some((f) => f.id === rule.id) ? rule.id : undefined;
    const next: Omit<RateFluctuationRule, "id"> & { id?: string } = {
      id: ownId,
      propertyId,
      presetId: preset.id,
      name: preset.name,
      pct: preset.pct,
      startDate: rule.startDate,
      endDate: rule.endDate,
      createdBy: actor.id,
      createdByName: actor.name,
    };

    const label = `${preset.name} (${preset.pct > 0 ? "+" : ""}${preset.pct}%) · ${rule.startDate} → ${rule.endDate}`;
    const audit = (details: string) => AuditService.log({
      propertyId, userId: actor.id, userName: actor.name,
      action: "RATE_FLUCTUATION_SAVED", entity: "RATE_FLUCTUATION",
      entityId: ownId ?? "nova", details,
    });

    if (mode === "strict") {
      const overlaps = findOverlaps(existing, next);
      if (overlaps.length > 0) {
        return {
          conflict: overlaps.map((f) => ({
            id: f.id, name: f.name || `${f.pct > 0 ? "+" : ""}${f.pct}%`,
            startDate: f.startDate, endDate: f.endDate,
          })),
          created: 0,
        };
      }
      const { error } = await admin.from("rate_fluctuations").upsert(
        { ...next, id: next.id || crypto.randomUUID() },
        { onConflict: "id" }
      );
      if (error) throw new Error(error.message);
      await audit(`Flutuação atribuída: ${label}.`);
      return { created: 1 };
    }

    const resolution =
      mode === "overwrite" ? resolveOverwrite(existing, next) : resolveFill(existing, next);
    if (resolution.insert.length === 0) return { created: 0 };

    if (resolution.removeIds.length > 0) {
      const { error } = await admin
        .from("rate_fluctuations")
        .delete()
        .in("id", resolution.removeIds)
        .eq("propertyId", propertyId);
      if (error) throw new Error(error.message);
    }
    const rows = resolution.insert.map((f) => ({ ...f, id: crypto.randomUUID(), propertyId }));
    const { error } = await admin.from("rate_fluctuations").insert(rows);
    if (error) throw new Error(error.message);
    await audit(`Flutuação atribuída (${mode === "overwrite" ? "sobrepondo" : "preenchendo vazios"}): ${label}.`);
    return { created: rows.length };
  },

  async deleteFluctuation(
    propertyId: string,
    id: string,
    actor: { id: string; name: string }
  ): Promise<void> {
    const admin = supabaseAdmin!;
    const { data: row } = await admin
      .from("rate_fluctuations").select("*")
      .eq("id", id).eq("propertyId", propertyId).maybeSingle();
    if (!row) return;

    const { error } = await admin
      .from("rate_fluctuations")
      .delete()
      .eq("id", id)
      .eq("propertyId", propertyId);
    if (error) throw new Error(error.message);

    const f = row as RateFluctuationRule;
    await AuditService.log({
      propertyId, userId: actor.id, userName: actor.name,
      action: "RATE_FLUCTUATION_DELETED", entity: "RATE_FLUCTUATION", entityId: id,
      details: `Flutuação removida: ${f.name || "sem nome"} (${f.pct > 0 ? "+" : ""}${f.pct}%) · ${f.startDate} → ${f.endDate}.`,
    });
  },

  // ── Config comercial ───────────────────────────────────────────────────────

  async saveSettings(propertyId: string, settings: Partial<RateSettings>): Promise<void> {
    const admin = supabaseAdmin!;
    // Só campos conhecidos e com o tipo certo — settings corrompido quebraria o
    // motor de cálculo em todos os orçamentos.
    const clean: Record<string, unknown> = {};
    if (typeof settings.petFee === "number" && isFinite(settings.petFee)) {
      clean.petFee = Math.max(0, settings.petFee);
    }
    if (Array.isArray(settings.fluctuations)) clean.fluctuations = settings.fluctuations;
    if (Array.isArray(settings.discounts)) clean.discounts = settings.discounts;
    if (Array.isArray(settings.promos)) clean.promos = settings.promos;
    if (settings.categoryLinks && typeof settings.categoryLinks === "object" && !Array.isArray(settings.categoryLinks)) {
      clean.categoryLinks = settings.categoryLinks;
    }
    for (const key of ["msgTemplate", "msgSingleTemplate", "eventTemplate", "inclusionsText"] as const) {
      if (typeof settings[key] === "string" || settings[key] === null) clean[key] = settings[key];
    }
    const { error } = await admin.from("rate_settings").upsert(
      { ...clean, propertyId, updatedAt: new Date().toISOString() },
      { onConflict: "propertyId" }
    );
    if (error) throw new Error(error.message);
  },

  // ── Contexto do orçamento: disponibilidade real + eventos no período ───────

  async getQuoteContext(
    propertyId: string,
    checkIn: string,
    checkOut: string
  ): Promise<{ availability: Record<string, RateAvailability>; events: { title: string; date: string }[] }> {
    const admin = supabaseAdmin!;

    const [cabinsRes, staysRes, eventsRes] = await Promise.all([
      admin.from("cabins").select("id, name, categoryId").eq("propertyId", propertyId),
      admin
        .from("stays")
        .select("cabinId, checkIn, checkOut, status")
        .eq("propertyId", propertyId)
        .in("status", ["pending", "pre_checkin_done", "active"])
        .lt("checkIn", `${checkOut}T23:59:59`)
        .gt("checkOut", `${checkIn}T00:00:00`),
      admin
        .from("events")
        .select("title, startDate, endDate")
        .eq("propertyId", propertyId)
        .eq("status", "published")
        .lt("startDate", checkOut)
        .or(`endDate.gte.${checkIn},and(endDate.is.null,startDate.gte.${checkIn})`),
    ]);

    // Ocupação com a mesma semântica date-only do resto do sistema:
    // check-out no dia do check-in de outra estadia NÃO conflita.
    const occupied = new Set<string>();
    for (const s of (staysRes.data || []) as { cabinId: string | null; checkIn: string; checkOut: string }[]) {
      if (!s.cabinId) continue;
      const sIn = (s.checkIn || "").slice(0, 10);
      const sOut = (s.checkOut || "").slice(0, 10);
      if (sIn < checkOut && sOut > checkIn) occupied.add(s.cabinId);
    }

    // Indexada por categoryId — o mesmo id que as tabelas de preço usam.
    const availability: Record<string, RateAvailability> = {};
    for (const c of (cabinsRes.data || []) as { id: string; name: string; categoryId: string | null }[]) {
      if (!c.categoryId) continue;
      if (!availability[c.categoryId]) availability[c.categoryId] = { total: 0, free: 0, freeCabins: [] };
      availability[c.categoryId].total++;
      if (!occupied.has(c.id)) {
        availability[c.categoryId].free++;
        availability[c.categoryId].freeCabins.push(c.name);
      }
    }

    const events = ((eventsRes.data || []) as { title: string; startDate: string; endDate?: string | null }[])
      .filter((e) => e.startDate < checkOut && (e.endDate || e.startDate) >= checkIn)
      .map((e) => ({ title: e.title, date: e.startDate }));

    return { availability, events };
  },

  // ── Orçamentos salvos / funil de vendas ────────────────────────────────────

  async listQuotes(propertyId: string): Promise<RateQuoteRecord[]> {
    const admin = supabaseAdmin!;
    const { data, error } = await admin
      .from("rate_quotes")
      .select("*")
      .eq("propertyId", propertyId)
      .order("createdAt", { ascending: false })
      .limit(400);
    if (error) throw new Error(error.message);
    return (data || []) as RateQuoteRecord[];
  },

  /** Dados de cálculo da propriedade (sem casamentos/canais — uso interno). */
  async getRateData(propertyId: string): Promise<{
    tables: RateTable[]; periods: RatePeriod[]; settings: RateSettings;
    categories: CabinCategory[]; fluctuations: RateFluctuationRule[] | null;
  }> {
    const admin = supabaseAdmin!;
    const [tablesRes, periodsRes, settingsRes, categoriesRes, fluctRes] = await Promise.all([
      admin.from("rate_tables").select("*").eq("propertyId", propertyId).order("createdAt"),
      admin.from("rate_periods").select("*").eq("propertyId", propertyId).order("startDate"),
      admin.from("rate_settings").select("*").eq("propertyId", propertyId).maybeSingle(),
      admin.from("cabin_categories").select("*").eq("propertyId", propertyId).order("order"),
      admin.from("rate_fluctuations").select("*").eq("propertyId", propertyId).order("startDate"),
    ]);
    const settings = (settingsRes.data as RateSettings) || DEFAULT_RATE_SETTINGS(propertyId);
    return {
      tables: (tablesRes.data || []) as RateTable[],
      periods: (periodsRes.data || []) as RatePeriod[],
      settings: {
        ...DEFAULT_RATE_SETTINGS(propertyId),
        ...settings,
        fluctuations: settings.fluctuations || [],
        discounts: settings.discounts || [],
        promos: settings.promos || [],
        categoryLinks: settings.categoryLinks || {},
      },
      categories: (categoriesRes.data || []) as CabinCategory[],
      // null = migration phase4 pendente (o sinal único de degradação).
      fluctuations: fluctRes.error ? null : ((fluctRes.data || []) as RateFluctuationRule[]),
    };
  },

  async getQuoteById(propertyId: string, id: string): Promise<RateQuoteRecord | null> {
    const admin = supabaseAdmin!;
    const { data } = await admin
      .from("rate_quotes").select("*")
      .eq("id", id).eq("propertyId", propertyId).maybeSingle();
    return (data as RateQuoteRecord) ?? null;
  },

  /**
   * Cria (ou, com payload.id, RECALCULA e atualiza) um orçamento.
   *
   * O snapshot NUNCA vem do cliente: o servidor roda o computeQuote com os
   * dados frescos da propriedade — fecha a validação e garante que o preço
   * congelado no funil saiu do motor, não de um payload adulterável.
   */
  async saveQuote(
    propertyId: string,
    payload: Partial<RateQuoteRecord>,
    actorId: string,
    actorName: string
  ): Promise<string> {
    const admin = supabaseAdmin!;
    const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
    if (!ISO_DATE.test(payload.checkIn || "") || !ISO_DATE.test(payload.checkOut || "")) {
      throw new Error("Datas inválidas.");
    }
    const status: RateQuoteStatus =
      payload.status && QUOTE_STATUSES.includes(payload.status) ? payload.status : "open";

    // Recálculo server-side (ignora options/snapshot/finalValue do payload —
    // do cliente vem só a COMPOSIÇÃO pedida: quantas acomodações e o pax de
    // cada uma). Os controles comerciais (flutuação, descontos, extra) são do
    // orçamento inteiro e entram no cálculo de todas as acomodações.
    const data = await this.getRateData(propertyId);
    // Modo Automática só vale com a migration aplicada; quando ativo, o pct
    // manual é zerado (um valor velho não pode vazar por baixo do auto).
    const fluctuationAuto = payload.fluctuationAuto === true && data.fluctuations !== null;
    const commercial = {
      fluctuationPct: fluctuationAuto ? 0 : Number(payload.fluctuationPct) || 0,
      fluctuationAuto,
      discountIds: Array.isArray(payload.discountIds) ? payload.discountIds.map(String) : [],
      adhocValue: Math.max(0, Number(payload.adhocValue) || 0),
      adhocType: (payload.adhocType === "brl" ? "brl" : "pct") as "pct" | "brl",
    };
    // Cada acomodação pode ter período PRÓPRIO (chegada escalonada); sem isso,
    // herda o do orçamento. Data inválida cai no período do orçamento — nunca
    // se inventa intervalo.
    const inputFor = (r: Partial<RateQuoteRoom>): RateQuoteInput => {
      const ci = ISO_DATE.test(r.checkIn || "") ? r.checkIn! : payload.checkIn!;
      const co = ISO_DATE.test(r.checkOut || "") && r.checkOut! > ci ? r.checkOut! : payload.checkOut!;
      return {
        checkIn: ci,
        checkOut: co > ci ? co : payload.checkOut!,
        adults: Math.max(1, Number(r.adults) || 2),
        children: Math.max(0, Number(r.children) || 0),
        babies: Math.max(0, Number(r.babies) || 0),
        pets: Math.max(0, Number(r.pets) || 0),
        // Exceção de ocupação é decisão POR acomodação (a família de 3 vai
        // para a Eco; o casal ao lado segue na regra normal).
        allowOverCapacity: r.allowOverCapacity === true,
        ...commercial,
      };
    };

    // Sem `rooms` no payload (chamador antigo) → uma acomodação com o pax raiz.
    const requested = Array.isArray(payload.rooms) && payload.rooms.length > 0
      ? payload.rooms
      : [{ id: "", label: null, adults: payload.adults, children: payload.children,
           babies: payload.babies, pets: payload.pets,
           selectedCategory: payload.selectedCategory } as Partial<RateQuoteRoom>];

    let firstAvgPct = 0;
    const rooms: RateQuoteRoom[] = requested.map((r, i) => {
      // A exceção só existe COM justificativa: a flag habilita o cálculo, o
      // texto é a prova comercial que fica no orçamento e na auditoria.
      const wantsOver = r.allowOverCapacity === true;
      const overReason = typeof r.overCapacityReason === "string" ? r.overCapacityReason.trim() : "";
      if (wantsOver && overReason.length < MIN_OVER_CAPACITY_REASON) {
        throw new Error(
          `Justifique a exceção de capacidade da acomodação ${i + 1} (mínimo ${MIN_OVER_CAPACITY_REASON} caracteres).`
        );
      }

      const input = inputFor(r);
      const result = computeQuote(input, { ...data, fluctuations: data.fluctuations ?? undefined });
      if (i === 0) firstAvgPct = result.fluctuationAvgPct ?? 0;
      if (result.categories.length === 0) {
        throw new Error(
          result.uncoveredDates.length > 0
            ? "Sem regra de tarifário para as datas — cadastre na aba Calendário."
            : `Nenhuma categoria com preço para a acomodação ${i + 1}.`
        );
      }

      // `options` é o que o CLIENTE vê — só as cabanas que o vendedor marcou
      // para oferecer, nunca todo o parque da pousada. Sem a lista (chamador
      // antigo) cai no comportamento anterior: oferece tudo o que computou.
      const included = Array.isArray(r.includedCategoryIds)
        ? new Set(r.includedCategoryIds.map(String))
        : null;
      const computed = included
        ? result.categories.filter((c) => included.has(c.categoryId) || included.has(c.category))
        : result.categories;
      // Defesa em profundidade: sem a flag o motor nem computa a exceção — mas
      // se um dia computar, ela não passa daqui para o orçamento salvo.
      const offered = wantsOver ? computed : computed.filter((c) => !c.overCapacity);
      if (offered.length === 0) {
        throw new Error(`Selecione ao menos uma cabana para oferecer na acomodação ${i + 1}.`);
      }

      // A escolha só vale se a categoria estiver entre as OFERECIDAS.
      const pick = r.selectedCategory
        ? offered.find((c) => c.categoryId === r.selectedCategory || c.category === r.selectedCategory)
        : undefined;
      // Preços oferecidos sobrevivem ao recálculo (são decisão comercial, não
      // resultado de tabela), mas só para cabanas que seguem oferecidas —
      // mudar as datas ou desmarcar uma opção não pode deixar um preço orfão.
      const overrides: Record<string, number> = {};
      for (const [key, raw] of Object.entries(r.priceOverrides ?? {})) {
        const v = Number(raw);
        if (!Number.isFinite(v) || v <= 0) continue;
        if (offered.some((c) => c.categoryId === key || c.category === key)) {
          overrides[key] = v;
        }
      }

      return {
        id: r.id || crypto.randomUUID(),
        label: r.label?.trim() || null,
        // Guarda as datas SEMPRE (já sanitizadas): a acomodação passa a ser
        // autocontida para quem lê o orçamento depois.
        checkIn: input.checkIn, checkOut: input.checkOut,
        adults: input.adults, children: input.children,
        babies: input.babies, pets: input.pets,
        options: offered,
        selectedCategory: pick ? pick.categoryId || pick.category : null,
        priceOverrides: Object.keys(overrides).length > 0 ? overrides : null,
        // Só marca quando a exceção DE FATO produziu opção — orçamento com
        // selo e nenhuma cabana fora de capacidade seria ruído na auditoria.
        allowOverCapacity: wantsOver && offered.some((c) => c.overCapacity),
        overCapacityReason:
          wantsOver && offered.some((c) => c.overCapacity) ? overReason : null,
      };
    });

    // Colunas raiz: intervalo TOTAL do pedido (menor entrada → maior saída) —
    // é o período que o funil, os prazos do lead e a ficha mostram. As datas
    // de cada acomodação ficam dentro de `rooms`.
    const spanIn = rooms.reduce((m, r) => (r.checkIn! < m ? r.checkIn! : m), rooms[0].checkIn!);
    const spanOut = rooms.reduce((m, r) => (r.checkOut! > m ? r.checkOut! : m), rooms[0].checkOut!);

    // Espelho da acomodação 1 nas colunas raiz — é o que mantém as telas
    // legadas (funil do tarifário, vínculo com estadia) funcionando.
    const first = rooms[0];
    const input = inputFor(first);
    const snapshot = first.options;
    const chosen = first.selectedCategory
      ? snapshot.find((c) => c.categoryId === first.selectedCategory || c.category === first.selectedCategory)
      : undefined;

    // Origem: aceita só slug conhecido da propriedade (ou null).
    const channels = await CrmService.getChannels(propertyId);
    const source = payload.source && channels.some((c) => c.id === payload.source)
      ? payload.source : null;

    const existing = payload.id ? await this.getQuoteById(propertyId, payload.id) : null;
    const now = new Date().toISOString();

    const common = {
      clientName: payload.clientName?.trim() || null,
      clientDocument: payload.clientDocument?.trim() || null,
      clientPhone: payload.clientPhone ? payload.clientPhone.replace(/\D/g, "") : null,
      clientEmail: payload.clientEmail?.trim() || null,
      guestId: payload.guestId || null,
      weddingId: payload.weddingId || null,
      source,
      checkIn: spanIn,
      checkOut: spanOut,
      adults: input.adults,
      children: input.children,
      babies: input.babies,
      pets: input.pets,
      // Em modo auto o pct persistido é a MÉDIA efetiva da acomodação 1
      // (exibição/histórico); o cálculo real foi noite a noite.
      fluctuationPct: fluctuationAuto ? firstAvgPct : input.fluctuationPct,
      // A coluna só entra com a migration aplicada — e gravar `false` também
      // importa (re-salvar um auto como manual precisa desligar a flag).
      ...(data.fluctuations !== null ? { fluctuationAuto } : {}),
      discountIds: input.discountIds,
      adhocValue: input.adhocValue,
      adhocType: input.adhocType,
      rooms,
      snapshot,
      selectedCategory: chosen ? chosen.categoryId || chosen.category : null,
      // finalValue = soma das acomodações quando TODAS têm cabana escolhida;
      // senão fica null e o total sai "a partir de" via resolveQuoteValue.
      finalValue: rooms.every((r) => r.selectedCategory)
        ? rooms.reduce((s, r) => s + resolveRoomValue(r).value, 0)
        : null,
      notes: payload.notes?.trim() || null,
    };

    // Exceção de capacidade: registra na timeline e na auditoria SÓ quando algo
    // mudou (re-salvar o mesmo orçamento não vira uma pilha de notas iguais).
    const overNow = overCapacitySignature(rooms);
    const logOverCapacity = async (quoteId: string) => {
      if (!overNow || overNow === overCapacitySignature(existing?.rooms)) return;
      const detail = overCapacityDetail(rooms);
      const reason = rooms.find((r) => r.allowOverCapacity)?.overCapacityReason ?? "";
      await CrmService.logInteraction(propertyId, "quote", quoteId, "note", {
        actorId, actorName,
        note: `Exceção de capacidade — ${detail}. Justificativa: ${reason}`,
        payload: {
          tag: "over_capacity",
          rooms: rooms.filter((r) => r.allowOverCapacity).map((r) => ({
            roomId: r.id,
            requestedPax: r.adults + r.children,
            reason: r.overCapacityReason,
            categories: r.options.filter((c) => c.overCapacity).map((c) => ({
              categoryId: c.categoryId, pricedPax: c.overCapacity!.pricedPax,
            })),
          })),
        },
      });
      await AuditService.log({
        propertyId, userId: actorId, userName: actorName,
        action: existing ? "UPDATE" : "CREATE", entity: "RATE_QUOTE", entityId: quoteId,
        details: `EXCEÇÃO DE CAPACIDADE em ${common.clientName || "sem nome"} — ${detail}. Justificativa: ${reason}`,
      });
    };

    if (existing) {
      // Reabertura: recalcula e atualiza o MESMO orçamento (não duplica lead).
      const { error } = await admin
        .from("rate_quotes")
        .update({ ...common, updatedAt: now })
        .eq("id", existing.id)
        .eq("propertyId", propertyId);
      if (error) throw new Error(error.message);

      await CrmService.logInteraction(propertyId, "quote", existing.id, "reopened", {
        actorId, actorName,
        payload: { checkIn: payload.checkIn, checkOut: payload.checkOut },
      });
      await AuditService.log({
        propertyId, userId: actorId, userName: actorName,
        action: "UPDATE", entity: "RATE_QUOTE", entityId: existing.id,
        details: `Orçamento de ${common.clientName || "sem nome"} recalculado (${payload.checkIn} → ${payload.checkOut}).`,
      });
      await logOverCapacity(existing.id);
      return existing.id;
    }

    // A validade do lead não passa da PRIMEIRA chegada (span de entrada).
    const lead = await CrmService.initialQuoteLeadDates(propertyId, spanIn);
    const id = crypto.randomUUID();
    const { error } = await admin.from("rate_quotes").insert({
      id,
      propertyId,
      ...common,
      followUpAt: lead.followUpAt,
      expiresAt: lead.expiresAt,
      sentAt: status === "sent" ? now : null,
      status,
      createdBy: actorId,
      createdByName: actorName,
    });
    if (error) throw new Error(error.message);

    await CrmService.logInteraction(propertyId, "quote", id, "created", {
      actorId, actorName,
      payload: { status, source, checkIn: payload.checkIn, checkOut: payload.checkOut },
    });
    if (status === "sent") {
      await CrmService.logInteraction(propertyId, "quote", id, "sent", { actorId, actorName });
    }
    await AuditService.log({
      propertyId, userId: actorId, userName: actorName,
      action: "CREATE", entity: "RATE_QUOTE", entityId: id,
      details: `Orçamento criado: ${common.clientName || "sem nome"} · ${payload.checkIn} → ${payload.checkOut}${source ? ` · origem ${source}` : ""}.`,
    });
    await logOverCapacity(id);
    return id;
  },

  async updateQuote(
    propertyId: string,
    id: string,
    patch: Partial<RateQuoteRecord>,
    actor?: { id: string; name: string }
  ): Promise<void> {
    const admin = supabaseAdmin!;
    const clean: Record<string, unknown> = {};
    for (const field of QUOTE_PATCH_FIELDS) {
      if (!(field in patch)) continue;
      clean[field] = patch[field] ?? null;
    }
    if ("status" in clean && !QUOTE_STATUSES.includes(clean.status as RateQuoteStatus)) {
      delete clean.status;
    }
    if (typeof clean.clientPhone === "string") {
      clean.clientPhone = clean.clientPhone.replace(/\D/g, "") || null;
    }
    if ("finalValue" in clean && typeof clean.finalValue !== "number") clean.finalValue = null;
    if ("negotiatedValue" in clean &&
        (typeof clean.negotiatedValue !== "number" || clean.negotiatedValue <= 0)) {
      clean.negotiatedValue = null;   // limpar = volta ao valor de tabela
    }
    if (Object.keys(clean).length === 0) return;

    // Estado anterior: transições de estágio e de valor viram histórico e carimbos.
    const before = await this.getQuoteById(propertyId, id);
    if (!before) throw new Error("Orçamento não encontrado.");

    const nextStatus = clean.status as RateQuoteStatus | undefined;
    const changingStage = nextStatus && nextStatus !== before.status;

    // Ganho SEM ficha de hóspede não existe: é o ponto em que o lead vira
    // pessoa de verdade (estadia, fólio, histórico). Vale para todo caminho —
    // botão "Ganhou", arrastar no kanban ou PATCH direto.
    if (nextStatus === "won" && !((clean.guestId as string | null) ?? before.guestId ?? null)) {
      throw new Error("Promova o cliente a hóspede antes de marcar o orçamento como ganho.");
    }
    const nextNegotiated = clean.negotiatedValue as number | null | undefined;
    const changingValue = "negotiatedValue" in clean &&
      (nextNegotiated ?? null) !== (before.negotiatedValue ?? null);
    const now = new Date().toISOString();

    if (changingStage) {
      if (nextStatus === "sent" && !before.sentAt) clean.sentAt = now;
      if (nextStatus === "lost") clean.lostAt = now;
    }

    const { error } = await admin
      .from("rate_quotes")
      .update({ ...clean, updatedAt: now })
      .eq("id", id)
      .eq("propertyId", propertyId);
    if (error) throw new Error(error.message);

    if (changingStage) {
      await CrmService.logInteraction(propertyId, "quote", id, "stage_change", {
        actorId: actor?.id, actorName: actor?.name,
        payload: { from: before.status, to: nextStatus },
      });
      if (nextStatus === "sent" && !before.sentAt) {
        await CrmService.logInteraction(propertyId, "quote", id, "sent", {
          actorId: actor?.id, actorName: actor?.name,
        });
      }
      if (nextStatus === "lost") {
        await CrmService.logInteraction(propertyId, "quote", id, "lost", {
          actorId: actor?.id, actorName: actor?.name,
          payload: { reason: (clean.lostReason as string) ?? before.lostReason ?? null },
        });
      }
      if (actor) {
        await AuditService.log({
          propertyId, userId: actor.id, userName: actor.name,
          action: "UPDATE", entity: "RATE_QUOTE", entityId: id,
          details: `Orçamento de ${before.clientName || "sem nome"}: ${QUOTE_STAGE_LABEL[before.status]} → ${QUOTE_STAGE_LABEL[nextStatus!]}.`,
        });
      }
    }

    // Valor negociado: recepção pode mexer sem aval de gerente, mas TUDO fica
    // registrado — timeline (value_change) + trilha de auditoria.
    if (changingValue) {
      const fromValue = resolveQuoteValue(before).value;
      const toValue = resolveQuoteValue({ ...before, negotiatedValue: nextNegotiated ?? null }).value;
      await CrmService.logInteraction(propertyId, "quote", id, "value_change", {
        actorId: actor?.id, actorName: actor?.name,
        payload: { from: fromValue, to: toValue, negotiated: nextNegotiated ?? null },
      });
      if (actor) {
        await AuditService.log({
          propertyId, userId: actor.id, userName: actor.name,
          action: "UPDATE", entity: "RATE_QUOTE", entityId: id,
          details: `Valor negociado de ${before.clientName || "sem nome"}: R$ ${fromValue.toFixed(2)} → R$ ${toValue.toFixed(2)}${nextNegotiated == null ? " (voltou à tabela)" : ""}.`,
        });
      }
    }
  },

  /**
   * Altera UMA acomodação: a cabana escolhida e/ou o preço oferecido de UMA
   * das cabanas dela. Endpoint próprio em vez de PATCH livre — as opções e o
   * preço de tabela vêm SEMPRE do servidor; o que o vendedor manda é qual
   * opção quer e por quanto oferece (com auditoria).
   * `selectedCategory: null` desmarca; `price: null` volta ao valor calculado.
   */
  async patchQuoteRoom(
    propertyId: string,
    quoteId: string,
    roomId: string,
    patch: {
      selectedCategory?: string | null;
      /** Preço oferecido de UMA cabana: { categoryId, value|null }. */
      price?: { categoryId: string; value: number | null };
    },
    actor?: { id: string; name: string }
  ): Promise<RateQuoteRecord> {
    const admin = supabaseAdmin!;
    const quote = await this.getQuoteById(propertyId, quoteId);
    if (!quote) throw new Error("Orçamento não encontrado.");

    const rooms = quote.rooms && quote.rooms.length > 0
      ? quote.rooms
      // Orçamento anterior à fase 3: promove o snapshot a acomodação única.
      : [{
          id: "legacy", label: null,
          adults: quote.adults, children: quote.children,
          babies: quote.babies, pets: quote.pets,
          options: quote.snapshot || [],
          selectedCategory: quote.selectedCategory ?? null,
        } as RateQuoteRoom];

    const target = rooms.find((r) => r.id === roomId) ?? (rooms.length === 1 ? rooms[0] : null);
    if (!target) throw new Error("Acomodação não encontrada.");

    const changes: Partial<RateQuoteRoom> = {};

    if ("selectedCategory" in patch) {
      let picked: string | null = null;
      if (patch.selectedCategory) {
        const option = target.options.find(
          (c) => c.categoryId === patch.selectedCategory || c.category === patch.selectedCategory
        );
        if (!option) throw new Error("Essa cabana não está entre as opções desta acomodação.");
        picked = option.categoryId || option.category;
      }
      changes.selectedCategory = picked;
    }

    if (patch.price) {
      const option = target.options.find(
        (c) => c.categoryId === patch.price!.categoryId || c.category === patch.price!.categoryId
      );
      if (!option) throw new Error("Essa cabana não está entre as opções desta acomodação.");
      const key = option.categoryId || option.category;
      const v = Number(patch.price.value);
      const next = { ...(target.priceOverrides ?? {}) };
      if (Number.isFinite(v) && v > 0) next[key] = v; else delete next[key];
      changes.priceOverrides = Object.keys(next).length > 0 ? next : null;
    }

    const before = resolveRoomValue(target).value;
    const next = rooms.map((r) => (r.id === target.id ? { ...r, ...changes } : r));
    const updated = next.find((r) => r.id === target.id)!;
    const first = next[0];
    const allSettled = next.every((r) => r.selectedCategory);

    const { data, error } = await admin
      .from("rate_quotes")
      .update({
        rooms: next,
        // Espelho da acomodação 1 + total quando o pedido está fechado.
        selectedCategory: first.selectedCategory ?? null,
        finalValue: allSettled ? next.reduce((s, r) => s + resolveRoomValue(r).value, 0) : null,
        updatedAt: new Date().toISOString(),
      })
      .eq("id", quoteId)
      .eq("propertyId", propertyId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    const label = target.label || `Acomodação ${next.indexOf(updated) + 1}`;
    const priceOption = patch.price
      ? target.options.find(
          (c) => c.categoryId === patch.price!.categoryId || c.category === patch.price!.categoryId
        )
      : undefined;

    if (patch.price) {
      const after = resolveRoomValue(updated).value;
      await CrmService.logInteraction(propertyId, "quote", quoteId, "value_change", {
        actorId: actor?.id, actorName: actor?.name,
        note: `${label} · ${priceOption?.category ?? patch.price.categoryId}`,
        payload: {
          from: before, to: after, roomId: target.id,
          categoryId: patch.price.categoryId,
          offered: patch.price.value ?? null,
          tableValue: priceOption?.finalTotal ?? null,
        },
      });
    }

    if (actor) {
      const details: string[] = [];
      if ("selectedCategory" in changes) {
        const catName = changes.selectedCategory
          ? target.options.find((c) => (c.categoryId || c.category) === changes.selectedCategory)?.category ?? changes.selectedCategory
          : null;
        details.push(catName ? `cabana escolhida — ${catName}` : "escolha de cabana desfeita");
      }
      if (patch.price) {
        const cat = priceOption?.category ?? patch.price.categoryId;
        details.push(patch.price.value
          ? `${cat} oferecida por R$ ${Number(patch.price.value).toFixed(2)} (tabela R$ ${(priceOption?.finalTotal ?? 0).toFixed(2)})`
          : `${cat} voltou ao valor de tabela`);
      }
      await AuditService.log({
        propertyId, userId: actor.id, userName: actor.name,
        action: "UPDATE", entity: "RATE_QUOTE", entityId: quoteId,
        details: `${label}: ${details.join(" · ")}.`,
      });
    }
    return data as RateQuoteRecord;
  },

  /** Atalho usado pela proposta pública e pelo drawer (só a escolha). */
  async selectRoomCategory(
    propertyId: string,
    quoteId: string,
    roomId: string,
    categoryId: string | null,
    actor?: { id: string; name: string }
  ): Promise<RateQuoteRecord> {
    return this.patchQuoteRoom(propertyId, quoteId, roomId, { selectedCategory: categoryId }, actor);
  },

  async deleteQuote(propertyId: string, id: string, actorId: string, actorName: string): Promise<void> {
    const admin = supabaseAdmin!;
    const before = await this.getQuoteById(propertyId, id);
    const { error } = await admin
      .from("rate_quotes")
      .delete()
      .eq("id", id)
      .eq("propertyId", propertyId);
    if (error) throw new Error(error.message);

    await AuditService.log({
      propertyId, userId: actorId, userName: actorName,
      action: "DELETE", entity: "RATE_QUOTE", entityId: id,
      details: `Orçamento de ${before?.clientName || "sem nome"} (${before?.checkIn ?? "?"} → ${before?.checkOut ?? "?"}) excluído.`,
    });
  },

  /**
   * Garante a ficha de hóspede do lead SEM mexer no estágio ("Promover a
   * hóspede" — o titular pode virar hóspede no meio da negociação). A decisão
   * é do vendedor, na modal: `guestId` vincula uma ficha EXISTENTE (sugestão
   * por telefone/nome aceita) e `create` abre ficha NOVA com os dados
   * conferidos. Sem nenhum dos dois cai no automático de antes (já vinculado
   * → achado pelo documento do lead). Vínculo novo vira 'guest_linked' na
   * timeline.
   *
   * `create` com um CPF que já tem ficha na propriedade VINCULA a existente em
   * vez de duplicar — a modal mostra os matches, mas o CPF é a última palavra.
   */
  async ensureGuestForQuote(
    propertyId: string,
    id: string,
    actor: { id: string; name: string },
    opts?: {
      guestId?: string | null;
      create?: { document: string; fullName: string; phone?: string | null; email?: string | null } | null;
    }
  ): Promise<{ guestId: string | null }> {
    const admin = supabaseAdmin!;
    const { data } = await admin
      .from("rate_quotes")
      .select("*")
      .eq("id", id)
      .eq("propertyId", propertyId)
      .maybeSingle();
    if (!data) throw new Error("Orçamento não encontrado.");
    const quote = data as RateQuoteRecord;

    let guestId = quote.guestId || null;
    /** Dados conferidos na modal — o lead passa a espelhar a ficha criada. */
    const clientPatch: Record<string, unknown> = {};

    if (opts?.guestId) {
      // Vínculo explícito: valida que a ficha existe NESTA propriedade.
      const { data: g } = await admin
        .from("guests")
        .select("id")
        .eq("id", opts.guestId)
        .eq("propertyId", propertyId)
        .maybeSingle();
      if (!g) throw new Error("Hóspede não encontrado.");
      guestId = g.id as string;
    } else if (opts?.create) {
      const fullName = (opts.create.fullName || "").trim();
      const normId = GuestService.normalizeDocument(opts.create.document || "");
      if (!fullName) throw new Error("Informe o nome completo do hóspede.");
      if (!normId) throw new Error("Informe um CPF válido para abrir a ficha.");

      const phone = (opts.create.phone ?? quote.clientPhone ?? "").replace(/\D/g, "");
      const email = (opts.create.email ?? quote.clientEmail ?? "").trim();

      const { data: existing } = await admin
        .from("guests")
        .select("id")
        .eq("id", normId)
        .eq("propertyId", propertyId)
        .maybeSingle();

      if (existing) {
        // CPF já cadastrado: vincula em vez de duplicar a ficha.
        guestId = existing.id as string;
      } else {
        const newGuest: Omit<Guest, "updatedAt"> = {
          id: normId,
          propertyId,
          fullName,
          email,
          phone,
          nationality: "Brasileira",
          birthDate: "",
          gender: "NAO_INFORMADO",
          occupation: "",
          document: { type: "CPF", number: normId },
          address: { street: "", number: "", neighborhood: "", city: "", state: "", zipCode: "", country: "Brasil" },
          allergies: [],
          preferredLanguage: "pt",
        };
        guestId = await GuestService.upsertGuestDirect(propertyId, newGuest, actor.id, actor.name);
      }

      // O lead segue a ficha: nome/CPF conferidos valem mais que o digitado às
      // pressas na cotação.
      if (fullName !== (quote.clientName || "")) clientPatch.clientName = fullName;
      if (normId !== (quote.clientDocument || "")) clientPatch.clientDocument = normId;
      if (phone && phone !== (quote.clientPhone || "")) clientPatch.clientPhone = phone;
      if (email && email !== (quote.clientEmail || "")) clientPatch.clientEmail = email;
    } else if (!guestId && quote.clientDocument) {
      const normId = GuestService.normalizeDocument(quote.clientDocument);
      if (normId) {
        const { data: existing } = await admin
          .from("guests")
          .select("id")
          .eq("id", normId)
          .eq("propertyId", propertyId)
          .maybeSingle();
        if (existing) {
          guestId = existing.id as string;
        } else if (quote.clientName) {
          const newGuest: Omit<Guest, "updatedAt"> = {
            id: quote.clientDocument,
            propertyId,
            fullName: quote.clientName,
            email: quote.clientEmail || "",
            phone: quote.clientPhone || "",
            nationality: "Brasileira",
            birthDate: "",
            gender: "NAO_INFORMADO",
            occupation: "",
            document: { type: "CPF", number: quote.clientDocument },
            address: { street: "", number: "", neighborhood: "", city: "", state: "", zipCode: "", country: "Brasil" },
            allergies: [],
            preferredLanguage: "pt",
          };
          guestId = await GuestService.upsertGuestDirect(propertyId, newGuest, actor.id, actor.name);
        }
      }
    }

    const linking = !!guestId && guestId !== (quote.guestId || null);
    if (linking || Object.keys(clientPatch).length > 0) {
      const { error } = await admin
        .from("rate_quotes")
        .update({
          ...clientPatch,
          ...(linking ? { guestId } : {}),
          updatedAt: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("propertyId", propertyId);
      if (error) throw new Error(error.message);
    }

    if (linking) {
      await CrmService.logInteraction(propertyId, "quote", id, "guest_linked", {
        actorId: actor.id, actorName: actor.name,
        payload: { guestId, created: !!opts?.create },
      });
      await AuditService.log({
        propertyId, userId: actor.id, userName: actor.name,
        action: "UPDATE", entity: "RATE_QUOTE", entityId: id,
        details: `Orçamento de ${quote.clientName || "sem nome"} promovido a hóspede (${
          opts?.create ? "ficha nova" : "ficha existente"
        } ${guestId}).`,
      });
    }

    return { guestId };
  },

  /**
   * Conversão (ganhou): exige a ficha de hóspede. Ainda tenta o automático
   * (lead com CPF que já casa com uma ficha), mas se nem assim houver titular
   * o ganho não acontece — a promoção é uma decisão consciente (ficha
   * existente ou nova), feita na modal do drawer.
   */
  async convertQuote(
    propertyId: string,
    id: string,
    actorId: string,
    actorName: string
  ): Promise<{
    guestId: string; checkIn: string; checkOut: string;
    adults: number; children: number; babies: number;
  }> {
    const admin = supabaseAdmin!;
    const { data } = await admin
      .from("rate_quotes")
      .select("checkIn, checkOut, rooms, adults, children, babies")
      .eq("id", id)
      .eq("propertyId", propertyId)
      .maybeSingle();
    if (!data) throw new Error("Orçamento não encontrado.");

    // Pax da acomodação 1 (as colunas raiz já a espelham; ficam de fallback
    // para orçamentos anteriores às `rooms`). Sem isto a estadia nasceria com
    // 2 adultos fixos e a venda em exceção travaria no pré-check-in.
    const first = (data.rooms as RateQuoteRoom[] | null)?.[0];
    const pax = {
      adults: Math.max(1, Number(first?.adults ?? data.adults) || 2),
      children: Math.max(0, Number(first?.children ?? data.children) || 0),
      babies: Math.max(0, Number(first?.babies ?? data.babies) || 0),
    };

    const { guestId } = await this.ensureGuestForQuote(propertyId, id, { id: actorId, name: actorName });
    if (!guestId) {
      throw new Error("Promova o cliente a hóspede antes de marcar o orçamento como ganho.");
    }

    await this.updateQuote(propertyId, id, { status: "won", guestId }, { id: actorId, name: actorName });
    await CrmService.logInteraction(propertyId, "quote", id, "converted", {
      actorId, actorName, payload: { guestId },
    });
    return {
      guestId,
      checkIn: data.checkIn as string, checkOut: data.checkOut as string,
      ...pax,
    };
  },

  /**
   * Fecha o ciclo orçamento → estadia: grava o stayId no orçamento e leva o
   * preço congelado para a estadia (nightlyRate/lodgingTotal), de onde o cron
   * lança as diárias no fólio. A opção do snapshot é resolvida pela CATEGORIA
   * DA CABANA escolhida na estadia; fallback: opção marcada no funil → opção
   * única → finalValue.
   */
  async linkQuoteToStay(
    propertyId: string,
    quoteId: string,
    stayId: string,
    actorId: string,
    actorName: string
  ): Promise<{ linked: boolean; nightlyRate?: number; lodgingTotal?: number }> {
    const admin = supabaseAdmin!;

    const [{ data: quoteRow }, { data: stayRow }] = await Promise.all([
      admin.from("rate_quotes").select("*").eq("id", quoteId).eq("propertyId", propertyId).maybeSingle(),
      admin.from("stays").select("id, cabinId, guestId, checkIn, checkOut").eq("id", stayId).eq("propertyId", propertyId).maybeSingle(),
    ]);
    if (!quoteRow || !stayRow) throw new Error("Orçamento ou estadia não encontrados.");
    const quote = quoteRow as RateQuoteRecord;
    const stay = stayRow as {
      id: string; cabinId: string | null; guestId: string | null;
      checkIn: string; checkOut: string;
    };

    const snapshot = quote.snapshot || [];
    let chosen = undefined as (typeof snapshot)[number] | undefined;
    /** Preço OFERECIDO da opção casada (com o ajuste manual da cabana). */
    let chosenTotal: number | null = null;

    if (stay.cabinId) {
      const { data: cabin } = await admin
        .from("cabins").select("categoryId").eq("id", stay.cabinId).maybeSingle();
      if (cabin?.categoryId) {
        // Orçamento com várias acomodações: a diária desta estadia é o total
        // DA ACOMODAÇÃO que casa com a cabana — não o total do grupo todo.
        for (const room of quote.rooms ?? []) {
          const hit = room.options.find((c) => c.categoryId === cabin.categoryId);
          if (hit) { chosen = hit; chosenTotal = offeredTotal(room, hit); break; }
        }
        if (!chosen) chosen = snapshot.find((c) => c.categoryId === cabin.categoryId);
      }
    }
    // Valor negociado vence até a categoria da cabana: é o preço fechado com
    // o cliente. EXCEÇÃO: com várias acomodações o negociado é do pedido
    // inteiro — jogá-lo numa cabana só cobraria o grupo todo dela; nesse caso
    // vale o total da acomodação casada. Sem negociado nem cabana casada:
    // regra única de valor (aproximado "a partir de" não vira diária — melhor
    // sem hospedagem que com valor errado).
    const multiRoom = (quote.rooms?.length ?? 0) > 1;
    const negotiated = !multiRoom && typeof quote.negotiatedValue === "number" && quote.negotiatedValue > 0
      ? quote.negotiatedValue : null;
    let total: number | null = negotiated ?? chosenTotal ?? (chosen ? chosen.finalTotal : null);
    if (total == null) {
      const res = resolveQuoteValue(quote);
      if (res.chosen) { chosen = res.chosen; total = res.value; }
      else if (!res.approximate && res.value > 0) total = res.value;
    }

    await this.updateQuote(propertyId, quoteId, {
      stayId,
      status: "won",
      // O titular da estadia é o hóspede do orçamento: sem isso o ganho bate
      // na regra "promova antes" justamente quando a ficha já existe.
      guestId: quote.guestId ?? stay.guestId ?? null,
      selectedCategory: chosen ? (chosen.categoryId || chosen.category) : quote.selectedCategory ?? null,
      finalValue: total,
    }, { id: actorId, name: actorName });

    await CrmService.logInteraction(propertyId, "quote", quoteId, "stay_linked", {
      actorId, actorName, payload: { stayId, nightlyRate: total ?? undefined },
    });

    if (total == null || total <= 0) return { linked: true };

    // As noites da OPÇÃO casada vêm primeiro: com acomodações de períodos
    // diferentes, o intervalo raiz é o span do pedido (maior que o desta
    // cabana) e dividir por ele daria uma diária menor que a real.
    const quoteNights = chosen?.nights || nightsBetween(quote.checkIn, quote.checkOut) || 1;
    const nightlyRate = Math.round((total / quoteNights) * 100) / 100;
    const stayNights = nightsBetween(stay.checkIn.slice(0, 10), stay.checkOut.slice(0, 10));
    // Datas iguais às do orçamento → total exato; ajustadas → diária × noites reais.
    const lodgingTotal = stayNights === quoteNights
      ? total
      : Math.round(nightlyRate * Math.max(1, stayNights) * 100) / 100;

    const { error } = await admin
      .from("stays")
      .update({ rateQuoteId: quoteId, nightlyRate, lodgingTotal, updatedAt: new Date().toISOString() })
      .eq("id", stayId)
      .eq("propertyId", propertyId);
    if (error) throw new Error(error.message);

    await AuditService.log({
      propertyId, userId: actorId, userName: actorName,
      action: "RATE_QUOTE_LINKED", entity: "STAY", entityId: stayId,
      details: `Orçamento vinculado: ${chosen?.category ?? "valor manual"} — R$ ${total.toFixed(2)} (${quoteNights} noites, diária R$ ${nightlyRate.toFixed(2)}).`,
    });

    return { linked: true, nightlyRate, lodgingTotal };
  },

  /**
   * Estadias candidatas ao vínculo manual com um orçamento: check-in numa
   * janela de ±7 dias do check-in orçado, não canceladas/arquivadas.
   */
  async listLinkableStays(
    propertyId: string,
    checkIn: string
  ): Promise<{ id: string; label: string; checkIn: string; checkOut: string }[]> {
    const admin = supabaseAdmin!;
    const { data } = await admin
      .from("stays")
      .select("id, guestId, cabinId, checkIn, checkOut, status")
      .eq("propertyId", propertyId)
      .in("status", ["pending", "pre_checkin_done", "active"])
      .gte("checkIn", `${addDays(checkIn, -7)}T00:00:00`)
      .lte("checkIn", `${addDays(checkIn, 7)}T23:59:59`)
      .order("checkIn")
      .limit(30);
    const rows = (data || []) as {
      id: string; guestId: string | null; cabinId: string | null; checkIn: string; checkOut: string;
    }[];
    if (rows.length === 0) return [];

    const guestIds = Array.from(new Set(rows.map((r) => r.guestId).filter(Boolean))) as string[];
    const cabinIds = Array.from(new Set(rows.map((r) => r.cabinId).filter(Boolean))) as string[];
    const [guestsRes, cabinsRes] = await Promise.all([
      guestIds.length
        ? admin.from("guests").select("id, fullName").in("id", guestIds)
        : Promise.resolve({ data: [] }),
      cabinIds.length
        ? admin.from("cabins").select("id, name").in("id", cabinIds)
        : Promise.resolve({ data: [] }),
    ]);
    const guestName = new Map(((guestsRes.data || []) as { id: string; fullName: string }[]).map((g) => [g.id, g.fullName]));
    const cabinName = new Map(((cabinsRes.data || []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));

    const br = (iso: string) => iso.slice(0, 10).split("-").reverse().slice(0, 2).join("/");
    return rows.map((r) => ({
      id: r.id,
      label: `${r.guestId ? guestName.get(r.guestId) ?? "Sem hóspede" : "Sem hóspede"} · ${
        r.cabinId ? cabinName.get(r.cabinId) ?? "—" : "sem cabana"} · ${br(r.checkIn)}→${br(r.checkOut)}`,
      checkIn: r.checkIn,
      checkOut: r.checkOut,
    }));
  },

  /**
   * Cron (crm-status): arquiva orçamentos abertos vencidos — simetria com o
   * arquivamento automático de casamentos.
   * - checkIn já passou → 'Data da estadia passou' (o motivo mais forte, roda
   *   primeiro; o segundo passo não repega porque o status já virou lost)
   * - validade do lead venceu → 'Prazo vencido sem retorno'
   */
  async archiveExpiredQuotes(): Promise<{ expired: number; lapsed: number; names: string[] }> {
    const admin = supabaseAdmin!;
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const now = new Date().toISOString();

    const archive = async (
      rows: { id: string; propertyId: string; clientName: string | null }[],
      reason: string
    ) => {
      if (rows.length === 0) return;
      const { error } = await admin
        .from("rate_quotes")
        .update({ status: "lost", lostReason: reason, lostAt: now, updatedAt: now })
        .in("id", rows.map((r) => r.id));
      if (error) throw new Error(error.message);
      for (const r of rows) {
        await CrmService.logInteraction(r.propertyId, "quote", r.id, "lost", {
          actorId: "cron", actorName: "Sistema (Cron)", payload: { reason },
        });
      }
    };

    const { data: lapsed } = await admin
      .from("rate_quotes")
      .select("id, propertyId, clientName")
      .in("status", ["open", "sent", "negotiating"])
      .lt("checkIn", today);
    await archive((lapsed || []) as { id: string; propertyId: string; clientName: string | null }[],
      "Data da estadia passou");

    const { data: expired } = await admin
      .from("rate_quotes")
      .select("id, propertyId, clientName")
      .in("status", ["open", "sent", "negotiating"])
      .not("expiresAt", "is", null)
      .lt("expiresAt", today);
    await archive((expired || []) as { id: string; propertyId: string; clientName: string | null }[],
      "Prazo vencido sem retorno");

    const names = [...(lapsed || []), ...(expired || [])].map(
      (r) => (r as { clientName: string | null }).clientName || "sem nome"
    );
    return { lapsed: (lapsed || []).length, expired: (expired || []).length, names };
  },

  // ── Importação do backup do SIT ────────────────────────────────────────────

  /**
   * Substitui tabelas e regras da propriedade pelo conteúdo de um backup JSON
   * do SIT (sit_backup*.json) e mescla a config comercial. Casamentos e
   * eventos festivos do backup são ignorados (já existem módulos próprios).
   */
  async importSitBackup(
    propertyId: string,
    backup: Record<string, unknown>,
    actorId: string,
    actorName: string
  ): Promise<SitImportResult> {
    const admin = supabaseAdmin!;

    const rawTables = Array.isArray(backup.tabelas) ? (backup.tabelas as Record<string, unknown>[]) : [];
    const rawPeriods = Array.isArray(backup.periodos) ? (backup.periodos as Record<string, unknown>[]) : [];
    const config = (backup.config || {}) as Record<string, unknown>;

    // Monta e VALIDA tudo antes de tocar no banco — um backup malformado não
    // pode destruir o tarifário vivo.
    const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
    // Preços do SIT vêm indexados por NOME de categoria; aqui viram categoryId.
    // Casa por nome comercial (shortName) ou operacional, sem caixa/acento-sensível.
    const { data: catRows } = await admin
      .from("cabin_categories")
      .select("id, name, shortName")
      .eq("propertyId", propertyId);
    const key = (s: string) =>
      s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const catByKey = new Map<string, string>();
    for (const c of (catRows || []) as { id: string; name: string; shortName: string | null }[]) {
      catByKey.set(key(c.name), c.id);
      if (c.shortName) catByKey.set(key(c.shortName), c.id);
    }
    // Índice auxiliar para o "contém" (sem depender de iterar o Map).
    const catKeys: { key: string; id: string }[] = [];
    catByKey.forEach((id, k) => catKeys.push({ key: k, id }));
    const unmatched = new Set<string>();

    const remapPrices = (raw: unknown): RateTable["prices"] => {
      const out: RateTable["prices"] = {};
      if (!raw || typeof raw !== "object") return out;
      for (const [catName, row] of Object.entries(raw as Record<string, unknown>)) {
        const k = key(catName);
        const catId =
          catByKey.get(k) ??
          catKeys.find((e) => e.key.includes(k) || k.includes(e.key))?.id;
        if (!catId) { unmatched.add(catName); continue; }
        out[catId] = row as Record<string, number>;
      }
      return out;
    };

    const idMap = new Map<string, string>();
    const tableRows = rawTables.map((t) => {
      const id = crypto.randomUUID();
      idMap.set(String(t.id), id);
      return {
        id,
        propertyId,
        name: String(t.nome || "Tabela importada").trim(),
        prices: remapPrices(t.precos),
      };
    });
    const periodRows = rawPeriods
      .filter((p) => ISO_DATE.test(String(p.inicio)) && ISO_DATE.test(String(p.fim)))
      .map((p) => ({
        id: crypto.randomUUID(),
        propertyId,
        name: String(p.nome || "Período importado").trim(),
        startDate: String(p.inicio),
        endDate: String(p.fim),
        minNights: parseInt(String(p.min), 10) || 1,
        weekdayTableId: idMap.get(String(p.sem)) || null,
        weekendTableId: idMap.get(String(p.fds)) || null,
      }));
    if (tableRows.length === 0 && periodRows.length === 0) {
      throw new Error("Backup sem tabelas nem períodos válidos — nada foi alterado.");
    }

    // Só agora limpa o tarifário atual (períodos primeiro por causa das FKs).
    // Antes de apagar, cada tabela vai pro arquivo — o import do SIT era o
    // único caminho que destruía o histórico de preços sem rastro.
    const { data: doomed } = await admin
      .from("rate_tables").select("*").eq("propertyId", propertyId);
    for (const t of (doomed || []) as RateTable[]) {
      await this.snapshotTable(t, { id: actorId, name: actorName });
    }
    await admin.from("rate_periods").delete().eq("propertyId", propertyId);
    await admin.from("rate_tables").delete().eq("propertyId", propertyId);

    if (tableRows.length > 0) {
      const { error } = await admin.from("rate_tables").insert(tableRows);
      if (error) throw new Error(error.message);
    }
    if (periodRows.length > 0) {
      const { error } = await admin.from("rate_periods").insert(periodRows);
      if (error) throw new Error(error.message);
    }

    // Config comercial (val → pct; tipo → dayType).
    const fluctuations = (Array.isArray(config.fluctuations) ? config.fluctuations : []).map(
      (f: Record<string, unknown>) => ({
        id: String(f.id || crypto.randomUUID()),
        name: String(f.name || ""),
        pct: Number(f.val) || 0,
      })
    );
    const discounts = (Array.isArray(config.discounts) ? config.discounts : []).map(
      (d: Record<string, unknown>) => ({
        id: String(d.id || crypto.randomUUID()),
        name: String(d.name || ""),
        pct: Number(d.val) || 0,
      })
    );
    const promos = (Array.isArray(config.promocoes) ? config.promocoes : []).map(
      (p: Record<string, unknown>) => ({
        id: String(p.id || crypto.randomUUID()),
        name: String(p.nome || ""),
        pct: Number(p.val) || 0,
        startDate: String(p.inicio || ""),
        endDate: String(p.fim || ""),
        minNights: parseInt(String(p.minNights), 10) || 1,
        dayType: (["fds", "week"].includes(String(p.tipo)) ? String(p.tipo) : "all") as
          | "all" | "fds" | "week",
      })
    );

    await this.saveSettings(propertyId, {
      petFee: Number(config.petFee) || 50,
      fluctuations,
      discounts,
      promos,
      msgTemplate: typeof config.msgTemplate === "string" ? config.msgTemplate : null,
      msgSingleTemplate: typeof config.msgSingleTemplate === "string" ? config.msgSingleTemplate : null,
      eventTemplate: typeof config.eventTemplate === "string" ? config.eventTemplate : null,
    });

    const result: SitImportResult = {
      tables: tableRows.length,
      periods: periodRows.length,
      promos: promos.length,
      discounts: discounts.length,
      fluctuations: fluctuations.length,
      skippedWeddings: Array.isArray(backup.casamentos) ? backup.casamentos.length : 0,
      skippedEvents: Array.isArray(backup.eventos_festivos) ? backup.eventos_festivos.length : 0,
      unmatchedCategories: Array.from(unmatched).sort(),
    };

    await AuditService.log({
      propertyId,
      userId: actorId,
      userName: actorName,
      action: "RATE_SIT_IMPORTED",
      entity: "RATE_TABLE",
      entityId: propertyId,
      details: `Backup do SIT importado: ${result.tables} tabelas, ${result.periods} regras, ${result.promos} promoções.`,
    });

    return result;
  },
};
