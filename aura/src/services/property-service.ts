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

  async updateProperty(propertyId: string, updates: Partial<Property>) {
    const { error } = await supabase
      .from('properties')
      .update(updates)
      .eq('id', propertyId);

    if (error) console.error("Error updating property:", error);
  },

  async updateSettings(propertyId: string, updates: Partial<Property>, actorId: string, actorName: string) {
    const { error } = await supabase
      .from('properties')
      .update(updates)
      .eq('id', propertyId);

    if (error) throw error;

    await AuditService.log({
      propertyId: "SYSTEM",
      userId: actorId,
      userName: actorName,
      action: "UPDATE",
      entity: "PROPERTY" as any,
      entityId: propertyId,
      newData: updates,
      details: `Configurações da propriedade ${propertyId} atualizadas.`
    });
  }
};