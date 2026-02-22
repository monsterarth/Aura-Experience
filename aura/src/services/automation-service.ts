import { 
  collection, 
  doc, 
  setDoc, 
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp, 
  Timestamp 
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Stay, MessageTemplate, WhatsAppMessage, AutomationTriggerEvent, Guest, Cabin, AutomationRule } from "@/types/aura";

export class AutomationService {
  /**
   * Substitui as variáveis mágicas do template pelos dados reais da reserva.
   */
  static parseVariables(
    templateBody: string, 
    guest: Guest, 
    cabin?: Cabin, 
    stay?: Stay
  ): string {
    let parsedText = templateBody;
    
    const firstName = guest.fullName.split(" ")[0];
    parsedText = parsedText.replace(/{{guest_name}}/g, firstName);
    parsedText = parsedText.replace(/{{guest_full_name}}/g, guest.fullName);
    
    if (cabin) {
      parsedText = parsedText.replace(/{{cabin_name}}/g, cabin.name);
      parsedText = parsedText.replace(/{{wifi_ssid}}/g, cabin.wifi?.ssid || "Fazenda do Rosa");
      parsedText = parsedText.replace(/{{wifi_password}}/g, cabin.wifi?.password || "Sem senha");
    }

    if (stay) {
      const checkInDate = stay.checkIn?.toDate ? stay.checkIn.toDate().toLocaleDateString('pt-BR') : "";
      const checkOutDate = stay.checkOut?.toDate ? stay.checkOut.toDate().toLocaleDateString('pt-BR') : "";
      
      parsedText = parsedText.replace(/{{checkin_date}}/g, checkInDate);
      parsedText = parsedText.replace(/{{checkout_date}}/g, checkOutDate);
      
      const portalLink = `https://app.fazendadorosa.com.br/check-in/login`;
      parsedText = parsedText.replace(/{{portal_link}}/g, portalLink);
      parsedText = parsedText.replace(/{{access_code}}/g, stay.accessCode);

      const surveyLink = `https://app.fazendadorosa.com.br/feedback/${stay.id}`;
      parsedText = parsedText.replace(/{{survey_link}}/g, surveyLink);
    }

    return parsedText;
  }

  /**
   * Coloca uma mensagem na Fila (DLQ) com Escudo Anti-Inconveniência.
   */
  static async queueMessage(
    propertyId: string,
    stayId: string,
    toNumber: string,
    template: MessageTemplate,
    triggerEvent: AutomationTriggerEvent,
    guest: Guest,
    cabin?: Cabin,
    stay?: Stay,
    delayMinutes: number = 0
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const finalMessageBody = this.parseVariables(template.body, guest, cabin, stay);

      const now = new Date();
      if (delayMinutes > 0) {
        now.setMinutes(now.getMinutes() + delayMinutes);
      }

      // --- ESCUDO DE HORÁRIO SILENCIOSO (21:00 às 07:59) ---
      // Ações de balcão (Check-in e Check-out na hora) furam o escudo.
      const ignoreQuietHours = ['welcome_checkin', 'checkout_thanks'];
      
      if (!ignoreQuietHours.includes(triggerEvent)) {
        // Pega a hora exata da data planejada no fuso de São Paulo (BRT)
        let brtHour = parseInt(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false }), 10);
        
        // Se cair de noite ou de madrugada
        if (brtHour >= 21 || brtHour < 8) { 
          // Avança o relógio hora a hora até bater 08:00 da manhã para não quebrar matemática de dias
          while (brtHour !== 8) {
            now.setHours(now.getHours() + 1);
            brtHour = parseInt(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false }), 10);
          }
          // Zera os minutos para disparar às 08:00:00 em ponto
          now.setMinutes(0, 0, 0); 
        }
      }

      const messageRef = doc(collection(db, "properties", propertyId, "messages"));
      
      const queuedMessage: Omit<WhatsAppMessage, "id"> = {
        propertyId,
        stayId,
        to: toNumber,
        body: finalMessageBody,
        isAutomated: true,
        triggerEvent,
        scheduledFor: Timestamp.fromDate(now),
        status: 'pending',
        attempts: 0,
        createdAt: serverTimestamp()
      };

      await setDoc(messageRef, queuedMessage);
      return { success: true, messageId: messageRef.id };
    } catch (error) {
      console.error("Erro ao enfileirar mensagem automática:", error);
      return { success: false, error: "Falha ao colocar mensagem na fila." };
    }
  }

  static async retryFailedMessage(propertyId: string, messageId: string): Promise<boolean> {
    try {
      const messageRef = doc(db, "properties", propertyId, "messages", messageId);
      
      // Força para o passado (1 min) para o Cron apanhar instantaneamente
      const pastTime = new Date();
      pastTime.setMinutes(pastTime.getMinutes() - 1); 

      await updateDoc(messageRef, {
        status: 'pending',
        attempts: 0,
        scheduledFor: Timestamp.fromDate(pastTime),
        errorMessage: null,
      });
      return true;
    } catch (error) {
      console.error("Erro ao tentar reenviar mensagem:", error);
      return false;
    }
  }

  // ==========================================
  // GESTÃO DE TEMPLATES E REGRAS
  // ==========================================

  static async getTemplates(propertyId: string): Promise<MessageTemplate[]> {
    try {
      const snapshot = await getDocs(collection(db, "properties", propertyId, "message_templates"));
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MessageTemplate));
    } catch (error) {
      return [];
    }
  }

  static async saveTemplate(propertyId: string, templateData: Partial<MessageTemplate> & { id?: string }): Promise<boolean> {
    try {
      const isNew = !templateData.id;
      const ref = isNew 
        ? doc(collection(db, "properties", propertyId, "message_templates"))
        : doc(db, "properties", propertyId, "message_templates", templateData.id as string);

      const payload = {
        ...templateData,
        propertyId,
        updatedAt: serverTimestamp(),
        ...(isNew && { createdAt: serverTimestamp() })
      };

      await setDoc(ref, payload, { merge: true });
      return true;
    } catch (error) {
      return false;
    }
  }

  static async deleteTemplate(propertyId: string, templateId: string): Promise<boolean> {
    try {
      await deleteDoc(doc(db, "properties", propertyId, "message_templates", templateId));
      return true;
    } catch (error) {
      return false;
    }
  }

  static async getRules(propertyId: string): Promise<AutomationRule[]> {
    try {
      const rulesRef = collection(db, "properties", propertyId, "automation_rules");
      const snapshot = await getDocs(rulesRef);

      const allTriggers: AutomationTriggerEvent[] = [
        'pre_checkin_48h', 'pre_checkin_24h', 'welcome_checkin', 
        'pre_checkout', 'checkout_thanks', 'nps_survey'
      ];

      if (snapshot.empty) {
        const batch = writeBatch(db);
        const newRules: AutomationRule[] = [];

        for (const trigger of allTriggers) {
          const ruleRef = doc(rulesRef, trigger);
          const ruleData: Omit<AutomationRule, "updatedAt"> & { updatedAt: any } = {
            id: trigger, propertyId, active: false, templateId: "", delayMinutes: 0, updatedAt: serverTimestamp()
          };
          batch.set(ruleRef, ruleData);
          newRules.push(ruleData as unknown as AutomationRule);
        }
        await batch.commit();
        return newRules;
      }

      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AutomationRule));
    } catch (error) {
      return [];
    }
  }

  static async updateRule(propertyId: string, ruleId: string, data: Partial<AutomationRule>): Promise<boolean> {
    try {
      const ruleRef = doc(db, "properties", propertyId, "automation_rules", ruleId);
      await updateDoc(ruleRef, { ...data, updatedAt: serverTimestamp() });
      return true;
    } catch (error) {
      return false;
    }
  }
}