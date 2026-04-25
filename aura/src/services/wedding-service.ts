import { supabaseAdmin } from "@/lib/supabase";
import { Wedding, WeddingVendor, WeddingCabinAssignment, WeddingStatus } from "@/types/aura";

export const WeddingService = {

  async getWeddings(propertyId: string): Promise<Wedding[]> {
    const { data, error } = await supabaseAdmin
      .from("weddings")
      .select("*, vendors:wedding_vendors(*), cabinAssignments:wedding_cabin_assignments(*)")
      .eq("propertyId", propertyId)
      .order("weddingDate", { ascending: true });

    if (error) { console.error("Error fetching weddings:", error); return []; }
    return (data ?? []) as Wedding[];
  },

  async getWeddingById(propertyId: string, id: string): Promise<Wedding | null> {
    const { data, error } = await supabaseAdmin
      .from("weddings")
      .select("*, vendors:wedding_vendors(*), cabinAssignments:wedding_cabin_assignments(*)")
      .eq("id", id)
      .eq("propertyId", propertyId)
      .single();

    if (error || !data) return null;
    return data as Wedding;
  },

  async createWedding(
    propertyId: string,
    payload: Omit<Wedding, "id" | "createdAt" | "updatedAt" | "vendors" | "cabinAssignments">
  ): Promise<string> {
    const { data, error } = await supabaseAdmin
      .from("weddings")
      .insert({ ...payload, propertyId })
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return data.id;
  },

  async updateWedding(
    id: string,
    payload: Partial<Omit<Wedding, "id" | "createdAt" | "updatedAt" | "vendors" | "cabinAssignments">>
  ): Promise<void> {
    const { error } = await supabaseAdmin
      .from("weddings")
      .update({ ...payload, updatedAt: new Date().toISOString() })
      .eq("id", id);

    if (error) throw new Error(error.message);
  },

  async deleteWedding(id: string): Promise<void> {
    const { error } = await supabaseAdmin.from("weddings").delete().eq("id", id);
    if (error) throw new Error(error.message);
  },

  // ── Vendors ──────────────────────────────────────────────────────────────────

  async upsertVendor(vendor: Omit<WeddingVendor, "id" | "createdAt"> & { id?: string }): Promise<void> {
    const { error } = await supabaseAdmin
      .from("wedding_vendors")
      .upsert(vendor, { onConflict: "id" });
    if (error) throw new Error(error.message);
  },

  async deleteVendor(id: string): Promise<void> {
    const { error } = await supabaseAdmin.from("wedding_vendors").delete().eq("id", id);
    if (error) throw new Error(error.message);
  },

  // ── Cabin assignments ─────────────────────────────────────────────────────────

  async upsertCabinAssignment(assignment: Omit<WeddingCabinAssignment, "id"> & { id?: string }): Promise<void> {
    const { error } = await supabaseAdmin
      .from("wedding_cabin_assignments")
      .upsert(assignment, { onConflict: "id" });
    if (error) throw new Error(error.message);
  },

  async deleteCabinAssignment(id: string): Promise<void> {
    const { error } = await supabaseAdmin.from("wedding_cabin_assignments").delete().eq("id", id);
    if (error) throw new Error(error.message);
  },
};
