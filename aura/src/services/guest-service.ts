import { supabase } from "@/lib/supabase";
import { Guest } from "@/types/aura";

export const GuestService = {
  normalizeDocument(docStr: string): string {
    return docStr.toUpperCase().replace(/[^A-Z0-9]/g, "");
  },

  async findByDocument(propertyId: string, docNumber: string): Promise<Guest | null> {
    const id = this.normalizeDocument(docNumber);

    // Na nova modelagem o GUEST não usa ID aleatório, nós setamos o id = document normalizado para bater com Firebase
    const { data, error } = await supabase
      .from('guests')
      .select('*')
      .eq('id', id)
      .eq('propertyId', propertyId)
      .single();

    if (error || !data) return null;
    return data as Guest;
  },

  async upsertGuest(propertyId: string, guestData: Omit<Guest, "updatedAt">) {
    const id = this.normalizeDocument(guestData.id);

    const payload = {
      ...guestData,
      id,
      propertyId,
      updatedAt: new Date().toISOString()
    };

    const { error } = await supabase
      .from('guests')
      .upsert(payload, { onConflict: 'id' });

    if (error) {
      console.error("Error upserting guest:", error);
      throw error;
    }

    return id;
  }
};