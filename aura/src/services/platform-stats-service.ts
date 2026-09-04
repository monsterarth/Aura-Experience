// src/services/platform-stats-service.ts
//
// Contadores agregados da plataforma inteira (todas as propriedades) para a
// home institucional /aura. São números de marketing — nunca linhas, nunca
// dados pessoais: apenas count(*) com head:true (nenhuma row trafega).
import { supabaseAdmin } from '@/lib/supabase';

export interface PlatformStats {
  stays: number | null;
  guests: number | null;
  housekeepingTasks: number | null;
  /** Agendamentos que o próprio hóspede fez pelo portal — prova de autonomia. */
  portalBookings: number | null;
  messagesSent: number | null;
  surveyResponses: number | null;
}

async function countRows(table: string): Promise<number | null> {
  if (!supabaseAdmin) return null;
  try {
    const { count, error } = await supabaseAdmin
      .from(table)
      .select('*', { count: 'exact', head: true });
    if (error) {
      console.error(`[platform-stats] count ${table}:`, error.message);
      return null;
    }
    return count ?? null;
  } catch {
    return null;
  }
}

/** Mensagens de WhatsApp efetivamente enviadas (sent/delivered/read — nada de fila). */
async function countMessagesSent(): Promise<number | null> {
  if (!supabaseAdmin) return null;
  try {
    const { count, error } = await supabaseAdmin
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .in('status', ['sent', 'delivered', 'read']);
    if (error) {
      console.error('[platform-stats] count messages:', error.message);
      return null;
    }
    return count ?? null;
  } catch {
    return null;
  }
}

/** Todos os contadores em paralelo; cada um tolera falha isoladamente (null = oculta). */
export async function getPlatformStats(): Promise<PlatformStats> {
  const [stays, guests, housekeepingTasks, portalBookings, messagesSent, surveyResponses] =
    await Promise.all([
      countRows('stays'),
      countRows('guests'),
      countRows('housekeeping_tasks'),
      countRows('structure_bookings'),
      countMessagesSent(),
      countRows('survey_responses'),
    ]);
  return { stays, guests, housekeepingTasks, portalBookings, messagesSent, surveyResponses };
}
