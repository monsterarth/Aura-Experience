import { supabase } from "@/lib/supabase";
import { WhatsAppMessage, Property } from "@/types/aura";
import { AuditService } from "./audit-service";

export const WhatsAppService = {
  async enqueueMessage(
    messageData: Omit<WhatsAppMessage, "id" | "status" | "attempts" | "createdAt">,
    actorName: string,
    actorId: string
  ) {
    try {
      const id = crypto.randomUUID();

      const payload = {
        ...messageData,
        id,
        status: "pending",
        attempts: 0,
        createdAt: new Date().toISOString(),
      };

      const { error } = await supabase.from('messages').insert(payload);
      if (error) throw error;

      await AuditService.log({
        propertyId: messageData.propertyId,
        userId: actorId,
        userName: actorName,
        action: "MESSAGE_SENT",
        entity: "MESSAGE",
        entityId: id,
        details: `Mensagem enfileirada para ${messageData.to}`
      });

      return id;
    } catch (error) {
      console.error("[WhatsAppService] Falha ao enfileirar:", error);
      throw error;
    }
  },

  async processMessage(messageId: string, propertyConfig: Property['settings']['whatsappConfig']) {
    if (!propertyConfig) {
      throw new Error("Configuração de WhatsApp não encontrada para esta propriedade.");
    }

    try {
      const { data: msg } = await supabase.from('messages').select('attempts').eq('id', messageId).single();
      const currentAttempts = msg?.attempts || 0;

      await supabase.from('messages').update({
        attempts: currentAttempts + 1,
        lastAttemptAt: new Date().toISOString()
      }).eq('id', messageId);

      const response = await fetch(propertyConfig.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${propertyConfig.token}`
        },
        // TODO: Este método não é utilizado ativamente — o cron process-messages tem sua própria implementação.
        // Corrigir o payload caso venha a ser utilizado no futuro.
        body: JSON.stringify({ number: '', message: '' }),
      });

      if (!response.ok) throw new Error("API Offline ou Erro de Token.");

      await supabase.from('messages').update({ status: "sent" }).eq('id', messageId);

    } catch (error: any) {
      await supabase.from('messages').update({
        status: "failed",
        errorMessage: error.message
      }).eq('id', messageId);

      await AuditService.log({
        propertyId: "SYSTEM",
        userId: "SYSTEM_AURA",
        userName: "Aura Engine",
        action: "MESSAGE_FAILED",
        entity: "MESSAGE",
        entityId: messageId,
        details: `Falha no envio do WhatsApp: ${error.message}`
      });
    }
  },

  async resend(messageId: string, propertyId: string, actorName: string, actorId: string) {
    await supabase.from('messages').update({
      status: "queued",
      errorMessage: null
    }).eq('id', messageId);

    await AuditService.log({
      propertyId,
      userId: actorId,
      userName: actorName,
      action: "MESSAGE_RESENT",
      entity: "MESSAGE",
      entityId: messageId,
      details: "Solicitado reenvio manual da mensagem."
    });
  }
};