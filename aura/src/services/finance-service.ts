// Financeiro — fase 1: o fólio vira extrato da estadia.
// Diárias (débitos categoria 'lodging') são lançadas uma por noite vencida, de
// forma idempotente (refDate + índice único); pagamentos entram como crédito
// (categoria 'payment'). Saldo = débitos − créditos.
// Isomórfico via db(): roda no cron/rotas (service role) e no admin (browser).
import { db } from "@/lib/supabase";
import { FolioItem, Stay } from "@/types/aura";
import { formatDateBR, nightsOf, splitNightly } from "@/lib/rate-engine";
import { AuditService } from "./audit-service";

type LodgingStayRow = Pick<
  Stay,
  "id" | "propertyId" | "checkIn" | "checkOut" | "status" | "nightlyRate" | "lodgingTotal"
>;

export const FinanceService = {
  /** Hoje no fuso da pousada — o servidor roda em UTC. */
  localToday(): string {
    return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  },

  /** Débitos, créditos e saldo de uma lista de itens do fólio. */
  summarize(items: FolioItem[]): { debits: number; credits: number; balance: number } {
    let debits = 0, credits = 0;
    for (const i of items) {
      if (i.type === "credit") credits += Number(i.totalPrice) || 0;
      else debits += Number(i.totalPrice) || 0;
    }
    return { debits, credits, balance: debits - credits };
  },

  /**
   * Lança as diárias VENCIDAS (noites já passadas) que ainda não estão no
   * fólio. Idempotente: a noite é identificada por refDate e protegida por
   * índice único — rodar duas vezes não duplica. Retorna quantas lançou.
   */
  async postDueLodgingForStay(propertyId: string, stayId: string): Promise<number> {
    const { data } = await db()
      .from("stays")
      .select("id, propertyId, checkIn, checkOut, status, nightlyRate, lodgingTotal")
      .eq("id", stayId)
      .eq("propertyId", propertyId)
      .maybeSingle();
    if (!data) return 0;
    return this.postForStayRow(data as LodgingStayRow);
  },

  async postForStayRow(stay: LodgingStayRow): Promise<number> {
    const nightly = Number(stay.nightlyRate) || 0;
    if (nightly <= 0) return 0;
    if (["cancelled", "archived"].includes(stay.status)) return 0;

    const checkIn = (stay.checkIn || "").slice(0, 10);
    const checkOut = (stay.checkOut || "").slice(0, 10);
    if (!checkIn || !checkOut || checkIn >= checkOut) return 0;

    const today = this.localToday();
    const allNights = nightsOf(checkIn, checkOut);
    const due = allNights.filter((n) => n < today);
    if (due.length === 0) return 0;

    const { data: posted } = await db()
      .from("folio_items")
      .select("refDate")
      .eq("stayId", stay.id)
      .eq("category", "lodging");
    const already = new Set(((posted || []) as { refDate: string | null }[]).map((p) => p.refDate));

    const total = Number(stay.lodgingTotal) || nightly * allNights.length;
    const values = splitNightly(total, allNights.length);

    const rows = due
      .filter((n) => !already.has(n))
      .map((n) => ({
        id: crypto.randomUUID(),
        propertyId: stay.propertyId,
        stayId: stay.id,
        type: "debit",
        status: "pending",
        category: "lodging",
        description: `Diária ${formatDateBR(n)}`,
        quantity: 1,
        unitPrice: values[allNights.indexOf(n)],
        totalPrice: values[allNights.indexOf(n)],
        refDate: n,
        addedBy: "Sistema",
        createdAt: new Date().toISOString(),
      }));
    if (rows.length === 0) return 0;

    const { error } = await db().from("folio_items").insert(rows);
    if (error) {
      // Corrida com outro processo (índice único) — o outro lançou; não é falha.
      console.error(`[Finance] Falha ao lançar diárias da estadia ${stay.id}:`, error.message);
      return 0;
    }

    await db().from("stays").update({ hasOpenFolio: true }).eq("id", stay.id);
    return rows.length;
  },

  /** Varredura do cron: todas as estadias com diária configurada. */
  async postDueLodgingAll(): Promise<{ staysTouched: number; nightsPosted: number }> {
    const today = this.localToday();
    const { data } = await db()
      .from("stays")
      .select("id, propertyId, checkIn, checkOut, status, nightlyRate, lodgingTotal")
      .gt("nightlyRate", 0)
      .not("status", "in", "(cancelled,archived)")
      .lt("checkIn", `${today}T23:59:59`);

    let staysTouched = 0, nightsPosted = 0;
    for (const row of (data || []) as LodgingStayRow[]) {
      const n = await this.postForStayRow(row);
      if (n > 0) { staysTouched++; nightsPosted += n; }
    }
    return { staysTouched, nightsPosted };
  },

  /** Pagamento/crédito no fólio (ex.: hospedagem paga antecipada). */
  async addPayment(
    propertyId: string,
    stayId: string,
    description: string,
    amount: number,
    actorId: string,
    actorName: string
  ): Promise<void> {
    if (!(amount > 0)) throw new Error("Valor do pagamento inválido.");
    const { error } = await db().from("folio_items").insert({
      id: crypto.randomUUID(),
      propertyId,
      stayId,
      type: "credit",
      status: "paid",
      category: "payment",
      description: description.trim() || "Pagamento",
      quantity: 1,
      unitPrice: amount,
      totalPrice: amount,
      addedBy: actorName,
      createdAt: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);

    await AuditService.log({
      propertyId, userId: actorId, userName: actorName,
      action: "UPDATE", entity: "STAY", entityId: stayId,
      details: `Lançou crédito no fólio: ${description.trim() || "Pagamento"} — R$ ${amount.toFixed(2)}`,
    });
  },

  /** Define a diária de uma estadia avulsa (sem orçamento) e faz o catch-up. */
  async setStayRate(
    propertyId: string,
    stayId: string,
    nightlyRate: number,
    lodgingTotal: number,
    actorId: string,
    actorName: string
  ): Promise<number> {
    if (!(nightlyRate > 0)) throw new Error("Diária inválida.");
    const { error } = await db()
      .from("stays")
      .update({ nightlyRate, lodgingTotal, updatedAt: new Date().toISOString() })
      .eq("id", stayId)
      .eq("propertyId", propertyId);
    if (error) throw new Error(error.message);

    await AuditService.log({
      propertyId, userId: actorId, userName: actorName,
      action: "UPDATE", entity: "STAY", entityId: stayId,
      details: `Definiu diária: R$ ${nightlyRate.toFixed(2)}/noite (total R$ ${lodgingTotal.toFixed(2)}).`,
    });

    return this.postDueLodgingForStay(propertyId, stayId);
  },
};
