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

      const normalizedName = name?.trim().toUpperCase() ?? name;
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
        const updatePayload: any = { name: normalizedName, isGuest, updatedAt: now };
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
          name: normalizedName,
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

  /**
   * Migrates all messages and communications from an old phone to a new phone.
   * Called when a guest's phone number is corrected.
   */
  static async migrateContactPhone(propertyId: string, oldPhone: string, newPhone: string, name: string, guestId?: string): Promise<boolean> {
    try {
      const oldId = this.formatPhoneId(oldPhone);
      const newId = this.formatPhoneId(newPhone);
      if (!oldId || !newId || oldId === newId) return false;

      // 1. Update all messages from old contactId to new
      await supabase.from('messages')
        .update({ contactId: newId, to: newId })
        .eq('contactId', oldId)
        .eq('propertyId', propertyId)
        .eq('direction', 'outbound');

      await supabase.from('messages')
        .update({ contactId: newId })
        .eq('contactId', oldId)
        .eq('propertyId', propertyId)
        .eq('direction', 'inbound');

      // 2. Check if new communication record already exists
      const { data: newComm } = await supabase.from('communications')
        .select('id').eq('id', newId).eq('propertyId', propertyId).maybeSingle();

      if (!newComm) {
        // Move old communication record: delete old, insert new
        const { data: oldComm } = await supabase.from('communications')
          .select('*').eq('id', oldId).eq('propertyId', propertyId).maybeSingle();

        if (oldComm) {
          await supabase.from('communications').insert({
            ...oldComm,
            id: newId,
            updatedAt: new Date().toISOString()
          });
          await supabase.from('communications').delete().eq('id', oldId).eq('propertyId', propertyId);
        }
      } else {
        // New already exists, just delete old
        await supabase.from('communications').delete().eq('id', oldId).eq('propertyId', propertyId);
      }

      // 3. Create new contact, remove old
      await this.upsertContact(propertyId, name, newPhone, true, guestId);
      await supabase.from('contacts').delete().eq('id', oldId).eq('propertyId', propertyId);

      return true;
    } catch (error) {
      console.error("[ContactService] Erro ao migrar telefone:", error);
      return false;
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

  static async findByPhone(propertyId: string, phone: string): Promise<Contact | null> {
    const phoneId = this.formatPhoneId(phone);
    if (!phoneId) return null;
    const { data } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', phoneId)
      .eq('propertyId', propertyId)
      .maybeSingle();
    return (data as Contact) || null;
  }

  static async listContacts(propertyId: string): Promise<Contact[]> {
    try {
      const res = await fetch(`/api/admin/contacts?propertyId=${encodeURIComponent(propertyId)}`);
      if (!res.ok) return [];
      return res.json();
    } catch {
      return [];
    }
  }

  static async resolveContactContext(propertyId: string, phoneId: string): Promise<ContactContext> {
    const defaultContext: ContactContext = { status: 'none', message: "Contato sem histórico de estadias." };

    try {
      const { data: contact } = await supabase.from('contacts').select('*').eq('id', phoneId).eq('propertyId', propertyId).maybeSingle();
      if (!contact) return defaultContext;

      if (!contact.isGuest) {
        return { status: 'none', message: "Contato avulso (Não é hóspede)." };
      }

      // Collect all guests linked to this phone:
      // 1. Guests whose phone was stored as digits (the standard path via stays/new)
      const { data: guestsByPhone } = await supabase
        .from('guests')
        .select('id, fullName')
        .eq('propertyId', propertyId)
        .eq('phone', phoneId);

      const guestMap = new Map<string, string>(); // id → fullName
      for (const g of guestsByPhone ?? []) guestMap.set(g.id, g.fullName);

      // 2. Always include the contact's primary guestId as a fallback
      if (contact.guestId && !guestMap.has(contact.guestId)) {
        const { data: primary } = await supabase.from('guests').select('id, fullName').eq('id', contact.guestId).eq('propertyId', propertyId).maybeSingle();
        if (primary) guestMap.set(primary.id, primary.fullName);
      }

      if (guestMap.size === 0) return defaultContext;

      // Build one ContactContext per guest (using their most relevant stay)
      const STATUS_PRIORITY: Record<string, number> = { active: 0, pending: 1, past: 2, none: 3 };

      const buildGuestContext = async (guestId: string, guestName: string): Promise<ContactContext | null> => {
        const { data: staysRaw } = await supabase
          .from('stays')
          .select('*')
          .eq('propertyId', propertyId)
          .eq('guestId', guestId)
          .order('checkIn', { ascending: false })
          .limit(5);

        if (!staysRaw?.length) return null;
        const stays = staysRaw as Stay[];

        const activeStay  = stays.find(s => ['active', 'in_house'].includes(s.status));
        const pendingStay = stays.find(s => ['pending', 'pre_checkin_done', 'reserved', 'confirmed'].includes(s.status));
        const pastStay    = stays.find(s => ['finished', 'archived', 'checked_out'].includes(s.status));
        const relevantStay = activeStay || pendingStay || pastStay;
        if (!relevantStay) return null;

        let cabinName = "Acomodação";
        const mainCabinId = relevantStay.cabinConfigs?.[0]?.cabinId || relevantStay.cabinId;
        if (mainCabinId) {
          const { data: cabin } = await supabase.from('cabins').select('name').eq('id', mainCabinId).eq('propertyId', propertyId).maybeSingle();
          if (cabin) cabinName = cabin.name;
        }

        const checkInDate  = safeToDate(relevantStay.checkIn);
        const checkOutDate = safeToDate(relevantStay.checkOut);

        if (activeStay) {
          return { status: 'active', stayId: activeStay.id, guestName, cabinName, checkIn: checkInDate ?? undefined, checkOut: checkOutDate ?? undefined, message: `🟢 ${guestName} — ${cabinName}` };
        }
        if (pendingStay) {
          const checkInStr = checkInDate ? checkInDate.toLocaleDateString('pt-BR') : 'Breve';
          const isToday = checkInDate && checkInDate.toDateString() === new Date().toDateString();
          return { status: 'pending', stayId: pendingStay.id, guestName, cabinName, checkIn: checkInDate ?? undefined, checkOut: checkOutDate ?? undefined, message: isToday ? `🟡 ${guestName} — Chega HOJE em ${cabinName}` : `🟡 ${guestName} — Chega dia ${checkInStr} em ${cabinName}` };
        }
        // past
        const checkOutStr = checkOutDate ? checkOutDate.toLocaleDateString('pt-BR') : 'Data Indisponível';
        return { status: 'past', stayId: pastStay!.id, guestName, cabinName, checkIn: checkInDate ?? undefined, checkOut: checkOutDate ?? undefined, message: `⚪️ ${guestName} — Saiu em ${checkOutStr} (${cabinName})` };
      };

      const settled = await Promise.all(
        Array.from(guestMap.entries()).map(([id, name]) => buildGuestContext(id, name))
      );
      const allContexts = settled.filter((c): c is ContactContext => c !== null)
        .sort((a, b) => (STATUS_PRIORITY[a.status] ?? 3) - (STATUS_PRIORITY[b.status] ?? 3));

      if (allContexts.length === 0) return defaultContext;

      // Primary = highest priority context
      const primary = allContexts[0];
      return { ...primary, allContexts };

    } catch (error) {
      console.error("Erro ao resolver contexto do contato:", error);
      return defaultContext;
    }
  }
}