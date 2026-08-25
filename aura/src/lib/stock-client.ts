// src/lib/stock-client.ts
// Wrapper HTTP tipado para as páginas do módulo Estoque/Patrimônio consumirem as
// rotas em /api/admin/* (que validam sessão e usam service-role no servidor).
import {
  BatchMovementInput, BatchMovementResult,
  StockReport, StockReportFilters, StockReportKind,
  CabinLinkReport, StockCabinOption, StockLocationDetail, StockLocationOverview,
  StockCategory, StockLocation, StockProduct, StockMovement, StockStaffOption, StockSettings,
  StockMovementHistory, StockMovementHistoryFilters, StockBatchDetail,
  Supplier, Purchase, PurchaseItem, Asset, StockBatch, InventoryCount, ProductDetail, SupplierDetail, StockDashboard,
  InvoiceImportPreview, InvoiceImportCommit, InvoiceImportResult,
  AssetDetail, AssetLabel, AssetDisposalInput, AssetTransferInput,
  AssetInventoryCount, AssetInventoryItemStatus, AssetInventoryItemUpdate,
  AssetReport, AssetReportFilters, AssetReportKind,
} from "@/types/aura";

const BASE = "/api/admin";

async function get<T>(path: string, propertyId: string, extra = ""): Promise<T> {
  const res = await fetch(`${BASE}/${path}?propertyId=${encodeURIComponent(propertyId)}${extra}`, { cache: "no-store" });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Erro ao carregar.");
  return res.json() as Promise<T>;
}
async function post<T = { id?: string }>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}/${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw Object.assign(new Error(data?.error || "Erro ao salvar."), data);
  }
  return res.json() as Promise<T>;
}
async function del(path: string, propertyId: string, id: string): Promise<void> {
  const res = await fetch(`${BASE}/${path}?propertyId=${encodeURIComponent(propertyId)}&id=${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Erro ao remover.");
}

type WithProp<T> = Partial<T> & { propertyId: string };

export const StockClient = {
  // categorias
  categories: (pid: string) => get<StockCategory[]>("estoque/categories", pid),
  saveCategory: (body: WithProp<StockCategory>) => post("estoque/categories", body),
  deleteCategory: (pid: string, id: string) => del("estoque/categories", pid, id),
  // locais
  locations: (pid: string) => get<StockLocation[]>("estoque/locations", pid),
  cabinLinks: (pid: string) => get<CabinLinkReport>("estoque/locations", pid, "&cabins=1"),
  cabinOptions: (pid: string) => get<StockCabinOption[]>("estoque/locations", pid, "&cabinOptions=1"),
  locationsOverview: (pid: string) => get<StockLocationOverview[]>("estoque/locations", pid, "&overview=1"),
  locationDetail: (pid: string, id: string) => get<StockLocationDetail>("estoque/locations", pid, `&detail=${encodeURIComponent(id)}`),
  adjustBalance: (body: { propertyId: string; locationId: string; productId: string; newQuantity: number; reason: string; responsibleId?: string | null; staffId?: string | null }) =>
    post<{ movementId: string | null; delta: number }>("estoque/movements", { action: "adjustBalance", ...body }),
  linkCabins: (propertyId: string, links: { cabinId: string; locationId: string | null; rename?: boolean }[]) =>
    post<{ linked: number; unlinked: number }>("estoque/locations", { propertyId, action: "linkCabins", links }),
  saveLocation: (body: WithProp<StockLocation>) => post("estoque/locations", body),
  deleteLocation: (pid: string, id: string) => del("estoque/locations", pid, id),
  // produtos
  products: (pid: string) => get<StockProduct[]>("estoque/products", pid),
  lowStock: (pid: string) => get<StockProduct[]>("estoque/products", pid, "&lowStock=1"),
  entryHistory: (pid: string) => get<{ productId: string; quantity: number; unitCost: number; createdAt: string }[]>("estoque/products", pid, "&entries=1"),
  productDetail: (pid: string, productId: string) => get<ProductDetail>("estoque/products", pid, `&detail=${encodeURIComponent(productId)}`),
  saveProduct: (body: WithProp<StockProduct>) => post("estoque/products", body),
  deleteProduct: (pid: string, id: string) => del("estoque/products", pid, id),
  // movimentações
  movements: (pid: string, limit = 100) => get<StockMovement[]>("estoque/movements", pid, `&limit=${limit}`),
  movementHistory: (pid: string, f: StockMovementHistoryFilters) => {
    const p = new URLSearchParams({ history: "1" });
    if (f.from) p.set("from", f.from);
    if (f.to) p.set("to", f.to);
    if (f.types?.length) p.set("types", f.types.join(","));
    if (f.productId) p.set("productId", f.productId);
    if (f.locationId) p.set("locationId", f.locationId);
    if (f.responsibleId) p.set("responsibleId", f.responsibleId);
    if (f.referenceType) p.set("referenceType", f.referenceType);
    if (f.search) p.set("search", f.search);
    if (f.onlyWithNotes) p.set("onlyWithNotes", "1");
    p.set("page", String(f.page ?? 1));
    p.set("pageSize", String(f.pageSize ?? 50));
    return get<StockMovementHistory>("estoque/movements", pid, `&${p.toString()}`);
  },
  movementStaff: (pid: string) => get<StockStaffOption[]>("estoque/movements", pid, "&staff=1"),
  /** Todas as movimentações de um lote — a contagem real, não a fatia carregada na tela. */
  batchMovements: (pid: string, batchRef: string) =>
    get<StockBatchDetail>("estoque/movements", pid, `&batch=${encodeURIComponent(batchRef)}`),
  registerMovement: (body: Record<string, unknown> & { propertyId: string }) => post("estoque/movements", body),
  registerBatch: (body: BatchMovementInput & { propertyId: string }) =>
    post<BatchMovementResult>("estoque/movements", { action: "batch", ...body }),
  revertBatch: (propertyId: string, batchRef: string) =>
    post<{ reverted: number }>("estoque/movements", { propertyId, action: "revertBatch", batchRef }),
  // relatórios (POST: a lista de ids selecionados não cabe em query string)
  report: (propertyId: string, kind: StockReportKind, filters: StockReportFilters) =>
    post<StockReport>("estoque/reports", { propertyId, kind, filters }),
  // dashboard (visão geral)
  dashboard: (pid: string, days = 30) => get<StockDashboard>("estoque/overview", pid, `&days=${days}`),
  // parâmetros
  settings: (pid: string) => get<StockSettings>("estoque/settings", pid),
  saveSettings: (body: WithProp<StockSettings>) => post("estoque/settings", body),
  // fornecedores
  suppliers: (pid: string) => get<Supplier[]>("estoque/suppliers", pid),
  supplierDetail: (pid: string, id: string) => get<SupplierDetail>("estoque/suppliers", pid, `&detail=${encodeURIComponent(id)}`),
  saveSupplier: (body: WithProp<Supplier>) => post("estoque/suppliers", body),
  deleteSupplier: (pid: string, id: string) => del("estoque/suppliers", pid, id),
  // compras
  purchases: (pid: string) => get<Purchase[]>("estoque/purchases", pid),
  savePurchase: (body: Partial<Omit<Purchase, "items">> & { propertyId: string; items?: Partial<PurchaseItem>[] }) => post("estoque/purchases", body),
  deletePurchase: (pid: string, id: string) => del("estoque/purchases", pid, id),
  receivePurchase: (propertyId: string, purchaseId: string, overrides?: Record<string, { expiryDate?: string | null; batchCode?: string | null }>) =>
    post("estoque/purchases/receive", { propertyId, purchaseId, overrides }),
  // compras pelo XML da NF-e — o upload aceita .xml solto e o .zip do contador
  readInvoiceFiles: async (propertyId: string, files: File[]) => {
    const fd = new FormData();
    fd.append("propertyId", propertyId);
    for (const f of files) fd.append("files", f);
    const res = await fetch(`${BASE}/estoque/purchases/import`, { method: "POST", body: fd });
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Não consegui ler o arquivo.");
    return res.json() as Promise<{
      previews: { fileName: string; preview: InvoiceImportPreview }[];
      failures: { fileName: string; error: string }[];
      truncated: number;
    }>;
  },
  importInvoice: (body: InvoiceImportCommit) => post<InvoiceImportResult>("estoque/purchases/import", body),
  // patrimônio
  assets: (pid: string, includeDisposed = false) =>
    get<Asset[]>("patrimonio", pid, includeDisposed ? "&includeDisposed=1" : ""),
  assetDetail: (pid: string, id: string) => get<AssetDetail>("patrimonio", pid, `&detail=${encodeURIComponent(id)}`),
  assetLabels: (pid: string, ids: string[]) => get<AssetLabel[]>("patrimonio", pid, `&labels=${ids.join(",")}`),
  saveAsset: (body: WithProp<Asset>) => post("patrimonio", body),
  disposeAsset: (propertyId: string, id: string, disposal: AssetDisposalInput) =>
    post<{ ok: true }>("patrimonio", { propertyId, action: "dispose", id, ...disposal }),
  reinstateAsset: (propertyId: string, id: string, reason: string) =>
    post<{ ok: true }>("patrimonio", { propertyId, action: "reinstate", id, reason }),
  moveAsset: (propertyId: string, id: string, to: AssetTransferInput) =>
    post<{ movementId: string }>("patrimonio", { propertyId, action: "move", id, ...to }),
  deleteAsset: (pid: string, id: string) => del("patrimonio", pid, id),
  // conferência de patrimônio
  assetCounts: (pid: string) => get<AssetInventoryCount[]>("patrimonio/inventario", pid),
  assetCount: (pid: string, id: string) => get<AssetInventoryCount>("patrimonio/inventario", pid, `&id=${encodeURIComponent(id)}`),
  createAssetCount: (propertyId: string, opts: { locationId?: string | null; cabinId?: string | null; scope?: string[]; applyMoves?: boolean }) =>
    post<{ id: string }>("patrimonio/inventario", { propertyId, action: "create", ...opts }),
  saveAssetCountItems: (propertyId: string, countId: string, items: AssetInventoryItemUpdate[]) =>
    post<{ ok: true }>("patrimonio/inventario", { propertyId, action: "saveItems", countId, items }),
  markAssetByCode: (propertyId: string, countId: string, code: string) =>
    post<{ assetId: string; status: AssetInventoryItemStatus; name: string; assetTag?: string | null }>(
      "patrimonio/inventario", { propertyId, action: "markByCode", countId, code }),
  closeAssetCount: (propertyId: string, countId: string) =>
    post<{ accuracy: number; found: number; missing: number; moved: number; unexpected: number }>(
      "patrimonio/inventario", { propertyId, action: "close", countId }),
  deleteAssetCount: (pid: string, id: string) => del("patrimonio/inventario", pid, id),
  // relatórios de patrimônio
  assetReport: (propertyId: string, kind: AssetReportKind, filters: AssetReportFilters) =>
    post<AssetReport>("patrimonio/reports", { propertyId, kind, filters }),
  // validade / lotes
  expiringBatches: (pid: string, days = 30) => get<StockBatch[]>("estoque/batches", pid, `&expiring=${days}`),
  // perdas
  losses: (pid: string, days = 30) => get<StockMovement[]>("estoque/losses", pid, `&days=${days}`),
  // inventário
  inventoryCounts: (pid: string) => get<InventoryCount[]>("estoque/inventory", pid),
  inventoryCount: (pid: string, id: string) => get<InventoryCount>("estoque/inventory", pid, `&id=${encodeURIComponent(id)}`),
  createCount: (propertyId: string, locationId: string, scope: string[]) => post<{ id: string }>("estoque/inventory", { propertyId, action: "create", locationId, scope }),
  saveCountItems: (propertyId: string, countId: string, items: { id: string; countedQty: number | null }[]) => post("estoque/inventory", { propertyId, action: "saveItems", countId, items }),
  closeCount: (propertyId: string, countId: string) => post<{ accuracy: number }>("estoque/inventory", { propertyId, action: "close", countId }),
  deleteCount: (pid: string, id: string) => del("estoque/inventory", pid, id),
};
