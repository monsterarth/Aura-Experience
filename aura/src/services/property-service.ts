import { supabase } from "@/lib/supabase";
import { Property } from "@/types/aura";
import { AuditService } from "./audit-service";

export const PropertyService = {
  async createProperty(propertyData: Omit<Property, "id" | "createdAt">, actorId: string, actorName: string) {
    try {
      const propertyId = propertyData.slug;

      const payload = {
        ...propertyData,
        id: propertyId,
      };

      const { error } = await supabase
        .from('properties')
        .insert(payload);

      if (error) throw error;

      await AuditService.log({
        propertyId: "SYSTEM",
        userId: actorId,
        userName: actorName,
        action: "CREATE",
        entity: "PROPERTY" as any,
        entityId: propertyId,
        newData: payload,
        details: `Propriedade ${propertyData.name} registrada na plataforma.`
      });

      return { success: true, id: propertyId };
    } catch (error: any) {
      console.error("[PropertyService] Erro ao criar propriedade:", error);
      throw error;
    }
  },

  async getPropertyById(id: string): Promise<Property | null> {
    try {
      const { data, error } = await supabase
        .from('properties')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) return null;
      return data as Property;
    } catch (error) {
      console.error("[PropertyService] Erro ao buscar propriedade por ID:", error);
      return null;
    }
  },

  async getAllProperties(): Promise<Property[]> {
    try {
      const { data, error } = await supabase
        .from('properties')
        .select('*')
        .order('createdAt', { ascending: false });

      if (error) throw error;
      return data as Property[];
    } catch (error) {
      console.error("[PropertyService] Erro listando properties:", error);
      return [];
    }
  },

  // updateProperty / updateSettings foram REMOVIDOS.
  //
  // Os dois escreviam `properties` direto pelo navegador reescrevendo o objeto
  // `settings` inteiro — um save sobrescrevia o do outro — e o updateProperty ainda
  // engolia o erro (`console.error` sem throw), o que produzia "salvo com sucesso"
  // em cima de uma gravação que não aconteceu.
  //
  // Escrita agora é só por `PropertySettingsClient.patch` (cliente) ou
  // `mergePropertySettings` (servidor), ambos em torno do RPC merge_property_settings.
};