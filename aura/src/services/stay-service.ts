// db() (de @/lib/supabase): service-role no servidor (rotas de campo) — o lançamento no
// fólio pendurava no lock frio quando rodava pelo client do browser. Escopo atual: apenas
// addFolioItemManual (chamado pelo launchFrigobar do concierge e pela conferência) usa db().
import { supabase, db } from "@/lib/supabase";
import { Stay, Guest, Cabin, FolioItem, AutomationTriggerEvent, MessageTemplate } from "@/types/aura";
import { v4 as uuidv4 } from 'uuid';
import { AuditService } from "./audit-service";
import { AutomationService } from "./automation-service";
import { GuestService } from "./guest-service";
import { HousekeepingService } from "./housekeeping-service";
import { applyTimeToDate, DEFAULT_CHECK_IN_TIME, DEFAULT_CHECK_OUT_TIME } from "@/lib/stay-times";
import { assertFolioOpen } from "@/lib/folio-guard";
import { DEFAULT_PET_BLACKOUT, touchesBlackout, type PetBlackoutWindow } from "@/lib/pets";

export const StayService = {
  async triggerAutomation(
    propertyId: string,
    stayId: string,
    triggerEvent: AutomationTriggerEvent
  ): Promise<{ queued: boolean; reason?: string }> {
    try {
      const { data: rule } = await supabase
        .from('automation_rules')
        .select('*')
        .eq('propertyId', propertyId)
        .eq('triggerEvent', triggerEvent)
        .single();

      if (!rule || !rule.active) return { queued: false, reason: 'rule_inactive' };

      const { data: template } = await supabase
        .from('message_templates')
        .select('*')
        .eq('propertyId', propertyId)
        .eq('id', rule.templateId)
        .single();

      if (!template) return { queued: false, reason: 'template_missing' };

      const { data: stay } = await supabase.from('stays').select('*').eq('id', stayId).single();
      if (!stay) return { queued: false, reason: 'stay_not_found' };

      const { data: guest } = await supabase.from('guests').select('*').eq('id', stay.guestId).eq('propertyId', propertyId).single();
      if (!guest || !guest.phone) return { queued: false, reason: 'guest_no_phone' };

      let cabin = undefined;
      if (stay.cabinId) {
        const { data: c } = await supabase.from('cabins').select('*').eq('id', stay.cabinId).single();
        if (c) cabin = c;
      }

      const result = await AutomationService.queueMessage(
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

      return result.success ? { queued: true } : { queued: false, reason: 'queue_error' };
    } catch (error) {
      console.error(`Erro interno ao processar gatilho ${triggerEvent}:`, error);
      return { queued: false, reason: 'exception' };
    }
  },

  async generateUniqueAccessCode(propertyId: string): Promise<string> {
    // 32 chars → divide 2^32 exatamente, então o módulo NÃO enviesa a distribuição.
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    let isUnique = false;

    while (!isUnique) {
      // crypto.getRandomValues (Web Crypto, global no Node 18+) no lugar de
      // Math.random(): o código de acesso é credencial do portal do hóspede, não
      // pode sair de um PRNG previsível.
      const buf = new Uint32Array(8);
      crypto.getRandomValues(buf);
      code = Array.from(buf, (n) => chars.charAt(n % chars.length)).join('');

      const { data } = await db()
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
      const { data } = await db()
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
    // Normalize to date-only strings to avoid timezone-induced false overlaps.
    // Checkout day == next checkin day is valid (12h out, 15h in).
    const checkInDate = checkIn.slice(0, 10);
    const checkOutDate = checkOut.slice(0, 10);

    // Prefiltro de janela no SERVIDOR: sem ele, o limit devolvia as 50 primeiras
    // estadias em ordem arbitrária e uma cabana com histórico grande podia passar
    // como "livre" (falso negativo de conflito). O filtro exato (date-only,
    // checkout==checkin permitido) continua sendo o some() abaixo.
    const { data } = await supabase
      .from('stays')
      .select('id, checkIn, checkOut')
      .eq('cabinId', cabinId)
      .in('status', ['pending', 'pre_checkin_done', 'active'])
      .lt('checkIn', `${checkOutDate}T23:59:59.999Z`)
      .gt('checkOut', checkInDate)
      .limit(200);

    const conflict = (data ?? []).some((stay: { checkIn: string; checkOut: string }) => {
      const existIn = stay.checkIn.slice(0, 10);
      const existOut = stay.checkOut.slice(0, 10);
      // Overlap exists only when date ranges strictly interleave (same-day checkout/checkin is allowed)
      return existIn < checkOutDate && existOut > checkInDate;
    });

    if (conflict) {
      throw new Error(`CABIN_OVERLAP:${cabinId}`);
    }
  },

  async createStayRecord(params: {
    propertyId: string;
    guestId: string | null;
    cabinConfigs: { cabinId: string | null, adults: number, children: number, babies: number }[];
    checkIn: Date;
    checkOut: Date;
    /** Horário padrão da propriedade (HH:MM) carimbado na hora-do-dia de checkIn/checkOut.
     *  Quando ausente, cai nos defaults (14:00 / 12:00). A data escolhida é preservada. */
    checkInTime?: string;
    checkOutTime?: string;
    sendAutomations: boolean;
    internalUse?: boolean;
    internalLabel?: string;
    actorId: string;
    actorName: string;
  }) {
    // Verify no overlapping stays before creating (skip unassigned cabins)
    await Promise.all(
      params.cabinConfigs
        .filter(config => config.cabinId != null)
        .map(config =>
          this.checkCabinAvailability(
            config.cabinId!,
            params.checkIn.toISOString(),
            params.checkOut.toISOString()
          )
        )
    );

    const accessCode = await this.generateUniqueAccessCode(params.propertyId);
    const groupId = params.cabinConfigs.length > 1 ? `GRP-${uuidv4().slice(0, 8).toUpperCase()}` : null;

    // Carimba a hora-do-dia prevista (política da propriedade) preservando a data escolhida.
    const checkInIso = applyTimeToDate(params.checkIn, params.checkInTime, DEFAULT_CHECK_IN_TIME).toISOString();
    const checkOutIso = applyTimeToDate(params.checkOut, params.checkOutTime, DEFAULT_CHECK_OUT_TIME).toISOString();

    const payloads = params.cabinConfigs.map(config => {
      const stayId = uuidv4();

      const additionalGuests: { id: string; type: string; fullName: string; document: string; birthDate: string }[] = [];
      for (let i = 0; i < Math.max(0, config.adults - 1); i++) {
        additionalGuests.push({ id: uuidv4(), type: 'adult', fullName: 'ACOMPANHANTE', document: '', birthDate: '' });
      }
      for (let i = 0; i < config.children; i++) {
        additionalGuests.push({ id: uuidv4(), type: 'child', fullName: 'ACOMPANHANTE', document: '', birthDate: '' });
      }
      for (let i = 0; i < config.babies; i++) {
        additionalGuests.push({ id: uuidv4(), type: 'free', fullName: 'ACOMPANHANTE', document: '', birthDate: '' });
      }

      return {
        id: stayId,
        propertyId: params.propertyId,
        guestId: params.guestId ?? null,
        cabinId: config.cabinId ?? null,
        groupId,
        accessCode,
        checkIn: checkInIso,
        checkOut: checkOutIso,
        counts: { adults: config.adults, children: config.children, babies: config.babies },
        additionalGuests,
        internalUse: params.internalUse ?? false,
        internalLabel: params.internalLabel ?? null,
        status: 'pending',
        automationFlags: {
          enabled: params.sendAutomations,
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

    return { accessCode, groupId, stayId: payloads[0].id };
  },

  async savePreCheckinDraft(
    propertyId: string,
    stayId: string,
    stayData: Record<string, any>,
    guestData: Record<string, any>
  ): Promise<void> {
    const { data: stay } = await db()
      .from('stays')
      .select('guestId, petException')
      .eq('id', stayId)
      .eq('propertyId', propertyId)
      .single();

    if (!stay) return;

    // Rascunho passa pelas MESMAS allowlists do envio final: era o caminho mais
    // fácil de gravar campo operacional, porque salva sozinho enquanto se digita.
    const safeStay = this._pick(stayData, this.PRE_CHECKIN_GUEST_EDITABLE_FIELDS);
    if ('petException' in safeStay) {
      safeStay.petException = this._sanitizePetException(safeStay.petException, stay.petException);
    }
    const safeGuest = this._pick(guestData, this.PRE_CHECKIN_GUEST_FIELDS);

    await Promise.all([
      Object.keys(safeStay).length > 0
        ? db().from('stays')
            .update({ ...safeStay, updatedAt: new Date().toISOString() })
            .eq('id', stayId)
        : Promise.resolve(),
      Object.keys(safeGuest).length > 0
        ? db().from('guests')
            .update({ ...safeGuest, updatedAt: new Date().toISOString() })
            .eq('id', stay.guestId)
            .eq('propertyId', propertyId)
        : Promise.resolve()
    ]);
  },

  // Campos que o formulário de pré-check-in do hóspede realmente edita. O objeto `stayUpdate`
  // recebido aqui é um snapshot do estado local do navegador, carregado quando a página abriu —
  // pode estar desatualizado (ex.: hóspede envia o form minutos depois da recepção já ter feito
  // o check-in presencial). Por isso nunca aceitamos o objeto inteiro: campos operacionais como
  // status/checkInActual/cabinId/financeiro ficam de fora e não podem ser sobrescritos por aqui.
  PRE_CHECKIN_GUEST_EDITABLE_FIELDS: [
    'expectedArrivalTime', 'vehiclePlate', 'travelReason', 'transportation',
    'lastCity', 'nextCity', 'hasPet', 'petDetails', 'pets', 'additionalGuests',
    'counts', 'areaConfigs', 'petPolicyAcceptedAt', 'petException',
  ] as const,

  /**
   * `petException` chega pelo mesmo payload do navegador que tudo o mais, então
   * ele NÃO pode ser gravado como veio: um request forjado mandaria
   * `status: 'approved'` e se autoaprovaria. Do hóspede só se aceita o pedido —
   * quem decide é a recepção, por outra rota.
   *
   * E uma exceção JÁ DECIDIDA não volta para `pending`: reenviar o formulário não
   * pode apagar a recusa que alguém registrou com nome e hora.
   */
  _sanitizePetException(incoming: unknown, current: unknown): unknown {
    const cur = (current ?? null) as { status?: string } | null;
    if (cur && cur.status && cur.status !== 'pending') return cur;

    if (!incoming || typeof incoming !== 'object') return null;
    const inc = incoming as Record<string, unknown>;
    const reasons = Array.isArray(inc.reasons) ? inc.reasons.filter((r) => typeof r === 'string').slice(0, 10) : [];

    return {
      status: 'pending',
      reasons,
      // Mantém o instante do primeiro pedido: reenviar o form não reinicia a espera.
      requestedAt: (cur as { requestedAt?: string } | null)?.requestedAt ?? new Date().toISOString(),
      decidedAt: null, decidedBy: null, authorizedBy: null, note: null,
    };
  },

  /**
   * O mesmo cuidado para a tabela `guests`: o formulário mandava o objeto inteiro,
   * então um request forjado podia gravar QUALQUER coluna do hóspede. Esta lista é
   * exatamente o que o pré-check-in edita.
   */
  PRE_CHECKIN_GUEST_FIELDS: [
    'fullName', 'document', 'birthDate', 'gender', 'raca', 'occupation',
    'nationality', 'email', 'phone', 'address', 'preferredLanguage',
  ] as const,

  /** Filtra um payload pela lista de campos permitidos. */
  _pick(payload: Record<string, any>, fields: readonly string[]): Record<string, any> {
    const out: Record<string, any> = {};
    for (const f of fields) if (f in payload) out[f] = payload[f];
    return out;
  },

  async completePreCheckin(propertyId: string, stayId: string, stayUpdate: Partial<Stay>, guestUpdate: Partial<Guest>): Promise<string> {
    // Busca id do guest e dados de grupo
    const { data: stay } = await db().from('stays').select('guestId, groupId, accessCode, status, petException').eq('id', stayId).eq('propertyId', propertyId).single();
    if (!stay) throw new Error("Stay not found");

    let finalAccessCode = stay.accessCode;
    const sanitizedStayUpdate = this._pick(stayUpdate as Record<string, any>, this.PRE_CHECKIN_GUEST_EDITABLE_FIELDS);
    if ('petException' in sanitizedStayUpdate) {
      sanitizedStayUpdate.petException = this._sanitizePetException(sanitizedStayUpdate.petException, stay.petException);
    }
    // O payload do hóspede também passa por allowlist: antes ia inteiro para o banco.
    const sanitizedGuestUpdate = this._pick(guestUpdate as Record<string, any>, this.PRE_CHECKIN_GUEST_FIELDS);

    // Se a reserva é de grupo, desmembra o código para dar um dashboard privado à cabana
    if (stay.groupId) {
      finalAccessCode = await this.generateUniqueAccessCode(propertyId);
      sanitizedStayUpdate.accessCode = finalAccessCode;

      // Log audit
      await AuditService.log({
        propertyId,
        userId: stay.guestId,
        userName: (guestUpdate.fullName as string) || "Hóspede",
        action: "UPDATE",
        entity: "STAY",
        entityId: stayId,
        details: `Código de acesso desmembrado do grupo. Novo código gerado: ${finalAccessCode}`
      });
    }

    // Nunca regride uma estadia que já avançou (check-in feito, finalizada ou cancelada) — o
    // envio deste form é sempre "informativo" quando isso acontece, não uma mudança de estado.
    const nextStatus = ['active', 'finished', 'cancelled'].includes(stay.status)
      ? stay.status
      : 'pre_checkin_done';

    // Supabase JS doesnt have explicit transactions, we do parallel awaited calls
    const [stayRes, guestRes] = await Promise.all([
      db().from('stays').update({ ...sanitizedStayUpdate, status: nextStatus, updatedAt: new Date().toISOString() }).eq('id', stayId),
      // Escopado: a ficha de OUTRA propriedade com o mesmo CPF não pode ser editada por aqui
      // (`guests.id` é chave global). Se não bater, o update não toca linha nenhuma.
      db().from('guests').update({ ...sanitizedGuestUpdate, updatedAt: new Date().toISOString() }).eq('id', stay.guestId).eq('propertyId', propertyId)
    ]);

    if (stayRes.error) throw new Error(`Falha ao atualizar a estadia: ${stayRes.error.message}`);
    if (guestRes.error) throw new Error(`Falha ao atualizar os dados do hóspede: ${guestRes.error.message}`);

    // O documento normalmente chega AQUI: a reserva foi aberta sem CPF e o hóspede
    // preencheu no portal. Sem isto o id da ficha ficaria provisório para sempre e o
    // cartão da estadia acenderia "Doc pendente" mesmo com o documento na mão.
    // Só no envio final — no rascunho o campo ainda está sendo digitado.
    await GuestService.promoteGuestId(propertyId, stay.guestId, stay.guestId, (guestUpdate.fullName as string) || "Hóspede");

    await AuditService.log({
      propertyId,
      userId: stay.guestId,
      userName: (guestUpdate.fullName as string) || "Hóspede",
      action: "PRE_CHECKIN",
      entity: "STAY",
      entityId: stayId,
      details: "Pré check-in concluído pelo hóspede via portal.",
      newData: { status: nextStatus, ...sanitizedStayUpdate }
    });

    return finalAccessCode;
  },

  async acceptGuestTerms(propertyId: string, stayId: string, guestId: string, guestName: string, automationFlags: Record<string, unknown>): Promise<void> {
    await db().from('stays').update({ automationFlags: { ...automationFlags, termsAccepted: true }, updatedAt: new Date().toISOString() }).eq('id', stayId);
    await AuditService.log({
      propertyId,
      userId: guestId,
      userName: guestName || "Hóspede",
      action: "UPDATE",
      entity: "STAY",
      entityId: stayId,
      details: "Termos e condições aceitos pelo hóspede via portal."
    });
  },

  /** db(): service-role no servidor — o portal chama por /api/guest/session. */
  async getStaysByAccessCode(accessCode: string) {
    const { data: stays, error } = await db()
      .from('stays')
      .select('*')
      .eq('accessCode', accessCode.toUpperCase());

    if (error || !stays) return [];

    // Carrega todas as cabanas referenciadas numa única query (evita N+1).
    const cabinIds = Array.from(new Set(stays.map((s: any) => s.cabinId).filter(Boolean)));
    const cabinMap = new Map<string, { name: string; wifi: any }>();
    if (cabinIds.length > 0) {
      const { data: cabins } = await db()
        .from('cabins')
        .select('id, name, wifi')
        .in('id', cabinIds);
      (cabins ?? []).forEach((c: any) => cabinMap.set(c.id, { name: c.name, wifi: c.wifi }));
    }

    return stays.map((stay: any) => {
      const cabin = stay.cabinId ? cabinMap.get(stay.cabinId) : null;
      return {
        ...stay,
        cabinName: cabin ? cabin.name : "Acomodação",
        cabinWifi: cabin ? cabin.wifi : undefined
      };
    });
  },

  async getGroupStays(accessCode: string) {
    const { data: stays, error } = await db()
      .from('stays')
      .select('*')
      .eq('accessCode', accessCode.toUpperCase())
      .in('status', ['pending', 'pre_checkin_done']);

    if (error || !stays) return [];

    const enriched = await Promise.all(stays.map(async (stay: any) => {
      let cabin = null;
      if (stay.cabinId) {
        const { data } = await supabase.from('cabins').select('name').eq('id', stay.cabinId).maybeSingle();
        cabin = data;
      }
      return {
        ...stay,
        cabinName: cabin ? cabin.name : "Acomodação"
      };
    }));

    return enriched;
  },

  /** db(): service-role no servidor — o portal chama por /api/guest/session. */
  async getStayWithGuestAndCabin(propertyId: string, stayId: string) {
    const { data: stay } = await db().from('stays').select('*').eq('id', stayId).eq('propertyId', propertyId).single();
    if (!stay) return null;

    const [gRes, cRes] = await Promise.all([
      db().from('guests').select('*').eq('id', stay.guestId).eq('propertyId', propertyId).maybeSingle(),
      stay.cabinId
        ? db().from('cabins').select('*').eq('id', stay.cabinId).eq('propertyId', propertyId).maybeSingle()
        : Promise.resolve({ data: null })
    ]);

    return {
      stay: stay as Stay,
      guest: gRes.data as Guest | null,
      cabin: cRes.data as Cabin | null
    };
  },

  async getStayWithGuestAndCabinAdmin(_propertyId: string, stayId: string) {
    const res = await fetch(`/api/admin/stays/${stayId}`);
    if (!res.ok) return null;
    return res.json() as Promise<{ stay: Stay; guest: Guest | null; cabin: Cabin | null }>;
  },

  async performCheckIn(propertyId: string, stayId: string, actorId: string, actorName: string) {
    // 1. Buscar dados da estadia (incluindo guestId para enriquecer o log)
    const { data: stay } = await supabase
      .from('stays').select('cabinId, checkIn, guestId, status, checkInActual').eq('id', stayId).single();
    if (!stay) throw new Error('STAY_NOT_FOUND');

    if (!stay.cabinId) throw new Error('CABIN_REQUIRED_FOR_CHECKIN');

    // 2. Validar status da acomodação
    const { data: cabin } = await supabase
      .from('cabins').select('status, number').eq('id', stay.cabinId).single();
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

    // 4. Atualizar estadia e cabin — em sequência, nunca em paralelo.
    // Antes as duas escritas iam num Promise.all sem checagem de erro: quando a da estadia
    // falhava calada (ou casava zero linhas), a cabana ficava travada em 'occupied' apontando
    // para uma reserva ainda 'pending', e nenhum check-in seguinte passava pelo guard do passo 2.
    // Agora a estadia é a fonte da verdade: só ocupamos a cabana depois de confirmar a linha.
    const { data: updatedStay, error: stayError } = await supabase
      .from('stays').update(updates).eq('id', stayId).eq('propertyId', propertyId).select('id');
    if (stayError) throw new Error(`CHECKIN_STAY_UPDATE_FAILED:${stayError.message}`);
    if (!updatedStay || updatedStay.length === 0) throw new Error('CHECKIN_STAY_UPDATE_FAILED:no_rows');

    const { error: cabinError } = await supabase
      .from('cabins').update({ status: 'occupied', currentStayId: stayId }).eq('id', stay.cabinId);
    if (cabinError) {
      // Desfaz a estadia para não deixar hóspede ativo numa cabana que o painel mostra livre.
      await supabase.from('stays')
        .update({ status: stay.status, checkInActual: stay.checkInActual, checkIn: stay.checkIn })
        .eq('id', stayId).eq('propertyId', propertyId);
      throw new Error(`CHECKIN_CABIN_UPDATE_FAILED:${cabinError.message}`);
    }

    // A revisão de entrada perde a validade neste instante — a hóspede entrou, não há mais o que
    // revisar. Sem isto elas ficavam abertas para sempre na fila de conferência da governanta.
    try {
      await HousekeepingService.closeObsoleteCheckinInspections(
        propertyId, { cabinId: stay.cabinId }, { id: actorId, name: actorName },
      );
    } catch (e) {
      console.error('[performCheckIn] falha ao encerrar revisões de entrada:', e);
    }

    // Build human-readable audit details
    let guestFirstName = '';
    try {
      const { data: guest } = await supabase.from('guests').select('fullName').eq('id', stay.guestId).eq('propertyId', propertyId).single();
      if (guest?.fullName) guestFirstName = guest.fullName.split(' ')[0];
    } catch { /* silent */ }
    const cabinLabel = cabin.number && guestFirstName
      ? `cabana ${cabin.number} - ${guestFirstName}`
      : `cabana ${cabin.number || stayId}`;
    const dateNote = updates.checkIn ? ' (data prevista substituída pelo horário real)' : '';

    await AuditService.log({
      propertyId,
      userId: actorId,
      userName: actorName,
      action: "CHECKIN",
      entity: "STAY",
      entityId: stayId,
      details: `Check-in da ${cabinLabel} realizado pela recepção.${dateNote}`
    });

    const automation = await this.triggerAutomation(propertyId, stayId, 'welcome_checkin');
    return { messagedQueued: automation.queued, messageQueueReason: automation.reason };
  },

  async performCheckOut(
    propertyId: string,
    stayId: string,
    actorId: string,
    actorName: string,
    keyLocation: 'reception' | 'cabin' | 'unknown' = 'unknown'
  ) {
    const res = await fetch(`/api/admin/stays/${stayId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'checkout', propertyId, actorId, actorName, keyLocation }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error ?? 'checkout-failed');
    }
    return { success: true };
  },

  async undoCheckOut(propertyId: string, stayId: string, cabinId: string, actorId: string, actorName: string) {
    await supabase.from('housekeeping_tasks')
      .update({
        status: 'cancelled',
        observations: 'Check-out desfeito pela Recepção. Tarefa cancelada.',
        updatedAt: new Date().toISOString()
      })
      .eq('propertyId', propertyId)
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
    const { data: stay } = await supabase.from('stays').select('cabinId').eq('id', stayId).single();

    await supabase.from('stays')
      .update({ status: 'cancelled', updatedAt: new Date().toISOString() })
      .eq('id', stayId);

    // Libera a cabana se ela ainda apontava para esta reserva — sem isso, cancelar uma reserva
    // que já tinha ocupado a cabana (ex.: check-in desfeito manualmente antes) deixa a cabana
    // travada em 'occupied' apontando para uma estadia cancelada, sem nada de ativo nela.
    if (stay?.cabinId) {
      await supabase.from('cabins')
        .update({ status: 'available', currentStayId: null })
        .eq('id', stay.cabinId)
        .eq('currentStayId', stayId);
    }

    await AuditService.log({
      propertyId, userId: actorId, userName: actorName, action: "DELETE", entity: "STAY", entityId: stayId,
      details: "Reserva cancelada administrativamente."
    });
  },

  async updateStayData(propertyId: string, stayId: string, data: Partial<Stay>, actorId: string, actorName: string) {
    const { error } = await supabase.from('stays').update({ ...data, updatedAt: new Date().toISOString() }).eq('id', stayId);

    if (error) {
      console.error('[StayService] updateStayData error:', error.code, error.message, error.details);
      throw new Error(`Falha ao atualizar estadia: ${error.message}`);
    }

    // Enrich with cabin + guest identity
    let stayLabel = stayId;
    try {
      const { data: stay } = await supabase.from('stays').select('cabinId, guestId').eq('id', stayId).single();
      if (stay) {
        const [{ data: cabinData }, { data: guestData }] = await Promise.all([
          stay.cabinId ? supabase.from('cabins').select('number').eq('id', stay.cabinId).single() : Promise.resolve({ data: null }),
          supabase.from('guests').select('fullName').eq('id', stay.guestId).eq('propertyId', propertyId).single(),
        ]);
        const cabinNum = cabinData?.number || '';
        const firstName = guestData?.fullName?.split(' ')[0] || '';
        if (cabinNum && firstName) stayLabel = `cabana ${cabinNum} - ${firstName}`;
        else if (cabinNum) stayLabel = `cabana ${cabinNum}`;
      }
    } catch { /* silent */ }

    await AuditService.log({
      propertyId, userId: actorId, userName: actorName, action: "UPDATE", entity: "STAY", entityId: stayId,
      details: `Ficha de hospedagem da ${stayLabel} editada pela recepção.`, newData: data
    });
  },

  async reassignGuest(propertyId: string, stayId: string, newGuestId: string, actorId: string, actorName: string) {
    const { error } = await supabase.from('stays')
      .update({ guestId: newGuestId, updatedAt: new Date().toISOString() })
      .eq('id', stayId)
      .eq('propertyId', propertyId);

    if (error) throw error;

    const { data: newGuest } = await supabase
      .from('guests').select('fullName').eq('id', newGuestId).eq('propertyId', propertyId).maybeSingle();
    await AuditService.log({
      propertyId, userId: actorId, userName: actorName,
      action: "REASSIGN_GUEST", entity: "STAY", entityId: stayId,
      details: `Titular alterado para ${newGuest?.fullName ?? newGuestId}.`
    });
  },

  async transferCabin(
    propertyId: string,
    stayId: string,
    newCabinId: string,
    oldCabinDisposition: 'cleaning' | 'available',
    actorId: string,
    actorName: string
  ) {
    const { data: stay } = await supabase
      .from('stays').select('cabinId, status, checkIn, checkOut, cabinHistory').eq('id', stayId).single();
    if (!stay) throw new Error('STAY_NOT_FOUND');

    const oldCabinId = stay.cabinId;
    const isActive = stay.status === 'active';

    if (isActive) {
      // Active stay: target cabin must be physically available right now
      const { data: newCabin } = await supabase
        .from('cabins').select('status').eq('id', newCabinId).single();
      if (!newCabin || newCabin.status !== 'available') {
        const statusMap: Record<string, string> = {
          occupied: 'ocupada por outra estadia',
          cleaning: 'em limpeza',
          maintenance: 'em manutenção',
        };
        const label = statusMap[newCabin?.status ?? ''] ?? 'indisponível';
        throw new Error(`CABIN_NOT_AVAILABLE:${newCabin?.status ?? 'unknown'}:${label}`);
      }
    } else {
      // Pending/future stay: check for date overlap with existing stays in the target cabin
      await this.checkCabinAvailability(newCabinId, stay.checkIn, stay.checkOut);
    }

    // Build cabin history for active stays
    const today = new Date().toISOString().split('T')[0];
    const existingHistory: { cabinId: string; from: string; to: string }[] = stay.cabinHistory || [];
    const fromDate = existingHistory.length > 0
      ? existingHistory[existingHistory.length - 1].to
      : stay.checkIn?.split?.('T')?.[0] || stay.checkIn;
    const updatedHistory = isActive && oldCabinId
      ? [...existingHistory, { cabinId: oldCabinId, from: fromDate, to: today }]
      : existingHistory;

    // Update stay
    await supabase.from('stays')
      .update({ cabinId: newCabinId, cabinHistory: updatedHistory, updatedAt: new Date().toISOString() })
      .eq('id', stayId).eq('propertyId', propertyId);

    if (isActive) {
      // Occupy new cabin first
      await supabase.from('cabins').update({ status: 'occupied', currentStayId: stayId }).eq('id', newCabinId);

      if (oldCabinId) {
        // Release old cabin in two steps: clear currentStayId (may trigger a DB trigger that sets cleaning),
        // then explicitly set the desired status to ensure final state is correct regardless of any trigger.
        await supabase.from('cabins').update({ currentStayId: null }).eq('id', oldCabinId);
        await supabase.from('cabins').update({ status: oldCabinDisposition }).eq('id', oldCabinId);

        if (oldCabinDisposition === 'cleaning') {
          await supabase.from('housekeeping_tasks').insert({
            id: uuidv4(),
            propertyId,
            cabinId: oldCabinId,
            stayId,
            type: 'turnover',
            status: 'pending',
            assignedTo: [],
            checklist: []
          });
        }
      }
    }

    await AuditService.log({
      propertyId, userId: actorId, userName: actorName, action: "UPDATE", entity: "STAY", entityId: stayId,
      details: isActive
        ? `Transferência de cabana: ${oldCabinId ?? 'sem cabana'} → ${newCabinId}. Cabana antiga: ${oldCabinId ? (oldCabinDisposition === 'cleaning' ? 'enviada para limpeza' : 'liberada') : 'sem cabana anterior'}.`
        : `Cabana da reserva alterada: ${oldCabinId ?? 'sem cabana'} → ${newCabinId}.`
    });

  },

  async unassignCabin(
    propertyId: string,
    stayId: string,
    actorId: string,
    actorName: string
  ) {
    const { data: stay } = await supabase
      .from('stays').select('cabinId, status, checkIn, cabinHistory').eq('id', stayId).single();
    if (!stay) throw new Error('STAY_NOT_FOUND');
    if (!stay.cabinId) return; // already unassigned

    const oldCabinId = stay.cabinId;
    const isActive = stay.status === 'active';

    if (isActive) throw new Error('CANNOT_UNASSIGN_ACTIVE_STAY');

    await supabase.from('stays')
      .update({ cabinId: null, updatedAt: new Date().toISOString() })
      .eq('id', stayId).eq('propertyId', propertyId);

    const { data: oldCabin } = await supabase
      .from('cabins').select('number, name').eq('id', oldCabinId).maybeSingle();
    const cabinLabel = oldCabin ? `cabana ${oldCabin.number ?? oldCabin.name}` : oldCabinId;
    await AuditService.log({
      propertyId, userId: actorId, userName: actorName, action: "UPDATE", entity: "STAY", entityId: stayId,
      details: `Cabana removida da reserva: ${cabinLabel} → sem cabana.`
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

  /**
   * Porta única de entrada do fólio — recepção, concierge, frigobar da camareira
   * e as cobranças de chave/empréstimo passam todas por aqui. Por isso a trava de
   * conta encerrada mora neste ponto: uma checagem cobre todos.
   */
  async addFolioItemManual(propertyId: string, stayId: string, item: Omit<FolioItem, 'id' | 'createdAt' | 'status'>, actorId: string, actorName: string) {
    await assertFolioOpen(stayId);
    const itemId = uuidv4();
    const { error } = await db().from('folio_items').insert({
      ...item,
      id: itemId,
      propertyId,
      stayId,
      status: 'pending'
    });
    if (error) throw error;

    await db().from('stays').update({ hasOpenFolio: true }).eq('id', stayId);

    await AuditService.log({
      propertyId, userId: actorId, userName: actorName, action: "UPDATE", entity: "STAY", entityId: stayId,
      details: `Lançou item na conta: ${item.quantity}x ${item.description}`
    });
  },

  async deleteFolioItem(propertyId: string, stayId: string, itemId: string, itemDescription: string, actorId: string, actorName: string) {
    await supabase.from('folio_items').delete().eq('id', itemId).eq('propertyId', propertyId);

    const { count } = await supabase.from('folio_items').select('*', { count: 'exact', head: true }).eq('stayId', stayId).eq('status', 'pending');
    await supabase.from('stays').update({ hasOpenFolio: (count || 0) > 0 }).eq('id', stayId);

    await AuditService.log({
      propertyId, userId: actorId, userName: actorName, action: "DELETE", entity: "STAY", entityId: stayId,
      details: `Estornou o item da conta: ${itemDescription}`
    });
  },

  /**
   * Encerra a conta da estadia — o portão único entre "Ativas" e "Encerradas".
   *
   * `pendingSummary` é o que a confirmação mostrou para quem clicou (chips
   * acesos). Vai para a auditoria: encerrar com pendência é permitido, ficar
   * sem registro do que foi deixado para trás não é.
   *
   * Não apaga mais `lostItemsDescription`. A versão anterior zerava a descrição
   * do objeto esquecido ao encerrar — o único registro do achado sumia junto
   * com a conta. Agora o objeto tem destino próprio (`lostItemsResolution`).
   */
  async closeStayBill(propertyId: string, stayId: string, actorId: string, actorName: string, pendingSummary?: string) {
    await supabase.from('folio_items').update({ status: 'paid' }).eq('stayId', stayId).eq('status', 'pending');
    const { error } = await supabase.from('stays').update({
      hasOpenFolio: false,
      billClosedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).eq('id', stayId).eq('propertyId', propertyId);
    if (error) throw new Error(error.message);

    await AuditService.log({
      propertyId, userId: actorId, userName: actorName, action: "UPDATE", entity: "STAY", entityId: stayId,
      details: pendingSummary
        ? `Conta encerrada COM pendência: ${pendingSummary}. Lançamentos pendentes marcados como pagos.`
        : `Conta encerrada: todos os lançamentos pendentes marcados como pagos.`,
    });
  },

  /** Reabre a conta de uma estadia encerrada (volta para "Saíram · conta aberta"). */
  async reopenStayBill(propertyId: string, stayId: string, actorId: string, actorName: string) {
    const { error } = await supabase.from('stays')
      .update({ billClosedAt: null, updatedAt: new Date().toISOString() })
      .eq('id', stayId).eq('propertyId', propertyId);
    if (error) throw new Error(error.message);

    await AuditService.log({
      propertyId, userId: actorId, userName: actorName, action: "UPDATE", entity: "STAY", entityId: stayId,
      details: "Conta reaberta.",
    });
  },

  // ── Desfechos da conta ───────────────────────────────────────────────────
  // Chave e empréstimo terminam do mesmo jeito: ou a coisa apareceu, ou virou
  // cobrança no fólio. Objeto esquecido tem três destinos e nenhum deles é
  // "apagar a descrição".

  async resolveKey(
    propertyId: string, stayId: string,
    outcome: 'found' | 'returned' | 'charged',
    actorId: string, actorName: string,
    charge?: { amount: number; description?: string },
  ) {
    if (outcome === 'charged') {
      const amount = Math.round((charge?.amount ?? 0) * 100) / 100;
      if (!(amount > 0)) throw new Error('KEY_CHARGE_INVALID');
      await StayService.addFolioItemManual(
        propertyId, stayId,
        {
          description: charge?.description?.trim() || 'Chave não devolvida',
          quantity: 1, unitPrice: amount, totalPrice: amount,
          category: 'services', addedBy: actorId,
        },
        actorId, actorName,
      );
    }

    const { error } = await supabase.from('stays').update({
      keyStatus: outcome,
      keyStatusAt: new Date().toISOString(),
      keyStatusBy: actorId,
      updatedAt: new Date().toISOString(),
    }).eq('id', stayId).eq('propertyId', propertyId);
    if (error) throw new Error(error.message);

    await AuditService.log({
      propertyId, userId: actorId, userName: actorName, action: "UPDATE", entity: "STAY", entityId: stayId,
      details: outcome === 'charged'
        ? `Chave cobrada no fólio (R$ ${(charge?.amount ?? 0).toFixed(2)}).`
        : outcome === 'returned' ? 'Chave devolvida depois do check-out.' : 'Chave encontrada na acomodação.',
    });
  },

  async resolveLoanedItems(
    propertyId: string, stayId: string,
    outcome: 'returned' | 'charged',
    actorId: string, actorName: string,
    charge?: { amount: number; description?: string },
  ) {
    if (outcome === 'charged') {
      const amount = Math.round((charge?.amount ?? 0) * 100) / 100;
      if (!(amount > 0)) throw new Error('LOAN_CHARGE_INVALID');
      await StayService.addFolioItemManual(
        propertyId, stayId,
        {
          description: charge?.description?.trim() || 'Itens emprestados não devolvidos',
          quantity: 1, unitPrice: amount, totalPrice: amount,
          category: 'services', addedBy: actorId,
        },
        actorId, actorName,
      );
    }

    // `loanedItemsChecked` continua espelhado: é o campo que o app da camareira lê.
    const now = new Date().toISOString();
    const { error } = await supabase.from('stays').update({
      loanedItemsStatus: outcome,
      loanedItemsChecked: true,
      loanedItemsCheckedAt: now,
      updatedAt: now,
    }).eq('id', stayId).eq('propertyId', propertyId);
    if (error) throw new Error(error.message);

    await AuditService.log({
      propertyId, userId: actorId, userName: actorName, action: "UPDATE", entity: "STAY", entityId: stayId,
      details: outcome === 'charged'
        ? `Itens emprestados cobrados no fólio (R$ ${(charge?.amount ?? 0).toFixed(2)}).`
        : 'Itens emprestados devolvidos.',
    });
  },

  async resolveLostItems(
    propertyId: string, stayId: string,
    resolution: 'returned' | 'discarded' | 'stored',
    actorId: string, actorName: string,
  ) {
    const now = new Date().toISOString();
    const { error } = await supabase.from('stays').update({
      lostItemsResolution: resolution,
      lostItemsResolvedAt: now,
      lostItemsResolvedBy: actorId,
      updatedAt: now,
    }).eq('id', stayId).eq('propertyId', propertyId);
    if (error) throw new Error(error.message);

    const LABEL = { returned: 'devolvido ao hóspede', discarded: 'descartado', stored: 'guardado em achados e perdidos' } as const;
    await AuditService.log({
      propertyId, userId: actorId, userName: actorName, action: "UPDATE", entity: "STAY", entityId: stayId,
      details: `Objeto esquecido ${LABEL[resolution]}.`,
    });
  },

  // `archiveStay` foi removida em 24/08/2026 junto com o botão "Arquivar": era a
  // única faxina possível na aba Encerradas e escondia a estadia para sempre. O
  // lugar dela é a grade de "Últimas saídas" + histórico paginado, e as 8 estadias
  // que estavam em 'archived' voltaram por migration (`unarchive_stays.sql`).

  // ── Exceção à Política Pet ───────────────────────────────────────────────────
  //
  // O pedido nasce no pré-check-in (ver `_sanitizePetException`) e morre aqui,
  // decidido por gente. Os dois critérios abaixo INFORMAM quem decide; nenhum
  // recusa sozinho — a direção libera exceção várias vezes por mês e tirar essa
  // possibilidade só faria a decisão sair do sistema de novo.

  /**
   * Pedidos pendentes com o contexto da decisão junto: se as datas tocam a alta
   * temporada e se já existe outra exceção aprovada com datas sobrepostas.
   *
   * Uma consulta para os pendentes e outra para os aprovados — nunca uma por
   * estadia. Só olha para frente: pedido de estadia que já passou não é decisão,
   * é histórico.
   */
  async listPendingPetExceptions(propertyId: string, blackout?: PetBlackoutWindow[] | null): Promise<Array<{
    stayId: string; guestId: string | null; cabinId: string | null;
    checkIn: string; checkOut: string; pets: any[]; reasons: string[];
    requestedAt: string | null;
    inBlackout: boolean;
    overlapping: { stayId: string; checkIn: string; checkOut: string }[];
    /** Pico de ocupação no período pedido, em % das cabanas que contam. */
    occupancyPct: number | null;
    /** Quantas OUTRAS estadias com pet cruzam estas datas. */
    petsInPeriod: number;
  }>> {
    const todayIso = new Date().toISOString();

    // Duas consultas para tudo: uma varredura das estadias vivas (que serve ao
    // pedido, à sobreposição, à ocupação e à contagem de pets) e a das cabanas.
    // Uma consulta por pedido seria o caminho fácil e o mais caro.
    const [staysRes, cabinsRes] = await Promise.all([
      db().from('stays')
        .select('id, guestId, cabinId, checkIn, checkOut, pets, hasPet, status, petException')
        .eq('propertyId', propertyId)
        .gte('checkOut', todayIso)
        .order('checkIn', { ascending: true }),
      db().from('cabins')
        .select('id, active, ignoreInOccupancy')
        .eq('propertyId', propertyId),
    ]);

    const stays = staysRes.data ?? [];
    // Cabana desativada ou fora da conta de ocupação não entra no denominador.
    const cabinsCount = (cabinsRes.data ?? [])
      .filter((c: any) => c.active !== false && !c.ignoreInOccupancy).length;

    const vivas = stays.filter((s: any) => !['cancelled', 'archived'].includes(s.status));
    const pending = stays.filter((s: any) => s.petException?.status === 'pending');
    const approved = stays.filter((s: any) => s.petException?.status === 'approved');
    const windows = blackout ?? DEFAULT_PET_BLACKOUT;

    const cruza = (a: any, b: any) => a.checkIn < b.checkOut && a.checkOut > b.checkIn;

    /**
     * Pico de ocupação dentro do período pedido: a maior quantidade de cabanas
     * ocupadas ao mesmo tempo, e não a média. É o dia cheio que decide se cabe
     * mais um animal na pousada — a média esconde exatamente esse dia.
     */
    const picoOcupacao = (alvo: any): number | null => {
      if (cabinsCount === 0) return null;
      const inicio = new Date(alvo.checkIn);
      const fim = new Date(alvo.checkOut);
      if (isNaN(inicio.getTime()) || isNaN(fim.getTime())) return null;

      let pico = 0;
      for (let i = 0, dia = new Date(inicio); i < 400 && dia < fim; i++, dia.setDate(dia.getDate() + 1)) {
        const ms = dia.getTime();
        const ocupadas = new Set(
          vivas
            .filter((s: any) => s.cabinId && new Date(s.checkIn).getTime() <= ms && new Date(s.checkOut).getTime() > ms)
            .map((s: any) => s.cabinId),
        ).size;
        if (ocupadas > pico) pico = ocupadas;
      }
      return Math.min(100, Math.round((pico / cabinsCount) * 100));
    };

    return pending.map((s: any) => ({
      stayId: s.id,
      guestId: s.guestId ?? null,
      cabinId: s.cabinId ?? null,
      checkIn: s.checkIn,
      checkOut: s.checkOut,
      pets: Array.isArray(s.pets) ? s.pets : [],
      reasons: Array.isArray(s.petException?.reasons) ? s.petException.reasons : [],
      requestedAt: s.petException?.requestedAt ?? null,
      inBlackout: touchesBlackout(s.checkIn, s.checkOut, windows),
      // Sobreposição de datas: duas exceções na pousada ao mesmo tempo é o risco
      // real, não "no mesmo feriado".
      overlapping: approved
        .filter((a: any) => a.id !== s.id && cruza(a, s))
        .map((a: any) => ({ stayId: a.id, checkIn: a.checkIn, checkOut: a.checkOut })),
      occupancyPct: picoOcupacao(s),
      // Pets DENTRO da política também disputam espaço e sossego — a dica é
      // "quantos animais vão estar aqui", não "quantas exceções".
      petsInPeriod: vivas.filter((o: any) => o.id !== s.id && o.hasPet && cruza(o, s)).length,
    }));
  },

  /**
   * Registra a decisão. `authorizedBy` é texto livre porque a direção não opera a
   * plataforma — ela manda fazer, e quem digita é a recepção. Guardar os dois
   * (quem mandou e quem registrou) é o ponto: hoje não fica registro nenhum.
   */
  async decidePetException(
    propertyId: string, stayId: string,
    actorId: string, actorName: string,
    decision: 'approved' | 'refused',
    authorizedBy?: string | null, note?: string | null,
  ): Promise<void> {
    const { data: stay } = await db().from('stays')
      .select('petException').eq('id', stayId).eq('propertyId', propertyId).maybeSingle();
    if (!stay?.petException) throw new Error("Esta estadia não tem pedido de exceção.");

    const now = new Date().toISOString();
    const next = {
      ...(stay.petException as Record<string, unknown>),
      status: decision,
      decidedAt: now,
      decidedBy: actorId,
      authorizedBy: (authorizedBy ?? '').trim() || null,
      note: (note ?? '').trim() || null,
    };

    const { error } = await db().from('stays')
      .update({ petException: next, updatedAt: now })
      .eq('id', stayId).eq('propertyId', propertyId);
    if (error) throw new Error(error.message);

    const quem = next.authorizedBy ? ` Autorizado por: ${next.authorizedBy}.` : '';
    await AuditService.log({
      propertyId, userId: actorId, userName: actorName,
      action: "UPDATE", entity: "STAY", entityId: stayId,
      details: `Exceção à Política Pet ${decision === 'approved' ? 'APROVADA' : 'RECUSADA'}.${quem}${next.note ? ` Observação: ${next.note}` : ''}`,
      newData: next,
    });

    // Avisa o hóspede por WhatsApp. Só dispara se a propriedade tiver a regra
    // ligada com um texto escolhido — automação sem template não inventa
    // mensagem, e recusa de pet é assunto delicado demais para texto padrão.
    // A falha do envio não derruba a decisão: o registro é o que importa.
    try {
      await AutomationService.triggerAutomationAdmin(
        propertyId, stayId,
        decision === 'approved' ? 'pet_exception_approved' : 'pet_exception_refused',
      );
    } catch (e) {
      console.error('[decidePetException] automação', e);
    }
  },
};
