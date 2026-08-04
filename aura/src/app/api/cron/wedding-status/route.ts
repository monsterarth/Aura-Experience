// src/app/api/cron/wedding-status/route.ts
// Diário: casamento CONFIRMADO cuja data já passou vira 'completed'.
// 'tentative' que passou NÃO é promovido — é negociação perdida, e viraria
// receita fantasma no total do módulo.
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { WeddingService } from '@/services/wedding-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Unauthorized via CRON' }, { status: 401 });
  }
  const startedAt = new Date().toISOString();

  try {
    const { updated, couples } = await WeddingService.completePastWeddings();

    if (updated > 0) {
      await supabaseAdmin.from('audit_logs').insert({
        id: crypto.randomUUID(), propertyId: 'system', userId: 'cron', userName: 'Sistema (Cron)',
        action: 'WEDDING_AUTO_COMPLETED', entity: 'CRON', entityId: 'wedding-status',
        details: `${updated} casamento(s) marcado(s) como realizado(s): ${couples.join(', ')}`,
        newData: { updated, couples, startedAt, finishedAt: new Date().toISOString() },
        timestamp: new Date().toISOString(),
      }).then(() => {}, () => {});
    }

    return NextResponse.json({ success: true, updated, couples });
  } catch (e) {
    console.error('[Cron wedding-status] Erro:', e);
    return NextResponse.json({ error: 'Falha ao atualizar status dos casamentos.' }, { status: 500 });
  }
}
