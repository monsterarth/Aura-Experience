// src/app/api/rh/meu-dia/route.ts
//
// A escala DA PRÓPRIA PESSOA. Substitui as três requisições que cada app de campo
// dispara hoje (`schedules` + `schedule-overrides` + `schedule-checkpoints`) para
// escrever uma linha de texto — seis apps × três chamadas, mais o cálculo rodando
// no navegador de cada um.
//
// Aberto a QUALQUER cargo logado de propósito: a pessoa só consegue ler a própria
// escala, porque o `staffId` vem da sessão e não da query. Não existe parâmetro
// para pedir a escala de outro — para isso existe `/api/admin/rh`, com cargo.
//
// Sem gate de módulo: com `rh` desligado a resposta simplesmente não tem padrão e
// o app mostra "Sem escala definida", que é o que ele já mostra hoje para as 16
// pessoas sem jornada cadastrada. Devolver 403 aqui quebraria a tela de perfil
// dos seis apps de campo numa propriedade que não contratou escala.
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api-auth";
import { HRService } from "@/services/hr-service";
import { addDaysYMD } from "@/lib/schedule-engine";

export const dynamic = "force-dynamic";

/**
 * O dia da pousada em BRT, decidido no SERVIDOR.
 *
 * Os cinco apps de campo montam a data com `toISOString()` sobre o horário local
 * do aparelho: depois das 21h em BRT isso já é o dia seguinte em UTC, e a pessoa
 * via a escala de amanhã achando que era a de hoje. Com a data saindo daqui, o
 * relógio do celular deixa de participar da conta.
 */
function todayBrt(): string {
  return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(request.url);
  const today = todayBrt();

  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  const from = fromParam && YMD_RE.test(fromParam) ? fromParam : today;
  const to = toParam && YMD_RE.test(toParam) ? toParam : from;

  // Teto de 62 dias: o consumidor mais faminto é a varredura de 30 dias do perfil
  // ("qual é a minha próxima folga"), e sem limite um parâmetro errado varreria
  // anos numa rota que qualquer logado alcança.
  if (to < from) return NextResponse.json({ error: "Período inválido." }, { status: 400 });
  const teto = addDaysYMD(from, 62);
  const fim = to > teto ? teto : to;

  if (!auth.staff.propertyId) {
    return NextResponse.json({ error: "Funcionário sem propriedade." }, { status: 400 });
  }

  try {
    const resposta = await HRService.getMeuDia(
      { id: auth.staff.id, propertyId: auth.staff.propertyId },
      from,
      fim,
      today,
    );
    return NextResponse.json(resposta);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao ler sua escala." },
      { status: 500 },
    );
  }
}
