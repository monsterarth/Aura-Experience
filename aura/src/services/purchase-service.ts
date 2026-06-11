// src/services/purchase-service.ts
// Compras (notas). Ao "receber" uma compra, cada item vira uma ENTRADA de estoque
// via StockService.registerMovement — que recalcula custo médio e lastPurchaseCost.
import { supabase, supabaseAdmin } from "@/lib/supabase";
import { AuditService } from "./audit-service";
import { StockService } from "./stock-service";
import { Purchase, PurchaseItem, Supplier, StockLocation, StockProduct } from "@/types/aura";

type DB = NonNullable<typeof supabaseAdmin>;
function db(): DB {
  return ((typeof window === "undefined" && supabaseAdmin) ? supabaseAdmin : supabase) as DB;
}
const now = () => new Date().toISOString();
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
interface Actor { id: string; name: string; }

export const PurchaseService = {
  async getPurchases(propertyId: string): Promise<Purchase[]> {
    const [{ data: purchases }, { data: suppliers }, { data: locations }] = await Promise.all([
      db().from("purchases").select("*").eq("propertyId", propertyId).order("createdAt", { ascending: false }),
      db().from("suppliers").select("id, name").eq("propertyId", propertyId),
      db().from("stock_locations").select("id, name").eq("propertyId", propertyId),
    ]);

    const list = (purchases ?? []) as Purchase[];
    const ids = list.map((p) => p.id);
    let items: PurchaseItem[] = [];
    if (ids.length) {
      const { data } = await db().from("purchase_items").select("*").in("purchaseId", ids);
      items = (data ?? []) as PurchaseItem[];
    }
    const productIds = Array.from(new Set(items.map((i) => i.productId)));
    let products: { id: string; name: string; unit: string }[] = [];
    if (productIds.length) {
      const { data } = await db().from("stock_products").select("id, name, unit").in("id", productIds);
      products = (data ?? []) as typeof products;
    }

    const prodMap = new Map(products.map((p) => [p.id, p]));
    const supMap = new Map(((suppliers ?? []) as Supplier[]).map((s) => [s.id, s]));
    const locMap = new Map(((locations ?? []) as StockLocation[]).map((l) => [l.id, l]));
    const itemsByPurchase = new Map<string, PurchaseItem[]>();
    for (const i of items) {
      const arr = itemsByPurchase.get(i.purchaseId) ?? [];
      arr.push({ ...i, product: prodMap.get(i.productId) as StockProduct | undefined });
      itemsByPurchase.set(i.purchaseId, arr);
    }

    return list.map((p) => ({
      ...p,
      supplier: p.supplierId ? (supMap.get(p.supplierId) as Supplier | undefined) : undefined,
      location: p.locationId ? (locMap.get(p.locationId) as StockLocation | undefined) : undefined,
      items: itemsByPurchase.get(p.id) ?? [],
    }));
  },

  async upsertPurchase(propertyId: string, payload: Partial<Purchase>, items: Partial<PurchaseItem>[], actor: Actor): Promise<string> {
    const isNew = !payload.id;
    const id = payload.id ?? crypto.randomUUID();
    const totalValue = round2(items.reduce((s, i) => s + Number(i.quantity ?? 0) * Number(i.unitCost ?? 0), 0));

    const row = {
      id, propertyId,
      supplierId: payload.supplierId ?? null,
      locationId: payload.locationId ?? null,
      invoiceNumber: payload.invoiceNumber ?? null,
      status: payload.status ?? "draft",
      isEmergency: payload.isEmergency ?? false,
      orderDate: payload.orderDate ?? null,
      receivedDate: payload.receivedDate ?? null,
      totalValue,
      notes: payload.notes ?? null,
      updatedAt: now(),
      ...(isNew && { createdAt: now() }),
    };
    const { error } = await db().from("purchases").upsert(row);
    if (error) throw error;

    // Substitui os itens (só permitido enquanto não recebida)
    await db().from("purchase_items").delete().eq("purchaseId", id);
    if (items.length) {
      const rows = items
        .filter((i) => i.productId)
        .map((i) => ({
          id: crypto.randomUUID(), purchaseId: id, productId: i.productId,
          quantity: Number(i.quantity ?? 0), unitCost: Number(i.unitCost ?? 0),
          totalCost: round2(Number(i.quantity ?? 0) * Number(i.unitCost ?? 0)),
          expiryDate: i.expiryDate ?? null, batchCode: i.batchCode ?? null, createdAt: now(),
        }));
      if (rows.length) {
        const { error: ie } = await db().from("purchase_items").insert(rows);
        if (ie) throw ie;
      }
    }

    await AuditService.log({
      propertyId, userId: actor.id, userName: actor.name,
      action: isNew ? "PURCHASE_CREATED" : "UPDATE", entity: "PURCHASE", entityId: id,
      details: `Compra ${isNew ? "criada" : "editada"}${payload.invoiceNumber ? ` (NF ${payload.invoiceNumber})` : ""}.`,
    });
    return id;
  },

  /** Recebe a compra: gera entradas de estoque (custo médio recalculado) e marca received. */
  async receivePurchase(propertyId: string, purchaseId: string, actor: Actor): Promise<void> {
    const { data: purchase } = await db().from("purchases").select("*").eq("id", purchaseId).eq("propertyId", propertyId).single();
    if (!purchase) throw new Error("Compra não encontrada.");
    if (purchase.status === "received") throw new Error("Compra já foi recebida.");
    if (!purchase.locationId) throw new Error("Defina o local de recebimento antes de receber.");

    const { data: items } = await db().from("purchase_items").select("*").eq("purchaseId", purchaseId);
    if (!items || items.length === 0) throw new Error("Compra sem itens.");

    for (const it of items as PurchaseItem[]) {
      await StockService.registerMovement(propertyId, {
        productId: it.productId,
        type: "entry",
        quantity: Number(it.quantity),
        unitCost: Number(it.unitCost),
        toLocationId: purchase.locationId,
        referenceType: "purchase",
        referenceId: purchaseId,
        notes: `Recebimento${purchase.invoiceNumber ? ` NF ${purchase.invoiceNumber}` : ""}`,
      }, actor);
    }

    await db().from("purchases").update({ status: "received", receivedDate: now(), updatedAt: now() }).eq("id", purchaseId);
    await AuditService.log({
      propertyId, userId: actor.id, userName: actor.name,
      action: "PURCHASE_RECEIVED", entity: "PURCHASE", entityId: purchaseId,
      details: `Compra recebida — ${items.length} item(ns) deram entrada no estoque.`,
    });
  },

  async deletePurchase(propertyId: string, id: string, actor: Actor): Promise<void> {
    const { data: p } = await db().from("purchases").select("status").eq("id", id).single();
    if (p?.status === "received") throw new Error("Não é possível excluir uma compra já recebida.");
    const { error } = await db().from("purchases").delete().eq("id", id).eq("propertyId", propertyId);
    if (error) throw error;
    await AuditService.log({
      propertyId, userId: actor.id, userName: actor.name,
      action: "PURCHASE_CANCELLED", entity: "PURCHASE", entityId: id, details: "Compra excluída.",
    });
  },
};
