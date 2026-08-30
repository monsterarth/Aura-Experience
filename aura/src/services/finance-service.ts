// Financeiro — fase 1: o fólio vira extrato da estadia.
// Diárias (débitos categoria 'lodging') são lançadas uma por noite vencida, de
// forma idempotente (refDate + índice único); pagamentos entram como crédito
// (categoria 'payment'). Saldo = débitos − créditos.
// Isomórfico via db(): roda no cron/rotas (service role) e no admin (browser).
import { db } from "@/lib/supabase";
import { FolioItem, LodgingNight, Stay } from "@/types/aura";
import { formatDateBR, nightsOf, splitNightly } from "@/lib/rate-engine";
import { assertFolioOpen } from "@/lib/folio-guard";
import { AuditService } from "./audit-service";

type LodgingStayRow = Pick<
  Stay,
  "id" | "propertyId" | "checkIn" | "checkOut" | "status" | "nightlyRate" | "lodgingTotal"
> & { lodgingPaused?: boolean; nightlyOverrides?: Record<string, number>; billClosedAt?: string | null };

const LODGING_COLS =
  "id, propertyId, checkIn, checkOut, status, nightlyRate, lodgingTotal, lodgingPaused, nightlyOverrides, billClosedAt";

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
      .select(LODGING_COLS)
      .eq("id", stayId)
      .eq("propertyId", propertyId)
      .maybeSingle();
    if (!data) return 0;
    return this.postForStayRow(data as LodgingStayRow);
  },

  /**
   * Valor efetivo de cada noite: override quando existir, senão o rateio do
   * total. Override 0 = noite não cobrada (cortesia / lançamento indevido).
   */
  nightlyValues(stay: LodgingStayRow, allNights: string[]): Record<string, number> {
    const nightly = Number(stay.nightlyRate) || 0;
    const total = Number(stay.lodgingTotal) || nightly * allNights.length;
    const base = splitNightly(total, allNights.length);
    const overrides = stay.nightlyOverrides || {};
    const out: Record<string, number> = {};
    allNights.forEach((n, i) => {
      out[n] = overrides[n] !== undefined ? Number(overrides[n]) : base[i];
    });
    return out;
  },

  async postForStayRow(stay: LodgingStayRow): Promise<number> {
    const nightly = Number(stay.nightlyRate) || 0;
    if (nightly <= 0) return 0;
    if (stay.lodgingPaused) return 0;   // lançamento automático pausado
    if (stay.billClosedAt) return 0;    // conta encerrada não recebe mais nada
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

    const values = this.nightlyValues(stay, allNights);

    const rows = due
      .filter((n) => !already.has(n))
      .filter((n) => values[n] > 0)   // override 0 → noite não é cobrada
      .map((n) => ({
        id: crypto.randomUUID(),
        propertyId: stay.propertyId,
        stayId: stay.id,
        type: "debit",
        status: "pending",
        category: "lodging",
        description: `Diária ${formatDateBR(n)}`,
        quantity: 1,
        unitPrice: values[n],
        totalPrice: values[n],
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

  /** Varredura do cron: todas as estadias com diária ativa (não pausadas). */
  async postDueLodgingAll(): Promise<{ staysTouched: number; nightsPosted: number }> {
    const today = this.localToday();
    const { data } = await db()
      .from("stays")
      .select(LODGING_COLS)
      .gt("nightlyRate", 0)
      .eq("lodgingPaused", false)
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
    await assertFolioOpen(stayId);
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

  /** Painel de diárias: uma linha por noite, com valor efetivo e situação. */
  async getLodgingNights(propertyId: string, stayId: string): Promise<{
    nights: LodgingNight[];
    paused: boolean;
    nightlyRate: number;
    effectiveTotal: number;
  }> {
    const { data } = await db()
      .from("stays").select(LODGING_COLS)
      .eq("id", stayId).eq("propertyId", propertyId).maybeSingle();
    if (!data) return { nights: [], paused: false, nightlyRate: 0, effectiveTotal: 0 };
    const stay = data as LodgingStayRow;

    const checkIn = (stay.checkIn || "").slice(0, 10);
    const checkOut = (stay.checkOut || "").slice(0, 10);
    if (!checkIn || !checkOut || checkIn >= checkOut) {
      return { nights: [], paused: !!stay.lodgingPaused, nightlyRate: Number(stay.nightlyRate) || 0, effectiveTotal: 0 };
    }

    const allNights = nightsOf(checkIn, checkOut);
    const values = this.nightlyValues(stay, allNights);
    const nightly = Number(stay.nightlyRate) || 0;
    const base = splitNightly(Number(stay.lodgingTotal) || nightly * allNights.length, allNights.length);
    const overrides = stay.nightlyOverrides || {};
    const today = this.localToday();

    const { data: items } = await db()
      .from("folio_items").select("id, refDate")
      .eq("stayId", stayId).eq("category", "lodging");
    const byDate = new Map(
      ((items || []) as { id: string; refDate: string | null }[])
        .filter((i) => i.refDate).map((i) => [i.refDate as string, i.id])
    );

    const nights: LodgingNight[] = allNights.map((n, i) => ({
      date: n,
      value: values[n],
      baseValue: base[i],
      overridden: overrides[n] !== undefined,
      posted: byDate.has(n),
      folioItemId: byDate.get(n) ?? null,
      due: n < today,
    }));

    return {
      nights,
      paused: !!stay.lodgingPaused,
      nightlyRate: nightly,
      effectiveTotal: Math.round(nights.reduce((a, b) => a + b.value, 0) * 100) / 100,
    };
  },

  /** Liga/desliga o lançamento automático das diárias. */
  async setLodgingPaused(
    propertyId: string, stayId: string, paused: boolean,
    actor: { id: string; name: string }, approvedByName: string
  ): Promise<void> {
    const { error } = await db()
      .from("stays")
      .update({ lodgingPaused: paused, updatedAt: new Date().toISOString() })
      .eq("id", stayId).eq("propertyId", propertyId);
    if (error) throw new Error(error.message);

    await AuditService.log({
      propertyId, userId: actor.id, userName: actor.name,
      action: paused ? "LODGING_PAUSED" : "LODGING_RESUMED",
      entity: "STAY", entityId: stayId,
      details: `${paused ? "Pausou" : "Retomou"} o lançamento automático de diárias. Autorizado por ${approvedByName}.`,
    });
  },

  /**
   * Define (ou remove) o valor de UMA noite.
   *
   * value  > 0    → noite passa a valer isso
   * value == 0    → noite não é cobrada (e a diária lançada é estornada)
   * value == null → remove o acordo e volta ao rateio padrão
   *
   * Se a noite já estiver lançada, o item do fólio é ajustado/estornado no
   * mesmo passo. O override fica gravado mesmo quando a noite é estornada —
   * é isso que impede o cron de lançá-la de novo no dia seguinte.
   */
  async setNightOverride(
    propertyId: string, stayId: string, refDate: string, value: number | null,
    actor: { id: string; name: string }, approvedByName: string
  ): Promise<{ nights: LodgingNight[] }> {
    const { data } = await db()
      .from("stays").select(LODGING_COLS)
      .eq("id", stayId).eq("propertyId", propertyId).maybeSingle();
    if (!data) throw new Error("Estadia não encontrada.");
    const stay = data as LodgingStayRow;

    const checkIn = (stay.checkIn || "").slice(0, 10);
    const checkOut = (stay.checkOut || "").slice(0, 10);
    const allNights = nightsOf(checkIn, checkOut);
    if (!allNights.includes(refDate)) throw new Error("Noite fora do período da estadia.");
    if (value !== null && (!isFinite(value) || value < 0)) throw new Error("Valor inválido.");

    const overrides = { ...(stay.nightlyOverrides || {}) };
    const before = overrides[refDate];
    if (value === null) delete overrides[refDate];
    else overrides[refDate] = Math.round(value * 100) / 100;

    const { error } = await db()
      .from("stays")
      .update({ nightlyOverrides: overrides, updatedAt: new Date().toISOString() })
      .eq("id", stayId).eq("propertyId", propertyId);
    if (error) throw new Error(error.message);

    // Ajusta o que já estava lançado.
    const effective = this.nightlyValues({ ...stay, nightlyOverrides: overrides }, allNights)[refDate];
    const { data: existing } = await db()
      .from("folio_items").select("id")
      .eq("stayId", stayId).eq("category", "lodging").eq("refDate", refDate).maybeSingle();

    if (existing) {
      if (effective > 0) {
        await db().from("folio_items")
          .update({ unitPrice: effective, totalPrice: effective })
          .eq("id", existing.id);
      } else {
        await db().from("folio_items").delete().eq("id", existing.id);
      }
    }

    await AuditService.log({
      propertyId, userId: actor.id, userName: actor.name,
      action: "LODGING_NIGHT_OVERRIDDEN", entity: "STAY", entityId: stayId,
      details:
        `Diária de ${formatDateBR(refDate)}: ` +
        (value === null ? `voltou ao valor padrão (era R$ ${Number(before ?? 0).toFixed(2)})`
          : value === 0 ? "não será cobrada"
          : `passou a R$ ${value.toFixed(2)}`) +
        `. Autorizado por ${approvedByName}.`,
    });

    return { nights: (await this.getLodgingNights(propertyId, stayId)).nights };
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
