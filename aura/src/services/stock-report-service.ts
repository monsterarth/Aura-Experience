// src/services/stock-report-service.ts
// Relatórios do módulo Estoque. Devolve LINHAS ESTRUTURADAS (nunca CSV pronto):
// o mesmo payload alimenta a tabela na tela, o arquivo CSV e a impressão.
import { supabase, supabaseAdmin } from "@/lib/supabase";
import {
  StockCategory, StockLocation, StockMovement, StockMovementType, StockProduct,
  StockReport, StockReportFilters, StockReportKind,
} from "@/types/aura";

type DB = NonNullable<typeof supabaseAdmin>;
function db(): DB {
  const client = (typeof window === "undefined" && supabaseAdmin) ? supabaseAdmin : supabase;
  return client as DB;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const now = () => new Date().toISOString();

const MOV_LABEL: Record<StockMovementType, string> = {
  entry: "Entrada", exit: "Saída", transfer: "Transferência", adjustment: "Ajuste", loss: "Perda",
};
const LOSS_LABEL: Record<string, string> = {
  expiry: "Vencimento", damage: "Quebra/Danificação", handling: "Manipulação", other: "Outros",
};

/** Resume os filtros em uma linha — vai no cabeçalho da impressão e do CSV. */
function summarize(f: StockReportFilters, locations: StockLocation[], products: StockProduct[]): string {
  const parts: string[] = [];
  const locs = f.locationIds?.length
    ? locations.filter((l) => f.locationIds!.includes(l.id)).map((l) => l.name)
    : [];
  parts.push(locs.length ? `Estoques: ${locs.join(", ")}` : "Estoques: todos");
  const prods = f.productIds?.length
    ? products.filter((p) => f.productIds!.includes(p.id)).map((p) => p.name)
    : [];
  parts.push(prods.length ? `Itens: ${prods.length <= 6 ? prods.join(", ") : `${prods.length} selecionados`}` : "Itens: todos");
  if (f.from || f.to) {
    const d = (s?: string | null) => (s ? new Date(s).toLocaleDateString("pt-BR") : "…");
    parts.push(`Período: ${d(f.from)} a ${d(f.to)}`);
  }
  return parts.join(" · ");
}

async function loadBase(propertyId: string) {
  const client = db();
  const [{ data: products }, { data: locations }, { data: categories }] = await Promise.all([
    client.from("stock_products").select("*").eq("propertyId", propertyId).eq("deleted", false).order("name"),
    client.from("stock_locations").select("*").eq("propertyId", propertyId).order("name"),
    client.from("stock_categories").select("*").eq("propertyId", propertyId),
  ]);
  return {
    products: (products ?? []) as StockProduct[],
    locations: (locations ?? []) as StockLocation[],
    categories: (categories ?? []) as StockCategory[],
  };
}

export const StockReportService = {
  async build(propertyId: string, kind: StockReportKind, filters: StockReportFilters): Promise<StockReport> {
    switch (kind) {
      case "position": return this.positionReport(propertyId, filters);
      case "losses": return this.movementsReport(propertyId, { ...filters, types: ["loss"] }, "losses");
      default: return this.movementsReport(propertyId, filters, "movements");
    }
  },

  /** Posição de estoque: saldo por (item × estoque), com custo e valor. */
  async positionReport(propertyId: string, f: StockReportFilters): Promise<StockReport> {
    const client = db();
    const { products, locations, categories } = await loadBase(propertyId);
    const { data: balances } = await client.from("stock_balances")
      .select("locationId, productId, quantity").eq("propertyId", propertyId);

    const pMap = new Map(products.map((p) => [p.id, p]));
    const lMap = new Map(locations.map((l) => [l.id, l]));
    const catMap = new Map(categories.map((c) => [c.id, c.name]));

    const rows = ((balances ?? []) as { locationId: string; productId: string; quantity: number }[])
      .filter((b) => {
        if (f.locationIds?.length && !f.locationIds.includes(b.locationId)) return false;
        if (f.productIds?.length && !f.productIds.includes(b.productId)) return false;
        const p = pMap.get(b.productId);
        if (!p) return false;
        if (f.categoryIds?.length && !(p.categoryId && f.categoryIds.includes(p.categoryId))) return false;
        if (f.hideZero !== false && Number(b.quantity) === 0) return false;
        return true;
      })
      .map((b) => {
        const p = pMap.get(b.productId)!;
        const qty = Number(b.quantity);
        const cost = Number(p.averageCost) || 0;
        return {
          estoque: lMap.get(b.locationId)?.name ?? "—",
          item: p.name,
          categoria: p.categoryId ? (catMap.get(p.categoryId) ?? "—") : "—",
          unidade: p.unit,
          saldo: qty,
          minimo: Number(p.minStock) || 0,
          custoMedio: round2(cost),
          valor: round2(qty * cost),
          situacao: Number(p.minStock) > 0 && qty < Number(p.minStock) ? "Abaixo do mínimo" : "",
        };
      })
      .sort((a, b) => a.estoque.localeCompare(b.estoque) || a.item.localeCompare(b.item));

    return {
      kind: "position",
      columns: [
        { key: "estoque", label: "Estoque" },
        { key: "item", label: "Item" },
        { key: "categoria", label: "Categoria" },
        { key: "unidade", label: "Un." },
        { key: "saldo", label: "Saldo", align: "right" },
        { key: "minimo", label: "Mínimo", align: "right" },
        { key: "custoMedio", label: "Custo médio", align: "right" },
        { key: "valor", label: "Valor", align: "right" },
        { key: "situacao", label: "Situação" },
      ],
      rows,
      totals: {
        saldo: round2(rows.reduce((s, r) => s + r.saldo, 0)),
        valor: round2(rows.reduce((s, r) => s + r.valor, 0)),
      },
      meta: { generatedAt: now(), filterSummary: summarize(f, locations, products), rowCount: rows.length },
    };
  },

  /** Movimentações (ou só perdas) no período, com origem/destino e responsável. */
  async movementsReport(propertyId: string, f: StockReportFilters, kind: StockReportKind = "movements"): Promise<StockReport> {
    const client = db();
    const { products, locations, categories } = await loadBase(propertyId);

    let q = client.from("stock_movements").select("*").eq("propertyId", propertyId);
    if (f.from) q = q.gte("createdAt", f.from);
    if (f.to) q = q.lte("createdAt", `${f.to.slice(0, 10)}T23:59:59.999Z`);
    if (f.types?.length) q = q.in("type", f.types);
    if (f.productIds?.length) q = q.in("productId", f.productIds);
    const { data: moves } = await q.order("createdAt", { ascending: false }).limit(5000);

    const pMap = new Map(products.map((p) => [p.id, p]));
    const lMap = new Map(locations.map((l) => [l.id, l]));
    const catMap = new Map(categories.map((c) => [c.id, c.name]));

    const rows = ((moves ?? []) as StockMovement[])
      .filter((m) => {
        if (f.locationIds?.length) {
          const hit = (m.fromLocationId && f.locationIds.includes(m.fromLocationId))
            || (m.toLocationId && f.locationIds.includes(m.toLocationId));
          if (!hit) return false;
        }
        if (f.categoryIds?.length) {
          const p = pMap.get(m.productId);
          if (!p?.categoryId || !f.categoryIds.includes(p.categoryId)) return false;
        }
        return true;
      })
      .map((m) => {
        const p = pMap.get(m.productId);
        return {
          data: new Date(m.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }),
          tipo: MOV_LABEL[m.type] ?? m.type,
          item: p?.name ?? "—",
          categoria: p?.categoryId ? (catMap.get(p.categoryId) ?? "—") : "—",
          quantidade: Number(m.quantity),
          unidade: p?.unit ?? "",
          origem: m.fromLocationId ? (lMap.get(m.fromLocationId)?.name ?? "—") : "",
          destino: m.toLocationId ? (lMap.get(m.toLocationId)?.name ?? "—") : "",
          motivo: m.lossType ? (LOSS_LABEL[m.lossType] ?? m.lossType) : "",
          custo: round2(Number(m.totalCost) || 0),
          responsavel: m.responsibleName ?? m.performedByName ?? "—",
          observacoes: m.notes ?? "",
        };
      });

    const columns = [
      { key: "data", label: "Data" },
      { key: "tipo", label: "Tipo" },
      { key: "item", label: "Item" },
      { key: "categoria", label: "Categoria" },
      { key: "quantidade", label: "Qtd.", align: "right" as const },
      { key: "unidade", label: "Un." },
      { key: "origem", label: "Origem" },
      { key: "destino", label: "Destino" },
      ...(kind === "losses" ? [{ key: "motivo", label: "Motivo" }] : []),
      { key: "custo", label: "Custo", align: "right" as const },
      { key: "responsavel", label: "Responsável" },
      { key: "observacoes", label: "Observações" },
    ];

    return {
      kind,
      columns,
      rows,
      totals: {
        quantidade: round2(rows.reduce((s, r) => s + Math.abs(r.quantidade), 0)),
        custo: round2(rows.reduce((s, r) => s + r.custo, 0)),
      },
      meta: { generatedAt: now(), filterSummary: summarize(f, locations, products), rowCount: rows.length },
    };
  },
};
