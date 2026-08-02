// src/services/asset-inventory-service.ts
// Conferência física de patrimônio. Paralelo método a método de
// InventoryService (estoque), com a diferença que comanda tudo aqui:
// ATIVO NÃO TEM QUANTIDADE, TEM PRESENÇA.
//
// Por isso não há systemQty/countedQty/difference — há um `status` por item, e a
// acuracidade é encontrados/esperados (o ramo de fallback de
// inventory-service.ts:123, que aqui é o caso normal e não a exceção).
import { supabase, supabaseAdmin } from "@/lib/supabase";
import { AuditService } from "./audit-service";
import {
  Asset, AssetInventoryCount, AssetInventoryItem, AssetInventoryItemStatus,
  AssetInventoryItemUpdate, StockLocation,
} from "@/types/aura";

type DB = NonNullable<typeof supabaseAdmin>;
function db(): DB {
  return ((typeof window === "undefined" && supabaseAdmin) ? supabaseAdmin : supabase) as DB;
}
const now = () => new Date().toISOString();
interface Actor { id: string; name: string; }

export const AssetInventoryService = {
  async getCounts(propertyId: string): Promise<AssetInventoryCount[]> {
    const { data: counts } = await db().from("asset_inventory_counts").select("*")
      .eq("propertyId", propertyId).order("createdAt", { ascending: false });
    const list = (counts ?? []) as AssetInventoryCount[];
    if (list.length === 0) return [];

    const { data: locations } = await db().from("stock_locations").select("id, name").eq("propertyId", propertyId);
    const lMap = new Map(((locations ?? []) as StockLocation[]).map((l) => [l.id, l]));

    const ids = list.map((c) => c.id);
    const { data: items } = await db().from("asset_inventory_items").select("countId").in("countId", ids);
    const countMap = new Map<string, number>();
    for (const i of (items ?? []) as { countId: string }[]) countMap.set(i.countId, (countMap.get(i.countId) ?? 0) + 1);

    return list.map((c) => ({
      ...c,
      location: c.locationId ? lMap.get(c.locationId) : undefined,
      itemCount: countMap.get(c.id) ?? 0,
    }));
  },

  async getCount(propertyId: string, id: string): Promise<AssetInventoryCount | null> {
    const { data: count } = await db().from("asset_inventory_counts").select("*")
      .eq("id", id).eq("propertyId", propertyId).maybeSingle();
    if (!count) return null;
    const c = count as AssetInventoryCount;

    const [{ data: items }, { data: assets }, { data: locations }, { data: cabins }] = await Promise.all([
      db().from("asset_inventory_items").select("*").eq("countId", id),
      db().from("assets").select("id, name, assetTag, publicCode, locationId, cabinId, status").eq("propertyId", propertyId),
      db().from("stock_locations").select("id, name").eq("propertyId", propertyId),
      db().from("cabins").select("id, name").eq("propertyId", propertyId),
    ]);

    const cabMap = new Map(((cabins ?? []) as { id: string; name: string }[]).map((x) => [x.id, x.name]));
    const aMap = new Map(((assets ?? []) as Asset[]).map((a) => [a.id, {
      ...a, cabinName: a.cabinId ? cabMap.get(a.cabinId) : undefined,
    }]));
    const lMap = new Map(((locations ?? []) as StockLocation[]).map((l) => [l.id, l]));

    const hydrated = ((items ?? []) as AssetInventoryItem[])
      .map((i) => ({ ...i, asset: aMap.get(i.assetId) }))
      .sort((a, b) => (a.asset?.name ?? "").localeCompare(b.asset?.name ?? ""));

    return { ...c, items: hydrated, location: c.locationId ? lMap.get(c.locationId) : undefined };
  },

  /**
   * Abre uma campanha e congela a lista do que se ESPERA encontrar.
   * locationId/cabinId nulos = a propriedade inteira.
   */
  async createCount(
    propertyId: string,
    opts: { locationId?: string | null; cabinId?: string | null; scope?: string[]; applyMoves?: boolean },
    actor: Actor,
  ): Promise<string> {
    const { data: open } = await db().from("asset_inventory_counts").select("id")
      .eq("propertyId", propertyId).neq("status", "closed").maybeSingle();
    if (open) throw new Error("Já existe uma conferência aberta. Feche-a antes de abrir outra.");

    let q = db().from("assets").select("id, locationId, cabinId")
      .eq("propertyId", propertyId).not("status", "in", "(disposed,written_off)");
    if (opts.locationId) q = q.eq("locationId", opts.locationId);
    if (opts.cabinId) q = q.eq("cabinId", opts.cabinId);
    if (opts.scope?.length) q = q.in("categoryId", opts.scope);
    const { data: assets } = await q;
    const list = (assets ?? []) as { id: string; locationId: string | null; cabinId: string | null }[];

    const id = crypto.randomUUID();
    const { error } = await db().from("asset_inventory_counts").insert({
      id, propertyId,
      locationId: opts.locationId ?? null, cabinId: opts.cabinId ?? null,
      scope: opts.scope ?? [], status: "counting",
      expectedCount: list.length, applyMoves: opts.applyMoves !== false,
      createdBy: actor.id, createdByName: actor.name,
      startedAt: now(), createdAt: now(), updatedAt: now(),
    });
    if (error) throw error;

    if (list.length) {
      await db().from("asset_inventory_items").insert(list.map((a) => ({
        id: crypto.randomUUID(), countId: id, assetId: a.id,
        expectedLocationId: a.locationId, expectedCabinId: a.cabinId,
        status: "pending", createdAt: now(),
      })));
    }

    await AuditService.log({
      propertyId, userId: actor.id, userName: actor.name,
      action: "ASSET_INVENTORY_OPENED", entity: "ASSET_INVENTORY", entityId: id,
      details: `Conferência de patrimônio aberta (${list.length} ativo(s) esperados).`,
    });
    return id;
  },

  async saveItems(propertyId: string, countId: string, updates: AssetInventoryItemUpdate[], actor: Actor): Promise<void> {
    const { data: count } = await db().from("asset_inventory_counts").select("status")
      .eq("id", countId).eq("propertyId", propertyId).maybeSingle();
    if (!count) throw new Error("Conferência não encontrada.");
    if ((count as { status: string }).status === "closed") throw new Error("Conferência já está fechada.");

    for (const u of updates) {
      await db().from("asset_inventory_items").update({
        status: u.status,
        foundLocationId: u.foundLocationId ?? null,
        notes: u.notes ?? null,
        checkedAt: u.status === "pending" ? null : now(),
        checkedBy: u.status === "pending" ? null : actor.id,
        checkedByName: u.status === "pending" ? null : actor.name,
      }).eq("id", u.id).eq("countId", countId);
    }
    await db().from("asset_inventory_counts").update({ updatedAt: now() }).eq("id", countId);
  },

  /**
   * "O scanner". Aceita o código da plaqueta (publicCode) OU o nº de patrimônio
   * (assetTag) — leitores USB/Bluetooth se apresentam como teclado e digitam um
   * dos dois direto no input, sem precisar de biblioteca de câmera.
   *
   * Um ativo que aparece na conferência mas não estava na lista entra como
   * 'unexpected' — é justamente o achado que interessa.
   */
  async markByCode(
    propertyId: string, countId: string, code: string, actor: Actor,
  ): Promise<{ assetId: string; status: AssetInventoryItemStatus; name: string; assetTag?: string | null }> {
    const clean = code.trim().toUpperCase();
    if (!clean) throw new Error("Informe o código da plaqueta ou o nº de patrimônio.");

    const { data: count } = await db().from("asset_inventory_counts")
      .select("id, status, locationId, cabinId").eq("id", countId).eq("propertyId", propertyId).maybeSingle();
    if (!count) throw new Error("Conferência não encontrada.");
    const c = count as { status: string; locationId: string | null; cabinId: string | null };
    if (c.status === "closed") throw new Error("Conferência já está fechada.");

    const { data: byCode } = await db().from("assets")
      .select("id, name, assetTag, locationId, cabinId")
      .eq("propertyId", propertyId).eq("publicCode", clean).maybeSingle();
    const { data: asset } = byCode
      ? { data: byCode }
      : await db().from("assets").select("id, name, assetTag, locationId, cabinId")
        .eq("propertyId", propertyId).eq("assetTag", code.trim()).maybeSingle();
    if (!asset) throw new Error(`Nenhum ativo com o código "${code.trim()}".`);
    const a = asset as { id: string; name: string; assetTag: string | null; locationId: string | null; cabinId: string | null };

    const { data: item } = await db().from("asset_inventory_items").select("id, expectedLocationId, expectedCabinId")
      .eq("countId", countId).eq("assetId", a.id).maybeSingle();

    // Local onde a conferência está acontecendo; sem escopo, o local do próprio ativo.
    const foundLocationId = c.locationId ?? a.locationId;
    const foundCabinId = c.cabinId ?? a.cabinId;

    if (!item) {
      // Não estava na lista: registra como inesperado.
      await db().from("asset_inventory_items").insert({
        id: crypto.randomUUID(), countId, assetId: a.id,
        expectedLocationId: a.locationId, expectedCabinId: a.cabinId,
        status: "unexpected", foundLocationId, foundCabinId,
        checkedAt: now(), checkedBy: actor.id, checkedByName: actor.name, createdAt: now(),
      });
      await db().from("asset_inventory_counts").update({ updatedAt: now() }).eq("id", countId);
      return { assetId: a.id, status: "unexpected", name: a.name, assetTag: a.assetTag };
    }

    const it = item as { id: string; expectedLocationId: string | null; expectedCabinId: string | null };
    const displaced =
      (foundLocationId ?? null) !== (it.expectedLocationId ?? null) ||
      (foundCabinId ?? null) !== (it.expectedCabinId ?? null);
    const status: AssetInventoryItemStatus = displaced ? "moved" : "found";

    await db().from("asset_inventory_items").update({
      status, foundLocationId, foundCabinId,
      checkedAt: now(), checkedBy: actor.id, checkedByName: actor.name,
    }).eq("id", it.id);
    await db().from("asset_inventory_counts").update({ updatedAt: now() }).eq("id", countId);

    return { assetId: a.id, status, name: a.name, assetTag: a.assetTag };
  },

  /**
   * Fecha a campanha. O que ficou 'pending' vira 'missing'. Com applyMoves, os
   * 'moved' corrigem o local do ativo e geram asset_movements — a conferência
   * passa a ser fonte de verdade sobre onde as coisas estão.
   */
  async closeCount(
    propertyId: string, countId: string, actor: Actor,
  ): Promise<{ accuracy: number; found: number; missing: number; moved: number; unexpected: number }> {
    const { data: count } = await db().from("asset_inventory_counts").select("*")
      .eq("id", countId).eq("propertyId", propertyId).maybeSingle();
    if (!count) throw new Error("Conferência não encontrada.");
    const c = count as AssetInventoryCount;
    if (c.status === "closed") throw new Error("Conferência já está fechada.");

    // Pendentes viram ausentes.
    await db().from("asset_inventory_items").update({ status: "missing" })
      .eq("countId", countId).eq("status", "pending");

    const { data: items } = await db().from("asset_inventory_items").select("*").eq("countId", countId);
    const list = (items ?? []) as AssetInventoryItem[];

    const found = list.filter((i) => i.status === "found").length;
    const moved = list.filter((i) => i.status === "moved").length;
    const missing = list.filter((i) => i.status === "missing").length;
    const unexpected = list.filter((i) => i.status === "unexpected").length;

    // Acuracidade = localizados / esperados. 'moved' conta como localizado (o
    // bem existe; o que estava errado era o cadastro).
    const expected = c.expectedCount || (found + moved + missing);
    const accuracy = expected > 0
      ? Math.max(0, Math.round(((found + moved) / expected) * 10000) / 100)
      : 0;

    if (c.applyMoves) {
      for (const i of list.filter((x) => x.status === "moved" || x.status === "unexpected")) {
        if (!i.foundLocationId && !i.foundCabinId) continue;
        await db().from("assets").update({
          locationId: i.foundLocationId ?? null,
          cabinId: i.foundCabinId ?? null,
          updatedAt: now(),
        }).eq("id", i.assetId).eq("propertyId", propertyId);

        await db().from("asset_movements").insert({
          id: crypto.randomUUID(), propertyId, assetId: i.assetId, type: "inventory",
          fromLocationId: i.expectedLocationId ?? null, toLocationId: i.foundLocationId ?? null,
          fromCabinId: i.expectedCabinId ?? null, toCabinId: i.foundCabinId ?? null,
          reason: "Correção pela conferência de patrimônio",
          referenceType: "inventory", referenceId: countId,
          performedBy: actor.id, performedByName: actor.name, createdAt: now(),
        });
      }
    }

    await db().from("asset_inventory_counts").update({
      status: "closed", accuracy,
      foundCount: found, missingCount: missing, movedCount: moved, unexpectedCount: unexpected,
      closedAt: now(), updatedAt: now(),
    }).eq("id", countId);

    await AuditService.log({
      propertyId, userId: actor.id, userName: actor.name,
      action: "ASSET_INVENTORY_CLOSED", entity: "ASSET_INVENTORY", entityId: countId,
      details: `Conferência fechada. Acuracidade ${accuracy}% · ${found} encontrados, ${moved} deslocados, ${missing} não localizados, ${unexpected} inesperados.`,
    });
    return { accuracy, found, missing, moved, unexpected };
  },

  async deleteCount(propertyId: string, id: string, actor: Actor): Promise<void> {
    const { data: c } = await db().from("asset_inventory_counts").select("status")
      .eq("id", id).eq("propertyId", propertyId).maybeSingle();
    if ((c as { status?: string } | null)?.status === "closed") {
      throw new Error("Não é possível excluir uma conferência fechada.");
    }
    const { error } = await db().from("asset_inventory_counts").delete().eq("id", id).eq("propertyId", propertyId);
    if (error) throw error;
    await AuditService.log({
      propertyId, userId: actor.id, userName: actor.name,
      action: "DELETE", entity: "ASSET_INVENTORY", entityId: id, details: "Conferência excluída.",
    });
  },
};
