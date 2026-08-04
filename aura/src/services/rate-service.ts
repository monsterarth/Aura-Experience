// Tarifário — CRUD das tabelas de preço, regras de calendário e config
// comercial, mais o contexto de orçamento (disponibilidade real + eventos) e a
// importação do backup do SIT (sistema offline que este módulo substitui).
import { supabaseAdmin } from "@/lib/supabase";
import {
  Guest,
  RatePeriod,
  RateQuoteRecord,
  RateQuoteStatus,
  RateSettings,
  RateTable,
  RateAvailability,
} from "@/types/aura";
import { findOverlaps, resolveFill, resolveOverwrite } from "@/lib/rate-engine";
import { AuditService } from "./audit-service";
import { GuestService } from "./guest-service";

const QUOTE_STATUSES: RateQuoteStatus[] = ["open", "sent", "negotiating", "won", "lost"];

/** Campos de rate_quotes que o PATCH pode alterar (whitelist). */
const QUOTE_PATCH_FIELDS = [
  "clientName", "clientDocument", "clientPhone", "clientEmail",
  "guestId", "stayId", "weddingId",
  "selectedCategory", "finalValue",
  "status", "lostReason", "notes",
] as const;

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
});

export interface RateBundle {
  tables: RateTable[];
  periods: RatePeriod[];
  settings: RateSettings;
  /** Categorias distintas das cabanas cadastradas (sugestões p/ tabelas). */
  cabinCategories: string[];
  /** Casamentos não-cancelados com saída futura (vínculo no orçamento). */
  weddings: { id: string; couple: string; checkin: string; checkout: string; status: string }[];
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
}

export const RateService = {
  async getBundle(propertyId: string): Promise<RateBundle> {
    const admin = supabaseAdmin!;
    const today = new Date().toISOString().slice(0, 10);

    const [tablesRes, periodsRes, settingsRes, cabinsRes, weddingsRes] = await Promise.all([
      admin.from("rate_tables").select("*").eq("propertyId", propertyId).order("createdAt"),
      admin.from("rate_periods").select("*").eq("propertyId", propertyId).order("startDate"),
      admin.from("rate_settings").select("*").eq("propertyId", propertyId).maybeSingle(),
      admin.from("cabins").select("category").eq("propertyId", propertyId),
      admin
        .from("weddings")
        .select("id, bride, groom, checkin, checkout, status")
        .eq("propertyId", propertyId)
        .neq("status", "cancelled")
        .gte("checkout", today)
        .order("checkin"),
    ]);

    const settings = (settingsRes.data as RateSettings) || DEFAULT_RATE_SETTINGS(propertyId);
    const cabinCategories = Array.from(
      new Set(((cabinsRes.data || []) as { category: string }[]).map((c) => c.category).filter(Boolean))
    ).sort();

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
      cabinCategories,
      weddings,
    };
  },

  // ── Tabelas de preço ───────────────────────────────────────────────────────

  async saveTable(
    propertyId: string,
    table: { id?: string; name: string; prices: RateTable["prices"] }
  ): Promise<string> {
    const admin = supabaseAdmin!;
    // Upsert por id: garante que um id existente pertence a ESTA propriedade
    // (senão o payload poderia sequestrar a linha de outra).
    if (table.id) {
      const { data: existing } = await admin
        .from("rate_tables")
        .select("propertyId")
        .eq("id", table.id)
        .maybeSingle();
      if (existing && existing.propertyId !== propertyId) {
        throw new Error("Tabela pertence a outra propriedade.");
      }
    }
    const id = table.id || crypto.randomUUID();
    const { error } = await admin.from("rate_tables").upsert(
      {
        id,
        propertyId,
        name: table.name,
        prices: table.prices || {},
        updatedAt: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
    if (error) throw new Error(error.message);
    return id;
  },

  async deleteTable(propertyId: string, id: string, actorId: string, actorName: string): Promise<void> {
    const admin = supabaseAdmin!;
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
      details: "Tabela de preços excluída.",
    });
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
    for (const key of ["msgTemplate", "msgSingleTemplate", "eventTemplate"] as const) {
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
      admin.from("cabins").select("id, name, category").eq("propertyId", propertyId),
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

    const availability: Record<string, RateAvailability> = {};
    for (const c of (cabinsRes.data || []) as { id: string; name: string; category: string }[]) {
      if (!c.category) continue;
      if (!availability[c.category]) availability[c.category] = { total: 0, free: 0, freeCabins: [] };
      availability[c.category].total++;
      if (!occupied.has(c.id)) {
        availability[c.category].free++;
        availability[c.category].freeCabins.push(c.name);
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

    const id = crypto.randomUUID();
    const { error } = await admin.from("rate_quotes").insert({
      id,
      propertyId,
      clientName: payload.clientName?.trim() || null,
      clientDocument: payload.clientDocument?.trim() || null,
      clientPhone: payload.clientPhone ? payload.clientPhone.replace(/\D/g, "") : null,
      clientEmail: payload.clientEmail?.trim() || null,
      guestId: payload.guestId || null,
      weddingId: payload.weddingId || null,
      checkIn: payload.checkIn,
      checkOut: payload.checkOut,
      adults: payload.adults ?? 2,
      children: payload.children ?? 0,
      babies: payload.babies ?? 0,
      pets: payload.pets ?? 0,
      fluctuationPct: payload.fluctuationPct ?? 0,
      discountIds: Array.isArray(payload.discountIds) ? payload.discountIds : [],
      adhocValue: payload.adhocValue ?? 0,
      adhocType: payload.adhocType === "brl" ? "brl" : "pct",
      snapshot: Array.isArray(payload.snapshot) ? payload.snapshot : [],
      selectedCategory: payload.selectedCategory || null,
      finalValue: typeof payload.finalValue === "number" ? payload.finalValue : null,
      status,
      notes: payload.notes?.trim() || null,
      createdBy: actorId,
      createdByName: actorName,
    });
    if (error) throw new Error(error.message);
    return id;
  },

  async updateQuote(
    propertyId: string,
    id: string,
    patch: Partial<RateQuoteRecord>
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
    if (Object.keys(clean).length === 0) return;

    const { error } = await admin
      .from("rate_quotes")
      .update({ ...clean, updatedAt: new Date().toISOString() })
      .eq("id", id)
      .eq("propertyId", propertyId);
    if (error) throw new Error(error.message);
  },

  async deleteQuote(propertyId: string, id: string): Promise<void> {
    const admin = supabaseAdmin!;
    const { error } = await admin
      .from("rate_quotes")
      .delete()
      .eq("id", id)
      .eq("propertyId", propertyId);
    if (error) throw new Error(error.message);
  },

  /**
   * Conversão (ganhou): garante o hóspede — usa o vinculado, encontra pelo
   * documento ou cria a ficha a partir dos dados do lead — e marca o orçamento
   * como 'won'. Devolve o necessário para abrir /admin/stays/new pré-preenchida.
   */
  async convertQuote(
    propertyId: string,
    id: string,
    actorId: string,
    actorName: string
  ): Promise<{ guestId: string | null; checkIn: string; checkOut: string }> {
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

    if (!guestId && quote.clientDocument) {
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
          guestId = await GuestService.upsertGuestDirect(propertyId, newGuest, actorId, actorName);
        }
      }
    }

    await this.updateQuote(propertyId, id, { status: "won", guestId });
    return { guestId, checkIn: quote.checkIn, checkOut: quote.checkOut };
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
    const idMap = new Map<string, string>();
    const tableRows = rawTables.map((t) => {
      const id = crypto.randomUUID();
      idMap.set(String(t.id), id);
      return {
        id,
        propertyId,
        name: String(t.nome || "Tabela importada").trim(),
        prices: (typeof t.precos === "object" && t.precos ? t.precos : {}) as RateTable["prices"],
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
