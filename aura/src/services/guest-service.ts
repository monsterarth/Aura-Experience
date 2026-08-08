import { supabase, db } from "@/lib/supabase";
import { Guest } from "@/types/aura";
import { postFieldAction } from "@/lib/field-api";
import { AuditService } from "./audit-service";

export const GuestService = {
  normalizeDocument(docStr: string): string {
    return docStr.toUpperCase().replace(/[^A-Z0-9]/g, "");
  },

  async findByDocument(propertyId: string, docNumber: string): Promise<Guest | null> {
    const id = this.normalizeDocument(docNumber);
    if (!id) return null;

    const { data, error } = await db()
      .from('guests')
      .select('*')
      .eq('id', id)
      .eq('propertyId', propertyId)
      .single();

    if (error || !data) return null;
    return data as Guest;
  },

  /**
   * Hóspedes com este telefone — sugestão de vínculo no CRM. Casa pelo SUFIXO
   * (últimos 8 dígitos): o banco guarda só dígitos, mas com/sem DDI conforme a
   * época do cadastro (5531 9xxxx vs 31 9xxxx).
   */
  async findByPhone(propertyId: string, phone: string): Promise<Guest[]> {
    const digits = (phone || '').replace(/\D/g, '');
    if (digits.length < 8) return [];

    const { data } = await db()
      .from('guests')
      .select('*')
      .eq('propertyId', propertyId)
      .like('phone', `%${digits.slice(-8)}`)
      .limit(5);
    return (data || []) as Guest[];
  },

  /**
   * Grava/atualiza a ficha do hóspede.
   *
   * No BROWSER delega para /api/admin/guests/upsert. Escrever direto pelo client do browser
   * passa pelo lock de auth e, no lock frio, a promise nunca resolve — é o mesmo travamento do
   * spinner de CPF, só que no "Confirmar Reserva", com a reserva já meio criada. No SERVIDOR
   * (a própria rota) roda `upsertGuestDirect` com service-role.
   */
  async upsertGuest(propertyId: string, guestData: Omit<Guest, "updatedAt">, actorId?: string, actorName?: string): Promise<string> {
    if (typeof window === 'undefined') {
      return this.upsertGuestDirect(propertyId, guestData, actorId, actorName);
    }

    const res = await postFieldAction('/api/admin/guests/upsert', { propertyId, guestData });
    if (!res.ok || !res.data?.id) {
      throw new Error(res.error || "Falha ao salvar a ficha do hóspede. Tente novamente.");
    }
    return res.data.id as string;
  },

  /** Implementação real — só server-side (chamada pela rota). */
  async upsertGuestDirect(propertyId: string, guestData: Omit<Guest, "updatedAt">, actorId?: string, actorName?: string): Promise<string> {
    const id = this.normalizeDocument(guestData.id);

    const payload = {
      ...guestData,
      id,
      propertyId,
      fullName: guestData.fullName?.trim().toUpperCase() ?? guestData.fullName,
      // Armazena telefone sempre como só dígitos (sem +, espaços ou traços)
      phone: guestData.phone ? guestData.phone.replace(/\D/g, '') : guestData.phone,
      updatedAt: new Date().toISOString()
    };

    const { data: existing } = await db()
      .from('guests')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    const { error } = await db()
      .from('guests')
      .upsert(payload, { onConflict: 'id' });

    if (error) {
      console.error("Error upserting guest:", error);
      throw error;
    }

    await AuditService.log({
      propertyId,
      userId: actorId || id,
      userName: actorName || payload.fullName || id,
      action: existing ? "UPDATE" : "CREATE",
      entity: "GUEST",
      entityId: id,
      details: existing
        ? `Ficha do hóspede ${payload.fullName ?? id} atualizada.`
        : `Hóspede ${payload.fullName ?? id} criado.`
    });

    return id;
  },

  async listGuests(propertyId: string, search?: string): Promise<Guest[]> {
    const params = new URLSearchParams({ propertyId });
    if (search?.trim()) params.set('search', search.trim());
    try {
      const res = await fetch(`/api/admin/guests?${params}`);
      if (!res.ok) return [];
      return res.json();
    } catch {
      return [];
    }
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