import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { WhatsAppMessage } from "@/types/aura";
import { parseEvolutionError, isSessionDownError } from "@/lib/evolution-error";
import { PropertySecretsService } from "@/services/property-secrets-service";
import { resolveEvolutionConfig, sendEvolutionText } from "@/lib/evolution";
import { whatsappNumberProblem } from "@/lib/phone";
import { WhatsAppHealthService } from "@/services/whatsapp-health-service";

async function writeCronLog(action: string, entityId: string, details: string, newData: object) {
  try {
    await supabaseAdmin.from('audit_logs').insert({
      id: crypto.randomUUID(),
      propertyId: 'system',
      userId: 'cron',
      userName: 'Sistema (Cron)',
      action,
      entity: 'CRON',
      entityId,
      details,
      newData,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[Audit] Falha ao gravar log de cron:', e);
  }
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date().toISOString();

  try {
    // Recovery: mensagens presas em "processing" por mais de 3 minutos SEM confirmação
    // da Evolution API (messageIdApi nulo) voltam para "pending" para reenvio.
    // Mensagens com messageIdApi preenchido já foram enviadas — marcamos como "sent".
    const stuckThreshold = new Date();
    stuckThreshold.setMinutes(stuckThreshold.getMinutes() - 3);
    await supabaseAdmin
      .from("messages")
      .update({ status: "sent" })
      .eq("status", "processing")
      .lt("updatedAt", stuckThreshold.toISOString())
      .not("messageIdApi", "is", null);
    await supabaseAdmin
      .from("messages")
      .update({ status: "pending" })
      .eq("status", "processing")
      .lt("updatedAt", stuckThreshold.toISOString())
      .is("messageIdApi", null);

    const now = new Date();
    now.setMinutes(now.getMinutes() + 1);
    const timeLimit = now.toISOString();

    const { data: snapshot, error: fetchError } = await supabaseAdmin
      .from("messages")
      .select("*")
      .eq("status", "pending")
      .lte("scheduledFor", timeLimit)
      .limit(15);

    if (fetchError) throw fetchError;

    if (!snapshot || snapshot.length === 0) {
      return NextResponse.json({ success: true, processed: 0, message: "Fila vazia. Nenhuma ação necessária." });
    }

    let successCount = 0;
    let failCount = 0;
    // Para o vigia: propriedades cujos envios falharam com assinatura de sessão morta,
    // e todas as que este ciclo tocou (para o aviso de recuperação).
    const sessionDownProps = new Set<string>();
    const touchedProps = new Set<string>();

    for (const msgDoc of snapshot) {
      const msg = msgDoc as any as WhatsAppMessage;
      if (msg.propertyId) touchedProps.add(msg.propertyId);

      const { error: markErr } = await supabaseAdmin
        .from("messages")
        .update({ status: "processing", updatedAt: new Date().toISOString() })
        .eq("id", msg.id);
      if (markErr) {
        console.error(`[Cron] Falha ao marcar mensagem ${msg.id} como processing:`, markErr.message);
        continue;
      }

      try {
        // Re-check: se a mensagem foi cancelada entre o fetch e o update, abortar
        const { data: freshMsg } = await supabaseAdmin
          .from("messages")
          .select("status")
          .eq("id", msg.id)
          .single();
        if (!freshMsg || freshMsg.status !== "processing") {
          continue;
        }

        // requireEnabled: só o cron respeita o desligamento do WhatsApp na propriedade
        // (o envio manual segue permitido de propósito — ver @/lib/evolution).
        // O modo seguro é tratado dentro de sendEvolutionText.
        const cfg = await resolveEvolutionConfig(msg.propertyId, { requireEnabled: true });
        if (!cfg.ok) throw new Error(cfg.message);

        // Número que a Evolution vai recusar de qualquer jeito. Falha JÁ, com a
        // causa por extenso: cadastro sem DDI não se conserta em três tentativas,
        // e o "Bad Request" genérico foi o que escondeu 22 falhas por cinco meses.
        // Consertar o número aqui está fora de questão — ver src/lib/phone.ts.
        const numberProblem = whatsappNumberProblem(msg.to);
        if (numberProblem) {
          console.error(`[process-messages] ${numberProblem} (msg ${msg.id})`);
          await supabaseAdmin
            .from("messages")
            .update({
              status: "failed",
              attempts: (msg.attempts || 0) + 1,
              lastAttemptAt: new Date().toISOString(),
              errorMessage: numberProblem,
            })
            .eq("id", msg.id);
          failCount++;
          continue;
        }

        // whatsappNumberProblem() acima já barrou número ausente/inválido.
        const to = msg.to as string;
        const sent = await sendEvolutionText(cfg.config, to, msg.body, `process-messages msg ${msg.id}`);
        if (!sent.ok) throw new Error(sent.errorMessage);

        await supabaseAdmin
          .from("messages")
          .update({
            status: "sent",
            // Só grava o id externo quando a Evolution devolveu um diferente do nosso.
            ...(sent.apiMessageId && sent.apiMessageId !== msg.id
              ? { messageIdApi: sent.apiMessageId }
              : {}),
            attempts: (msg.attempts || 0) + 1,
            lastAttemptAt: new Date().toISOString(),
            errorMessage: null,
          })
          .eq("id", msg.id);

        successCount++;

        // A pausa existe para não parecer robô na Evolution. No modo seguro nada saiu,
        // então esperar só faria a fila do DEV arrastar (era `continue` antes).
        if (!sent.safeMode) {
          const humanDelay = Math.floor(Math.random() * (4000 - 2000 + 1)) + 2000;
          await sleep(humanDelay);
        }

      } catch (error: any) {
        console.error(`Erro ao enviar mensagem ${msg.id}:`, error.message);
        if (isSessionDownError(error?.message) && msg.propertyId) {
          sessionDownProps.add(msg.propertyId);
        }
        const nextAttempts = (msg.attempts || 0) + 1;
        const isoNow = new Date().toISOString();

        if (nextAttempts >= 3) {
          await supabaseAdmin
            .from("messages")
            .update({
              status: "failed",
              attempts: nextAttempts,
              lastAttemptAt: isoNow,
              errorMessage: error.message || "Erro desconhecido",
            })
            .eq("id", msg.id);
        } else {
          const retryTime = new Date();
          retryTime.setMinutes(retryTime.getMinutes() + 5);

          await supabaseAdmin
            .from("messages")
            .update({
              status: "pending",
              attempts: nextAttempts,
              scheduledFor: retryTime.toISOString(),
              lastAttemptAt: isoNow,
              errorMessage: `Falha na tentativa ${nextAttempts}: ${error.message}`,
            })
            .eq("id", msg.id);
        }
        failCount++;
      }
    }

    // Vigia: o resultado dos envios REAIS acima é o único sinal honesto de sessão morta
    // (connectionState/fetchInstances mentem "open"). Ciclo 100% falho com assinatura de
    // sessão → tenta recuperar (restart via Coolify + push). Ciclo com sucesso → fecha
    // incidente aberto. Falha do vigia nunca derruba o cron.
    let watchdog: string | undefined;
    try {
      if (successCount === 0 && sessionDownProps.size > 0) {
        const w = await WhatsAppHealthService.checkAndRecover("fila", Array.from(sessionDownProps));
        watchdog = `${w.verdict}:${w.acted}`;
      } else if (successCount > 0) {
        await WhatsAppHealthService.notifyRecoveredIfNeeded(Array.from(touchedProps));
      }
    } catch (e) {
      console.error("[process-messages] vigia falhou:", e);
    }

    const { count } = await supabaseAdmin
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending")
      .lte("scheduledFor", timeLimit);

    const finishedAt = new Date().toISOString();
    await writeCronLog(
      'CRON_PROCESS_MESSAGES',
      'process-messages',
      `${snapshot.length} mensagem(ns) processada(s): ${successCount} enviada(s), ${failCount} com falha/adiada(s)`,
      { processed: snapshot.length, sent: successCount, failed: failCount, leftInQueue: count || 0, watchdog, startedAt, finishedAt, durationMs: new Date(finishedAt).getTime() - new Date(startedAt).getTime() }
    );
    return NextResponse.json({
      success: true,
      processed: snapshot.length,
      leftInQueue: count || 0,
      results: { sent: successCount, delayed_or_failed: failCount },
    });

  } catch (error: any) {
    console.error("Erro no Processador da Fila (Cron):", error);
    const finishedAt = new Date().toISOString();
    await writeCronLog(
      'CRON_PROCESS_MESSAGES',
      'process-messages',
      `ERRO: ${error.message}`,
      { startedAt, finishedAt, durationMs: new Date(finishedAt).getTime() - new Date(startedAt).getTime(), error: error.message }
    );
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
