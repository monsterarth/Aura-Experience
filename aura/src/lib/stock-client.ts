// src/lib/stock-client.ts
// Wrapper HTTP tipado para as páginas do módulo Estoque consumirem as rotas
// /api/admin/estoque/* (que validam sessão e usam service-role no servidor).
import {
  StockCategory, StockLocation, StockProduct, StockMovement, StockSettings,
} from "@/types/aura";

const BASE = "/api/admin/estoque";

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
  categories: (pid: string) => get<StockCategory[]>("categories", pid),
  saveCategory: (body: WithProp<StockCategory>) => post("categories", body),
  deleteCategory: (pid: string, id: string) => del("categories", pid, id),
  // locais
  locations: (pid: string) => get<StockLocation[]>("locations", pid),
  saveLocation: (body: WithProp<StockLocation>) => post("locations", body),
  deleteLocation: (pid: string, id: string) => del("locations", pid, id),
  // produtos
  products: (pid: string) => get<StockProduct[]>("products", pid),
  lowStock: (pid: string) => get<StockProduct[]>("products", pid, "&lowStock=1"),
  saveProduct: (body: WithProp<StockProduct>) => post("products", body),
  deleteProduct: (pid: string, id: string) => del("products", pid, id),
  // movimentações
  movements: (pid: string, limit = 100) => get<StockMovement[]>("movements", pid, `&limit=${limit}`),
  registerMovement: (body: Record<string, unknown> & { propertyId: string }) => post("movements", body),
  // parâmetros
  settings: (pid: string) => get<StockSettings>("settings", pid),
  saveSettings: (body: WithProp<StockSettings>) => post("settings", body),
};
