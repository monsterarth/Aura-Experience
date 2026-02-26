import { 
  collection, doc, setDoc, getDoc, getDocs, query, where, serverTimestamp 
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Contact, ContactContext, Stay, Cabin } from "@/types/aura";

// Helper robusto para lidar com diferentes formatos de Timestamp do Firebase/Frontend
function safeToDate(val: any): Date | null {
  if (!val) return null;
  if (val.toDate) return val.toDate(); // Firebase Timestamp
  if (val.seconds) return new Date(val.seconds * 1000); // Raw Timestamp object
  if (val instanceof Date) return val;
  return new Date(val); // Fallback para string ISO
}

export class ContactService {
  /**
   * Limpa o número para virar o ID universal (Apenas números)
   */
  static formatPhoneId(phone: string): string {
    return phone.replace(/\D/g, '');
  }

  /**
   * Salva ou atualiza um contato na Agenda.
   * Agora é à prova de "downgrade" (nunca tira o status de hóspede se já for um).
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
        updatedAt: serverTimestamp()
      };

      // Se estamos declarando explicitamente que é hóspede, atualizamos.
      if (isGuest) {
        payload.isGuest = true;
        if (guestId) payload.guestId = guestId;
      }

      if (!contactSnap.exists()) {
        payload.id = phoneId;
        payload.propertyId = propertyId;
        payload.createdAt = serverTimestamp();
        // Se for um contato novo criado via chat, por padrão não é hóspede ainda
        if (!isGuest) payload.isGuest = false; 
      }

      await setDoc(contactRef, payload, { merge: true });
      return phoneId;
    } catch (error) {
      console.error("Erro ao sincronizar contato na agenda:", error);
      return null;
    }
  }

  /**
   * O RAIO-X REVISADO: Motor de contexto de estadias
   */
  static async resolveContactContext(propertyId: string, phoneId: string): Promise<ContactContext> {
    const defaultContext: ContactContext = { status: 'none', message: "Contato sem histórico de estadias." };

    try {
      const contactSnap = await getDoc(doc(db, "properties", propertyId, "contacts", phoneId));
      if (!contactSnap.exists()) return defaultContext;
      
      const contact = contactSnap.data() as Contact;
      
      // Validação Estrita: Se não for hóspede fiscal, aborta a busca pesada
      if (!contact.isGuest || !contact.guestId) {
        return { status: 'none', message: "Contato avulso (Não é hóspede)." };
      }

      const staysQuery = query(
        collection(db, "properties", propertyId, "stays"),
        where("guestId", "==", contact.guestId)
      );
      
      const staysSnap = await getDocs(staysQuery);
      if (staysSnap.empty) return { status: 'none', message: "Hóspede cadastrado, mas sem estadias no sistema." };

      const stays = staysSnap.docs.map(d => ({ id: d.id, ...d.data() } as Stay));
      
      // Ordena pela data de check-in (do mais recente para o mais antigo) de forma segura
      stays.sort((a, b) => {
        const dateA = safeToDate(a.checkIn);
        const dateB = safeToDate(b.checkIn);
        return (dateB?.getTime() || 0) - (dateA?.getTime() || 0);
      });
      
      // Filtros tolerantes: Captura diversas nomenclaturas de status
      const activeStay = stays.find(s => ['active', 'in_house'].includes(s.status));
      const pendingStay = stays.find(s => ['pending', 'pre_checkin_done', 'reserved', 'confirmed'].includes(s.status));
      const pastStay = stays.find(s => ['finished', 'archived', 'checked_out'].includes(s.status));

      const relevantStay = activeStay || pendingStay || pastStay;
      if (!relevantStay) return defaultContext;

      // Busca o nome da cabana (se houver múltiplas cabanas na reserva, pega a primeira)
      let cabinName = "Acomodação";
      const mainCabinId = relevantStay.cabinConfigs?.[0]?.cabinId || relevantStay.cabinId;
      
      if (mainCabinId) {
        const cabinSnap = await getDoc(doc(db, "properties", propertyId, "cabins", mainCabinId));
        if (cabinSnap.exists()) cabinName = (cabinSnap.data() as Cabin).name;
      }

      const checkInDate = safeToDate(relevantStay.checkIn);
      const checkOutDate = safeToDate(relevantStay.checkOut);

      if (activeStay) {
        return {
          status: 'active',
          stayId: activeStay.id,
          cabinName,
          checkIn: checkInDate || undefined,
          checkOut: checkOutDate || undefined,
          message: `🟢 Hospedado agora em: ${cabinName}`
        };
      }

      if (pendingStay) {
        const checkInStr = checkInDate ? checkInDate.toLocaleDateString('pt-BR') : 'Breve';
        
        // Regra especial: Se o check-in é HOJE
        const isToday = checkInDate && checkInDate.toDateString() === new Date().toDateString();
        
        return {
          status: 'pending',
          stayId: pendingStay.id,
          cabinName,
          checkIn: checkInDate || undefined,
          checkOut: checkOutDate || undefined,
          message: isToday ? `🟡 Chega HOJE em: ${cabinName}` : `🟡 Chega dia ${checkInStr} em: ${cabinName}`
        };
      }

      if (pastStay) {
        const checkOutStr = checkOutDate ? checkOutDate.toLocaleDateString('pt-BR') : 'Data Indisponível';
        return {
          status: 'past',
          stayId: pastStay.id,
          cabinName,
          checkIn: checkInDate || undefined,
          checkOut: checkOutDate || undefined,
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