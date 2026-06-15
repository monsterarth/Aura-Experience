// src/services/asset-service.ts
// Patrimônio: CRUD de ativos + depreciação linear calculada em tempo de leitura.
// Sem histórico de manutenção nesta fase (decisão: adiado).
import { supabase, supabaseAdmin } from "@/lib/supabase";
import { AuditService } from "./audit-service";
import { Asset, StockCategory, AssetDepreciationEntry } from "@/types/aura";

type DB = NonNullable<typeof supabaseAdmin>;
function db(): DB {
  return ((typeof window === "undefined" && supabaseAdmin) ? supabaseAdmin : supabase) as DB;
}
const now = () => new Date().toISOString();
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
interface Actor { id: string; name: string; }

/** Depreciação linear até a data de referência. */
export function computeDepreciation(a: Asset, ref: Date) {
  const cost = Number(a.acquisitionCost) || 0;
  const residual = Number(a.residualValue) || 0;
  const life = Number(a.usefulLifeMonths) || 0;
  if (a.depreciationMethod !== "linear" || life <= 0) {
    return { monthlyDepreciation: 0, accumulatedDepreciation: 0, bookValue: round2(cost) };
  }
  const base = Math.max(0, cost - residual);
  const monthly = base / life;
  const startStr = a.depreciationStart || a.acquisitionDate;
  if (!startStr) return { monthlyDepreciation: round2(monthly), accumulatedDepreciation: 0, bookValue: round2(cost) };
  const start = new Date(startStr);
  const months = Math.max(0, (ref.getFullYear() - start.getFullYear()) * 12 + (ref.getMonth() - start.getMonth()));
  const accumulated = Math.min(monthly * months, base);
  return { monthlyDepreciation: round2(monthly), accumulatedDepreciation: round2(accumulated), bookValue: round2(cost - accumulated) };
}

export const AssetService = {
  async getAssets(propertyId: string): Promise<Asset[]> {
    const ref = new Date();
    const [{ data: assets }, { data: categories }] = await Promise.all([
      db().from("assets").select("*").eq("propertyId", propertyId).order("name", { ascending: true }),
      db().from("stock_categories").select("*").eq("propertyId", propertyId),
    ]);
    const catMap = new Map(((categories ?? []) as StockCategory[]).map((c) => [c.id, c]));
    return ((assets ?? []) as Asset[]).map((a) => ({
      ...a,
      category: a.categoryId ? (catMap.get(a.categoryId) as StockCategory | undefined) : undefined,
      ...computeDepreciation(a, ref),
    }));
  },

  async upsertAsset(propertyId: string, payload: Partial<Asset>, actor: Actor): Promise<string> {
    const isNew = !payload.id;
    const id = payload.id ?? crypto.randomUUID();
    const row = {
      ...payload, id, propertyId,
      depreciationMethod: payload.depreciationMethod ?? "linear",
      acquisitionCost: payload.acquisitionCost ?? 0,
      residualValue: payload.residualValue ?? 0,
      status: payload.status ?? "active",
      updatedAt: now(),
      ...(isNew && { createdAt: now() }),
    };
    // remover campos virtuais antes de gravar
    for (const k of ["category", "bookValue", "monthlyDepreciation", "accumulatedDepreciation"]) {
      delete (row as Record<string, unknown>)[k];
    }
    const { error } = await db().from("assets").upsert(row);
    if (error) throw error;
    await AuditService.log({
      propertyId, userId: actor.id, userName: actor.name,
      action: isNew ? "ASSET_CREATED" : "ASSET_UPDATED", entity: "ASSET", entityId: id,
      details: `Ativo ${isNew ? "criado" : "editado"}: ${payload.name}.`,
    });
    return id;
  },

  async deleteAsset(propertyId: string, id: string, actor: Actor): Promise<void> {
    const { error } = await db().from("assets").delete().eq("id", id).eq("propertyId", propertyId);
    if (error) throw error;
    await AuditService.log({
      propertyId, userId: actor.id, userName: actor.name,
      action: "ASSET_DISPOSED", entity: "ASSET", entityId: id, details: "Ativo removido.",
    });
  },

  async getDepreciationEntries(propertyId: string, assetId: string): Promise<AssetDepreciationEntry[]> {
    const { data } = await db().from("asset_depreciation_entries")
      .select("*").eq("propertyId", propertyId).eq("assetId", assetId).order("period", { ascending: false });
    return (data ?? []) as AssetDepreciationEntry[];
  },

  /**
   * Lança a depreciação do período (YYYY-MM) para os ativos lineares ativos.
   * Idempotente por (assetId, period). Usado pelo cron mensal.
   */
  async runDepreciation(propertyId: string, period: string): Promise<number> {
    const ref = new Date();
    const { data: assets } = await db().from("assets").select("*")
      .eq("propertyId", propertyId).eq("depreciationMethod", "linear").in("status", ["active", "maintenance"]);
    let count = 0;
    for (const a of (assets ?? []) as Asset[]) {
      if (!a.usefulLifeMonths || a.usefulLifeMonths <= 0) continue;
      const d = computeDepreciation(a, ref);
      const amount = d.bookValue > Number(a.residualValue ?? 0) ? d.monthlyDepreciation : 0;
      const { data: existing } = await db().from("asset_depreciation_entries")
        .select("id").eq("assetId", a.id).eq("period", period).maybeSingle();
      if (existing) {
        await db().from("asset_depreciation_entries")
          .update({ amount, accumulatedDepreciation: d.accumulatedDepreciation, bookValue: d.bookValue }).eq("id", existing.id);
      } else {
        await db().from("asset_depreciation_entries").insert({
          id: crypto.randomUUID(), propertyId, assetId: a.id, period, amount,
          accumulatedDepreciation: d.accumulatedDepreciation, bookValue: d.bookValue, createdAt: now(),
        });
      }
      count++;
    }
    return count;
  },
};
