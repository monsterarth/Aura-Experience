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

  /**
   * Marca como 'completed' os casamentos CONFIRMADOS cuja data já passou.
   *
   * Só mexe em 'confirmed': um 'tentative' que passou é negociação perdida, não
   * casamento realizado — vira receita fantasma no total se for promovido.
   * 'cancelled' e 'completed' ficam como estão.
   */
  async completePastWeddings(propertyId?: string): Promise<{ updated: number; couples: string[] }> {
    // Data local da pousada: às 21h em BRT o UTC já virou e anteciparia um dia.
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

    let query = supabaseAdmin
      .from("weddings")
      .select("id, bride, groom, weddingDate")
      .eq("status", "confirmed")
      .lt("weddingDate", today);
    if (propertyId) query = query.eq("propertyId", propertyId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as { id: string; bride: string; groom: string; weddingDate: string }[];
    if (rows.length === 0) return { updated: 0, couples: [] };

    const { error: upErr } = await supabaseAdmin
      .from("weddings")
      .update({ status: "completed", updatedAt: new Date().toISOString() })
      .in("id", rows.map((r) => r.id));
    if (upErr) throw new Error(upErr.message);

    return { updated: rows.length, couples: rows.map((r) => `${r.bride} & ${r.groom}`) };
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
