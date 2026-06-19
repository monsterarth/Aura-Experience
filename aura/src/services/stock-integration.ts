// src/services/stock-integration.ts
// O "ELO" entre o resto do sistema (Concierge, F&B) e o módulo de estoque.
// Regra de ouro: o resto do sistema NÃO depende do estoque. Esta camada é o
// único ponto de contato e é best-effort — NUNCA lança (não pode quebrar a
// entrega ao hóspede nem o lançamento no folio). Sem módulo / sem produto
// vinculado / sem local de consumo → no-op silencioso.
import { supabase, supabaseAdmin } from "@/lib/supabase";
import { StockService } from "./stock-service";
import { StockReferenceType } from "@/types/aura";

type DB = NonNullable<typeof supabaseAdmin>;
function db(): DB {
  return ((typeof window === "undefined" && supabaseAdmin) ? supabaseAdmin : supabase) as DB;
}
interface Actor { id: string; name: string; }

export const StockIntegration = {
  /** Módulo de estoque habilitado na propriedade? Default ON; off só se settings.hasStock === false. */
  async isEnabled(propertyId: string): Promise<boolean> {
    try {
      const { data } = await db().from("properties").select("settings").eq("id", propertyId).single();
      return (data?.settings?.hasStock) !== false;
    } catch { return false; }
  },

  async _defaultLocation(propertyId: string): Promise<string | null> {
    const { data } = await db().from("stock_settings").select("defaultSaleLocationId").eq("propertyId", propertyId).maybeSingle();
    return (data?.defaultSaleLocationId as string | null) ?? null;
  },

  /** Baixa de estoque por consumo/venda. Best-effort: NUNCA lança.
   *  fromLocationId opcional sobrepõe o local de venda padrão ("Baixar de"). */
  async consumeForSale(
    propertyId: string,
    opts: { productId?: string | null; quantity: number; referenceType: StockReferenceType; referenceId?: string | null; fromLocationId?: string | null },
    actor: Actor,
  ): Promise<void> {
    try {
      if (!opts.productId || !(opts.quantity > 0)) return;
      if (!(await this.isEnabled(propertyId))) return;
      const locationId = opts.fromLocationId ?? (await this._defaultLocation(propertyId));
      if (!locationId) {
        console.warn("[StockIntegration] sem local de baixa (defaultSaleLocationId não configurado) — baixa de estoque ignorada.");
        return;
      }
      await StockService.registerMovement(propertyId, {
        productId: opts.productId,
        type: "exit",
        quantity: opts.quantity,
        fromLocationId: locationId,
        referenceType: opts.referenceType,
        referenceId: opts.referenceId ?? null,
        allowNegative: true,            // venda não é bloqueada por falta de estoque
        notes: "Consumo (venda)",
      }, actor);
    } catch (e) {
      console.error("[StockIntegration] consumeForSale falhou (ignorado):", e);
    }
  },

  /**
   * Saldos para gating de disponibilidade do Concierge/F&B, ciente de local
   * ("Baixar de"). Retorna saldo por (produto,local) + total por produto +
   * o local de venda padrão. Best-effort, FAIL-OPEN: módulo off ou erro →
   * null (não gateia / tudo disponível). Um objeto é autoritativo: ausente = 0.
   * Use availableFor(levels, productId, locationId) para resolver a qtd.
   */
  async getStockLevels(propertyId: string): Promise<StockLevels | null> {
    try {
      if (!(await this.isEnabled(propertyId))) return null;
      const defaultLocationId = await this._defaultLocation(propertyId);
      const { data, error } = await db()
        .from("stock_balances").select("productId, locationId, quantity").eq("propertyId", propertyId);
      if (error || !data) return null;
      const byProductLocation: Record<string, number> = {};
      const byProduct: Record<string, number> = {};
      for (const row of data as { productId: string; locationId: string; quantity: number }[]) {
        const qty = Number(row.quantity || 0);
        byProductLocation[`${row.productId}::${row.locationId}`] = (byProductLocation[`${row.productId}::${row.locationId}`] ?? 0) + qty;
        byProduct[row.productId] = (byProduct[row.productId] ?? 0) + qty;
      }
      return { defaultLocationId, byProductLocation, byProduct };
    } catch (e) {
      console.error("[StockIntegration] getStockLevels falhou (ignorado):", e);
      return null;
    }
  },

  /**
   * Saldo disponível de um produto no local resolvido. PADRÃO (locationId
   * nulo) cai no local de venda padrão; sem padrão definido, soma todos os
   * locais (saldo total) — mesmo critério da baixa.
   */
  availableFor(levels: StockLevels, productId: string, locationId?: string | null): number {
    const loc = locationId || levels.defaultLocationId;
    if (loc) return levels.byProductLocation[`${productId}::${loc}`] ?? 0;
    return levels.byProduct[productId] ?? 0;
  },
};

/** Saldos para gating de disponibilidade ciente de local (ver getStockLevels). */
export interface StockLevels {
  defaultLocationId: string | null;
  byProductLocation: Record<string, number>;  // chave `${productId}::${locationId}`
  byProduct: Record<string, number>;          // total por produto (todos os locais)
}
