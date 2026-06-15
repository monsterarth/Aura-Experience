// src/lib/stock-client.ts
// Wrapper HTTP tipado para as páginas do módulo Estoque/Patrimônio consumirem as
// rotas em /api/admin/* (que validam sessão e usam service-role no servidor).
import {
  StockCategory, StockLocation, StockProduct, StockMovement, StockSettings,
  Supplier, Purchase, PurchaseItem, Asset, StockBatch, InventoryCount, ProductDetail, SupplierDetail,
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
  registerMovement: (body: Record<string, unknown> & { propertyId: string }) => post("estoque/movements", body),
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
  // patrimônio
  assets: (pid: string) => get<Asset[]>("patrimonio", pid),
  saveAsset: (body: WithProp<Asset>) => post("patrimonio", body),
  deleteAsset: (pid: string, id: string) => del("patrimonio", pid, id),
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
