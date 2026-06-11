// src/services/stock-service.ts
// Lógica de negócio do MÓDULO ESTOQUE — Fase 0 (Fundação).
// Movimentações (entry/exit/transfer/adjustment/loss) são a fonte da verdade;
// stock_balances é o saldo materializado e averageCost é o custo médio ponderado.
//
// Client picker: server-side (API routes) usa supabaseAdmin (ignora RLS);
// client-side usa supabase (RLS authenticated). Mesmo padrão do AuditService.
import { supabase, supabaseAdmin } from "@/lib/supabase";
import { AuditService } from "./audit-service";
import {
  AuditLog,
  StockCategory,
  StockLocation,
  StockProduct,
  StockMovement,
  StockMovementType,
  StockSettings,
} from "@/types/aura";

type DB = NonNullable<typeof supabaseAdmin>;
function db(): DB {
  const client = (typeof window === "undefined" && supabaseAdmin) ? supabaseAdmin : supabase;
  return client as DB;
}

const now = () => new Date().toISOString();
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;

interface Actor { id: string; name: string; }

interface MovementInput {
  productId: string;
  type: StockMovementType;
  quantity: number;            // adjustment aceita negativo; demais são positivos
  unitCost?: number;           // entry: custo da compra; demais: default = averageCost
  fromLocationId?: string | null;
  toLocationId?: string | null;
  lossType?: StockMovement["lossType"];
  referenceType?: StockMovement["referenceType"];
  referenceId?: string | null;
  notes?: string;
  allowNegative?: boolean;     // confirma explicitamente deixar o saldo do local negativo
}

/** Erro lançado quando a operação levaria o saldo do local abaixo de zero. */
export interface NegativeStockError extends Error {
  code: "NEGATIVE_STOCK";
  available: number;
  requested: number;
  resulting: number;
}

const AUDIT_ACTION: Record<StockMovementType, AuditLog["action"]> = {
  entry: "STOCK_ENTRY",
  exit: "STOCK_EXIT",
  transfer: "STOCK_TRANSFER",
  adjustment: "STOCK_ADJUSTMENT",
  loss: "STOCK_LOSS",
};

export const StockService = {
  // ── CATEGORIAS ─────────────────────────────────────────────────────────────
  async getCategories(propertyId: string): Promise<StockCategory[]> {
    const { data, error } = await db()
      .from("stock_categories")
      .select("*")
      .eq("propertyId", propertyId)
      .order("order", { ascending: true });
    if (error) { console.error("getCategories", error); return []; }
    return (data ?? []) as StockCategory[];
  },

  async upsertCategory(propertyId: string, payload: Partial<StockCategory>, actor: Actor): Promise<string> {
    const isNew = !payload.id;
    const id = payload.id ?? crypto.randomUUID();
    const row = {
      ...payload,
      id,
      propertyId,
      appliesTo: payload.appliesTo ?? "consumable",
      active: payload.active ?? true,
      updatedAt: now(),
      ...(isNew && { createdAt: now() }),
    };
    const { error } = await db().from("stock_categories").upsert(row);
    if (error) throw error;
    await AuditService.log({
      propertyId, userId: actor.id, userName: actor.name,
      action: isNew ? "CREATE" : "UPDATE", entity: "STOCK", entityId: id,
      details: `Categoria de estoque ${isNew ? "criada" : "editada"}: ${payload.name}.`,
    });
    return id;
  },

  async deleteCategory(propertyId: string, id: string, actor: Actor): Promise<void> {
    const { error } = await db().from("stock_categories").delete().eq("id", id).eq("propertyId", propertyId);
    if (error) throw error;
    await AuditService.log({
      propertyId, userId: actor.id, userName: actor.name,
      action: "DELETE", entity: "STOCK", entityId: id, details: "Categoria de estoque removida.",
    });
  },

  // ── LOCAIS ─────────────────────────────────────────────────────────────────
  async getLocations(propertyId: string): Promise<StockLocation[]> {
    const { data, error } = await db()
      .from("stock_locations")
      .select("*")
      .eq("propertyId", propertyId)
      .order("name", { ascending: true });
    if (error) { console.error("getLocations", error); return []; }
    return (data ?? []) as StockLocation[];
  },

  async upsertLocation(propertyId: string, payload: Partial<StockLocation>, actor: Actor): Promise<string> {
    const isNew = !payload.id;
    const id = payload.id ?? crypto.randomUUID();
    const row = {
      ...payload,
      id,
      propertyId,
      type: payload.type ?? "warehouse",
      active: payload.active ?? true,
      updatedAt: now(),
      ...(isNew && { createdAt: now() }),
    };
    const { error } = await db().from("stock_locations").upsert(row);
    if (error) throw error;
    await AuditService.log({
      propertyId, userId: actor.id, userName: actor.name,
      action: isNew ? "CREATE" : "UPDATE", entity: "STOCK", entityId: id,
      details: `Local de estoque ${isNew ? "criado" : "editado"}: ${payload.name}.`,
    });
    return id;
  },

  async deleteLocation(propertyId: string, id: string, actor: Actor): Promise<void> {
    const { error } = await db().from("stock_locations").delete().eq("id", id).eq("propertyId", propertyId);
    if (error) throw error;
    await AuditService.log({
      propertyId, userId: actor.id, userName: actor.name,
      action: "DELETE", entity: "STOCK", entityId: id, details: "Local de estoque removido.",
    });
  },

  // ── PRODUTOS ────────────────────────────────────────────────────────────────
  /** Produtos (não deletados) já com categoria e quantidade total agregada por todos os locais. */
  async getProducts(propertyId: string): Promise<StockProduct[]> {
    const [{ data: products }, { data: balances }, { data: categories }] = await Promise.all([
      db().from("stock_products").select("*").eq("propertyId", propertyId).eq("deleted", false).order("name"),
      db().from("stock_balances").select("productId, quantity").eq("propertyId", propertyId),
      db().from("stock_categories").select("*").eq("propertyId", propertyId),
    ]);

    const totals = new Map<string, number>();
    for (const b of (balances ?? []) as { productId: string; quantity: number }[]) {
      totals.set(b.productId, (totals.get(b.productId) ?? 0) + Number(b.quantity));
    }
    const catMap = new Map((categories ?? []).map((c: StockCategory) => [c.id, c]));

    return ((products ?? []) as StockProduct[]).map((p) => ({
      ...p,
      totalQuantity: totals.get(p.id) ?? 0,
      category: p.categoryId ? (catMap.get(p.categoryId) as StockCategory | undefined) : undefined,
    }));
  },

  /** Produtos cuja quantidade total está abaixo do estoque mínimo. */
  async getLowStock(propertyId: string): Promise<StockProduct[]> {
    const products = await this.getProducts(propertyId);
    return products.filter((p) => p.active && (p.totalQuantity ?? 0) < Number(p.minStock));
  },

  async upsertProduct(propertyId: string, payload: Partial<StockProduct>, actor: Actor): Promise<string> {
    const isNew = !payload.id;
    const id = payload.id ?? crypto.randomUUID();
    const row = {
      ...payload,
      id,
      propertyId,
      unit: payload.unit ?? "un",
      trackExpiry: payload.trackExpiry ?? false,
      minStock: payload.minStock ?? 0,
      averageCost: payload.averageCost ?? 0,
      active: payload.active ?? true,
      deleted: payload.deleted ?? false,
      updatedAt: now(),
      ...(isNew && { createdAt: now() }),
    };
    // Não deixar o cliente sobrescrever campos derivados em update
    delete (row as Record<string, unknown>).category;
    delete (row as Record<string, unknown>).totalQuantity;

    const { error } = await db().from("stock_products").upsert(row);
    if (error) throw error;
    await AuditService.log({
      propertyId, userId: actor.id, userName: actor.name,
      action: isNew ? "CREATE" : "UPDATE", entity: "STOCK", entityId: id,
      details: `Produto ${isNew ? "criado" : "editado"}: ${payload.name}.`,
    });
    return id;
  },

  /** Soft-delete (deleted = true) para preservar histórico de movimentações. */
  async deleteProduct(propertyId: string, id: string, actor: Actor): Promise<void> {
    const { error } = await db()
      .from("stock_products")
      .update({ deleted: true, active: false, updatedAt: now() })
      .eq("id", id).eq("propertyId", propertyId);
    if (error) throw error;
    await AuditService.log({
      propertyId, userId: actor.id, userName: actor.name,
      action: "DELETE", entity: "STOCK", entityId: id, details: "Produto arquivado.",
    });
  },

  // ── MOVIMENTAÇÕES ────────────────────────────────────────────────────────────
  async getMovements(propertyId: string, limit = 100): Promise<StockMovement[]> {
    const [{ data: moves }, { data: products }, { data: locations }] = await Promise.all([
      db().from("stock_movements").select("*").eq("propertyId", propertyId)
        .order("createdAt", { ascending: false }).limit(limit),
      db().from("stock_products").select("id, name").eq("propertyId", propertyId),
      db().from("stock_locations").select("id, name").eq("propertyId", propertyId),
    ]);
    const pMap = new Map((products ?? []).map((p: { id: string; name: string }) => [p.id, p]));
    const lMap = new Map((locations ?? []).map((l: { id: string; name: string }) => [l.id, l]));
    return ((moves ?? []) as StockMovement[]).map((m) => ({
      ...m,
      product: pMap.get(m.productId) as StockProduct | undefined,
      fromLocation: m.fromLocationId ? (lMap.get(m.fromLocationId) as StockLocation | undefined) : undefined,
      toLocation: m.toLocationId ? (lMap.get(m.toLocationId) as StockLocation | undefined) : undefined,
    }));
  },

  async getBalances(propertyId: string, productId?: string) {
    let q = db().from("stock_balances").select("*").eq("propertyId", propertyId);
    if (productId) q = q.eq("productId", productId);
    const { data, error } = await q;
    if (error) { console.error("getBalances", error); return []; }
    return data ?? [];
  },

  /**
   * Registra uma movimentação e atualiza saldos + custo médio.
   * NOTA: sem transação atômica nesta fase (várias chamadas sequenciais).
   * Evoluir para função Postgres se houver concorrência alta. Lotes/FIFO na Fase 2.
   */
  async registerMovement(propertyId: string, input: MovementInput, actor: Actor): Promise<string> {
    const client = db();
    const { data: product } = await client
      .from("stock_products").select("*").eq("id", input.productId).eq("propertyId", propertyId).single();
    if (!product) throw new Error("Produto não encontrado.");

    // Validação mínima de locais por tipo
    if ((input.type === "exit" || input.type === "loss") && !input.fromLocationId)
      throw new Error("Saída/perda exige local de origem.");
    if (input.type === "entry" && !input.toLocationId)
      throw new Error("Entrada exige local de destino.");
    if (input.type === "transfer" && (!input.fromLocationId || !input.toLocationId))
      throw new Error("Transferência exige origem e destino.");
    if (input.type === "adjustment" && !input.toLocationId && !input.fromLocationId)
      throw new Error("Ajuste exige um local.");

    const qty = Number(input.quantity);
    const fallbackCost = Number(product.averageCost) || 0;
    const unitCost = input.type === "entry"
      ? round4(Number(input.unitCost ?? 0))
      : round4(Number(input.unitCost ?? fallbackCost));
    const totalCost = round2(unitCost * Math.abs(qty));

    // Guarda de estoque negativo: bloqueia operações que REDUZEM o saldo de um
    // local abaixo de zero, a menos que allowNegative seja explicitado.
    const guard = this._negativeGuard(input, qty);
    if (guard && guard.delta < 0 && !input.allowNegative) {
      const current = await this._balanceAt(client, input.productId, guard.locationId);
      const resulting = current + guard.delta;
      if (resulting < 0) {
        throw Object.assign(new Error("NEGATIVE_STOCK"), {
          code: "NEGATIVE_STOCK", available: current, requested: Math.abs(guard.delta), resulting,
        }) as NegativeStockError;
      }
    }

    const id = crypto.randomUUID();
    const { error: movErr } = await client.from("stock_movements").insert({
      id,
      propertyId,
      productId: input.productId,
      type: input.type,
      quantity: qty,
      unitCost,
      totalCost,
      fromLocationId: input.fromLocationId ?? null,
      toLocationId: input.toLocationId ?? null,
      lossType: input.lossType ?? null,
      referenceType: input.referenceType ?? "manual",
      referenceId: input.referenceId ?? null,
      performedBy: actor.id,
      performedByName: actor.name,
      notes: input.notes ?? null,
      createdAt: now(),
    });
    if (movErr) throw movErr;

    // Custo médio ponderado: recalcular ANTES de aplicar o saldo da entrada.
    if (input.type === "entry") {
      const preQty = await this._totalQty(client, input.productId);
      const newAvg = preQty + qty > 0
        ? round4((preQty * fallbackCost + qty * unitCost) / (preQty + qty))
        : unitCost;
      await client.from("stock_products")
        .update({ averageCost: newAvg, lastPurchaseCost: unitCost, updatedAt: now() })
        .eq("id", input.productId);
    }

    // Aplicar deltas de saldo
    switch (input.type) {
      case "entry":
        await this._applyDelta(client, propertyId, input.productId, input.toLocationId!, +qty);
        break;
      case "exit":
      case "loss":
        await this._applyDelta(client, propertyId, input.productId, input.fromLocationId!, -qty);
        break;
      case "transfer":
        await this._applyDelta(client, propertyId, input.productId, input.fromLocationId!, -qty);
        await this._applyDelta(client, propertyId, input.productId, input.toLocationId!, +qty);
        break;
      case "adjustment":
        // qty é um delta (+/-) aplicado a um único local
        await this._applyDelta(client, propertyId, input.productId, (input.toLocationId ?? input.fromLocationId)!, qty);
        break;
    }

    await AuditService.log({
      propertyId, userId: actor.id, userName: actor.name,
      action: AUDIT_ACTION[input.type], entity: "STOCK", entityId: input.productId,
      details: `${input.type.toUpperCase()} de ${qty} ${product.unit} — ${product.name}.`,
    });
    return id;
  },

  async _totalQty(client: DB, productId: string): Promise<number> {
    const { data } = await client.from("stock_balances").select("quantity").eq("productId", productId);
    return ((data ?? []) as { quantity: number }[]).reduce((s, b) => s + Number(b.quantity), 0);
  },

  /** Local + delta a verificar contra saldo negativo (null quando não se aplica). */
  _negativeGuard(input: MovementInput, qty: number): { locationId: string; delta: number } | null {
    switch (input.type) {
      case "exit":
      case "loss":
        return input.fromLocationId ? { locationId: input.fromLocationId, delta: -qty } : null;
      case "transfer":
        return input.fromLocationId ? { locationId: input.fromLocationId, delta: -qty } : null;
      case "adjustment": {
        const loc = input.toLocationId ?? input.fromLocationId;
        return loc ? { locationId: loc, delta: qty } : null;  // qty já é o delta assinado
      }
      default:
        return null;
    }
  },

  async _balanceAt(client: DB, productId: string, locationId: string): Promise<number> {
    const { data } = await client.from("stock_balances")
      .select("quantity").eq("productId", productId).eq("locationId", locationId).maybeSingle();
    return data ? Number(data.quantity) : 0;
  },

  async _applyDelta(client: DB, propertyId: string, productId: string, locationId: string, delta: number): Promise<void> {
    const { data: existing } = await client.from("stock_balances")
      .select("id, quantity").eq("productId", productId).eq("locationId", locationId).maybeSingle();
    if (existing) {
      await client.from("stock_balances")
        .update({ quantity: Number(existing.quantity) + delta, updatedAt: now() })
        .eq("id", existing.id);
    } else {
      await client.from("stock_balances").insert({
        id: crypto.randomUUID(), propertyId, productId, locationId, quantity: delta, updatedAt: now(),
      });
    }
  },

  // ── PARÂMETROS ────────────────────────────────────────────────────────────────
  async getSettings(propertyId: string): Promise<StockSettings> {
    const { data } = await db().from("stock_settings").select("*").eq("propertyId", propertyId).maybeSingle();
    return (data as StockSettings) ?? {
      propertyId, noTurnoverDays: 60, expiryAlertLeadDays: 30, autoLossOnExpiry: false, updatedAt: now(),
    };
  },

  async saveSettings(propertyId: string, payload: Partial<StockSettings>, actor: Actor): Promise<void> {
    const row = {
      propertyId,
      noTurnoverDays: payload.noTurnoverDays ?? 60,
      expiryAlertLeadDays: payload.expiryAlertLeadDays ?? 30,
      autoLossOnExpiry: payload.autoLossOnExpiry ?? false,
      updatedAt: now(),
    };
    const { error } = await db().from("stock_settings").upsert(row);
    if (error) throw error;
    await AuditService.log({
      propertyId, userId: actor.id, userName: actor.name,
      action: "UPDATE", entity: "STOCK", entityId: propertyId, details: "Parâmetros de estoque atualizados.",
    });
  },
};
