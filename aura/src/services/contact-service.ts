import { supabase } from "@/lib/supabase";
import { Contact, ContactContext, Stay, Cabin } from "@/types/aura";

function safeToDate(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  return new Date(val);
}

export class ContactService {
  static formatPhoneId(phone: string): string {
    return phone.replace(/\D/g, '');
  }

  static async upsertContact(propertyId: string, name: string, phone: string, isGuest: boolean = false, guestId?: string): Promise<string | null> {
    try {
      if (!phone) return null;
      const phoneId = this.formatPhoneId(phone);
      if (!phoneId) return null;

      const now = new Date().toISOString();

      // Tenta atualizar se já existe
      const { data: existing } = await supabase
        .from('contacts')
        .select('id')
        .eq('id', phoneId)
        .eq('propertyId', propertyId)
        .maybeSingle();

      if (existing) {
        // Atualiza: nome, isGuest
        const updatePayload: any = { name, isGuest, updatedAt: now };
        if (guestId) updatePayload.guestId = guestId;

        const { error } = await supabase
          .from('contacts')
          .update(updatePayload)
          .eq('id', phoneId)
          .eq('propertyId', propertyId);

        if (error) {
          // Se falhou por causa de guestId, tenta sem ele
          if (error.code === 'PGRST204' && guestId) {
            delete updatePayload.guestId;
            await supabase.from('contacts').update(updatePayload).eq('id', phoneId).eq('propertyId', propertyId);
          } else {
            console.error("[ContactService] Erro ao atualizar contato:", JSON.stringify(error));
          }
        }
      } else {
        // Cria novo — primeiro sem guestId para garantir criação
        const insertPayload: any = {
          id: phoneId,
          propertyId,
          name,
          phone: phoneId,
          isGuest,
          createdAt: now,
          updatedAt: now,
        };
        if (guestId) insertPayload.guestId = guestId;

        const { error } = await supabase.from('contacts').insert(insertPayload);

        if (error) {
          // Se falhou por causa de guestId, tenta sem ele
          if (error.code === 'PGRST204' && guestId) {
            delete insertPayload.guestId;
            const { error: retryError } = await supabase.from('contacts').insert(insertPayload);
            if (retryError) console.error("[ContactService] Erro ao inserir contato (retry):", JSON.stringify(retryError));
          } else {
            console.error("[ContactService] Erro ao inserir contato:", JSON.stringify(error));
          }
        }
      }

      return phoneId;
    } catch (error) {
      console.error("[ContactService] Erro ao sincronizar contato:", error);
      return null;
    }
  }

  static async updateContact(propertyId: string, phoneId: string, data: { name?: string; phone?: string; tags?: string[] }): Promise<boolean> {
    try {
      const { error } = await supabase.from('contacts')
        .update({ ...data, updatedAt: new Date().toISOString() })
        .eq('id', phoneId)
        .eq('propertyId', propertyId);
      return !error;
    } catch {
      return false;
    }
  }

  static async deleteContact(propertyId: string, phoneId: string): Promise<boolean> {
    try {
      const { error } = await supabase.from('contacts')
        .delete()
        .eq('id', phoneId)
        .eq('propertyId', propertyId);
      return !error;
    } catch {
      return false;
    }
  }

  static async listContacts(propertyId: string): Promise<Contact[]> {
    const { data } = await supabase.from('contacts')
      .select('*')
      .eq('propertyId', propertyId)
      .order('updatedAt', { ascending: false });
    return (data as Contact[]) || [];
  }

  static async resolveContactContext(propertyId: string, phoneId: string): Promise<ContactContext> {
    const defaultContext: ContactContext = { status: 'none', message: "Contato sem histórico de estadias." };

    try {
      const { data: contact } = await supabase.from('contacts').select('*').eq('id', phoneId).eq('propertyId', propertyId).maybeSingle();
      if (!contact) return defaultContext;

      if (!contact.isGuest || !contact.guestId) {
        return { status: 'none', message: "Contato avulso (Não é hóspede)." };
      }

      const { data: staysRaw } = await supabase
        .from('stays')
        .select('*')
        .eq('propertyId', propertyId)
        .eq('guestId', contact.guestId)
        .order('checkIn', { ascending: false })
        .limit(5);

      if (!staysRaw || staysRaw.length === 0) return { status: 'none', message: "Hóspede cadastrado, mas sem estadias no sistema." };

      const stays = staysRaw as Stay[];

      const activeStay = stays.find(s => ['active', 'in_house'].includes(s.status));
      const pendingStay = stays.find(s => ['pending', 'pre_checkin_done', 'reserved', 'confirmed'].includes(s.status));
      const pastStay = stays.find(s => ['finished', 'archived', 'checked_out'].includes(s.status));

      const relevantStay = activeStay || pendingStay || pastStay;
      if (!relevantStay) return defaultContext;

      let cabinName = "Acomodação";
      const mainCabinId = relevantStay.cabinConfigs?.[0]?.cabinId || relevantStay.cabinId;

      if (mainCabinId) {
        const { data: cabin } = await supabase.from('cabins').select('name').eq('id', mainCabinId).eq('propertyId', propertyId).maybeSingle();
        if (cabin) cabinName = cabin.name;
      }

      const checkInDate = safeToDate(relevantStay.checkIn);
      const checkOutDate = safeToDate(relevantStay.checkOut);

      if (activeStay) {
        return {
          status: 'active',
          stayId: activeStay.id,
          cabinName,
          checkIn: checkInDate || undefined,
          checkOut: checkOutDate || undefined,
          message: `🟢 Hospedado agora em: ${cabinName}`
        };
      }

      if (pendingStay) {
        const checkInStr = checkInDate ? checkInDate.toLocaleDateString('pt-BR') : 'Breve';
        const isToday = checkInDate && checkInDate.toDateString() === new Date().toDateString();

        return {
          status: 'pending',
          stayId: pendingStay.id,
          cabinName,
          checkIn: checkInDate || undefined,
          checkOut: checkOutDate || undefined,
          message: isToday ? `🟡 Chega HOJE em: ${cabinName}` : `🟡 Chega dia ${checkInStr} em: ${cabinName}`
        };
      }

      if (pastStay) {
        const checkOutStr = checkOutDate ? checkOutDate.toLocaleDateString('pt-BR') : 'Data Indisponível';
        return {
          status: 'past',
          stayId: pastStay.id,
          cabinName,
          checkIn: checkInDate || undefined,
          checkOut: checkOutDate || undefined,
          message: `⚪️ Última estadia encerrou em ${checkOutStr} (${cabinName})`
        };
      }

      return defaultContext;
    } catch (error) {
      console.error("Erro ao resolver contexto do contato:", error);
      return defaultContext;
    }
  }
}