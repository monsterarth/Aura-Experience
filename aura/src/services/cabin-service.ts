import { supabase } from "@/lib/supabase";
import { Cabin } from "@/types/aura";
import { AuditService } from "./audit-service";

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

    await AuditService.log({
      propertyId,
      userId: "SYSTEM",
      userName: "Admin",
      action: cabin.id ? "CABIN_UPDATED" : "CABIN_CREATED",
      entity: "CABIN",
      entityId: id,
      details: cabin.id
        ? `Cabana ${finalName} (${id}) atualizada.`
        : `Cabana ${finalName} (${id}) criada.`
    });

    return id;
  },

  async deleteCabin(propertyId: string, cabinId: string) {
    const { data: cabin } = await supabase
      .from('cabins')
      .select('name')
      .eq('id', cabinId)
      .maybeSingle();

    const { error } = await supabase
      .from('cabins')
      .delete()
      .eq('id', cabinId)
      .eq('propertyId', propertyId);

    if (error) {
      console.error("Error deleting cabin from Supabase:", error);
      throw error;
    }

    await AuditService.log({
      propertyId,
      userId: "SYSTEM",
      userName: "Admin",
      action: "CABIN_DELETED",
      entity: "CABIN",
      entityId: cabinId,
      details: `Cabana ${cabin?.name ?? cabinId} excluída.`
    });
  },

  async saveCabinsBatch(propertyId: string, baseCabin: Partial<Cabin>, numbers: string[]) {
    const payloads = numbers.map(num => {
      const id = crypto.randomUUID();
      const finalName = `${num} - ${baseCabin.category}`;
      return {
        ...baseCabin,
        id,
        number: num,
        name: finalName,
        propertyId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    });

    const { error } = await supabase
      .from('cabins')
      .insert(payloads);

    if (error) {
      console.error("Error saving cabins batch to Supabase:", error);
      throw error;
    }

    await AuditService.log({
      propertyId,
      userId: "SYSTEM",
      userName: "Admin",
      action: "CABIN_CREATED",
      entity: "CABIN",
      entityId: propertyId,
      details: `${payloads.length} cabana(s) criada(s) em lote: ${numbers.join(', ')}.`
    });

    return payloads.map(p => p.id);
  }
};