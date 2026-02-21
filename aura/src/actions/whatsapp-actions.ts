//src/actions/whatsapp-actions.ts

"use server";

import { MessageQueueService } from "@/services/message-queue-service";
import { revalidatePath } from "next/cache";

interface SendMessagePayload {
  propertyId: string;
  to: string; // Número do hóspede
  body: string; // Texto da mensagem
  scheduledFor?: Date; // Opcional: Se vazio, envia agora
}

export async function scheduleWhatsAppMessage({ propertyId, to, body, scheduledFor }: SendMessagePayload) {
  try {
    // Validação básica
    if (!to || !body) {
      return { success: false, error: "Número e mensagem são obrigatórios." };
    }

    // Se não passou data de agendamento, agenda para AGORA
    const sendDate = scheduledFor || new Date();

    // Adiciona na fila que construímos
    const jobId = await MessageQueueService.enqueueMessage({
      propertyId,
      to,
      body,
      scheduledFor: sendDate,
      maxRetries: 3, // Vai tentar 3 vezes se o celular do painel ficar sem internet
    });

    // Revalida a rota para atualizar qualquer painel de logs que você venha a criar
    revalidatePath("/admin/[propertyId]/comunicacao", "page");

    return { success: true, jobId };
  } catch (error: any) {
    console.error("[WhatsApp Action] Erro ao agendar mensagem:", error);
    return { success: false, error: error.message || "Erro interno ao agendar mensagem." };
  }
}