// src/app/api/cron/daily-lodging/route.ts
// Diário (madrugada BRT): lança no fólio a diária de cada noite vencida das
// estadias com "nightlyRate" configurada. Idempotente — refDate + índice único
// garantem 1 lançamento por noite; se um dia falhar, o próximo faz catch-up.
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { FinanceService } from '@/services/finance-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function writeCronLog(details: string, newData: object) {
  try {
    await supabaseAdmin.from('audit_logs').insert({
      id: crypto.randomUUID(), propertyId: 'system', userId: 'cron', userName: 'Sistema (Cron)',
      action: 'CRON_DAILY_LODGING', entity: 'CRON', entityId: 'daily-lodging',
      details, newData, timestamp: new Date().toISOString(),
    });
  } catch (e) { console.error('[Audit] Falha ao gravar log de cron:', e); }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Unauthorized via CRON' }, { status: 401 });
  }
  const startedAt = new Date().toISOString();

  try {
    const { staysTouched, nightsPosted } = await FinanceService.postDueLodgingAll();
    const finishedAt = new Date().toISOString();
    await writeCronLog(
      `${nightsPosted} diária(s) lançada(s) em ${staysTouched} estadia(s).`,
      { staysTouched, nightsPosted, startedAt, finishedAt }
    );
    return NextResponse.json({ success: true, staysTouched, nightsPosted });
  } catch (e) {
    console.error('[Cron daily-lodging] Erro:', e);
    return NextResponse.json({ error: 'Falha ao lançar diárias.' }, { status: 500 });
  }
}
