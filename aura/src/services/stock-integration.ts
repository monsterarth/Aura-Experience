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

  /** Baixa de estoque por consumo/venda. Best-effort: NUNCA lança. */
  async consumeForSale(
    propertyId: string,
    opts: { productId?: string | null; quantity: number; referenceType: StockReferenceType; referenceId?: string | null },
    actor: Actor,
  ): Promise<void> {
    try {
      if (!opts.productId || !(opts.quantity > 0)) return;
      if (!(await this.isEnabled(propertyId))) return;
      const locationId = await this._defaultLocation(propertyId);
      if (!locationId) {
        console.warn("[StockIntegration] defaultSaleLocationId não configurado — baixa de estoque ignorada.");
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
};
