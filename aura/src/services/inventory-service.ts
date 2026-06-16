// src/services/inventory-service.ts
// Inventário físico por local: abre uma contagem com snapshot do saldo do sistema,
// recebe as contagens, e ao fechar gera ajustes (via StockService) e calcula acuracidade.
import { supabase, supabaseAdmin } from "@/lib/supabase";
import { AuditService } from "./audit-service";
import { StockService } from "./stock-service";
import { InventoryCount, InventoryCountItem, StockLocation, StockProduct } from "@/types/aura";

type DB = NonNullable<typeof supabaseAdmin>;
function db(): DB {
  return ((typeof window === "undefined" && supabaseAdmin) ? supabaseAdmin : supabase) as DB;
}
const now = () => new Date().toISOString();
interface Actor { id: string; name: string; }

export const InventoryService = {
  async getCounts(propertyId: string): Promise<InventoryCount[]> {
    const { data: counts } = await db().from("inventory_counts").select("*").eq("propertyId", propertyId).order("createdAt", { ascending: false });
    const list = (counts ?? []) as InventoryCount[];
    const { data: locations } = await db().from("stock_locations").select("id, name").eq("propertyId", propertyId);
    const lMap = new Map(((locations ?? []) as StockLocation[]).map((l) => [l.id, l]));
    const ids = list.map((c) => c.id);
    const countMap = new Map<string, number>();
    if (ids.length) {
      const { data: items } = await db().from("inventory_count_items").select("countId").in("countId", ids);
      for (const i of (items ?? []) as { countId: string }[]) countMap.set(i.countId, (countMap.get(i.countId) ?? 0) + 1);
    }
    return list.map((c) => ({
      ...c,
      location: c.locationId ? (lMap.get(c.locationId) as StockLocation | undefined) : undefined,
      itemCount: countMap.get(c.id) ?? 0,
    }));
  },

  async getCount(propertyId: string, id: string): Promise<InventoryCount | null> {
    const { data: count } = await db().from("inventory_counts").select("*").eq("id", id).eq("propertyId", propertyId).single();
    if (!count) return null;
    const [{ data: items }, { data: products }, { data: locations }] = await Promise.all([
      db().from("inventory_count_items").select("*").eq("countId", id),
      db().from("stock_products").select("id, name, unit").eq("propertyId", propertyId),
      db().from("stock_locations").select("id, name").eq("propertyId", propertyId),
    ]);
    const pMap = new Map((products ?? []).map((p: { id: string }) => [p.id, p]));
    const lMap = new Map(((locations ?? []) as StockLocation[]).map((l) => [l.id, l]));
    const withProd = ((items ?? []) as InventoryCountItem[])
      .map((i) => ({ ...i, product: pMap.get(i.productId) as StockProduct | undefined }))
      .sort((a, b) => (a.product?.name ?? "").localeCompare(b.product?.name ?? ""));
    const c = count as InventoryCount;
    return { ...c, items: withProd, location: c.locationId ? (lMap.get(c.locationId) as StockLocation | undefined) : undefined };
  },

  /** Abre uma contagem por local, com snapshot do saldo de cada produto no escopo. */
  async createCount(propertyId: string, opts: { locationId: string; scope?: string[] }, actor: Actor): Promise<string> {
    if (!opts.locationId) throw new Error("Selecione um local para o inventário.");
    let pq = db().from("stock_products").select("id").eq("propertyId", propertyId).eq("deleted", false).eq("active", true);
    if (opts.scope && opts.scope.length) pq = pq.in("categoryId", opts.scope);
    const { data: products } = await pq;
    const { data: balances } = await db().from("stock_balances").select("productId, quantity").eq("propertyId", propertyId).eq("locationId", opts.locationId);
    const balMap = new Map(((balances ?? []) as { productId: string; quantity: number }[]).map((b) => [b.productId, Number(b.quantity)]));

    const id = crypto.randomUUID();
    await db().from("inventory_counts").insert({
      id, propertyId, locationId: opts.locationId, scope: opts.scope ?? [], status: "counting",
      createdBy: actor.id, createdByName: actor.name, startedAt: now(), createdAt: now(), updatedAt: now(),
    });
    const items = ((products ?? []) as { id: string }[]).map((p) => ({
      id: crypto.randomUUID(), countId: id, productId: p.id, locationId: opts.locationId,
      systemQty: balMap.get(p.id) ?? 0, countedQty: null, difference: null, adjusted: false, createdAt: now(),
    }));
    if (items.length) await db().from("inventory_count_items").insert(items);

    await AuditService.log({
      propertyId, userId: actor.id, userName: actor.name,
      action: "INVENTORY_OPENED", entity: "INVENTORY", entityId: id, details: `Inventário aberto (${items.length} itens).`,
    });
    return id;
  },

  /** Salva as quantidades contadas (recalcula a diferença com base no snapshot). */
  async saveItems(propertyId: string, countId: string, updates: { id: string; countedQty: number | null }[]): Promise<void> {
    const { data: existing } = await db().from("inventory_count_items").select("id, systemQty").eq("countId", countId);
    const sysMap = new Map(((existing ?? []) as { id: string; systemQty: number }[]).map((i) => [i.id, Number(i.systemQty)]));
    for (const u of updates) {
      if (!sysMap.has(u.id)) continue;
      const counted = u.countedQty === null || u.countedQty === undefined ? null : Number(u.countedQty);
      const diff = counted === null ? null : counted - (sysMap.get(u.id) ?? 0);
      await db().from("inventory_count_items").update({ countedQty: counted, difference: diff }).eq("id", u.id);
    }
    await db().from("inventory_counts").update({ updatedAt: now() }).eq("id", countId);
  },

  /** Fecha a contagem: gera ajustes para as diferenças e calcula a acuracidade. */
  async closeCount(propertyId: string, countId: string, actor: Actor): Promise<number> {
    const { data: count } = await db().from("inventory_counts").select("*").eq("id", countId).eq("propertyId", propertyId).single();
    if (!count) throw new Error("Inventário não encontrado.");
    if (count.status === "closed") throw new Error("Inventário já está fechado.");
    const { data: items } = await db().from("inventory_count_items").select("*").eq("countId", countId);

    const counted = ((items ?? []) as InventoryCountItem[]).filter((i) => i.countedQty !== null && i.countedQty !== undefined);
    let matched = 0;        // itens com contagem exata
    let totalSystem = 0;    // Σ saldo do sistema (base p/ acuracidade ponderada)
    let totalAbsDiff = 0;   // Σ |diferença|
    for (const it of counted) {
      const diff = Number(it.countedQty) - Number(it.systemQty);
      totalSystem += Number(it.systemQty);
      totalAbsDiff += Math.abs(diff);
      if (diff === 0) { matched++; }
      else {
        await StockService.registerMovement(propertyId, {
          productId: it.productId, type: "adjustment", quantity: diff,
          toLocationId: it.locationId ?? count.locationId,
          referenceType: "inventory", referenceId: countId, allowNegative: true,
          notes: "Ajuste de inventário",
        }, actor);
      }
      await db().from("inventory_count_items").update({ adjusted: true }).eq("id", it.id);
    }

    // Acuracidade ponderada por quantidade: 1 − (Σ|dif| / Σ sistema).
    // Sem base de quantidade, cai para acerto exato por item.
    const accuracy = totalSystem > 0
      ? Math.max(0, Math.round((1 - totalAbsDiff / totalSystem) * 10000) / 100)
      : (counted.length ? Math.round((matched / counted.length) * 10000) / 100 : 0);
    await db().from("inventory_counts").update({ status: "closed", accuracy, closedAt: now(), updatedAt: now() }).eq("id", countId);
    await AuditService.log({
      propertyId, userId: actor.id, userName: actor.name,
      action: "INVENTORY_CLOSED", entity: "INVENTORY", entityId: countId,
      details: `Inventário fechado. Acuracidade ${accuracy}% (${matched}/${counted.length} itens exatos · divergência total ${totalAbsDiff}).`,
    });
    return accuracy;
  },

  async deleteCount(propertyId: string, id: string, actor: Actor): Promise<void> {
    const { data: c } = await db().from("inventory_counts").select("status").eq("id", id).single();
    if (c?.status === "closed") throw new Error("Não é possível excluir um inventário fechado.");
    const { error } = await db().from("inventory_counts").delete().eq("id", id).eq("propertyId", propertyId);
    if (error) throw error;
    await AuditService.log({
      propertyId, userId: actor.id, userName: actor.name,
      action: "DELETE", entity: "INVENTORY", entityId: id, details: "Inventário excluído.",
    });
  },
};
