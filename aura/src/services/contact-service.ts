import { supabase } from "@/lib/supabase";
import { Contact, Stay, Cabin } from "@/types/aura";
import { AuditService } from "./audit-service";

function safeToDate(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  return new Date(val);
}

export class ContactService {
  static formatPhoneId(phone: string): string {
    return phone.replace(/\D/g, '');
  }

  static async upsertContact(propertyId: string, name: string, phone: string, isGuest: boolean = false, guestId?: string, actorId?: string, actorName?: string): Promise<string | null> {
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

      await AuditService.log({
        propertyId,
        userId: actorId ?? guestId ?? phoneId,
        userName: actorName ?? normalizedName ?? phoneId,
        action: "CONTACT_UPDATED",
        entity: "CONTACT",
        entityId: phoneId,
        details: existing
          ? `Contato ${normalizedName ?? phoneId} atualizado.`
          : `Contato ${normalizedName ?? phoneId} criado.`
      });

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

      await AuditService.log({
        propertyId,
        userId: guestId ?? newId,
        userName: name,
        action: "CONTACT_PHONE_MIGRATED",
        entity: "CONTACT",
        entityId: newId,
        details: `Telefone migrado de ${oldPhone} para ${newPhone}.`
      });

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

      if (!error) {
        await AuditService.log({
          propertyId,
          userId: phoneId,
          userName: data.name ?? phoneId,
          action: "CONTACT_UPDATED",
          entity: "CONTACT",
          entityId: phoneId,
          details: `Dados do contato ${data.name ?? phoneId} atualizados manualmente.`,
          newData: data
        });
      }

      return !error;
    } catch {
      return false;
    }
  }

  static async deleteContact(propertyId: string, phoneId: string): Promise<boolean> {
    try {
      const { data: contact } = await supabase.from('contacts')
        .select('name')
        .eq('id', phoneId)
        .maybeSingle();

      const { error } = await supabase.from('contacts')
        .delete()
        .eq('id', phoneId)
        .eq('propertyId', propertyId);

      if (!error) {
        await AuditService.log({
          propertyId,
          userId: phoneId,
          userName: contact?.name ?? phoneId,
          action: "CONTACT_DELETED",
          entity: "CONTACT",
          entityId: phoneId,
          details: `Contato ${contact?.name ?? phoneId} excluído.`
        });
      }

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

}