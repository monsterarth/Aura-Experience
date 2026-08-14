// src/app/api/cron/whatsapp-watchdog/route.ts
//
// Vigia independente da fila. A lógica principal roda de carona no `process-messages`
// (que enxerga o sinal mais honesto: envios reais falhando) — mas ela só acorda quando
// há mensagem para enviar. Este cron cobre o resto: processo travado (timeout na sonda)
// e queda admitida pela Evolution, mesmo com a fila parada.
//
// NÃO está no vercel.json (mesma opção do process-messages) — agende no cronjob.org,
// a cada 10–15 min. Toda a inteligência (veredito, cooldowns, push, auditoria) vive em
// src/services/whatsapp-health-service.ts.
import { NextResponse } from "next/server";
import { WhatsAppHealthService } from "@/services/whatsapp-health-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // ?dry=1 → só o veredito, sem reagir (sem restart, sem push, sem auditoria).
    // Serve para conferir o estado por URL sem medo de acordar ninguém.
    const dry = new URL(request.url).searchParams.get("dry");
    if (dry) {
      const a = await WhatsAppHealthService.assess();
      return NextResponse.json({ success: true, dry: true, ...a });
    }

    const result = await WhatsAppHealthService.checkAndRecover("vigia");
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error("[whatsapp-watchdog] erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
