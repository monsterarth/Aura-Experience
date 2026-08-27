// src/app/api/guest/events/route.ts
//
// Programação publicada, para o portal do hóspede (superfície anônima).
//
// Conteúdo público da pousada — não há dado de hóspede aqui, então basta o
// propertyId (mesma regra de /api/guest/breakfast-menu). O que muda é que a
// leitura sai do navegador: `events` é uma das tabelas que a fase 0E revoga.
//
// A allowlist de colunas existe porque a tabela `events` tem campos internos
// (rascunho, notas de produção); só sai o que o hóspede precisa ver.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { notEndedBefore } from "@/lib/event-dates";

export const dynamic = "force-dynamic";

// Fora de propósito: `privateEventId` (vínculo com evento fechado/casamento) e os
// campos de controle interno. O filtro de linhas é o MESMO de antes
// (status = 'published'), para a migração não mudar o que o hóspede vê.
const PUBLIC_COLUMNS =
  "id, propertyId, title, titleEn, titleEs, description, descriptionEn, descriptionEs, " +
  "type, category, visibility, featured, startDate, endDate, startTime, endTime, " +
  "location, locationUrl, imageUrl, externalUrl, price, priceDescription, maxCapacity, status";

export async function GET(req: NextRequest) {
  if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const propertyId = searchParams.get("propertyId");
  const from = searchParams.get("from"); // YYYY-MM-DD

  if (!propertyId) return NextResponse.json({ error: "Missing propertyId" }, { status: 400 });

  let query = supabaseAdmin
    .from("events")
    .select(PUBLIC_COLUMNS)
    .eq("propertyId", propertyId)
    .eq("status", "published")
    .order("startDate", { ascending: true });

  // Multi-dia: o corte é pelo FIM do evento, não pelo início. Com `.gte` um
  // evento de 31/12 a 02/01 sumia da lista no dia 1º — para o hóspede, no meio
  // do evento. E `from` é interpolado no `.or()`, então data inválida vira 400
  // em vez de filtro reescrito pelo cliente.
  if (from) {
    const notEnded = notEndedBefore(from);
    if (!notEnded) return NextResponse.json({ error: "Invalid from" }, { status: 400 });
    query = query.or(notEnded);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ events: data ?? [] });
}
