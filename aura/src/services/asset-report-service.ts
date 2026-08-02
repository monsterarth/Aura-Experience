// src/services/asset-report-service.ts
// Relatórios do módulo Patrimônio. Mesma regra do stock-report-service:
// devolve LINHAS ESTRUTURADAS (nunca CSV pronto), porque o mesmo payload
// alimenta a tabela na tela, o arquivo CSV e a impressão.
import { supabase, supabaseAdmin } from "@/lib/supabase";
import { computeDepreciation, warrantyStatusOf } from "./asset-service";
import {
  Asset, AssetDepreciationEntry, AssetReport, AssetReportFilters, AssetReportKind,
  AssetStatus, Cabin, MaintenanceTask, StockCategory, StockLocation,
} from "@/types/aura";

type DB = NonNullable<typeof supabaseAdmin>;
function db(): DB {
  return ((typeof window === "undefined" && supabaseAdmin) ? supabaseAdmin : supabase) as DB;
}
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const nowIso = () => new Date().toISOString();
const brDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString("pt-BR") : "");

const STATUS_LABEL: Record<AssetStatus, string> = {
  active: "Ativo", maintenance: "Manutenção", inactive: "Inativo",
  disposed: "Baixado", written_off: "Baixa contábil",
};
const DISPOSAL_LABEL: Record<string, string> = {
  sale: "Venda", donation: "Doação", scrap: "Sucata", loss: "Perda",
  theft: "Furto/roubo", trade_in: "Troca",
};
const WARRANTY_LABEL: Record<string, string> = {
  active: "Em garantia", expiring: "Vencendo", expired: "Vencida", none: "Sem garantia",
};

/** Resume os filtros numa linha — vai no cabeçalho da impressão e do CSV. */
function summarize(
  f: AssetReportFilters,
  categories: StockCategory[],
  locations: StockLocation[],
): string {
  const parts: string[] = [];
  const cats = f.categoryIds?.length ? categories.filter((c) => f.categoryIds!.includes(c.id)).map((c) => c.name) : [];
  parts.push(cats.length ? `Categorias: ${cats.join(", ")}` : "Categorias: todas");
  const locs = f.locationIds?.length ? locations.filter((l) => f.locationIds!.includes(l.id)).map((l) => l.name) : [];
  parts.push(locs.length ? `Locais: ${locs.length <= 6 ? locs.join(", ") : `${locs.length} selecionados`}` : "Locais: todos");
  if (f.statuses?.length) parts.push(`Status: ${f.statuses.map((s) => STATUS_LABEL[s]).join(", ")}`);
  if (f.from || f.to) parts.push(`Período: ${f.from ? brDate(f.from) : "…"} a ${f.to ? brDate(f.to) : "…"}`);
  if (f.includeDisposed) parts.push("Inclui baixados");
  return parts.join(" · ");
}

async function loadBase(propertyId: string) {
  const client = db();
  const [{ data: categories }, { data: locations }, { data: cabins }, { data: staff }] = await Promise.all([
    client.from("stock_categories").select("*").eq("propertyId", propertyId),
    client.from("stock_locations").select("*").eq("propertyId", propertyId).order("name"),
    client.from("cabins").select("id, name").eq("propertyId", propertyId),
    client.from("staff").select("id, fullName").eq("propertyId", propertyId),
  ]);
  return {
    categories: (categories ?? []) as StockCategory[],
    locations: (locations ?? []) as StockLocation[],
    cabins: (cabins ?? []) as Pick<Cabin, "id" | "name">[],
    staff: (staff ?? []) as { id: string; fullName: string }[],
  };
}

/** Ativos filtrados, já com depreciação e garantia calculadas. */
async function loadAssets(propertyId: string, f: AssetReportFilters): Promise<Asset[]> {
  const ref = new Date();
  let q = db().from("assets").select("*").eq("propertyId", propertyId).order("name");
  if (f.statuses?.length) q = q.in("status", f.statuses);
  else if (!f.includeDisposed) q = q.not("status", "in", "(disposed,written_off)");
  if (f.categoryIds?.length) q = q.in("categoryId", f.categoryIds);
  if (f.locationIds?.length) q = q.in("locationId", f.locationIds);
  if (f.custodianIds?.length) q = q.in("custodianId", f.custodianIds);

  const { data } = await q;
  return ((data ?? []) as Asset[]).map((a) => ({
    ...a,
    warrantyStatus: warrantyStatusOf(a.warrantyUntil, ref),
    ...computeDepreciation(a, ref),
  }));
}

function meta(f: AssetReportFilters, cats: StockCategory[], locs: StockLocation[], rowCount: number) {
  return { generatedAt: nowIso(), filterSummary: summarize(f, cats, locs), rowCount };
}

export const AssetReportService = {
  async build(propertyId: string, kind: AssetReportKind, filters: AssetReportFilters): Promise<AssetReport> {
    switch (kind) {
      case "asset_depreciation": return this.depreciationLedger(propertyId, filters);
      case "asset_warranty": return this.warrantyReport(propertyId, filters);
      case "asset_maintenance": return this.maintenanceCostReport(propertyId, filters);
      case "asset_disposals": return this.disposalsReport(propertyId, filters);
      default: return this.positionReport(propertyId, filters);
    }
  },

  /** Posição patrimonial: um ativo por linha, com custo e valor contábil. */
  async positionReport(propertyId: string, f: AssetReportFilters): Promise<AssetReport> {
    const [{ categories, locations, cabins, staff }, assets] = await Promise.all([
      loadBase(propertyId), loadAssets(propertyId, f),
    ]);
    const catMap = new Map(categories.map((c) => [c.id, c.name]));
    const locMap = new Map(locations.map((l) => [l.id, l.name]));
    const cabMap = new Map(cabins.map((c) => [c.id, c.name]));
    const staffMap = new Map(staff.map((s) => [s.id, s.fullName]));

    const rows = assets.map((a) => ({
      tag: a.assetTag ?? "",
      plaqueta: a.publicCode ?? "",
      ativo: a.name,
      categoria: a.categoryId ? catMap.get(a.categoryId) ?? "" : "",
      local: a.cabinId ? cabMap.get(a.cabinId) ?? "" : (a.locationId ? locMap.get(a.locationId) ?? "" : ""),
      responsavel: a.custodianId ? staffMap.get(a.custodianId) ?? a.custodianName ?? "" : "",
      status: STATUS_LABEL[a.status],
      aquisicao: brDate(a.acquisitionDate),
      custo: round2(Number(a.acquisitionCost ?? 0)),
      depreciado: round2(Number(a.accumulatedDepreciation ?? 0)),
      valorContabil: round2(Number(a.bookValue ?? 0)),
    }));

    return {
      kind: "asset_position",
      columns: [
        { key: "tag", label: "Nº" }, { key: "plaqueta", label: "Plaqueta" },
        { key: "ativo", label: "Ativo" }, { key: "categoria", label: "Categoria" },
        { key: "local", label: "Local" }, { key: "responsavel", label: "Responsável" },
        { key: "status", label: "Status" }, { key: "aquisicao", label: "Aquisição" },
        { key: "custo", label: "Custo", align: "right" },
        { key: "depreciado", label: "Depreciado", align: "right" },
        { key: "valorContabil", label: "Valor contábil", align: "right" },
      ],
      rows,
      totals: {
        custo: round2(rows.reduce((s, r) => s + r.custo, 0)),
        depreciado: round2(rows.reduce((s, r) => s + r.depreciado, 0)),
        valorContabil: round2(rows.reduce((s, r) => s + r.valorContabil, 0)),
      },
      meta: meta(f, categories, locations, rows.length),
    };
  },

  /** Razão de depreciação: um lançamento mensal por linha. */
  async depreciationLedger(propertyId: string, f: AssetReportFilters): Promise<AssetReport> {
    const [{ categories, locations }, assets] = await Promise.all([
      loadBase(propertyId), loadAssets(propertyId, { ...f, includeDisposed: true }),
    ]);
    const assetIds = assets.map((a) => a.id);
    if (assetIds.length === 0) {
      return {
        kind: "asset_depreciation", columns: [], rows: [], totals: {},
        meta: meta(f, categories, locations, 0),
      };
    }

    let q = db().from("asset_depreciation_entries").select("*")
      .eq("propertyId", propertyId).in("assetId", assetIds).order("period", { ascending: false });
    // Datas viram períodos YYYY-MM: a razão é mensal.
    if (f.from) q = q.gte("period", f.from.slice(0, 7));
    if (f.to) q = q.lte("period", f.to.slice(0, 7));
    const { data } = await q;

    const aMap = new Map(assets.map((a) => [a.id, a]));
    const rows = ((data ?? []) as AssetDepreciationEntry[]).map((e) => {
      const a = aMap.get(e.assetId);
      return {
        periodo: e.period,
        tag: a?.assetTag ?? "",
        ativo: a?.name ?? e.assetId,
        depreciacao: round2(Number(e.amount ?? 0)),
        acumulada: round2(Number(e.accumulatedDepreciation ?? 0)),
        valorContabil: round2(Number(e.bookValue ?? 0)),
      };
    });

    return {
      kind: "asset_depreciation",
      columns: [
        { key: "periodo", label: "Período" }, { key: "tag", label: "Nº" }, { key: "ativo", label: "Ativo" },
        { key: "depreciacao", label: "Depreciação", align: "right" },
        { key: "acumulada", label: "Acumulada", align: "right" },
        { key: "valorContabil", label: "Valor contábil", align: "right" },
      ],
      rows,
      totals: { depreciacao: round2(rows.reduce((s, r) => s + r.depreciacao, 0)) },
      meta: meta(f, categories, locations, rows.length),
    };
  },

  /** Garantias: o que está para vencer dentro da janela, e o que já venceu. */
  async warrantyReport(propertyId: string, f: AssetReportFilters): Promise<AssetReport> {
    const [{ categories, locations, cabins }, assets] = await Promise.all([
      loadBase(propertyId), loadAssets(propertyId, f),
    ]);
    const windowDays = f.warrantyWindowDays ?? 90;
    const limit = new Date(Date.now() + windowDays * 86_400_000);
    const catMap = new Map(categories.map((c) => [c.id, c.name]));
    const locMap = new Map(locations.map((l) => [l.id, l.name]));
    const cabMap = new Map(cabins.map((c) => [c.id, c.name]));

    const rows = assets
      .filter((a) => a.warrantyUntil && new Date(a.warrantyUntil) <= limit)
      .sort((a, b) => (a.warrantyUntil ?? "").localeCompare(b.warrantyUntil ?? ""))
      .map((a) => {
        const until = new Date(a.warrantyUntil as string);
        const days = Math.ceil((until.getTime() - Date.now()) / 86_400_000);
        return {
          tag: a.assetTag ?? "",
          ativo: a.name,
          categoria: a.categoryId ? catMap.get(a.categoryId) ?? "" : "",
          local: a.cabinId ? cabMap.get(a.cabinId) ?? "" : (a.locationId ? locMap.get(a.locationId) ?? "" : ""),
          garantidor: a.warrantyProvider ?? "",
          ate: brDate(a.warrantyUntil),
          dias: days,
          situacao: WARRANTY_LABEL[a.warrantyStatus ?? "none"],
        };
      });

    return {
      kind: "asset_warranty",
      columns: [
        { key: "tag", label: "Nº" }, { key: "ativo", label: "Ativo" }, { key: "categoria", label: "Categoria" },
        { key: "local", label: "Local" }, { key: "garantidor", label: "Garantidor" },
        { key: "ate", label: "Garantia até" }, { key: "dias", label: "Dias", align: "right" },
        { key: "situacao", label: "Situação" },
      ],
      rows,
      totals: {},
      meta: {
        ...meta(f, categories, locations, rows.length),
        filterSummary: `${summarize(f, categories, locations)} · Janela: ${windowDays} dias`,
      },
    };
  },

  /** Custo de manutenção por ativo — o "custo total de propriedade". */
  async maintenanceCostReport(propertyId: string, f: AssetReportFilters): Promise<AssetReport> {
    const [{ categories, locations }, assets] = await Promise.all([
      loadBase(propertyId), loadAssets(propertyId, f),
    ]);
    const assetIds = assets.map((a) => a.id);
    if (assetIds.length === 0) {
      return { kind: "asset_maintenance", columns: [], rows: [], totals: {}, meta: meta(f, categories, locations, 0) };
    }

    let q = db().from("maintenance_tasks").select("assetId, status, cost, createdAt")
      .eq("propertyId", propertyId).in("assetId", assetIds);
    if (f.from) q = q.gte("createdAt", f.from);
    if (f.to) q = q.lte("createdAt", `${f.to}T23:59:59`);
    const { data } = await q;

    const byAsset = new Map<string, { count: number; open: number; cost: number }>();
    for (const t of (data ?? []) as MaintenanceTask[]) {
      if (!t.assetId) continue;
      const acc = byAsset.get(t.assetId) ?? { count: 0, open: 0, cost: 0 };
      acc.count++;
      if (!["completed", "cancelled"].includes(t.status)) acc.open++;
      acc.cost += Number(t.cost ?? 0);
      byAsset.set(t.assetId, acc);
    }

    const rows = assets
      .map((a) => {
        const acc = byAsset.get(a.id) ?? { count: 0, open: 0, cost: 0 };
        const custo = round2(Number(a.acquisitionCost ?? 0));
        const manut = round2(acc.cost);
        return {
          tag: a.assetTag ?? "",
          ativo: a.name,
          chamados: acc.count,
          abertos: acc.open,
          custoAquisicao: custo,
          custoManutencao: manut,
          // Manutenção acima de ~50% da aquisição é o sinal clássico de "troque".
          percentual: custo > 0 ? round2((manut / custo) * 100) : 0,
        };
      })
      .filter((r) => r.chamados > 0)
      .sort((a, b) => b.custoManutencao - a.custoManutencao);

    return {
      kind: "asset_maintenance",
      columns: [
        { key: "tag", label: "Nº" }, { key: "ativo", label: "Ativo" },
        { key: "chamados", label: "Chamados", align: "right" },
        { key: "abertos", label: "Abertos", align: "right" },
        { key: "custoAquisicao", label: "Custo aquisição", align: "right" },
        { key: "custoManutencao", label: "Custo manutenção", align: "right" },
        { key: "percentual", label: "% do custo", align: "right" },
      ],
      rows,
      totals: {
        chamados: rows.reduce((s, r) => s + r.chamados, 0),
        custoManutencao: round2(rows.reduce((s, r) => s + r.custoManutencao, 0)),
      },
      meta: meta(f, categories, locations, rows.length),
    };
  },

  /** Baixas do período, com o resultado (ganho/perda) de cada uma. */
  async disposalsReport(propertyId: string, f: AssetReportFilters): Promise<AssetReport> {
    const { categories, locations } = await loadBase(propertyId);
    let q = db().from("assets").select("*")
      .eq("propertyId", propertyId).not("disposalDate", "is", null).order("disposalDate", { ascending: false });
    if (f.categoryIds?.length) q = q.in("categoryId", f.categoryIds);
    if (f.from) q = q.gte("disposalDate", f.from);
    if (f.to) q = q.lte("disposalDate", f.to);
    const { data } = await q;

    const catMap = new Map(categories.map((c) => [c.id, c.name]));
    const rows = ((data ?? []) as Asset[]).map((a) => {
      const recebido = round2(Number(a.disposalValue ?? 0));
      const contabil = round2(Number(a.bookValueAtDisposal ?? 0));
      return {
        data: brDate(a.disposalDate),
        tag: a.assetTag ?? "",
        ativo: a.name,
        categoria: a.categoryId ? catMap.get(a.categoryId) ?? "" : "",
        tipo: a.disposalType ? DISPOSAL_LABEL[a.disposalType] ?? a.disposalType : "",
        motivo: a.disposalReason ?? "",
        valorContabil: contabil,
        recebido,
        resultado: round2(recebido - contabil),
        responsavel: a.disposedByName ?? "",
      };
    });

    return {
      kind: "asset_disposals",
      columns: [
        { key: "data", label: "Data" }, { key: "tag", label: "Nº" }, { key: "ativo", label: "Ativo" },
        { key: "categoria", label: "Categoria" }, { key: "tipo", label: "Tipo" }, { key: "motivo", label: "Motivo" },
        { key: "valorContabil", label: "Valor contábil", align: "right" },
        { key: "recebido", label: "Recebido", align: "right" },
        { key: "resultado", label: "Resultado", align: "right" },
        { key: "responsavel", label: "Registrado por" },
      ],
      rows,
      totals: {
        valorContabil: round2(rows.reduce((s, r) => s + r.valorContabil, 0)),
        recebido: round2(rows.reduce((s, r) => s + r.recebido, 0)),
        resultado: round2(rows.reduce((s, r) => s + r.resultado, 0)),
      },
      meta: meta(f, categories, locations, rows.length),
    };
  },
};
