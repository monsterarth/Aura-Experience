// Conta encerrada não recebe lançamento.
//
// `billClosedAt` é o portão entre "Ativas" e "Encerradas": encerrar marca os
// pendentes como pagos e tira a estadia do balcão. Até agora isso valia só na
// tela — a recepção deixava de ver o formulário, mas o garçom, o frigobar da
// camareira, o concierge e o cron das diárias continuavam escrevendo no fólio.
// Em produção 11 lançamentos entraram assim, depois do fecho, sem ninguém ver:
// 9 de frigobar e 2 de serviços.
//
// A regra agora é uma só e mora aqui: quem quiser lançar numa conta encerrada
// reabre a conta primeiro. Vale para todo caminho de escrita.
import { db } from "@/lib/supabase";

/** Código carregado no erro — as rotas traduzem para 409 + mensagem. */
export const FOLIO_CLOSED = "FOLIO_CLOSED";

export const FOLIO_CLOSED_MESSAGE =
  "Conta encerrada — reabra a conta para lançar.";

export function isFolioClosedError(e: unknown): boolean {
  return !!e && typeof e === "object" && (e as { code?: string }).code === FOLIO_CLOSED;
}

/**
 * Lança se a conta da estadia já estiver encerrada.
 *
 * Silencioso quando a estadia não é encontrada: quem chama já validou a posse,
 * e não é papel desta trava inventar um 404.
 */
export async function assertFolioOpen(stayId: string): Promise<void> {
  const { data, error } = await db()
    .from("stays")
    .select("billClosedAt")
    .eq("id", stayId)
    .maybeSingle();

  // Falha de leitura NÃO vira bloqueio: uma soluçada do banco não pode impedir a
  // recepção de lançar. Mas fica no log — trava que falha calada não é trava.
  if (error) {
    console.error(`[folio-guard] não consegui ler billClosedAt de ${stayId}:`, error.message);
    return;
  }
  if (data?.billClosedAt) {
    throw Object.assign(new Error(FOLIO_CLOSED_MESSAGE), { code: FOLIO_CLOSED });
  }
}
