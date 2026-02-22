import { 
  collection, doc, setDoc, getDoc, getDocs, query, where, orderBy, limit, serverTimestamp 
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Contact, ContactContext, Stay, Cabin } from "@/types/aura";

export class ContactService {
  /**
   * Limpa o número para virar o ID universal (Apenas números)
   */
  static formatPhoneId(phone: string): string {
    return phone.replace(/\D/g, '');
  }

  /**
   * Gatilho Invisível: Salva ou atualiza um contato na Agenda.
   * Chamaremos isso automaticamente ao criar um Guest ou fazer pré-checkin.
   */
  static async upsertContact(propertyId: string, name: string, phone: string, isGuest: boolean = false, guestId?: string): Promise<string | null> {
    try {
      if (!phone) return null;
      
      const phoneId = this.formatPhoneId(phone);
      if (!phoneId) return null;

      const contactRef = doc(db, "properties", propertyId, "contacts", phoneId);
      const contactSnap = await getDoc(contactRef);

      const payload: Partial<Contact> = {
        name,
        phone: phoneId,
        isGuest,
        updatedAt: serverTimestamp()
      };

      if (guestId) payload.guestId = guestId;

      if (!contactSnap.exists()) {
        payload.id = phoneId;
        payload.propertyId = propertyId;
        payload.createdAt = serverTimestamp();
      }

      await setDoc(contactRef, payload, { merge: true });
      return phoneId;
    } catch (error) {
      console.error("Erro ao sincronizar contato na agenda:", error);
      return null;
    }
  }

  /**
   * O RAIO-X: Descobre a situação do contato em relação às estadias
   */
  static async resolveContactContext(propertyId: string, phoneId: string): Promise<ContactContext> {
    const defaultContext: ContactContext = { status: 'none', message: "Contato sem histórico de estadias." };

    try {
      const contactSnap = await getDoc(doc(db, "properties", propertyId, "contacts", phoneId));
      if (!contactSnap.exists()) return defaultContext;
      
      const contact = contactSnap.data() as Contact;
      if (!contact.isGuest || !contact.guestId) {
        return { status: 'none', message: "Contato avulso (Não é hóspede)." };
      }

      // Busca estadias desse hóspede
      const staysQuery = query(
        collection(db, "properties", propertyId, "stays"),
        where("guestId", "==", contact.guestId),
        orderBy("checkIn", "desc") // Pega a mais recente/futura primeiro
      );
      
      const staysSnap = await getDocs(staysQuery);
      if (staysSnap.empty) return { status: 'none', message: "Hóspede cadastrado, mas sem estadias." };

      const stays = staysSnap.docs.map(d => ({ id: d.id, ...d.data() } as Stay));
      
      // Procura a estadia mais relevante: 1º Active, 2º Pending, 3º Finished
      let activeStay = stays.find(s => s.status === 'active');
      let pendingStay = stays.find(s => s.status === 'pending' || s.status === 'pre_checkin_done');
      let pastStay = stays.find(s => s.status === 'finished' || s.status === 'archived');

      const relevantStay = activeStay || pendingStay || pastStay;
      if (!relevantStay) return defaultContext;

      // Busca o nome da cabana
      let cabinName = "Acomodação";
      if (relevantStay.cabinId) {
        const cabinSnap = await getDoc(doc(db, "properties", propertyId, "cabins", relevantStay.cabinId));
        if (cabinSnap.exists()) cabinName = (cabinSnap.data() as Cabin).name;
      }

      if (activeStay) {
        return {
          status: 'active',
          stayId: activeStay.id,
          cabinName,
          checkIn: activeStay.checkIn?.toDate(),
          checkOut: activeStay.checkOut?.toDate(),
          message: `🟢 Hospedado agora em: ${cabinName}`
        };
      }

      if (pendingStay) {
        const checkInStr = pendingStay.checkIn?.toDate().toLocaleDateString('pt-BR') || '';
        return {
          status: 'pending',
          stayId: pendingStay.id,
          cabinName,
          checkIn: pendingStay.checkIn?.toDate(),
          checkOut: pendingStay.checkOut?.toDate(),
          message: `🟡 Chega dia ${checkInStr} em: ${cabinName}`
        };
      }

      if (pastStay) {
        const checkOutStr = pastStay.checkOut?.toDate().toLocaleDateString('pt-BR') || '';
        return {
          status: 'past',
          stayId: pastStay.id,
          cabinName,
          checkIn: pastStay.checkIn?.toDate(),
          checkOut: pastStay.checkOut?.toDate(),
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