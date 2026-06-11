// src/services/supplier-service.ts
import { supabase, supabaseAdmin } from "@/lib/supabase";
import { AuditService } from "./audit-service";
import { Supplier } from "@/types/aura";

type DB = NonNullable<typeof supabaseAdmin>;
function db(): DB {
  return ((typeof window === "undefined" && supabaseAdmin) ? supabaseAdmin : supabase) as DB;
}
const now = () => new Date().toISOString();
interface Actor { id: string; name: string; }

export const SupplierService = {
  async getSuppliers(propertyId: string): Promise<Supplier[]> {
    const { data, error } = await db()
      .from("suppliers").select("*").eq("propertyId", propertyId).order("name", { ascending: true });
    if (error) { console.error("getSuppliers", error); return []; }
    return (data ?? []) as Supplier[];
  },

  async upsertSupplier(propertyId: string, payload: Partial<Supplier>, actor: Actor): Promise<string> {
    const isNew = !payload.id;
    const id = payload.id ?? crypto.randomUUID();
    const row = { ...payload, id, propertyId, active: payload.active ?? true, updatedAt: now(), ...(isNew && { createdAt: now() }) };
    const { error } = await db().from("suppliers").upsert(row);
    if (error) throw error;
    await AuditService.log({
      propertyId, userId: actor.id, userName: actor.name,
      action: isNew ? "SUPPLIER_CREATED" : "SUPPLIER_UPDATED", entity: "SUPPLIER", entityId: id,
      details: `Fornecedor ${isNew ? "criado" : "editado"}: ${payload.name}.`,
    });
    return id;
  },

  async deleteSupplier(propertyId: string, id: string, actor: Actor): Promise<void> {
    const { error } = await db().from("suppliers").delete().eq("id", id).eq("propertyId", propertyId);
    if (error) throw error;
    await AuditService.log({
      propertyId, userId: actor.id, userName: actor.name,
      action: "SUPPLIER_DELETED", entity: "SUPPLIER", entityId: id, details: "Fornecedor removido.",
    });
  },
};
