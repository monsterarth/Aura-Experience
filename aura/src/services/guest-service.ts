import { db } from "@/lib/supabase";
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
      // Lista vazia e "sem permissão" davam a MESMA tela ("nenhum hóspede cadastrado"):
      // um 403 por cargo faltando na rota ficou invisível. Ao menos deixa rastro.
      if (!res.ok) {
        console.error(`[listGuests] ${res.status} ao buscar hóspedes`, await res.text().catch(() => ''));
        return [];
      }
      return res.json();
    } catch (e) {
      console.error('[listGuests] falha de rede', e);
      return [];
    }
  },

  /**
   * Histórico de estadias da ficha. No BROWSER vai pela rota (service-role): pelo client
   * a leitura depende da RLS de `stays`/`cabins` e voltava vazia — o histórico parecia
   * inexistente em vez de bloqueado.
   */
  async getGuestStays(propertyId: string, guestId: string): Promise<any[]> {
    if (typeof window === 'undefined') {
      return this.getGuestStaysDirect(propertyId, guestId);
    }

    const qs = new URLSearchParams({ propertyId, guestId });
    try {
      const res = await fetch(`/api/admin/guests/stays?${qs}`);
      if (!res.ok) {
        console.error(`[getGuestStays] ${res.status}`, await res.text().catch(() => ''));
        return [];
      }
      const json = await res.json();
      return json?.stays ?? [];
    } catch (e) {
      console.error('[getGuestStays] falha de rede', e);
      return [];
    }
  },

  /** Implementação real — só server-side (chamada pela rota). */
  async getGuestStaysDirect(propertyId: string, guestId: string): Promise<any[]> {
    const { data, error } = await db()
      .from('stays')
      .select('id, checkIn, checkOut, status, cabinId')
      .eq('propertyId', propertyId)
      .eq('guestId', guestId)
      .order('checkIn', { ascending: false });

    if (error) throw error;
    if (!data?.length) return [];

    // Uma query para todas as cabanas (antes era um SELECT por estadia).
    const cabinIds = Array.from(new Set(data.map((s: any) => s.cabinId).filter(Boolean)));
    const names = new Map<string, string>();
    if (cabinIds.length) {
      const { data: cabins } = await db().from('cabins').select('id, name').in('id', cabinIds);
      for (const c of cabins ?? []) names.set(c.id as string, c.name as string);
    }

    return data.map((stay: any) => ({ ...stay, cabinName: names.get(stay.cabinId) ?? 'N/A' }));
  },

  /**
   * Unifica dois cadastros. Operação destrutiva (apaga a ficha secundária) e escrita
   * cruzando duas tabelas — no browser vai pela rota, que roda com service-role e
   * carimba a autoria pela sessão.
   */
  async mergeGuests(
    propertyId: string,
    primaryId: string,
    secondaryId: string,
    actorId: string,
    actorName: string
  ): Promise<number> {
    if (typeof window === 'undefined') {
      return this.mergeGuestsDirect(propertyId, primaryId, secondaryId, actorId, actorName);
    }

    const res = await postFieldAction('/api/admin/guests/merge', { propertyId, primaryId, secondaryId });
    if (!res.ok) throw new Error(res.error || 'Falha ao unificar os cadastros.');
    return (res.data?.stayCount as number) ?? 0;
  },

  /** Implementação real — só server-side (chamada pela rota). */
  async mergeGuestsDirect(
    propertyId: string,
    primaryId: string,
    secondaryId: string,
    actorId: string,
    actorName: string
  ): Promise<number> {
    if (!primaryId || !secondaryId || primaryId === secondaryId) {
      throw new Error('Cadastros inválidos para unificação.');
    }

    // A ficha que fica precisa existir NESTA propriedade: sem isso, um id errado
    // transferiria as estadias para o vazio e ainda assim apagaria a secundária.
    const { data: primary } = await db()
      .from('guests').select('id, fullName').eq('id', primaryId).eq('propertyId', propertyId).maybeSingle();
    if (!primary) throw new Error('Cadastro principal não encontrado nesta propriedade.');

    // Nome da secundária antes do delete — depois não existe mais para consultar.
    const { data: secondary } = await db()
      .from('guests').select('fullName').eq('id', secondaryId).eq('propertyId', propertyId).maybeSingle();

    const { data: stays, error: staysErr } = await db()
      .from('stays')
      .select('id')
      .eq('propertyId', propertyId)
      .eq('guestId', secondaryId);
    if (staysErr) throw staysErr;

    const stayCount = stays?.length ?? 0;

    if (stayCount > 0) {
      const { error } = await db()
        .from('stays')
        .update({ guestId: primaryId })
        .eq('propertyId', propertyId)
        .eq('guestId', secondaryId);
      // Falha aqui NÃO pode seguir para o delete: apagaria a ficha deixando as
      // estadias órfãs apontando para um hóspede inexistente.
      if (error) throw error;
    }

    const { error: delErr } = await db()
      .from('guests')
      .delete()
      .eq('id', secondaryId)
      .eq('propertyId', propertyId);
    if (delErr) throw delErr;

    await AuditService.log({
      propertyId, userId: actorId, userName: actorName,
      action: "UPDATE", entity: "GUEST", entityId: primaryId,
      details: `Cadastros unificados: ${secondary?.fullName ?? secondaryId} → ${(primary as { fullName?: string }).fullName ?? primaryId}. ${stayCount} estadia(s) transferida(s).`
    });

    return stayCount;
  },
};