import { supabase } from "@/lib/supabase";
import { Stay, MessageTemplate, WhatsAppMessage, AutomationTriggerEvent, Guest, Cabin, AutomationRule } from "@/types/aura";

export class AutomationService {
  static async triggerStructureBookingAutomation(propertyId: string, stayId: string, structureName: string, date: string, startTime: string, templateId: string, cancellationReason?: string) {
    if (!templateId) return;
    try {
      const { data: template } = await supabase.from('message_templates').select('*').eq('propertyId', propertyId).eq('id', templateId).single();
      if (!template) return;

      const { data: stay } = await supabase.from('stays').select('*').eq('id', stayId).single();
      if (!stay) return;

      const { data: guest } = await supabase.from('guests').select('*').eq('id', stay.guestId).single();
      if (!guest || !guest.phone) return;

      let cabin;
      if (stay.cabinId) {
        const { data: c } = await supabase.from('cabins').select('*').eq('id', stay.cabinId).single();
        if (c) cabin = c;
      }

      // Pre-compile structure variables
      let customBody = template.body
        .replace(/{{structure_name}}/g, structureName)
        .replace(/{{booking_date}}/g, new Date(date + "T00:00:00").toLocaleDateString('pt-BR', { timeZone: 'UTC' }))
        .replace(/{{booking_time}}/g, startTime);

      if (cancellationReason) {
        customBody = customBody.replace(/{{cancellation_reason}}/g, cancellationReason);
      }

      await this.queueMessage(
        propertyId,
        stayId,
        guest.phone,
        { ...template, body: customBody } as any,
        'structure_booking_confirmed',
        guest as any,
        cabin as any,
        stay as any,
        0 // Disparo imediato.
      );
    } catch (error) {
      console.error("Erro no gatilho de agendamento de estrutura:", error);
    }
  }

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
      const checkInDate = stay.checkIn ? new Date(stay.checkIn).toLocaleDateString('pt-BR') : "";
      const checkOutDate = stay.checkOut ? new Date(stay.checkOut).toLocaleDateString('pt-BR') : "";

      parsedText = parsedText.replace(/{{checkin_date}}/g, checkInDate);
      parsedText = parsedText.replace(/{{checkout_date}}/g, checkOutDate);

      const portalLink = `https://aaura.app/check-in`;
      parsedText = parsedText.replace(/{{portal_link}}/g, portalLink);
      parsedText = parsedText.replace(/{{access_code}}/g, stay.accessCode);

      const surveyLink = `https://aaura.app/feedback/${stay.id}`;
      parsedText = parsedText.replace(/{{survey_link}}/g, surveyLink);
    }

    return parsedText;
  }

  static getBodyForLanguage(template: MessageTemplate, language?: string): string {
    if (language === 'en' && template.body_en) return template.body_en;
    if (language === 'es' && template.body_es) return template.body_es;
    return template.body; // fallback: PT
  }

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
      const body = this.getBodyForLanguage(template, guest.preferredLanguage);
      const finalMessageBody = this.parseVariables(body, guest, cabin, stay);

      const now = new Date();
      if (delayMinutes > 0) {
        now.setMinutes(now.getMinutes() + delayMinutes);
      }

      const ignoreQuietHours = ['welcome_checkin', 'checkout_thanks'];

      if (!ignoreQuietHours.includes(triggerEvent)) {
        let brtHour = parseInt(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false }), 10);

        if (brtHour >= 21 || brtHour < 8) {
          while (brtHour !== 8) {
            now.setHours(now.getHours() + 1);
            brtHour = parseInt(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false }), 10);
          }
          now.setMinutes(0, 0, 0);
        }
      }

      const cleanPhone = toNumber.replace(/\D/g, '');
      const messageId = crypto.randomUUID();

      const queuedMessage = {
        id: messageId,
        propertyId,
        contactId: cleanPhone,
        stayId,
        to: cleanPhone,
        body: finalMessageBody,
        direction: 'outbound',
        isAutomated: true,
        triggerEvent,
        scheduledFor: now.toISOString(),
        status: 'pending',
        attempts: 0,
        createdAt: new Date().toISOString()
      };

      const { error } = await supabase.from('messages').insert(queuedMessage);
      if (error) throw error;

      return { success: true, messageId };
    } catch (error) {
      console.error("Erro ao enfileirar mensagem automática:", error);
      return { success: false, error: "Falha ao colocar mensagem na fila." };
    }
  }

  static async retryFailedMessage(propertyId: string, messageId: string): Promise<boolean> {
    try {
      const pastTime = new Date();
      pastTime.setMinutes(pastTime.getMinutes() - 1);

      const { error } = await supabase.from('messages').update({
        status: 'pending',
        attempts: 0,
        scheduledFor: pastTime.toISOString(),
        errorMessage: null,
      }).eq('id', messageId).eq('propertyId', propertyId);

      return !error;
    } catch (error) {
      console.error("Erro ao tentar reenviar mensagem:", error);
      return false;
    }
  }

  static async editAndRetryMessage(propertyId: string, messageId: string, newPhone: string): Promise<boolean> {
    try {
      const cleanPhone = newPhone.replace(/\D/g, '');
      const pastTime = new Date();
      pastTime.setMinutes(pastTime.getMinutes() - 1);

      const { error } = await supabase.from('messages').update({
        to: cleanPhone,
        status: 'pending',
        attempts: 0,
        scheduledFor: pastTime.toISOString(),
        errorMessage: null,
      }).eq('id', messageId).eq('propertyId', propertyId);

      return !error;
    } catch (error) {
      console.error("Erro ao tentar editar e reenviar mensagem:", error);
      return false;
    }
  }

  static async cancelMessage(propertyId: string, messageId: string): Promise<boolean> {
    try {
      const { error } = await supabase.from('messages')
        .update({ status: 'cancelled' })
        .eq('id', messageId)
        .eq('propertyId', propertyId)
        .in('status', ['pending', 'failed']);

      return !error;
    } catch (error) {
      console.error("Erro ao cancelar mensagem:", error);
      return false;
    }
  }

  static async cancelMessagesBatch(propertyId: string, messageIds: string[]): Promise<boolean> {
    try {
      const { error } = await supabase.from('messages')
        .update({ status: 'cancelled' })
        .in('id', messageIds)
        .eq('propertyId', propertyId)
        .in('status', ['pending', 'failed']);

      return !error;
    } catch (error) {
      console.error("Erro ao cancelar mensagens em lote:", error);
      return false;
    }
  }

  static async getTemplates(propertyId: string): Promise<MessageTemplate[]> {
    try {
      const { data } = await supabase.from('message_templates').select('*').eq('propertyId', propertyId);
      return (data || []) as MessageTemplate[];
    } catch (error) {
      return [];
    }
  }

  static async saveTemplate(propertyId: string, templateData: Partial<MessageTemplate> & { id?: string }): Promise<boolean> {
    try {
      const id = templateData.id || crypto.randomUUID();
      const payload: any = {
        id,
        name: templateData.name,
        body: templateData.body,
        body_en: templateData.body_en || null,
        body_es: templateData.body_es || null,
        propertyId,
        updatedAt: new Date().toISOString()
      };

      if (!templateData.id) {
        payload.createdAt = new Date().toISOString();
      }

      const { error } = await supabase.from('message_templates').upsert(payload);
      return !error;
    } catch (error) {
      return false;
    }
  }

  static async deleteTemplate(propertyId: string, templateId: string): Promise<boolean> {
    try {
      const { error } = await supabase.from('message_templates').delete().eq('id', templateId).eq('propertyId', propertyId);
      return !error;
    } catch (error) {
      return false;
    }
  }

  static async getRules(propertyId: string): Promise<AutomationRule[]> {
    try {
      const { data } = await supabase.from('automation_rules').select('*').eq('propertyId', propertyId);

      const allTriggers: AutomationTriggerEvent[] = [
        'pre_checkin_48h', 'pre_checkin_24h', 'welcome_checkin',
        'pre_checkout', 'checkout_thanks', 'nps_survey', 'structure_booking_confirmed'
      ];

      const existingIds = new Set((data || []).map((r: any) => r.id));
      const missingTriggers = allTriggers.filter((t: any) => !existingIds.has(t));

      if (missingTriggers.length > 0) {
        const newRules = missingTriggers.map((trigger: any) => ({
          id: trigger,
          triggerEvent: trigger,
          propertyId,
          active: false,
          templateId: "",
          delayMinutes: 0,
          updatedAt: new Date().toISOString()
        }));

        await supabase.from('automation_rules').upsert(newRules, { onConflict: 'id' });
        return [...(data || []), ...newRules] as unknown as AutomationRule[];
      }

      return data as AutomationRule[];
    } catch (error) {
      return [];
    }
  }

  static async updateRule(propertyId: string, ruleId: string, data: Partial<AutomationRule>): Promise<boolean> {
    try {
      const { error, count } = await supabase.from('automation_rules')
        .update({ ...data, updatedAt: new Date().toISOString() })
        .eq('id', ruleId)
        .eq('propertyId', propertyId)
        .select('id', { count: 'exact', head: true });

      if (error) {
        console.error("updateRule error:", error);
        return false;
      }

      // Se nenhuma linha foi afetada, tenta upsert
      if (count === 0) {
        const { error: upsertError } = await supabase.from('automation_rules').upsert({
          id: ruleId,
          triggerEvent: ruleId,
          propertyId,
          ...data,
          updatedAt: new Date().toISOString()
        }, { onConflict: 'id' });

        if (upsertError) {
          console.error("updateRule upsert fallback error:", upsertError);
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error("updateRule exception:", error);
      return false;
    }
  }
}