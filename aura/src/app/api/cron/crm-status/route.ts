// src/app/api/cron/crm-status/route.ts
// Diário: arquiva orçamentos de reserva vencidos — simetria com o
// wedding-status (que cuida dos casamentos e permanece intocado):
//   check-in já passou      → 'lost', "Data da estadia passou"
//   validade do lead venceu → 'lost', "Prazo vencido sem retorno"
// Cron separado de propósito: não arriscar o fluxo de casamentos que já
// roda em produção.
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { RateService } from '@/services/rate-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Unauthorized via CRON' }, { status: 401 });
  }
  const startedAt = new Date().toISOString();

  try {
    const { expired, lapsed, names } = await RateService.archiveExpiredQuotes();

    if (expired > 0 || lapsed > 0) {
      await supabaseAdmin.from('audit_logs').insert({
        id: crypto.randomUUID(), propertyId: 'system', userId: 'cron', userName: 'Sistema (Cron)',
        action: 'CRON_CRM_STATUS', entity: 'CRON', entityId: 'crm-status',
        details: `${lapsed + expired} orçamento(s) arquivado(s) (${lapsed} com data passada, ${expired} com prazo vencido): ${names.join(', ')}`,
        newData: { lapsed, expired, names, startedAt, finishedAt: new Date().toISOString() },
        timestamp: new Date().toISOString(),
      }).then(() => {}, () => {});
    }

    return NextResponse.json({ success: true, lapsed, expired });
  } catch (e) {
    console.error('[Cron crm-status] Erro:', e);
    return NextResponse.json({ error: 'Falha ao arquivar orçamentos.' }, { status: 500 });
  }
}
