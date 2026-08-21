// src/services/restock-service.ts
// Reposição (camareira/governanta → mensageiro), extraída do Concierge.
// O pedido aponta PRODUTO do estoque e NUNCA toca fólio. A baixa acontece na
// ENTREGA (exit, referenceType 'restock'), da fonte resolvida pela cadeia
// produto→categoria (StockIntegration.resolveDeductionSource), com fallback
// para o local de maior saldo quando a fonte está em falta. Filosofia
// StockIntegration: a baixa é best-effort — nunca quebra a entrega.
import { supabase, supabaseAdmin } from "@/lib/supabase";
import { AuditService } from "./audit-service";
import { StockIntegration } from "./stock-integration";
import { StockService } from "./stock-service";
import {
  RestockCatalogItem,
  RestockRequest,
  RestockRequestStatus,
  StockCategory,
  StockProduct,
  StockUnit,
} from "@/types/aura";

type DB = NonNullable<typeof supabaseAdmin>;
function db(): DB {
  return ((typeof window === "undefined" && supabaseAdmin) ? supabaseAdmin : supabase) as DB;
}
interface Actor { id: string; name: string; }

const now = () => new Date().toISOString();

/** Erro de regra de negócio com código estável para a rota mapear em status HTTP. */
function codedError(message: string, code: "CONFLICT" | "OUT_OF_STOCK" | "NOT_FOUND"): Error {
  return Object.assign(new Error(message), { code });
}

/**
 * Fonte de baixa em lote (catálogo/criação): mesma cadeia do
 * resolveDeductionSource em modo 'restock', resolvida em memória para não
 * fazer 2 queries por produto.
 */
function resolveSourceLocal(p: StockProduct, catById: Map<string, StockCategory>): string | null {
  if (p.deductMode === "none") return null;
  if (p.deductMode === "location" && p.deductLocationId) return p.deductLocationId;
  const cat = p.categoryId ? catById.get(p.categoryId) : undefined;
  return cat?.deductLocationId ?? null;
}

/** Local com maior saldo positivo do produto (fallback "pegar no estoque Y"). */
function bestFallback(
  byProductLocation: Record<string, number>,
  productId: string,
  excludeLocationId: string | null,
): { locationId: string; quantity: number } | null {
  let best: { locationId: string; quantity: number } | null = null;
  const prefix = `${productId}::`;
  for (const [key, qty] of Object.entries(byProductLocation)) {
    if (!key.startsWith(prefix) || !(qty > 0)) continue;
    const locationId = key.slice(prefix.length);
    if (locationId === excludeLocationId) continue;
    if (!best || qty > best.quantity) best = { locationId, quantity: qty };
  }
  return best;
}

export const RestockService = {
  // ── Catálogo ────────────────────────────────────────────────────────────────
  /**
   * Produtos solicitáveis pela camareira, com disponibilidade já resolvida:
   * 'ok' (tem na fonte) · 'fallback' (fonte vazia, tem em outro local) ·
   * 'out' (em falta em todo lugar — pedido bloqueado) · 'ungated' (sem fonte
   * de baixa configurada ou módulo de estoque desligado — sem trava).
   */
  async getCatalog(propertyId: string): Promise<RestockCatalogItem[]> {
    const [{ data: products }, { data: categories }, levels] = await Promise.all([
      db().from("stock_products").select("*").eq("propertyId", propertyId)
        .eq("deleted", false).eq("active", true).eq("maidRequestable", true).order("name"),
      db().from("stock_categories").select("*").eq("propertyId", propertyId),
      StockIntegration.getStockLevels(propertyId),
    ]);
    const cats = (categories ?? []) as StockCategory[];
    const catById = new Map(cats.map((c) => [c.id, c]));

    const fallbackLocIds = new Set<string>();
    const items = ((products ?? []) as StockProduct[]).map((p): RestockCatalogItem & { _fallbackId?: string } => {
      const cat = p.categoryId ? catById.get(p.categoryId) : undefined;
      const base: RestockCatalogItem = {
        productId: p.id,
        name: p.name,
        unit: p.unit as StockUnit,
        categoryId: p.categoryId ?? null,
        categoryName: cat?.name,
        categoryIcon: cat?.icon,
        categoryOrder: cat?.order ?? 999,
        availability: "ungated",
        fallbackLocationName: null,
      };
      const source = resolveSourceLocal(p, catById);
      if (!source || !levels) return base; // sem fonte / módulo off → sem trava
      if ((levels.byProductLocation[`${p.id}::${source}`] ?? 0) > 0) return { ...base, availability: "ok" };
      const fb = bestFallback(levels.byProductLocation, p.id, source);
      if (fb) { fallbackLocIds.add(fb.locationId); return { ...base, availability: "fallback", _fallbackId: fb.locationId }; }
      return { ...base, availability: "out" };
    });

    // Nome do local de fallback só para exibição (uma query, apenas se houver).
    if (fallbackLocIds.size > 0) {
      const { data: locs } = await db().from("stock_locations")
        .select("id, name").in("id", Array.from(fallbackLocIds));
      const lMap = new Map(((locs ?? []) as { id: string; name: string }[]).map((l) => [l.id, l.name]));
      for (const it of items) if (it._fallbackId) it.fallbackLocationName = lMap.get(it._fallbackId) ?? null;
    }

    return items
      .map(({ _fallbackId, ...it }) => it)
      .sort((a, b) =>
        (a.categoryOrder ?? 999) - (b.categoryOrder ?? 999)
        || (a.categoryName ?? "").localeCompare(b.categoryName ?? "")
        || a.name.localeCompare(b.name));
  },

  // ── Criação (camareira / governanta) ────────────────────────────────────────
  /**
   * Cria um pedido por item. Pré-validação de TODOS os itens antes de gravar:
   * qualquer item em falta em todo lugar bloqueia o lote inteiro (código
   * OUT_OF_STOCK → "Item em falta — informe o gestor").
   */
  async createRequests(
    propertyId: string,
    input: { cabinId?: string | null; items: { productId: string; quantity: number }[]; notes?: string | null },
    actor: Actor,
    role: "maid" | "governance",
  ): Promise<string[]> {
    const items = (input.items ?? []).filter((i) => i.productId && Number(i.quantity) > 0);
    if (items.length === 0) throw new Error("Nenhum item no pedido.");

    const ids = items.map((i) => i.productId);
    const [{ data: products }, { data: categories }, levels] = await Promise.all([
      db().from("stock_products").select("*").eq("propertyId", propertyId).in("id", ids),
      db().from("stock_categories").select("*").eq("propertyId", propertyId),
      StockIntegration.getStockLevels(propertyId),
    ]);
    const pById = new Map(((products ?? []) as StockProduct[]).map((p) => [p.id, p]));
    const catById = new Map(((categories ?? []) as StockCategory[]).map((c) => [c.id, c]));

    // Pré-voo: valida tudo, não grava nada com item inválido/em falta.
    const outOfStock: string[] = [];
    const resolved = items.map((i) => {
      const p = pById.get(i.productId);
      if (!p || p.deleted || !p.active || !p.maidRequestable)
        throw new Error("Produto indisponível para reposição.");
      const source = resolveSourceLocal(p, catById);
      let fallback: string | null = null;
      if (source && levels) {
        const atSource = levels.byProductLocation[`${p.id}::${source}`] ?? 0;
        if (atSource <= 0) {
          const fb = bestFallback(levels.byProductLocation, p.id, source);
          if (fb) fallback = fb.locationId;
          else outOfStock.push(p.name);
        }
      }
      return { product: p, quantity: Number(i.quantity), source, fallback };
    });
    if (outOfStock.length > 0)
      throw codedError(`Item em falta — informe o gestor: ${outOfStock.join(", ")}.`, "OUT_OF_STOCK");

    const rows = resolved.map((r) => ({
      id: crypto.randomUUID(),
      propertyId,
      cabinId: input.cabinId ?? null,
      productId: r.product.id,
      quantity: r.quantity,
      status: "pending" as RestockRequestStatus,
      requestedById: actor.id,
      requestedByName: actor.name,
      requestedByRole: role,
      plannedSourceId: r.source,
      fallbackSourceId: r.fallback,
      notes: input.notes ?? null,
      createdAt: now(),
      updatedAt: now(),
    }));
    const { error } = await db().from("restock_requests").insert(rows);
    if (error) throw error;

    let cabinName: string | null = null;
    if (input.cabinId) {
      const { data: cabin } = await db().from("cabins").select("name").eq("id", input.cabinId).maybeSingle();
      cabinName = (cabin?.name as string | undefined) ?? null;
    }
    await AuditService.log({
      propertyId, userId: actor.id, userName: actor.name,
      action: "CREATE", entity: "STOCK", entityId: rows[0].id,
      details: `Reposição solicitada${cabinName ? ` — ${cabinName}` : ""}: ${resolved.map((r) => `${r.quantity}× ${r.product.name}`).join(", ")}.`,
    });
    return rows.map((r) => r.id);
  },

  // ── Fluxo do mensageiro ─────────────────────────────────────────────────────
  /** Assumir com precondição de status: dois mensageiros no mesmo pedido → o segundo leva CONFLICT. */
  async assign(propertyId: string, requestId: string, actor: Actor): Promise<void> {
    const { data, error } = await db().from("restock_requests")
      .update({ status: "in_progress", assignedTo: actor.id, assignedName: actor.name, assignedAt: now(), updatedAt: now() })
      .eq("id", requestId).eq("propertyId", propertyId).eq("status", "pending")
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) throw codedError("Este pedido já foi assumido por outro colega.", "CONFLICT");
  },

  /**
   * Entrega: grava o status PRIMEIRO (verdade operacional) e então baixa o
   * estoque best-effort — re-resolve a fonte com saldo fresco e segue o
   * fallback de maior saldo quando ela está vazia. allowNegative: a entrega
   * nunca é bloqueada; saldo negativo é o alarme do furo.
   */
  async deliver(propertyId: string, requestId: string, actor: Actor): Promise<void> {
    const { data: req } = await db().from("restock_requests")
      .select("*").eq("id", requestId).eq("propertyId", propertyId).maybeSingle();
    if (!req) throw codedError("Pedido não encontrado.", "NOT_FOUND");

    const { data: updated, error } = await db().from("restock_requests")
      .update({ status: "delivered", deliveredAt: now(), updatedAt: now() })
      .eq("id", requestId).eq("propertyId", propertyId).eq("status", "in_progress")
      .select("id");
    if (error) throw error;
    if (!updated || updated.length === 0)
      throw codedError("Este pedido não está mais em andamento (já entregue ou cancelado).", "CONFLICT");

    try {
      if (!(await StockIntegration.isEnabled(propertyId))) return;
      const source = await StockIntegration.resolveDeductionSource(propertyId, req.productId, { mode: "restock" });
      if (!source) return; // fonte "nenhum": entrega sem baixa

      // Saldo fresco: se a fonte esvaziou entre o pedido e a entrega, a baixa
      // segue o local de maior saldo (o mesmo que o alerta manda o mensageiro).
      const { data: balances } = await db().from("stock_balances")
        .select("locationId, quantity").eq("productId", req.productId);
      const byLoc = new Map(((balances ?? []) as { locationId: string; quantity: number }[])
        .map((b) => [b.locationId, Number(b.quantity)]));
      let chosen = source;
      if ((byLoc.get(source) ?? 0) <= 0) {
        let best: { locationId: string; quantity: number } | null = null;
        for (const [locationId, quantity] of Array.from(byLoc.entries())) {
          if (quantity > 0 && (!best || quantity > best.quantity)) best = { locationId, quantity };
        }
        if (best) chosen = best.locationId;
      }

      await StockService.registerMovement(propertyId, {
        productId: req.productId,
        type: "exit",
        quantity: Number(req.quantity),
        fromLocationId: chosen,
        toCabinId: req.cabinId ?? undefined,   // anota a cabana (consumo por cabana no relatório)
        referenceType: "restock",
        referenceId: requestId,
        allowNegative: true,
        notes: "Reposição",
      }, actor);
      await db().from("restock_requests")
        .update({ sourceLocationId: chosen, updatedAt: now() })
        .eq("id", requestId).eq("propertyId", propertyId);
    } catch (e) {
      console.error("[RestockService] baixa da entrega falhou (entrega mantida):", e);
    }
  },

  async notDeliver(propertyId: string, requestId: string, reason: string, actor: Actor): Promise<void> {
    const { data, error } = await db().from("restock_requests")
      .update({ status: "not_delivered", notDeliveredReason: reason || "Não informado", assignedTo: actor.id, assignedName: actor.name, updatedAt: now() })
      .eq("id", requestId).eq("propertyId", propertyId).in("status", ["pending", "in_progress"])
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) throw codedError("Este pedido já foi finalizado.", "CONFLICT");
  },

  /** Cancela um pedido ainda pendente (a rota decide QUEM pode). */
  async cancel(propertyId: string, requestId: string): Promise<void> {
    const { data, error } = await db().from("restock_requests")
      .update({ status: "cancelled", updatedAt: now() })
      .eq("id", requestId).eq("propertyId", propertyId).eq("status", "pending")
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) throw codedError("Só é possível cancelar pedido ainda pendente.", "CONFLICT");
  },

  // ── Leitura ─────────────────────────────────────────────────────────────────
  /** Fila: ativos (pendente/andamento) + resolvidos recentes, enriquecidos. */
  async queue(propertyId: string, resolvedSinceHours = 12): Promise<RestockRequest[]> {
    const sinceIso = new Date(Date.now() - resolvedSinceHours * 3600e3).toISOString();
    const [{ data: active }, { data: resolved }] = await Promise.all([
      db().from("restock_requests").select("*")
        .eq("propertyId", propertyId).in("status", ["pending", "in_progress"])
        .order("createdAt", { ascending: true }),
      db().from("restock_requests").select("*")
        .eq("propertyId", propertyId).in("status", ["delivered", "not_delivered", "cancelled"])
        .gte("updatedAt", sinceIso).order("updatedAt", { ascending: false }).limit(100),
    ]);
    return this._enrich(propertyId, [...(active ?? []), ...(resolved ?? [])] as RestockRequest[]);
  },

  /** Nomes de produto, cabana e locais nas linhas — os apps só exibem. */
  async _enrich(propertyId: string, rows: RestockRequest[]): Promise<RestockRequest[]> {
    if (rows.length === 0) return rows;
    const productIds = Array.from(new Set(rows.map((r) => r.productId)));
    const cabinIds = Array.from(new Set(rows.map((r) => r.cabinId).filter(Boolean))) as string[];
    const locIds = Array.from(new Set(rows.flatMap((r) => [r.plannedSourceId, r.fallbackSourceId]).filter(Boolean))) as string[];
    const [{ data: products }, { data: cabins }, { data: locations }] = await Promise.all([
      db().from("stock_products").select("id, name, unit").in("id", productIds),
      cabinIds.length ? db().from("cabins").select("id, name").in("id", cabinIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      locIds.length ? db().from("stock_locations").select("id, name").in("id", locIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);
    const pMap = new Map(((products ?? []) as { id: string; name: string; unit: string }[]).map((p) => [p.id, p]));
    const cMap = new Map(((cabins ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
    const lMap = new Map(((locations ?? []) as { id: string; name: string }[]).map((l) => [l.id, l.name]));
    return rows.map((r) => ({
      ...r,
      productName: pMap.get(r.productId)?.name ?? "—",
      productUnit: (pMap.get(r.productId)?.unit ?? "un") as StockUnit,
      cabinName: r.cabinId ? (cMap.get(r.cabinId) ?? null) : null,
      plannedSourceName: r.plannedSourceId ? (lMap.get(r.plannedSourceId) ?? null) : null,
      fallbackSourceName: r.fallbackSourceId ? (lMap.get(r.fallbackSourceId) ?? null) : null,
    }));
  },

  // ── Realtime (browser) ──────────────────────────────────────────────────────
  /**
   * Assina mudanças e chama o callback — o CALLER refaz o fetch pela rota
   * field (leitura pelo client do browser trava no lock frio; ver
   * field-app-browser-write-hangs).
   */
  listenToRequests(propertyId: string, onChange: () => void): () => void {
    const channel = supabase
      .channel(`restock_requests_${propertyId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "restock_requests", filter: `propertyId=eq.${propertyId}` },
        () => onChange())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  },
};
