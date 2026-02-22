import { db } from "@/lib/firebase";
import { 
  collection, 
  doc, 
  getDoc, 
  updateDoc, 
  writeBatch, 
  serverTimestamp, 
  query, 
  where, 
  getDocs, 
  orderBy,
  collectionGroup,
  limit,
  setDoc,
  deleteDoc
} from "firebase/firestore";
import { Stay, Guest, Cabin, FolioItem, AutomationTriggerEvent, MessageTemplate } from "@/types/aura";
import { v4 as uuidv4 } from 'uuid';
import { AuditService } from "./audit-service";
import { AutomationService } from "./automation-service";

export const StayService = {
  /**
   * Dispara uma automação se a regra estiver ativa na propriedade.
   * Executado silenciosamente para não travar o fluxo da recepção.
   */
  async triggerAutomation(propertyId: string, stayId: string, triggerEvent: AutomationTriggerEvent) {
    try {
      // 1. Verifica se a regra existe e está ativa
      const ruleSnap = await getDoc(doc(db, "properties", propertyId, "automation_rules", triggerEvent));
      if (!ruleSnap.exists() || !ruleSnap.data().active) return;
      const rule = ruleSnap.data();

      // 2. Busca o template da mensagem
      const templateSnap = await getDoc(doc(db, "properties", propertyId, "message_templates", rule.templateId));
      if (!templateSnap.exists()) return;
      const template = { id: templateSnap.id, ...templateSnap.data() } as MessageTemplate;

      // 3. Coleta os dados vitais
      const stayDoc = await getDoc(doc(db, "properties", propertyId, "stays", stayId));
      if (!stayDoc.exists()) return;
      const stay = { id: stayDoc.id, ...stayDoc.data() } as Stay;

      const guestDoc = await getDoc(doc(db, "properties", propertyId, "guests", stay.guestId));
      if (!guestDoc.exists()) return;
      const guest = { id: guestDoc.id, ...guestDoc.data() } as Guest;

      // Se não houver telefone cadastrado, aborta o envio
      if (!guest.phone) return;

      let cabin;
      if (stay.cabinId) {
        const cabinDoc = await getDoc(doc(db, "properties", propertyId, "cabins", stay.cabinId));
        if (cabinDoc.exists()) cabin = { id: cabinDoc.id, ...cabinDoc.data() } as Cabin;
      }

      // 4. Envia para a Fila de Processamento
      await AutomationService.queueMessage(
        propertyId,
        stayId,
        guest.phone,
        template,
        triggerEvent,
        guest,
        cabin,
        stay,
        rule.delayMinutes || 0
      );
    } catch (error) {
      console.error(`Erro interno ao processar gatilho ${triggerEvent}:`, error);
    }
  },

  /**
   * Gera um código de acesso único dentro da sub-coleção de estadias da propriedade
   */
  async generateUniqueAccessCode(propertyId: string): Promise<string> {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    let isUnique = false;

    while (!isUnique) {
      code = Array.from({ length: 5 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
      
      const q = query(
        collection(db, "properties", propertyId, "stays"), 
        where("accessCode", "==", code)
      );
      
      const snap = await getDocs(q);
      if (snap.empty) isUnique = true;
    }
    return code;
  },

  /**
   * Encontra o ID da propriedade pesquisando globalmente pelo ID da estadia.
   */
  async findPropertyIdByStayId(stayId: string): Promise<string | null> {
    try {
      const staysRef = collectionGroup(db, "stays");
      const q = query(staysRef, where("id", "==", stayId), limit(1));
      const snapshot = await getDocs(q);

      if (snapshot.empty) return null;

      const doc = snapshot.docs[0];
      return doc.ref.parent.parent?.id || null;
    } catch (error) {
      console.error("Erro ao localizar propriedade da estadia:", error);
      return null;
    }
  },

  /**
   * Cria registros de estadia na sub-coleção properties/{id}/stays
   */
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
    const batch = writeBatch(db);
    const accessCode = await this.generateUniqueAccessCode(params.propertyId);
    const groupId = params.cabinConfigs.length > 1 ? `GRP-${uuidv4().slice(0, 8).toUpperCase()}` : null;

    params.cabinConfigs.forEach((config) => {
      const stayId = uuidv4();
      const stayRef = doc(db, "properties", params.propertyId, "stays", stayId);
      
      batch.set(stayRef, {
        id: stayId,
        propertyId: params.propertyId,
        guestId: params.guestId,
        cabinId: config.cabinId,
        groupId,
        accessCode,
        checkIn: params.checkIn,
        checkOut: params.checkOut,
        counts: { adults: config.adults, children: config.children, babies: config.babies },
        status: 'pending',
        automationFlags: { 
          send48h: params.sendAutomations, 
          send24h: params.sendAutomations, 
          preCheckinSent: false, 
          remindersCount: 0 
        },
        createdAt: serverTimestamp()
      });
    });

    await batch.commit();

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

  /**
   * Busca uma estadia e seu hóspede (Admin)
   */
  async getStayWithGuest(propertyId: string, stayId: string) {
    const stayRef = doc(db, "properties", propertyId, "stays", stayId);
    const stayDoc = await getDoc(stayRef);
    
    if (!stayDoc.exists()) return null;
    
    const stayData = { id: stayDoc.id, ...stayDoc.data() } as Stay;
    const guestDoc = await getDoc(doc(db, "properties", propertyId, "guests", stayData.guestId));
    
    return { 
      stay: stayData, 
      guest: guestDoc.exists() ? { id: guestDoc.id, ...guestDoc.data() } as Guest : null 
    };
  },

  /**
   * Finaliza o pré-check-in do hóspede
   */
  async completePreCheckin(propertyId: string, stayId: string, stayUpdate: Partial<Stay>, guestUpdate: Partial<Guest>) {
    const batch = writeBatch(db);
    
    const stayRef = doc(db, "properties", propertyId, "stays", stayId);
    const staySnap = await getDoc(stayRef);
    const gId = staySnap.data()?.guestId;

    batch.update(stayRef, { 
      ...stayUpdate, 
      status: 'pre_checkin_done', 
      updatedAt: serverTimestamp() 
    });

    batch.update(doc(db, "properties", propertyId, "guests", gId), { 
      ...guestUpdate, 
      updatedAt: serverTimestamp() 
    });

    return batch.commit();
  },

  /**
   * Busca estadias de um grupo usando COLLECTION GROUP (Portal do Hóspede)
   */
  async getGroupStays(accessCode: string) {
    const q = query(
      collectionGroup(db, "stays"), 
      where("accessCode", "==", accessCode.toUpperCase()),
      where("status", "in", ["pending", "pre_checkin_done"])
    );
    
    const snap = await getDocs(q);
    
    const stays = await Promise.all(snap.docs.map(async (d) => {
      const data = d.data() as Stay;
      const cabinDoc = await getDoc(doc(db, "properties", data.propertyId, "cabins", data.cabinId));
      
      return { 
        ...data, 
        id: d.id, 
        cabinName: cabinDoc.exists() ? cabinDoc.data().name : "Acomodação" 
      };
    }));
    
    return stays;
  },

  /**
   * Busca Stay + Guest + Cabin (Admin e Portal)
   */
  async getStayWithGuestAndCabin(propertyId: string, stayId: string) {
    const stayRef = doc(db, "properties", propertyId, "stays", stayId);
    const stayDoc = await getDoc(stayRef);
    if (!stayDoc.exists()) return null;

    const stayData = { id: stayDoc.id, ...stayDoc.data() } as Stay;

    const [guestDoc, cabinDoc] = await Promise.all([
      getDoc(doc(db, "properties", propertyId, "guests", stayData.guestId)),
      getDoc(doc(db, "properties", propertyId, "cabins", stayData.cabinId))
    ]);

    return { 
      stay: stayData, 
      guest: guestDoc.exists() ? { id: guestDoc.id, ...guestDoc.data() } as Guest : null,
      cabin: cabinDoc.exists() ? { id: cabinDoc.id, ...cabinDoc.data() } as Cabin : null
    };
  },

  /**
   * Listagem por Status (Admin)
   */
  async getStaysByStatus(propertyId: string, statusList: string[]) {
    try {
      const q = query(
        collection(db, "properties", propertyId, "stays"),
        where("status", "in", statusList),
        orderBy("checkIn", "asc")
      );
      
      const snap = await getDocs(q);
      const stays = await Promise.all(snap.docs.map(async (d) => {
        const data = d.data() as Stay;
        const [guestDoc, cabinDoc] = await Promise.all([
          getDoc(doc(db, "properties", propertyId, "guests", data.guestId)),
          getDoc(doc(db, "properties", propertyId, "cabins", data.cabinId))
        ]);

        return {
          ...data,
          id: d.id,
          guestName: guestDoc.exists() ? guestDoc.data().fullName : "Hóspede desconhecido",
          cabinName: cabinDoc.exists() ? cabinDoc.data().name : "N/A"
        };
      }));

      return stays;
    } catch (error) {
      console.error("Erro ao listar estadias:", error);
      return [];
    }
  },

  /**
   * Check-in Físico
   */
  async performCheckIn(propertyId: string, stayId: string, actorId: string, actorName: string) {
    const stayRef = doc(db, "properties", propertyId, "stays", stayId);

    await updateDoc(stayRef, {
      status: 'active',
      checkInActual: serverTimestamp()
    });

    await AuditService.log({
      propertyId,
      userId: actorId,
      userName: actorName,
      action: "CHECKIN",
      entity: "STAY",
      entityId: stayId,
      details: "Check-in físico realizado pela recepção."
    });

    // DISPARO DE AUTOMAÇÃO: Boas Vindas
    await this.triggerAutomation(propertyId, stayId, 'welcome_checkin');
  },

  /**
   * Check-out Físico: Libera Cabana E Cria Tarefa de Governança
   */
  async performCheckOut(propertyId: string, stayId: string, actorId: string, actorName: string) {
    const stayRef = doc(db, "properties", propertyId, "stays", stayId);
    const staySnap = await getDoc(stayRef);
    const cabinId = staySnap.data()?.cabinId;

    if (!cabinId) throw new Error("Acomodação não encontrada na reserva.");

    const dailyTasksQuery = query(
      collection(db, "properties", propertyId, "housekeeping_tasks"),
      where("cabinId", "==", cabinId),
      where("status", "==", "pending")
    );
    const dailyTasksSnap = await getDocs(dailyTasksQuery);

    const batch = writeBatch(db);

    dailyTasksSnap.docs.forEach(d => {
      if (d.data().type === 'daily') {
        batch.update(d.ref, {
          status: 'cancelled',
          observations: 'Cancelada automaticamente por Check-out (Substituída por Faxina de Troca).',
          updatedAt: serverTimestamp()
        });
      }
    });

    batch.update(stayRef, {
      status: 'finished',
      checkOutActual: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    const cabinRef = doc(db, "properties", propertyId, "cabins", cabinId);
    batch.update(cabinRef, {
      status: 'cleaning',
      currentStayId: null
    });

    const newTaskId = uuidv4();
    const taskRef = doc(db, "properties", propertyId, "housekeeping_tasks", newTaskId);
    batch.set(taskRef, {
      id: newTaskId,
      propertyId,
      cabinId,
      stayId, 
      type: 'turnover',
      status: 'pending',
      assignedTo: [], 
      checklist: [], 
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    await batch.commit();

    await AuditService.log({
      propertyId,
      userId: actorId,
      userName: actorName,
      action: "CHECKOUT",
      entity: "STAY",
      entityId: stayId,
      details: `Check-out realizado. Tarefa de Faxina de Troca gerada para a unidade ${cabinId}.`
    });

    // DISPARO DE AUTOMAÇÕES: Agradecimento e NPS (O delay é tratado na Fila)
    await this.triggerAutomation(propertyId, stayId, 'checkout_thanks');
    await this.triggerAutomation(propertyId, stayId, 'nps_survey');

    return { success: true };
  },

  /**
   * Desfaz o Check-out e Reativa a Estadia (Cancela a Tarefa de Governança)
   */
  async undoCheckOut(propertyId: string, stayId: string, cabinId: string, actorId: string, actorName: string) {
    const turnoverQuery = query(
      collection(db, "properties", propertyId, "housekeeping_tasks"),
      where("stayId", "==", stayId),
      where("type", "==", "turnover"),
      where("status", "in", ["pending", "in_progress", "waiting_conference"])
    );
    const turnoverSnap = await getDocs(turnoverQuery);

    const batch = writeBatch(db);

    turnoverSnap.docs.forEach(d => {
      batch.update(d.ref, {
        status: 'cancelled',
        observations: 'Check-out desfeito pela Recepção. Tarefa cancelada.',
        updatedAt: serverTimestamp()
      });
    });

    const stayRef = doc(db, "properties", propertyId, "stays", stayId);
    batch.update(stayRef, {
      status: 'active',
      checkOutActual: null,
      updatedAt: serverTimestamp()
    });

    const cabinRef = doc(db, "properties", propertyId, "cabins", cabinId);
    batch.update(cabinRef, {
      status: 'occupied',
      currentStayId: stayId
    });

    await batch.commit();

    await AuditService.log({
      propertyId,
      userId: actorId,
      userName: actorName,
      action: "UPDATE",
      entity: "STAY",
      entityId: stayId,
      details: `Check-out revertido. Estadia reativada e tarefa de limpeza cancelada.`
    });
    
    // Obs: Poderíamos adicionar lógica para deletar a mensagem de NPS da fila aqui, 
    // mas na maioria das operações isso não é bloqueante.
  },

  /**
   * Cancela uma estadia pendente
   */
  async cancelStay(propertyId: string, stayId: string, actorId: string, actorName: string) {
    const stayRef = doc(db, "properties", propertyId, "stays", stayId);
    
    await updateDoc(stayRef, {
      status: 'cancelled',
      updatedAt: serverTimestamp()
    });

    await AuditService.log({
      propertyId,
      userId: actorId,
      userName: actorName,
      action: "DELETE",
      entity: "STAY",
      entityId: stayId,
      details: "Reserva cancelada administrativamente."
    });
  },

  /**
   * Atualização manual de dados da ficha
   */
  async updateStayData(propertyId: string, stayId: string, data: Partial<Stay>, actorId: string, actorName: string) {
    const stayRef = doc(db, "properties", propertyId, "stays", stayId);
    await updateDoc(stayRef, { ...data, updatedAt: serverTimestamp() });

    await AuditService.log({
      propertyId,
      userId: actorId,
      userName: actorName,
      action: "UPDATE",
      entity: "STAY",
      entityId: stayId,
      details: "Ficha de hospedagem editada pela recepção.",
      newData: data
    });
  },

  // ==========================================
  // MÓDULO DE CONTA & CONSUMO (FOLIO) E HISTÓRICO
  // ==========================================

  async getStayFolio(propertyId: string, stayId: string): Promise<FolioItem[]> {
    const q = query(
      collection(db, "properties", propertyId, "stays", stayId, "folio"),
      orderBy("createdAt", "desc")
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as FolioItem));
  },

  async addFolioItemManual(propertyId: string, stayId: string, item: Omit<FolioItem, 'id' | 'createdAt' | 'status'>, actorId: string, actorName: string) {
    const batch = writeBatch(db);
    const itemId = uuidv4();
    
    const folioRef = doc(db, "properties", propertyId, "stays", stayId, "folio", itemId);
    batch.set(folioRef, {
      ...item,
      id: itemId,
      status: 'pending',
      createdAt: serverTimestamp()
    });

    const stayRef = doc(db, "properties", propertyId, "stays", stayId);
    batch.update(stayRef, { hasOpenFolio: true });

    await batch.commit();

    await AuditService.log({
      propertyId, userId: actorId, userName: actorName, action: "UPDATE", entity: "STAY", entityId: stayId,
      details: `Lançou item na conta: ${item.quantity}x ${item.description}`
    });
  },

  async toggleFolioItemStatus(propertyId: string, stayId: string, itemId: string, newStatus: 'pending' | 'paid', actorId: string, actorName: string) {
    const folioRef = doc(db, "properties", propertyId, "stays", stayId, "folio", itemId);
    await updateDoc(folioRef, { status: newStatus });

    const q = query(collection(db, "properties", propertyId, "stays", stayId, "folio"), where("status", "==", "pending"));
    const pendingSnap = await getDocs(q);
    
    const stayRef = doc(db, "properties", propertyId, "stays", stayId);
    await updateDoc(stayRef, { hasOpenFolio: !pendingSnap.empty });

    await AuditService.log({
      propertyId, userId: actorId, userName: actorName, action: "UPDATE", entity: "STAY", entityId: stayId,
      details: `Marcou o item da conta como ${newStatus === 'paid' ? 'Pago/Lançado' : 'Pendente'}.`
    });
  },

  async deleteFolioItem(propertyId: string, stayId: string, itemId: string, itemDescription: string, actorId: string, actorName: string) {
    const folioRef = doc(db, "properties", propertyId, "stays", stayId, "folio", itemId);
    await deleteDoc(folioRef);

    const q = query(collection(db, "properties", propertyId, "stays", stayId, "folio"), where("status", "==", "pending"));
    const pendingSnap = await getDocs(q);
    const stayRef = doc(db, "properties", propertyId, "stays", stayId);
    await updateDoc(stayRef, { hasOpenFolio: !pendingSnap.empty });

    await AuditService.log({
      propertyId, userId: actorId, userName: actorName, action: "DELETE", entity: "STAY", entityId: stayId,
      details: `Estornou o item da conta: ${itemDescription}`
    });
  },

  async archiveStay(propertyId: string, stayId: string, actorId: string, actorName: string) {
    const stayRef = doc(db, "properties", propertyId, "stays", stayId);
    await updateDoc(stayRef, { 
      status: 'archived',
      updatedAt: serverTimestamp() 
    });

    await AuditService.log({
      propertyId, userId: actorId, userName: actorName, action: "UPDATE", entity: "STAY", entityId: stayId,
      details: "Estadia arquivada."
    });
  }
};