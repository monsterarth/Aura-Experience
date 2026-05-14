import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { WhatsAppMessage } from "@/types/aura";

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

    for (const msgDoc of snapshot) {
      const msg = msgDoc as any as WhatsAppMessage;

      await supabaseAdmin.from("messages").update({ status: "processing", updatedAt: new Date().toISOString() }).eq("id", msg.id);

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

        const { data: propertyDoc } = await supabaseAdmin
          .from("properties")
          .select("settings")
          .eq("id", msg.propertyId)
          .single();

        if (!propertyDoc) throw new Error("Propriedade não encontrada");

        const propertySettings = propertyDoc.settings as any;
        if (!propertySettings?.whatsappEnabled) {
          throw new Error("WhatsApp desligado na propriedade.");
        }

        const cfg = propertySettings.whatsappConfig ?? {};
        const apiUrl: string = cfg.apiUrl || process.env.EVOLUTION_API_URL || "";
        const apiKey: string = cfg.apiKey || process.env.EVOLUTION_API_KEY || "";
        const instanceName: string =
          cfg.instanceName ||
          cfg.instances?.[0]?.instanceName ||
          process.env.EVOLUTION_INSTANCE ||
          "";

        if (!apiUrl || !apiKey || !instanceName) throw new Error("Configuração da Evolution API ausente.");

        const baseUrl = apiUrl.endsWith("/") ? apiUrl.slice(0, -1) : apiUrl;

        const response = await fetch(`${baseUrl}/message/sendText/${encodeURIComponent(instanceName)}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: apiKey,
          },
          body: JSON.stringify({
            number: msg.to,
            text: msg.body,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          let errorMessage = "Erro na Evolution API";
          try {
            const errorJson = JSON.parse(errorText);
            errorMessage = errorJson.error || errorMessage;
          } catch {
            errorMessage = errorText;
          }
          throw new Error(errorMessage);
        }

        const responseData = await response.json();
        // Evolution API returns: { key: { id: "..." }, status: "PENDING" }
        const apiMessageId: string | null = responseData?.key?.id || null;
        const isoNow = new Date().toISOString();

        if (apiMessageId && apiMessageId !== msg.id) {
          // Registar com o ID externo da Evolution como messageIdApi
          await supabaseAdmin
            .from("messages")
            .update({
              status: "sent",
              messageIdApi: apiMessageId,
              attempts: (msg.attempts || 0) + 1,
              lastAttemptAt: isoNow,
              errorMessage: null,
            })
            .eq("id", msg.id);
        } else {
          await supabaseAdmin
            .from("messages")
            .update({
              status: "sent",
              attempts: (msg.attempts || 0) + 1,
              lastAttemptAt: isoNow,
              errorMessage: null,
            })
            .eq("id", msg.id);
        }

        successCount++;

        const humanDelay = Math.floor(Math.random() * (4000 - 2000 + 1)) + 2000;
        await sleep(humanDelay);

      } catch (error: any) {
        console.error(`Erro ao enviar mensagem ${msg.id}:`, error.message);
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
      { processed: snapshot.length, sent: successCount, failed: failCount, leftInQueue: count || 0, startedAt, finishedAt, durationMs: new Date(finishedAt).getTime() - new Date(startedAt).getTime() }
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
