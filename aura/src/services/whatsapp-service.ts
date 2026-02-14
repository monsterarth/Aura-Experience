// src/services/whatsapp-service.ts
import { db } from "@/lib/firebase";
import { collection, addDoc, doc, updateDoc, serverTimestamp, increment } from "firebase/firestore";
import { WhatsAppMessage, Property } from "@/types/aura";
import { AuditService } from "./audit-service";

/**
 * WhatsAppService: Sistema de mensageria assíncrona do Aura.
 */
export const WhatsAppService = {
  /**
   * Enfileira uma mensagem para envio na coleção de outbox.
   */
  async enqueueMessage(
    messageData: Omit<WhatsAppMessage, "id" | "status" | "attempts" | "createdAt">,
    actorName: string,
    actorId: string
  ) {
    try {
      const messageRef = collection(db, "messages");
      const docRef = await addDoc(messageRef, {
        ...messageData,
        status: "queued",
        attempts: 0,
        createdAt: serverTimestamp(),
      });

      // Log de envio
      await AuditService.log({
        propertyId: messageData.propertyId,
        userId: actorId,
        userName: actorName,
        action: "MESSAGE_SENT",
        entity: "MESSAGE",
        entityId: docRef.id,
        details: `Mensagem enfileirada para ${messageData.to}`
      });

      return docRef.id;
    } catch (error) {
      console.error("[WhatsAppService] Falha ao enfileirar:", error);
      throw error;
    }
  },

  /**
   * Processa o envio real chamando a API externa.
   */
  async processMessage(messageId: string, propertyConfig: Property['settings']['whatsappConfig']) {
    const messageRef = doc(db, "messages", messageId);

    if (!propertyConfig) {
      throw new Error("Configuração de WhatsApp não encontrada para esta propriedade.");
    }

    try {
      await updateDoc(messageRef, {
        attempts: increment(1),
        lastAttemptAt: serverTimestamp()
      });

      // Simulação da chamada de API do Synapse / Aura
      const response = await fetch(propertyConfig.apiUrl, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${propertyConfig.token}` 
        },
        body: JSON.stringify({ /* payload */ }),
      });

      if (!response.ok) throw new Error("API Offline ou Erro de Token.");

      await updateDoc(messageRef, { status: "sent" });

    } catch (error: any) {
      await updateDoc(messageRef, { 
        status: "failed",
        errorMessage: error.message 
      });

      // Log de falha na auditoria
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

  /**
   * Reenvia uma mensagem que falhou.
   */
  async resend(messageId: string, propertyId: string, actorName: string, actorId: string) {
    const messageRef = doc(db, "messages", messageId);
    
    await updateDoc(messageRef, {
      status: "queued",
      errorMessage: null
    });

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