// src/services/stay-service.ts
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
  collectionGroup
} from "firebase/firestore";
import { Stay, Guest, Cabin } from "@/types/aura";
import { v4 as uuidv4 } from 'uuid';
import { AuditService } from "./audit-service";

export const StayService = {
  /**
   * Gera um código de acesso único dentro da sub-coleção de estadias da propriedade
   */
  async generateUniqueAccessCode(propertyId: string): Promise<string> {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    let isUnique = false;

    while (!isUnique) {
      code = Array.from({ length: 5 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
      
      // Busca apenas dentro das estadias desta propriedade específica
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
      // CAMINHO ANINHADO: properties/{pid}/stays/{sid}
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
    // Procura o código em todas as sub-coleções "stays" do banco
    const q = query(
      collectionGroup(db, "stays"), 
      where("accessCode", "==", accessCode.toUpperCase()),
      where("status", "in", ["pending", "pre_checkin_done"])
    );
    
    const snap = await getDocs(q);
    
    const stays = await Promise.all(snap.docs.map(async (d) => {
      const data = d.data() as Stay;
      // Busca a cabana no caminho aninhado correto
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
  },

  /**
   * Check-out Físico e Liberação de Cabana
   */
  async performCheckOut(propertyId: string, stayId: string, actorId: string, actorName: string) {
    const stayRef = doc(db, "properties", propertyId, "stays", stayId);
    const staySnap = await getDoc(stayRef);
    const cabinId = staySnap.data()?.cabinId;

    const batch = writeBatch(db);

    // Finaliza Estadia
    batch.update(stayRef, {
      status: 'finished',
      checkOutActual: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    // Envia Cabana para Limpeza
    const cabinRef = doc(db, "properties", propertyId, "cabins", cabinId);
    batch.update(cabinRef, {
      status: 'cleaning',
      currentStayId: null
    });

    await batch.commit();

    await AuditService.log({
      propertyId,
      userId: actorId,
      userName: actorName,
      action: "CHECKOUT",
      entity: "STAY",
      entityId: stayId,
      details: `Check-out realizado. Unidade ${cabinId} enviada para limpeza.`
    });

    return { success: true };
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
  }
};