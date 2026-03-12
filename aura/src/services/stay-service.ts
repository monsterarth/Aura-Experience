import { supabase } from "@/lib/supabase";
import { Stay, Guest, Cabin, FolioItem, AutomationTriggerEvent, MessageTemplate } from "@/types/aura";
import { v4 as uuidv4 } from 'uuid';
import { AuditService } from "./audit-service";
import { AutomationService } from "./automation-service";

export const StayService = {
  async triggerAutomation(propertyId: string, stayId: string, triggerEvent: AutomationTriggerEvent) {
    try {
      // 1. Verifica se a regra existe e está ativa
      const { data: rule } = await supabase
        .from('automation_rules')
        .select('*')
        .eq('propertyId', propertyId)
        .eq('triggerEvent', triggerEvent)
        .single();

      if (!rule || !rule.active) return;

      // 2. Busca o template da mensagem
      const { data: template } = await supabase
        .from('message_templates')
        .select('*')
        .eq('propertyId', propertyId)
        .eq('id', rule.templateId)
        .single();

      if (!template) return;

      // 3. Coleta os dados vitais
      const { data: stay } = await supabase.from('stays').select('*').eq('id', stayId).single();
      if (!stay) return;

      const { data: guest } = await supabase.from('guests').select('*').eq('id', stay.guestId).single();
      if (!guest || !guest.phone) return;

      let cabin = undefined;
      if (stay.cabinId) {
        const { data: c } = await supabase.from('cabins').select('*').eq('id', stay.cabinId).single();
        if (c) cabin = c;
      }

      // 4. Envia para a Fila de Processamento
      await AutomationService.queueMessage(
        propertyId,
        stayId,
        guest.phone,
        template as MessageTemplate,
        triggerEvent,
        guest as Guest,
        cabin as Cabin,
        stay as Stay,
        rule.delayMinutes || 0
      );
    } catch (error) {
      console.error(`Erro interno ao processar gatilho ${triggerEvent}:`, error);
    }
  },

  async generateUniqueAccessCode(propertyId: string): Promise<string> {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    let isUnique = false;

    while (!isUnique) {
      code = Array.from({ length: 8 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');

      const { data } = await supabase
        .from('stays')
        .select('id')
        .eq('propertyId', propertyId)
        .eq('accessCode', code);

      if (!data || data.length === 0) isUnique = true;
    }
    return code;
  },

  async findPropertyIdByStayId(stayId: string): Promise<string | null> {
    try {
      const { data } = await supabase
        .from('stays')
        .select('propertyId')
        .eq('id', stayId)
        .maybeSingle();

      return data?.propertyId || null;
    } catch (error) {
      console.error("Erro ao localizar propriedade da estadia:", error);
      return null;
    }
  },

  async checkCabinAvailability(cabinId: string, checkIn: string, checkOut: string): Promise<void> {
    const { data } = await supabase
      .from('stays')
      .select('id')
      .eq('cabinId', cabinId)
      .in('status', ['pending', 'pre_checkin_done', 'active'])
      .lt('checkIn', checkOut)
      .gt('checkOut', checkIn)
      .limit(1);

    if (data && data.length > 0) {
      throw new Error(`CABIN_OVERLAP:${cabinId}`);
    }
  },

  async createStayRecord(params: {
    propertyId: string;
    guestId: string;
    cabinConfigs: { cabinId: string, adults: number, children: number, babies: number }[];
    checkIn: Date;
    checkOut: Date;
    sendAutomations: boolean;
    actorId: string;
    actorName: string;
  }) {
    // Verify no overlapping stays before creating
    await Promise.all(
      params.cabinConfigs.map(config =>
        this.checkCabinAvailability(
          config.cabinId,
          params.checkIn.toISOString(),
          params.checkOut.toISOString()
        )
      )
    );

    const accessCode = await this.generateUniqueAccessCode(params.propertyId);
    const groupId = params.cabinConfigs.length > 1 ? `GRP-${uuidv4().slice(0, 8).toUpperCase()}` : null;

    const payloads = params.cabinConfigs.map(config => {
      const stayId = uuidv4();
      return {
        id: stayId,
        propertyId: params.propertyId,
        guestId: params.guestId,
        cabinId: config.cabinId,
        groupId,
        accessCode,
        checkIn: params.checkIn.toISOString(),
        checkOut: params.checkOut.toISOString(),
        counts: { adults: config.adults, children: config.children, babies: config.babies },
        status: 'pending',
        automationFlags: {
          send48h: params.sendAutomations,
          send24h: params.sendAutomations,
          preCheckinSent: false,
          remindersCount: 0
        }
      };
    });

    const { error } = await supabase.from('stays').insert(payloads);
    if (error) throw error;

    await AuditService.log({
      propertyId: params.propertyId,
      userId: params.actorId,
      userName: params.actorName,
      action: groupId ? "STAY_GROUP_CREATE" : "CREATE",
      entity: "STAY",
      entityId: groupId || "MULTIPLE",
      details: `Reserva criada para ${params.cabinConfigs.length} cabana(s). Código: ${accessCode}`
    });

    return { accessCode, groupId };
  },

  async getStayWithGuest(propertyId: string, stayId: string) {
    const { data: stay } = await supabase.from('stays').select('*').eq('id', stayId).eq('propertyId', propertyId).single();
    if (!stay) return null;

    const { data: guest } = await supabase.from('guests').select('*').eq('id', stay.guestId).eq('propertyId', propertyId).maybeSingle();

    return { stay: stay as Stay, guest: guest as Guest | null };
  },

  async completePreCheckin(propertyId: string, stayId: string, stayUpdate: Partial<Stay>, guestUpdate: Partial<Guest>): Promise<string> {
    // Busca id do guest e dados de grupo
    const { data: stay } = await supabase.from('stays').select('guestId, groupId, accessCode').eq('id', stayId).single();
    if (!stay) throw new Error("Stay not found");

    let finalAccessCode = stay.accessCode;

    // Se a reserva é de grupo, desmembra o código para dar um dashboard privado à cabana
    if (stay.groupId) {
      finalAccessCode = await this.generateUniqueAccessCode(propertyId);
      stayUpdate.accessCode = finalAccessCode;

      // Log audit
      await AuditService.log({
        propertyId,
        userId: stay.guestId,
        userName: "Guest",
        action: "UPDATE",
        entity: "STAY",
        entityId: stayId,
        details: `Código de acesso desmembrado do grupo. Novo código gerado: ${finalAccessCode}`
      });
    }

    // Supabase JS doesnt have explicit transactions, we do parallel awaited calls
    const [stayRes, guestRes] = await Promise.all([
      supabase.from('stays').update({ ...stayUpdate, status: 'pre_checkin_done', updatedAt: new Date().toISOString() }).eq('id', stayId),
      supabase.from('guests').update({ ...guestUpdate, updatedAt: new Date().toISOString() }).eq('id', stay.guestId)
    ]);

    if (stayRes.error) throw new Error(`Falha ao atualizar a estadia: ${stayRes.error.message}`);
    if (guestRes.error) throw new Error(`Falha ao atualizar os dados do hóspede: ${guestRes.error.message}`);

    return finalAccessCode;
  },

  async getStaysByAccessCode(accessCode: string) {
    const { data: stays, error } = await supabase
      .from('stays')
      .select('*')
      .eq('accessCode', accessCode.toUpperCase());

    if (error || !stays) return [];

    const enriched = await Promise.all(stays.map(async (stay: any) => {
      const { data: cabin } = await supabase.from('cabins').select('name, wifi').eq('id', stay.cabinId).maybeSingle();
      return {
        ...stay,
        cabinName: cabin ? cabin.name : "Acomodação",
        cabinWifi: cabin ? cabin.wifi : undefined
      };
    }));

    return enriched;
  },

  async getGroupStays(accessCode: string) {
    const { data: stays, error } = await supabase
      .from('stays')
      .select('*')
      .eq('accessCode', accessCode.toUpperCase())
      .in('status', ['pending', 'pre_checkin_done']);

    if (error || !stays) return [];

    const enriched = await Promise.all(stays.map(async (stay: any) => {
      const { data: cabin } = await supabase.from('cabins').select('name').eq('id', stay.cabinId).maybeSingle();
      return {
        ...stay,
        cabinName: cabin ? cabin.name : "Acomodação"
      };
    }));

    return enriched;
  },

  async getStayWithGuestAndCabin(propertyId: string, stayId: string) {
    const { data: stay } = await supabase.from('stays').select('*').eq('id', stayId).eq('propertyId', propertyId).single();
    if (!stay) return null;

    const [gRes, cRes] = await Promise.all([
      supabase.from('guests').select('*').eq('id', stay.guestId).eq('propertyId', propertyId).maybeSingle(),
      supabase.from('cabins').select('*').eq('id', stay.cabinId).eq('propertyId', propertyId).maybeSingle()
    ]);

    return {
      stay: stay as Stay,
      guest: gRes.data as Guest | null,
      cabin: cRes.data as Cabin | null
    };
  },

  async getStaysByStatus(propertyId: string, statusList: string[]) {
    try {
      const { data: stays, error } = await supabase
        .from('stays')
        .select('*')
        .eq('propertyId', propertyId)
        .in('status', statusList)
        .order('checkIn', { ascending: true });

      if (error || !stays) return [];

      const enriched = await Promise.all(stays.map(async (stay: any) => {
        const [gRes, cRes] = await Promise.all([
          supabase.from('guests').select('fullName').eq('id', stay.guestId).maybeSingle(),
          supabase.from('cabins').select('name').eq('id', stay.cabinId).maybeSingle()
        ]);

        return {
          ...stay,
          guestName: gRes.data ? gRes.data.fullName : "Hóspede desconhecido",
          cabinName: cRes.data ? cRes.data.name : "N/A"
        };
      }));

      return enriched as any[]; // casting since we mixed frontend extra fields
    } catch (error) {
      console.error("Erro ao listar estadias:", error);
      return [];
    }
  },

  async performCheckIn(propertyId: string, stayId: string, actorId: string, actorName: string) {
    // 1. Buscar dados da estadia
    const { data: stay } = await supabase
      .from('stays').select('cabinId, checkIn').eq('id', stayId).single();
    if (!stay) throw new Error('STAY_NOT_FOUND');

    // 2. Validar status da acomodação
    const { data: cabin } = await supabase
      .from('cabins').select('status').eq('id', stay.cabinId).single();
    if (!cabin || cabin.status !== 'available') {
      throw new Error(`CABIN_NOT_AVAILABLE:${cabin?.status ?? 'unknown'}`);
    }

    // 3. Montar update — substituir checkIn pela data real se diferente
    const now = new Date();
    const updates: Record<string, any> = {
      status: 'active',
      checkInActual: now.toISOString(),
    };
    const scheduledDay = new Date(stay.checkIn).toDateString();
    if (now.toDateString() !== scheduledDay) {
      updates.checkIn = now.toISOString();
    }

    // 4. Atualizar estadia e cabin em paralelo
    await Promise.all([
      supabase.from('stays').update(updates).eq('id', stayId).eq('propertyId', propertyId),
      supabase.from('cabins').update({ status: 'occupied', currentStayId: stayId }).eq('id', stay.cabinId),
    ]);

    await AuditService.log({
      propertyId,
      userId: actorId,
      userName: actorName,
      action: "CHECKIN",
      entity: "STAY",
      entityId: stayId,
      details: updates.checkIn
        ? `Check-in físico realizado. Data prevista substituída pelo check-in real.`
        : "Check-in físico realizado pela recepção."
    });

    await this.triggerAutomation(propertyId, stayId, 'welcome_checkin');
  },

  async performCheckOut(propertyId: string, stayId: string, actorId: string, actorName: string) {
    const { data: stay } = await supabase.from('stays').select('cabinId').eq('id', stayId).single();
    const cabinId = stay?.cabinId;
    if (!cabinId) throw new Error("Acomodação não encontrada na reserva.");

    // Update daily tasks to cancelled
    await supabase.from('housekeeping_tasks')
      .update({
        status: 'cancelled',
        observations: 'Cancelada automaticamente por Check-out (Substituída por Faxina de Troca).',
        updatedAt: new Date().toISOString()
      })
      .eq('propertyId', propertyId)
      .eq('cabinId', cabinId)
      .eq('type', 'daily')
      .eq('status', 'pending');

    // Finish stay
    await supabase.from('stays')
      .update({
        status: 'finished',
        checkOutActual: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
      .eq('id', stayId);

    // Free up cabin
    await supabase.from('cabins')
      .update({
        status: 'cleaning',
        currentStayId: null
      })
      .eq('id', cabinId);

    // Create turnover
    const newTaskId = uuidv4();
    await supabase.from('housekeeping_tasks').insert({
      id: newTaskId,
      propertyId,
      cabinId,
      stayId,
      type: 'turnover',
      status: 'pending',
      assignedTo: [],
      checklist: []
    });

    await AuditService.log({
      propertyId,
      userId: actorId,
      userName: actorName,
      action: "CHECKOUT",
      entity: "STAY",
      entityId: stayId,
      details: `Check-out realizado. Tarefa de Faxina de Troca gerada para a unidade ${cabinId}.`
    });

    await this.triggerAutomation(propertyId, stayId, 'checkout_thanks');
    await this.triggerAutomation(propertyId, stayId, 'nps_survey');

    return { success: true };
  },

  async undoCheckOut(propertyId: string, stayId: string, cabinId: string, actorId: string, actorName: string) {
    await supabase.from('housekeeping_tasks')
      .update({
        status: 'cancelled',
        observations: 'Check-out desfeito pela Recepção. Tarefa cancelada.',
        updatedAt: new Date().toISOString()
      })
      .eq('stayId', stayId)
      .eq('type', 'turnover')
      .in('status', ['pending', 'in_progress', 'waiting_conference']);

    await supabase.from('stays')
      .update({
        status: 'active',
        checkOutActual: null,
        updatedAt: new Date().toISOString()
      })
      .eq('id', stayId);

    await supabase.from('cabins')
      .update({
        status: 'occupied',
        currentStayId: stayId
      })
      .eq('id', cabinId);

    await AuditService.log({
      propertyId,
      userId: actorId,
      userName: actorName,
      action: "UPDATE",
      entity: "STAY",
      entityId: stayId,
      details: `Check-out revertido. Estadia reativada e tarefa de limpeza cancelada.`
    });
  },

  async cancelStay(propertyId: string, stayId: string, actorId: string, actorName: string) {
    await supabase.from('stays')
      .update({ status: 'cancelled', updatedAt: new Date().toISOString() })
      .eq('id', stayId);

    await AuditService.log({
      propertyId, userId: actorId, userName: actorName, action: "DELETE", entity: "STAY", entityId: stayId,
      details: "Reserva cancelada administrativamente."
    });
  },

  async updateStayData(propertyId: string, stayId: string, data: Partial<Stay>, actorId: string, actorName: string) {
    await supabase.from('stays').update({ ...data, updatedAt: new Date().toISOString() }).eq('id', stayId);

    await AuditService.log({
      propertyId, userId: actorId, userName: actorName, action: "UPDATE", entity: "STAY", entityId: stayId,
      details: "Ficha de hospedagem editada pela recepção.", newData: data
    });
  },

  // ==========================================
  // MÓDULO DE CONTA & CONSUMO (FOLIO) E HISTÓRICO
  // ==========================================

  async getStayFolio(propertyId: string, stayId: string): Promise<FolioItem[]> {
    const { data } = await supabase
      .from('folio_items')
      .select('*')
      .eq('propertyId', propertyId)
      .eq('stayId', stayId)
      .order('createdAt', { ascending: false });
    return (data || []) as FolioItem[];
  },

  async addFolioItemManual(propertyId: string, stayId: string, item: Omit<FolioItem, 'id' | 'createdAt' | 'status'>, actorId: string, actorName: string) {
    const itemId = uuidv4();
    await supabase.from('folio_items').insert({
      ...item,
      id: itemId,
      propertyId,
      stayId,
      status: 'pending'
    });

    await supabase.from('stays').update({ hasOpenFolio: true }).eq('id', stayId);

    await AuditService.log({
      propertyId, userId: actorId, userName: actorName, action: "UPDATE", entity: "STAY", entityId: stayId,
      details: `Lançou item na conta: ${item.quantity}x ${item.description}`
    });
  },

  async toggleFolioItemStatus(propertyId: string, stayId: string, itemId: string, newStatus: 'pending' | 'paid', actorId: string, actorName: string) {
    await supabase.from('folio_items').update({ status: newStatus }).eq('id', itemId);

    const { count } = await supabase.from('folio_items').select('*', { count: 'exact', head: true }).eq('stayId', stayId).eq('status', 'pending');
    await supabase.from('stays').update({ hasOpenFolio: (count || 0) > 0 }).eq('id', stayId);

    await AuditService.log({
      propertyId, userId: actorId, userName: actorName, action: "UPDATE", entity: "STAY", entityId: stayId,
      details: `Marcou o item da conta como ${newStatus === 'paid' ? 'Pago/Lançado' : 'Pendente'}.`
    });
  },

  async deleteFolioItem(propertyId: string, stayId: string, itemId: string, itemDescription: string, actorId: string, actorName: string) {
    await supabase.from('folio_items').delete().eq('id', itemId);

    const { count } = await supabase.from('folio_items').select('*', { count: 'exact', head: true }).eq('stayId', stayId).eq('status', 'pending');
    await supabase.from('stays').update({ hasOpenFolio: (count || 0) > 0 }).eq('id', stayId);

    await AuditService.log({
      propertyId, userId: actorId, userName: actorName, action: "DELETE", entity: "STAY", entityId: stayId,
      details: `Estornou o item da conta: ${itemDescription}`
    });
  },

  async archiveStay(propertyId: string, stayId: string, actorId: string, actorName: string) {
    await supabase.from('stays')
      .update({ status: 'archived', updatedAt: new Date().toISOString() })
      .eq('id', stayId);

    await AuditService.log({
      propertyId, userId: actorId, userName: actorName, action: "UPDATE", entity: "STAY", entityId: stayId,
      details: "Estadia arquivada."
    });
  }
};