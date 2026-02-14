// src/services/stay-service.ts
import { db } from "@/lib/firebase";
import { 
  collection, doc, getDoc, updateDoc, writeBatch, 
  serverTimestamp, query, where, getDocs 
} from "firebase/firestore";
import { Stay, Guest, Cabin } from "@/types/aura";
import { v4 as uuidv4 } from 'uuid';
import { AuditService } from "./audit-service";

export const StayService = {
  // Gera código de acesso único (ex: A4B2K)
  async generateUniqueAccessCode(propertyId: string): Promise<string> {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    let isUnique = false;
    while (!isUnique) {
      code = Array.from({length: 5}, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
      const q = query(collection(db, "stays"), where("propertyId", "==", propertyId), where("accessCode", "==", code));
      const snap = await getDocs(q);
      if (snap.empty) isUnique = true;
    }
    return code;
  },

  // Método que faltava para a página /admin/stays/new
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
      const stayRef = doc(collection(db, "stays"), stayId);
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
        automationFlags: { send48h: params.sendAutomations, send24h: params.sendAutomations, preCheckinSent: false, remindersCount: 0 },
        createdAt: serverTimestamp()
      });
    });
    await batch.commit();
    return { accessCode };
  },

  async getStayWithGuest(stayId: string) {
    const stayDoc = await getDoc(doc(db, "stays", stayId));
    if (!stayDoc.exists()) return null;
    const stayData = { id: stayDoc.id, ...stayDoc.data() } as Stay;
    const guestDoc = await getDoc(doc(db, "properties", stayData.propertyId, "guests", stayData.guestId));
    return { stay: stayData, guest: guestDoc.exists() ? { id: guestDoc.id, ...guestDoc.data() } as Guest : null };
  },

  async completePreCheckin(stayId: string, stayUpdate: Partial<Stay>, guestUpdate: Partial<Guest>) {
    const stayRef = doc(db, "stays", stayId);
    const staySnap = await getDoc(stayRef);
    const pId = staySnap.data()?.propertyId;
    const gId = staySnap.data()?.guestId;

    const batch = writeBatch(db);
    batch.update(stayRef, { ...stayUpdate, status: 'pre_checkin_done', updatedAt: serverTimestamp() });
    batch.update(doc(db, "properties", pId, "guests", gId), { ...guestUpdate, updatedAt: serverTimestamp() });
    return batch.commit();
  },

  /**
   * Busca todas as estadias de um grupo ou apenas uma se for individual
   */
  async getGroupStays(accessCode: string) {
    const q = query(
      collection(db, "stays"), 
      where("accessCode", "==", accessCode.toUpperCase()),
      where("status", "in", ["pending", "pre_checkin_done"])
    );
    const snap = await getDocs(q);
    
    // Mapeia os dados e busca as cabanas para mostrar os nomes (Ex: "Cabana do Lago")
    const stays = await Promise.all(snap.docs.map(async (d) => {
      const data = d.data() as Stay;
      const cabinDoc = await getDoc(doc(db, "cabins", data.cabinId));
      return { 
        ...data, 
        id: d.id, 
        cabinName: cabinDoc.exists() ? cabinDoc.data().name : "Acomodação" 
      };
    }));
    
    return stays;
  },

  /**
   * Atribui um novo líder (guestId) a uma estadia específica do grupo
   */
  async assignLeaderToStay(stayId: string, guestData: { fullName: string, phone: string }) {
    // Aqui criaríamos um novo Guest ou usaríamos um existente
    // Por simplicidade para o teste, vamos atualizar apenas na Stay
    const stayRef = doc(db, "stays", stayId);
    await updateDoc(stayRef, {
      "tempLeaderName": guestData.fullName,
      "tempLeaderPhone": guestData.phone
    });
  },

  async getStayWithGuestAndCabin(stayId: string) {
    const stayDoc = await getDoc(doc(db, "stays", stayId));
    if (!stayDoc.exists()) return null;
    const stayData = { id: stayDoc.id, ...stayDoc.data() } as Stay;

    // Busca Hóspede
    const guestDoc = await getDoc(doc(db, "properties", stayData.propertyId, "guests", stayData.guestId));
    
    // Busca Cabana
    const cabinDoc = await getDoc(doc(db, "cabins", stayData.cabinId));

    return { 
      stay: stayData, 
      guest: guestDoc.exists() ? { id: guestDoc.id, ...guestDoc.data() } as Guest : null,
      cabin: cabinDoc.exists() ? { id: cabinDoc.id, ...cabinDoc.data() } as Cabin : null
    };
  },
};
