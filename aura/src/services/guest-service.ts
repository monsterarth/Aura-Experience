import { supabase } from "@/lib/supabase";
import { Guest } from "@/types/aura";
import { AuditService } from "./audit-service";

export const GuestService = {
  normalizeDocument(docStr: string): string {
    return docStr.toUpperCase().replace(/[^A-Z0-9]/g, "");
  },

  async findByDocument(propertyId: string, docNumber: string): Promise<Guest | null> {
    const id = this.normalizeDocument(docNumber);

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
  },

  async listGuests(propertyId: string, search?: string): Promise<Guest[]> {
    let query = supabase
      .from('guests')
      .select('*')
      .eq('propertyId', propertyId)
      .order('fullName', { ascending: true });

    if (search?.trim()) {
      const term = search.trim();
      query = query.or(
        `fullName.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%,id.ilike.%${term}%`
      );
    }

    const { data } = await query.limit(100);
    return (data || []) as Guest[];
  },

  async getGuestStays(propertyId: string, guestId: string): Promise<any[]> {
    const { data } = await supabase
      .from('stays')
      .select('id, checkIn, checkOut, status, cabinId')
      .eq('propertyId', propertyId)
      .eq('guestId', guestId)
      .order('checkIn', { ascending: false });

    if (!data?.length) return [];

    return Promise.all(data.map(async (stay: any) => {
      const { data: cabin } = await supabase
        .from('cabins').select('name').eq('id', stay.cabinId).maybeSingle();
      return { ...stay, cabinName: cabin?.name ?? 'N/A' };
    }));
  },

  async mergeGuests(
    propertyId: string,
    primaryId: string,
    secondaryId: string,
    actorId: string,
    actorName: string
  ): Promise<number> {
    const { data: stays } = await supabase
      .from('stays')
      .select('id')
      .eq('propertyId', propertyId)
      .eq('guestId', secondaryId);

    const stayCount = stays?.length ?? 0;

    if (stayCount > 0) {
      await supabase
        .from('stays')
        .update({ guestId: primaryId })
        .eq('propertyId', propertyId)
        .eq('guestId', secondaryId);
    }

    await supabase
      .from('guests')
      .delete()
      .eq('id', secondaryId)
      .eq('propertyId', propertyId);

    await AuditService.log({
      propertyId, userId: actorId, userName: actorName,
      action: "UPDATE", entity: "GUEST", entityId: primaryId,
      details: `Cadastros unificados: ${secondaryId} → ${primaryId}. ${stayCount} estadia(s) transferida(s).`
    });

    return stayCount;
  },
};