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
  CabinLinkCandidate,
  CabinLinkProposal,
  CabinLinkReport,
  StockCategory,
  StockLocation,
  StockProduct,
  StockMovement,
  StockMovementType,
  StockStaffOption,
  UserRole,
  StockSettings,
  StockBatch,
  StockBalance,
  StockDashboard,
} from "@/types/aura";

interface BatchChunk { qty: number; unitCost: number; expiryDate: string | null; batchCode: string | null; purchaseId: string | null; }

type DB = NonNullable<typeof supabaseAdmin>;
function db(): DB {
  const client = (typeof window === "undefined" && supabaseAdmin) ? supabaseAdmin : supabase;
  return client as DB;
}

const now = () => new Date().toISOString();
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;

/** "Cabana  01 " → "CABANA 01": sem acento, maiúsculo, espaços colapsados. */
const normalizeLocName = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

/** Último número do nome: "CABANA 14" → 14, "CABANAS" → null. Casa "CABANA 1" com number "01". */
const trailingNumber = (s: string): number | null => {
  const m = normalizeLocName(s).match(/(\d+)\s*$/);
  return m ? Number(m[1]) : null;
};

interface Actor { id: string; name: string; }

interface MovementInput {
  productId: string;
  type: StockMovementType;
  quantity: number;            // adjustment aceita negativo; demais são positivos
  unitCost?: number;           // entry: custo da compra; demais: default = averageCost
  fromLocationId?: string | null;
  toLocationId?: string | null;
  fromStaffId?: string | null;   // colaborador, quando o local de origem é do tipo 'staff'
  toStaffId?: string | null;     // colaborador, quando o local de destino é do tipo 'staff'
  responsibleId?: string | null; // quem responde pela ação; default = quem operou
  lossType?: StockMovement["lossType"];
  referenceType?: StockMovement["referenceType"];
  referenceId?: string | null;
  notes?: string;
  allowNegative?: boolean;     // confirma explicitamente deixar o saldo do local negativo
  expiryDate?: string | null;  // validade do lote (entrada de produto com trackExpiry)
  batchCode?: string | null;
  batchRef?: string | null;    // agrupa as movimentações lançadas juntas em lote
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
    const row: Record<string, unknown> = {
      ...payload,
      id,
      propertyId,
      type: payload.type ?? "warehouse",
      active: payload.active ?? true,
      updatedAt: now(),
      ...(isNew && { createdAt: now() }),
    };
    // cabinId é vínculo de identidade com a cabana: só applyCabinLinks e
    // _resolveCabinLocation escrevem nele. Nunca pelo formulário de local.
    delete row.cabinId;
    const { error } = await db().from("stock_locations").upsert(row);
    if (error) throw error;
    await AuditService.log({
      propertyId, userId: actor.id, userName: actor.name,
      action: isNew ? "CREATE" : "UPDATE", entity: "STOCK", entityId: id,
      details: `Local de estoque ${isNew ? "criado" : "editado"}: ${payload.name}.`,
    });
    return id;
  },

  /**
   * Excluir um local é destrutivo e silencioso no banco: stock_balances é
   * ON DELETE CASCADE (o saldo some) e stock_movements é ON DELETE SET NULL (o
   * histórico fica cego). Então só deixa excluir local sem saldo e sem histórico
   * — o resto se desativa.
   */
  async deleteLocation(propertyId: string, id: string, actor: Actor): Promise<void> {
    const client = db();
    const [{ data: balances }, { count: movementCount }] = await Promise.all([
      client.from("stock_balances").select("quantity").eq("propertyId", propertyId).eq("locationId", id),
      client.from("stock_movements").select("id", { count: "exact", head: true })
        .eq("propertyId", propertyId).or(`fromLocationId.eq.${id},toLocationId.eq.${id}`),
    ]);
    const units = ((balances ?? []) as { quantity: number }[]).reduce((s, b) => s + Math.abs(Number(b.quantity)), 0);
    if (units > 0 || (movementCount ?? 0) > 0) {
      const reasons = [
        units > 0 ? `${units} un. em saldo` : null,
        (movementCount ?? 0) > 0 ? `${movementCount} movimentação(ões)` : null,
      ].filter(Boolean).join(" e ");
      throw new Error(`Este local tem ${reasons} — excluir apagaria o saldo e cegaria o histórico. Desative o local em vez de excluir.`);
    }

    const { error } = await client.from("stock_locations").delete().eq("id", id).eq("propertyId", propertyId);
    if (error) throw error;
    await AuditService.log({
      propertyId, userId: actor.id, userName: actor.name,
      action: "DELETE", entity: "STOCK", entityId: id, details: "Local de estoque removido.",
    });
  },

  // ── CABANAS COMO LOCAIS ──────────────────────────────────────────────────────
  /**
   * Propõe o casamento entre cada cabana e um local de estoque existente.
   * SOMENTE LEITURA — não grava nada. Cada proposta vem com o peso do local
   * candidato (saldo e histórico) para o usuário decidir com o dado na frente.
   */
  async getCabinLinkReport(propertyId: string): Promise<CabinLinkReport> {
    const client = db();
    const [{ data: cabins }, { data: locations }] = await Promise.all([
      client.from("cabins").select("id, number, category, name").eq("propertyId", propertyId),
      client.from("stock_locations").select("*").eq("propertyId", propertyId),
    ]);

    const cabinRows = ((cabins ?? []) as { id: string; number: string; category: string; name: string }[])
      .sort((a, b) => (Number(a.number) - Number(b.number)) || a.number.localeCompare(b.number));
    const locRows = (locations ?? []) as StockLocation[];

    // Candidatos: locais tipo 'cabin' (é onde as cabanas foram cadastradas à mão)
    // + qualquer local já vinculado, mesmo que tenham retipado depois.
    const candidateRows = locRows.filter((l) => l.type === "cabin" || l.cabinId);
    const candidates = await this._describeLocations(client, propertyId, candidateRows);

    const byCabinId = new Map(candidateRows.filter((l) => l.cabinId).map((l) => [l.cabinId as string, l]));
    const taken = new Set(byCabinId.values());

    const proposals: CabinLinkProposal[] = cabinRows.map((cabin) => {
      const linked = byCabinId.get(cabin.id);
      if (linked) {
        return { cabin, linkedLocationId: linked.id, suggestedLocationId: null, matchKind: "linked" as const };
      }
      const free = candidateRows.filter((l) => !taken.has(l) && !l.cabinId);
      const wanted = normalizeLocName(`CABANA ${cabin.number}`);
      const exact = free.find((l) => normalizeLocName(l.name) === wanted);
      if (exact) {
        taken.add(exact);
        return { cabin, linkedLocationId: null, suggestedLocationId: exact.id, matchKind: "exact-name" as const };
      }
      const n = Number(cabin.number);
      const byNumber = Number.isFinite(n) ? free.find((l) => trailingNumber(l.name) === n) : undefined;
      if (byNumber) {
        taken.add(byNumber);
        return { cabin, linkedLocationId: null, suggestedLocationId: byNumber.id, matchKind: "number" as const };
      }
      return { cabin, linkedLocationId: null, suggestedLocationId: null, matchKind: "none" as const };
    });

    const unmatched = candidateRows
      .filter((l) => !taken.has(l) && !l.cabinId)
      .map((l) => candidates[l.id])
      .filter(Boolean);

    return { proposals, unmatched, candidates };
  },

  /**
   * Aplica os vínculos confirmados pelo usuário. Grava SOMENTE "cabinId" (e o
   * nome, se pedido): não apaga, não funde e não encosta em saldo — por isso é
   * reversível, basta desvincular. Valida tudo ANTES da primeira escrita, senão
   * o índice único estouraria no meio deixando metade aplicada.
   */
  async applyCabinLinks(
    propertyId: string,
    links: { cabinId: string; locationId: string | null; rename?: boolean }[],
    actor: Actor,
  ): Promise<{ linked: number; unlinked: number }> {
    const client = db();
    if (links.length === 0) return { linked: 0, unlinked: 0 };

    const targets = links.filter((l) => l.locationId);
    const dupLoc = targets.map((l) => l.locationId!).find((id, i, arr) => arr.indexOf(id) !== i);
    if (dupLoc) throw new Error("O mesmo local foi apontado para duas cabanas. Ajuste antes de confirmar.");
    const dupCabin = links.map((l) => l.cabinId).find((id, i, arr) => arr.indexOf(id) !== i);
    if (dupCabin) throw new Error("A mesma cabana aparece duas vezes na confirmação.");

    const [{ data: cabins }, { data: locs }] = await Promise.all([
      client.from("cabins").select("id, number").eq("propertyId", propertyId).in("id", links.map((l) => l.cabinId)),
      client.from("stock_locations").select("id, name, cabinId").eq("propertyId", propertyId)
        .in("id", targets.length ? targets.map((l) => l.locationId!) : ["__none__"]),
    ]);
    const cabinMap = new Map(((cabins ?? []) as { id: string; number: string }[]).map((c) => [c.id, c]));
    const locMap = new Map(((locs ?? []) as { id: string; name: string; cabinId: string | null }[]).map((l) => [l.id, l]));

    for (const link of links) {
      if (!cabinMap.has(link.cabinId)) throw new Error("Cabana não encontrada nesta propriedade.");
      if (!link.locationId) continue;
      const loc = locMap.get(link.locationId);
      if (!loc) throw new Error("Local não encontrado nesta propriedade.");
      if (loc.cabinId && loc.cabinId !== link.cabinId) {
        throw new Error(`O local "${loc.name}" já está vinculado a outra cabana. Desvincule antes.`);
      }
    }

    let linked = 0, unlinked = 0;
    for (const link of links) {
      if (link.locationId) {
        const cabin = cabinMap.get(link.cabinId)!;
        const patch: Record<string, unknown> = { cabinId: link.cabinId, type: "cabin", updatedAt: now() };
        if (link.rename) patch.name = `Cabana ${cabin.number}`;
        const { error } = await client.from("stock_locations").update(patch)
          .eq("id", link.locationId).eq("propertyId", propertyId);
        if (error) throw error;
        linked++;
      } else {
        // Desvincular: qualquer local que aponte para esta cabana volta a ser solto.
        const { error } = await client.from("stock_locations")
          .update({ cabinId: null, updatedAt: now() })
          .eq("propertyId", propertyId).eq("cabinId", link.cabinId);
        if (error) throw error;
        unlinked++;
      }
    }

    await AuditService.log({
      propertyId, userId: actor.id, userName: actor.name,
      action: "UPDATE", entity: "STOCK", entityId: propertyId,
      details: `Cabanas × locais de estoque: ${linked} vinculada(s), ${unlinked} desvinculada(s).`,
    });
    return { linked, unlinked };
  },

  /** Saldo e histórico de cada local — o "peso" que a UI mostra antes do clique. */
  async _describeLocations(client: DB, propertyId: string, locs: StockLocation[]): Promise<Record<string, CabinLinkCandidate>> {
    const out: Record<string, CabinLinkCandidate> = {};
    if (locs.length === 0) return out;
    const ids = locs.map((l) => l.id);
    const [{ data: balances }, { data: moves }] = await Promise.all([
      client.from("stock_balances").select("locationId, quantity").eq("propertyId", propertyId).in("locationId", ids),
      client.from("stock_movements").select("fromLocationId, toLocationId").eq("propertyId", propertyId)
        .or(`fromLocationId.in.(${ids.join(",")}),toLocationId.in.(${ids.join(",")})`),
    ]);

    const rows = new Map<string, { rows: number; units: number }>();
    for (const b of (balances ?? []) as { locationId: string; quantity: number }[]) {
      const cur = rows.get(b.locationId) ?? { rows: 0, units: 0 };
      rows.set(b.locationId, { rows: cur.rows + 1, units: cur.units + Number(b.quantity) });
    }
    const movs = new Map<string, number>();
    for (const m of (moves ?? []) as { fromLocationId: string | null; toLocationId: string | null }[]) {
      for (const id of [m.fromLocationId, m.toLocationId]) {
        if (id && ids.includes(id)) movs.set(id, (movs.get(id) ?? 0) + 1);
      }
    }

    for (const l of locs) {
      const b = rows.get(l.id) ?? { rows: 0, units: 0 };
      out[l.id] = {
        id: l.id, name: l.name, type: l.type, active: l.active, cabinId: l.cabinId ?? null,
        balanceRows: b.rows, totalUnits: b.units, movementCount: movs.get(l.id) ?? 0,
      };
    }
    return out;
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

  /** Ficha do produto: saldo por local, lotes com saldo e histórico de movimentação. */
  async getProductDetail(propertyId: string, productId: string) {
    const [{ data: product }, { data: balances }, { data: batches }, { data: movements }, { data: locations }, staffName] = await Promise.all([
      db().from("stock_products").select("*").eq("id", productId).eq("propertyId", propertyId).single(),
      db().from("stock_balances").select("*").eq("propertyId", propertyId).eq("productId", productId),
      db().from("stock_batches").select("*").eq("propertyId", propertyId).eq("productId", productId).gt("quantity", 0).order("expiryDate", { ascending: true, nullsFirst: false }),
      db().from("stock_movements").select("*").eq("propertyId", propertyId).eq("productId", productId).order("createdAt", { ascending: false }).limit(100),
      db().from("stock_locations").select("id, name").eq("propertyId", propertyId),
      this._staffNamer(propertyId),
    ]);
    const lMap = new Map((locations ?? []).map((l: { id: string; name: string }) => [l.id, l]));
    const name = (id?: string | null) => (id ? (lMap.get(id)?.name ?? "—") : "—");
    return {
      product: product as StockProduct,
      balances: ((balances ?? []) as StockBalance[]).map((b) => ({ ...b, locationName: name(b.locationId) })),
      batches: ((batches ?? []) as StockBatch[]).map((b) => ({ ...b, locationName: name(b.locationId) })),
      movements: ((movements ?? []) as StockMovement[]).map((m) => ({
        ...m,
        fromLocation: m.fromLocationId ? (lMap.get(m.fromLocationId) as StockLocation | undefined) : undefined,
        toLocation: m.toLocationId ? (lMap.get(m.toLocationId) as StockLocation | undefined) : undefined,
        fromStaffName: staffName(m.fromStaffId),
        toStaffName: staffName(m.toStaffId),
      })),
    };
  },

  /** Agregado da Visão Geral (dashboard) — KPIs, gráficos e listas em uma chamada. */
  async getDashboard(propertyId: string, days = 30): Promise<StockDashboard> {
    const ref = new Date();
    const since = new Date(ref); since.setDate(since.getDate() - days);
    const sinceIso = since.toISOString();
    const settings = await this.getSettings(propertyId);
    const turnSince = new Date(ref); turnSince.setDate(turnSince.getDate() - (Number(settings.noTurnoverDays) || 60));

    const [{ data: products }, { data: balances }, { data: categories }, { data: movements }, { data: closedCounts }, { data: recentExits }, { data: purchases }, { data: locs }] = await Promise.all([
      db().from("stock_products").select("*").eq("propertyId", propertyId).eq("deleted", false),
      db().from("stock_balances").select("productId, quantity").eq("propertyId", propertyId),
      db().from("stock_categories").select("id, name, color").eq("propertyId", propertyId),
      db().from("stock_movements").select("*").eq("propertyId", propertyId).gte("createdAt", sinceIso).order("createdAt", { ascending: false }),
      db().from("inventory_counts").select("accuracy").eq("propertyId", propertyId).eq("status", "closed").order("closedAt", { ascending: false }).limit(1),
      db().from("stock_movements").select("productId").eq("propertyId", propertyId).eq("type", "exit").gte("createdAt", turnSince.toISOString()),
      db().from("purchases").select("totalValue").eq("propertyId", propertyId).eq("status", "received").gte("receivedDate", sinceIso),
      db().from("stock_locations").select("id, name").eq("propertyId", propertyId),
    ]);

    const prods = (products ?? []) as StockProduct[];
    const totals = new Map<string, number>();
    for (const b of (balances ?? []) as { productId: string; quantity: number }[]) totals.set(b.productId, (totals.get(b.productId) ?? 0) + Number(b.quantity));
    const catMap = new Map((categories ?? []).map((c: { id: string; name: string; color?: string }) => [c.id, c]));

    let stockValue = 0, totalUnits = 0;
    const catValue = new Map<string, { value: number; color?: string }>();
    for (const p of prods) {
      const qty = totals.get(p.id) ?? 0;
      const val = qty * Number(p.averageCost || 0);
      stockValue += val; totalUnits += qty;
      const cat = p.categoryId ? catMap.get(p.categoryId) : undefined;
      const name = cat?.name ?? "Sem categoria";
      const cur = catValue.get(name) ?? { value: 0, color: cat?.color };
      cur.value += val; catValue.set(name, cur);
    }
    const byCategory = Array.from(catValue.entries()).map(([name, v]) => ({ name, value: round2(v.value), color: v.color })).filter(c => c.value > 0).sort((a, b) => b.value - a.value);

    const active = prods.filter(p => p.active);
    const lowAll = active.filter(p => (totals.get(p.id) ?? 0) < Number(p.minStock));
    const lowStockItems = lowAll.slice(0, 30).map(p => ({ id: p.id, name: p.name, unit: p.unit, qty: totals.get(p.id) ?? 0, min: Number(p.minStock) }));
    const exited = new Set((recentExits ?? []).map((m: { productId: string }) => m.productId));
    const noTurnover = active.filter(p => (totals.get(p.id) ?? 0) > 0 && !exited.has(p.id));
    const noTurnoverValue = round2(noTurnover.reduce((s, p) => s + (totals.get(p.id) ?? 0) * Number(p.averageCost || 0), 0));

    const moves = (movements ?? []) as StockMovement[];
    const summary = { entry: 0, exit: 0, transfer: 0, adjustment: 0, loss: 0 };
    const daily = new Map<string, { entry: number; exit: number }>();
    const lossM = new Map<string, { value: number; count: number }>();
    let lossesValue = 0, cmv = 0;
    for (const m of moves) {
      summary[m.type] = (summary[m.type] ?? 0) + 1;
      const day = String(m.createdAt).slice(0, 10);
      const d = daily.get(day) ?? { entry: 0, exit: 0 };
      if (m.type === "entry") d.entry += Number(m.totalCost);
      if (m.type === "exit" || m.type === "loss") d.exit += Number(m.totalCost);
      daily.set(day, d);
      if (m.type === "loss") {
        lossesValue += Number(m.totalCost);
        const t = m.lossType ?? "other";
        const lv = lossM.get(t) ?? { value: 0, count: 0 };
        lv.value += Number(m.totalCost); lv.count += 1; lossM.set(t, lv);
      }
      if (m.type === "exit" && (m.referenceType === "concierge" || m.referenceType === "fb" || m.referenceType === "minibar")) cmv += Number(m.totalCost);
    }
    const movementsDaily = Array.from(daily.entries()).map(([date, v]) => ({ date, entry: round2(v.entry), exit: round2(v.exit) })).sort((a, b) => a.date.localeCompare(b.date));
    const lossesByType = Array.from(lossM.entries()).map(([type, v]) => ({ type, value: round2(v.value), count: v.count })).sort((a, b) => b.value - a.value);

    const pName = new Map(prods.map(p => [p.id, p.name]));
    const lName = new Map((locs ?? []).map((l: { id: string; name: string }) => [l.id, l]));
    const recentMovements = moves.slice(0, 10).map(m => ({
      ...m,
      product: { name: pName.get(m.productId) } as StockProduct,
      fromLocation: m.fromLocationId ? (lName.get(m.fromLocationId) as StockLocation | undefined) : undefined,
      toLocation: m.toLocationId ? (lName.get(m.toLocationId) as StockLocation | undefined) : undefined,
    }));

    const expiring = await this.getExpiringBatches(propertyId, Number(settings.expiryAlertLeadDays) || 30);

    return {
      kpis: {
        stockValue: round2(stockValue), totalProducts: active.length, totalUnits: round2(totalUnits),
        lowStockCount: lowAll.length, noTurnoverCount: noTurnover.length, noTurnoverValue,
        lossesValue: round2(lossesValue), cmv: round2(cmv),
        accuracy: (closedCounts && closedCounts[0]) ? Number(closedCounts[0].accuracy) : null,
        purchasesCount: (purchases ?? []).length,
        purchasesTotal: round2(((purchases ?? []) as { totalValue: number }[]).reduce((s, p) => s + Number(p.totalValue), 0)),
        expiringCount: expiring.length,
      },
      byCategory, movementsDaily, lossesByType, movementsSummary: summary, lowStockItems, recentMovements,
    };
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
    const [{ data: moves }, { data: products }, { data: locations }, staffName] = await Promise.all([
      db().from("stock_movements").select("*").eq("propertyId", propertyId)
        .order("createdAt", { ascending: false }).limit(limit),
      db().from("stock_products").select("id, name").eq("propertyId", propertyId),
      db().from("stock_locations").select("id, name").eq("propertyId", propertyId),
      this._staffNamer(propertyId),
    ]);
    const pMap = new Map((products ?? []).map((p: { id: string; name: string }) => [p.id, p]));
    const lMap = new Map((locations ?? []).map((l: { id: string; name: string }) => [l.id, l]));
    return ((moves ?? []) as StockMovement[]).map((m) => ({
      ...m,
      product: pMap.get(m.productId) as StockProduct | undefined,
      fromLocation: m.fromLocationId ? (lMap.get(m.fromLocationId) as StockLocation | undefined) : undefined,
      toLocation: m.toLocationId ? (lMap.get(m.toLocationId) as StockLocation | undefined) : undefined,
      fromStaffName: staffName(m.fromStaffId),
      toStaffName: staffName(m.toStaffId),
    }));
  },

  /**
   * Colaboradores ATIVOS — alimentam o select que aparece quando o local
   * escolhido é do tipo 'staff'. O histórico resolve nomes por outro caminho
   * (_staffNamer), então quem sai da equipe não some das movimentações antigas.
   */
  async getStaffOptions(propertyId: string): Promise<StockStaffOption[]> {
    const all = await this._staffRows(propertyId);
    return all.filter((s) => s.active).map(({ id, name, role }) => ({ id, name, role }));
  },

  async _staffRows(propertyId: string): Promise<{ id: string; name: string; role?: UserRole; active: boolean }[]> {
    const { data } = await db().from("staff").select("id, fullName, role, active").eq("propertyId", propertyId).order("fullName");
    return ((data ?? []) as { id: string; fullName: string; role: UserRole | null; active: boolean | null }[])
      .map((s) => ({ id: s.id, name: s.fullName, role: s.role ?? undefined, active: s.active !== false }));
  },

  /** Resolve o nome do colaborador de um lado da movimentação (inclui inativos). */
  async _staffNamer(propertyId: string) {
    const rows = await this._staffRows(propertyId);
    const map = new Map(rows.map((s) => [s.id, s.name]));
    return (staffId?: string | null): string | undefined => (staffId ? map.get(staffId) : undefined);
  },

  /** Histórico de ENTRADAS (para explicar o custo médio): qtd, custo e data por produto. */
  async getEntryHistory(propertyId: string, limit = 500): Promise<{ productId: string; quantity: number; unitCost: number; createdAt: string }[]> {
    const { data, error } = await db()
      .from("stock_movements")
      .select("productId, quantity, unitCost, createdAt")
      .eq("propertyId", propertyId).eq("type", "entry")
      .order("createdAt", { ascending: false })
      .limit(limit);
    if (error) { console.error("getEntryHistory", error); return []; }
    return (data ?? []) as { productId: string; quantity: number; unitCost: number; createdAt: string }[];
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

    // Local do tipo 'staff' exige informar QUAL colaborador.
    await this._assertStaffDetail(client, propertyId, input);

    // Responsável pela ação: default = quem operou. O NOME é sempre resolvido no
    // servidor — o cliente manda só o id, como já vale para performedBy.
    const responsible = await this._resolveResponsible(client, propertyId, input.responsibleId, actor);

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

    // Lotes (FIFO por validade) — apenas para produtos com trackExpiry.
    let batchId: string | null = null;
    if (product.trackExpiry) {
      const loc = (input.toLocationId ?? input.fromLocationId) as string;
      switch (input.type) {
        case "entry":
          batchId = await this._createBatch(client, propertyId, input.productId, input.toLocationId!, qty, unitCost,
            input.expiryDate ?? null, input.batchCode ?? null,
            input.referenceType === "purchase" ? (input.referenceId ?? null) : null);
          break;
        case "exit":
        case "loss":
          await this._consumeBatchesFIFO(client, input.productId, input.fromLocationId!, qty);
          break;
        case "transfer": {
          const chunks = await this._consumeBatchesFIFO(client, input.productId, input.fromLocationId!, qty);
          for (const c of chunks) {
            await this._createBatch(client, propertyId, input.productId, input.toLocationId!, c.qty, c.unitCost, c.expiryDate, c.batchCode, c.purchaseId);
          }
          break;
        }
        case "adjustment":
          if (qty < 0) await this._consumeBatchesFIFO(client, input.productId, loc, -qty);
          else if (qty > 0) batchId = await this._createBatch(client, propertyId, input.productId, loc, qty, unitCost, input.expiryDate ?? null, input.batchCode ?? null, null);
          break;
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
      fromStaffId: input.fromStaffId ?? null,
      toStaffId: input.toStaffId ?? null,
      batchId,
      lossType: input.lossType ?? null,
      referenceType: input.referenceType ?? "manual",
      referenceId: input.referenceId ?? null,
      performedBy: actor.id,
      performedByName: actor.name,
      responsibleId: responsible.id,
      responsibleName: responsible.name,
      batchRef: input.batchRef ?? null,
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

  /**
   * Responsável pela ação. Aceita só o id vindo do cliente e busca o nome no
   * banco — nome enviado pelo cliente é ignorado (mesma regra de performedBy).
   * Sem id, ou id que não é da propriedade, cai no ator da sessão.
   */
  async _resolveResponsible(client: DB, propertyId: string, responsibleId: string | null | undefined, actor: Actor): Promise<Actor> {
    if (!responsibleId || responsibleId === actor.id) return actor;
    const { data } = await client.from("staff")
      .select("id, fullName").eq("id", responsibleId).eq("propertyId", propertyId).maybeSingle();
    if (!data) return actor;
    return { id: data.id as string, name: data.fullName as string };
  },

  /**
   * Só locais do tipo 'staff' carregam colaborador — normaliza o input zerando o
   * que não se aplica. O colaborador é OBRIGATÓRIO apenas na movimentação manual
   * (formulário): as baixas automáticas (compra, inventário, consumo, validade)
   * não têm onde informá-lo.
   */
  async _assertStaffDetail(client: DB, propertyId: string, input: MovementInput): Promise<void> {
    const ids = [input.fromLocationId, input.toLocationId].filter(Boolean) as string[];
    if (ids.length === 0) return;
    const required = (input.referenceType ?? "manual") === "manual";
    const { data } = await client.from("stock_locations")
      .select("id, name, type").eq("propertyId", propertyId).in("id", ids);
    const map = new Map(((data ?? []) as StockLocation[]).map((l) => [l.id, l]));

    for (const side of ["from", "to"] as const) {
      const loc = map.get((side === "from" ? input.fromLocationId : input.toLocationId) ?? "");
      const staffKey = `${side}StaffId` as const;
      if (loc?.type === "staff") {
        if (required && !input[staffKey]) throw new Error(`Selecione o colaborador em "${loc.name}".`);
      } else {
        input[staffKey] = null;
      }
    }
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

  // ── Lotes (FIFO por validade) ────────────────────────────────────────────────
  async _createBatch(client: DB, propertyId: string, productId: string, locationId: string, qty: number,
    unitCost: number, expiryDate: string | null, batchCode: string | null, purchaseId: string | null): Promise<string> {
    const id = crypto.randomUUID();
    await client.from("stock_batches").insert({
      id, propertyId, productId, locationId, quantity: qty, unitCost,
      expiryDate: expiryDate ?? null, batchCode: batchCode ?? null, purchaseId: purchaseId ?? null,
      createdAt: now(), updatedAt: now(),
    });
    return id;
  },

  /** Baixa `qty` dos lotes do local por FIFO de validade; devolve os pedaços consumidos. */
  async _consumeBatchesFIFO(client: DB, productId: string, locationId: string, qty: number): Promise<BatchChunk[]> {
    let remaining = qty;
    const consumed: BatchChunk[] = [];
    const { data: batches } = await client.from("stock_batches")
      .select("*").eq("productId", productId).eq("locationId", locationId).gt("quantity", 0)
      .order("expiryDate", { ascending: true, nullsFirst: false })
      .order("createdAt", { ascending: true });
    for (const b of (batches ?? []) as StockBatch[]) {
      if (remaining <= 0) break;
      const take = Math.min(Number(b.quantity), remaining);
      consumed.push({ qty: take, unitCost: Number(b.unitCost), expiryDate: b.expiryDate ?? null, batchCode: b.batchCode ?? null, purchaseId: b.purchaseId ?? null });
      await client.from("stock_batches").update({ quantity: Number(b.quantity) - take, updatedAt: now() }).eq("id", b.id);
      remaining -= take;
    }
    return consumed; // remaining > 0 só ocorre com allowNegative além dos lotes
  },

  async getBatches(propertyId: string, productId?: string): Promise<StockBatch[]> {
    let q = db().from("stock_batches").select("*").eq("propertyId", propertyId).gt("quantity", 0);
    if (productId) q = q.eq("productId", productId);
    const { data } = await q.order("expiryDate", { ascending: true, nullsFirst: false });
    return (data ?? []) as StockBatch[];
  },

  /** Lotes com saldo cuja validade vence dentro de `withinDays` (inclui já vencidos). */
  async getExpiringBatches(propertyId: string, withinDays = 30): Promise<StockBatch[]> {
    const limit = new Date(); limit.setDate(limit.getDate() + withinDays);
    const limitStr = limit.toISOString().slice(0, 10);
    const [{ data: batches }, { data: products }, { data: locations }] = await Promise.all([
      db().from("stock_batches").select("*").eq("propertyId", propertyId).gt("quantity", 0)
        .not("expiryDate", "is", null).lte("expiryDate", limitStr).order("expiryDate", { ascending: true }),
      db().from("stock_products").select("id, name, unit").eq("propertyId", propertyId),
      db().from("stock_locations").select("id, name").eq("propertyId", propertyId),
    ]);
    const pMap = new Map((products ?? []).map((p: { id: string }) => [p.id, p]));
    const lMap = new Map((locations ?? []).map((l: { id: string }) => [l.id, l]));
    return ((batches ?? []) as StockBatch[]).map((b) => ({
      ...b,
      product: pMap.get(b.productId) as StockProduct | undefined,
      location: lMap.get(b.locationId) as StockLocation | undefined,
    }));
  },

  /** Perdas (movimentos type='loss') dos últimos `sinceDays` dias, com produto. */
  async getLosses(propertyId: string, sinceDays = 30): Promise<StockMovement[]> {
    const since = new Date(); since.setDate(since.getDate() - sinceDays);
    const [{ data: moves }, { data: products }] = await Promise.all([
      db().from("stock_movements").select("*").eq("propertyId", propertyId).eq("type", "loss")
        .gte("createdAt", since.toISOString()).order("createdAt", { ascending: false }),
      db().from("stock_products").select("id, name, unit").eq("propertyId", propertyId),
    ]);
    const pMap = new Map((products ?? []).map((p: { id: string }) => [p.id, p]));
    return ((moves ?? []) as StockMovement[]).map((m) => ({ ...m, product: pMap.get(m.productId) as StockProduct | undefined }));
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
      propertyId, noTurnoverDays: 60, expiryAlertLeadDays: 30, autoLossOnExpiry: false, defaultSaleLocationId: null, updatedAt: now(),
    };
  },

  async saveSettings(propertyId: string, payload: Partial<StockSettings>, actor: Actor): Promise<void> {
    const row = {
      propertyId,
      noTurnoverDays: payload.noTurnoverDays ?? 60,
      expiryAlertLeadDays: payload.expiryAlertLeadDays ?? 30,
      autoLossOnExpiry: payload.autoLossOnExpiry ?? false,
      defaultSaleLocationId: payload.defaultSaleLocationId ?? null,
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
