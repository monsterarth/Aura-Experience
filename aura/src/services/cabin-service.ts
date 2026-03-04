import { supabase } from "@/lib/supabase";
import { Cabin } from "@/types/aura";

// Funções para conversão entre o banco real e a interface
function deserializeCabin(row: any): Cabin {
  return {
    ...row,
    createdAt: row.createdAt ? { seconds: new Date(row.createdAt).getTime() / 1000 } : undefined,
    updatedAt: row.updatedAt ? { seconds: new Date(row.updatedAt).getTime() / 1000 } : undefined,
  } as Cabin;
}

export const CabinService = {
  async getCabinsByProperty(propertyId: string): Promise<Cabin[]> {
    const { data, error } = await supabase
      .from('cabins')
      .select('*')
      .eq('propertyId', propertyId)
      .order('number', { ascending: true });

    if (error) {
      console.error("Error fetching cabins from Supabase:", error);
      throw error;
    }

    return (data || []).map(deserializeCabin);
  },

  async saveCabin(propertyId: string, cabin: Partial<Cabin>) {
    // Generate an ID if it's a new cabin (since we're dropping Firestore's auto-gen)
    const id = cabin.id || crypto.randomUUID();

    // Força a regra do nome: "Número - Categoria"
    const finalName = `${cabin.number} - ${cabin.category}`;

    const payload = {
      ...cabin,
      id,
      name: finalName,
      propertyId,
      updatedAt: new Date().toISOString()
    };

    // Removemos os timestamps do js pra n causar conflito 
    // com as timestamps the fato do banco
    if (!cabin.id) {
      (payload as any).createdAt = new Date().toISOString();
    } else {
      delete (payload as any).createdAt;
    }

    const { error } = await supabase
      .from('cabins')
      .upsert(payload, { onConflict: 'id' });

    if (error) {
      console.error("Error saving cabin to Supabase:", error);
      throw error;
    }

    return id;
  },

  async deleteCabin(propertyId: string, cabinId: string) {
    const { error } = await supabase
      .from('cabins')
      .delete()
      .eq('id', cabinId)
      .eq('propertyId', propertyId); // segurança extra se n houver bypass de RLS

    if (error) {
      console.error("Error deleting cabin from Supabase:", error);
      throw error;
    }
  }
};