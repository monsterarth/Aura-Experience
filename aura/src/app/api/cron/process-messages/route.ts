import { NextResponse } from "next/server";
import { MessageQueueService } from "@/services/message-queue-service";

// Força a execução dinâmica, vital para rotas de Cron na Vercel
export const dynamic = 'force-dynamic';

const WHATSAPP_SERVICE_URL = process.env.WHATSAPP_SERVICE_URL || "http://localhost:3001";
const WHATSAPP_API_KEY = process.env.WHATSAPP_API_KEY || "Fazenda@2025";

export async function GET(request: Request) {
  try {
    // 1. Validar autenticação do Cron (Segurança da Vercel)
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // 2. Busca até 50 mensagens pendentes
    const pendingJobs = await MessageQueueService.getPendingMessages(50);

    if (pendingJobs.length === 0) {
      return NextResponse.json({ message: "No pending messages to process." }, { status: 200 });
    }

    const results = {
      success: 0,
      failed: 0,
    };

    // 3. Processa cada mensagem (usando Promise.all para performance, ou for...of para evitar banimento)
    // Para WhatsApp, recomendo for...of para adicionar um pequeno delay e evitar bloqueio por SPAM.
    for (const job of pendingJobs) {
      if (!job.id) continue;

      // Trava a mensagem para não ser processada duas vezes se o cron sobrepor
      await MessageQueueService.updateMessageStatus(job.id, "processing");

      try {
        const response = await fetch(`${WHATSAPP_SERVICE_URL}/api/send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": WHATSAPP_API_KEY
          },
          body: JSON.stringify({
            number: job.to,
            message: job.body
          })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP Error ${response.status}`);
        }

        // Sucesso
        await MessageQueueService.updateMessageStatus(job.id, "sent");
        results.success++;
        
        // Pequeno delay de 1.5s entre mensagens para o WhatsApp não te bloquear
        await new Promise(resolve => setTimeout(resolve, 1500));

      } catch (error: any) {
        // Falha: Reverte para failed, incrementa tentativa
        await MessageQueueService.updateMessageStatus(job.id, "failed", error.message || "Unknown error");
        results.failed++;
      }
    }

    return NextResponse.json({ 
      message: "Cron execution finished", 
      processed: pendingJobs.length,
      results 
    }, { status: 200 });

  } catch (error: any) {
    console.error("[CRON] Error processing messages:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}