// src/app/api/cron/rh-materialize/route.ts
//
// Diário: mantém a escala materializada rolando para a frente — o mês corrente e
// os dois seguintes, para toda propriedade com o módulo `rh` ligado.
//
// Por que existe: a escala é gerada, não calculada na hora. Sem alguém empurrando
// a janela, chega o dia 1º de um mês que ninguém abriu no admin e a grade está
// vazia. O gerador é idempotente por (staffId, date) e PRESERVA o que foi
// ajustado à mão, então rodar todo dia não desfaz trabalho de ninguém.
//
// Regra 3 da modularização: cron novo nasce com gate. A varredura pula a
// propriedade cujo módulo está desligado, em vez de gerar escala para quem não
// contratou — foi assim que 348 sessões de café fantasma apareceram no banco.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { isModuleOn } from "@/lib/modules";
import { HRService } from "@/services/hr-service";
import { daysOfMonth, addDaysYMD } from "@/lib/schedule-engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** O dia da pousada em BRT. O servidor roda em UTC e viraria o mês três horas cedo. */
function todayBrt(): string {
  return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
}

async function writeCronLog(details: string, newData: object) {
  try {
    await supabaseAdmin.from("audit_logs").insert({
      id: crypto.randomUUID(), propertyId: "system", userId: "cron", userName: "Sistema (Cron)",
      action: "CRON_RH_MATERIALIZE", entity: "CRON", entityId: "rh-materialize",
      details, newData, timestamp: new Date().toISOString(),
    });
  } catch (e) { console.error("[Audit] Falha ao gravar log de cron:", e); }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Unauthorized via CRON" }, { status: 401 });
  }
  const startedAt = new Date().toISOString();

  try {
    const { data, error } = await supabaseAdmin.from("properties").select("id, settings");
    if (error) throw new Error(error.message);

    const hoje = todayBrt();
    const inicio = daysOfMonth(hoje.slice(0, 7))[0];
    // Três meses de janela: o mês corrente mais dois. Quem monta a escala
    // costuma adiantar o mês seguinte, e o terceiro é folga para o cron falhar
    // um dia sem ninguém perceber.
    const mes2 = addDaysYMD(daysOfMonth(hoje.slice(0, 7)).slice(-1)[0], 1);
    const mes3 = addDaysYMD(daysOfMonth(mes2.slice(0, 7)).slice(-1)[0], 1);
    const fim = daysOfMonth(mes3.slice(0, 7)).slice(-1)[0];

    const resultados: Array<{ propertyId: string; gravados: number; preservados: number }> = [];
    let puladas = 0;

    for (const p of (data ?? []) as Array<{ id: string; settings: unknown }>) {
      if (!isModuleOn(p.settings, "rh")) { puladas++; continue; }
      const r = await HRService.materialize(p.id, inicio, fim);
      resultados.push({ propertyId: p.id, ...r });
    }

    const gravados = resultados.reduce((a, r) => a + r.gravados, 0);
    const preservados = resultados.reduce((a, r) => a + r.preservados, 0);

    await writeCronLog(
      `${gravados} dia(s) de escala gerados em ${resultados.length} propriedade(s); ${preservados} ajuste(s) manual(is) preservado(s); ${puladas} sem o módulo.`,
      { resultados, puladas, inicio, fim, startedAt, finishedAt: new Date().toISOString() },
    );

    return NextResponse.json({ success: true, inicio, fim, gravados, preservados, puladas, resultados });
  } catch (e) {
    console.error("[Cron rh-materialize] Erro:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao materializar a escala." },
      { status: 500 },
    );
  }
}
