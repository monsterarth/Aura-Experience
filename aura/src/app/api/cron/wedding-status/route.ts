// src/app/api/cron/wedding-status/route.ts
// Diário, dois fechamentos automáticos de ciclo:
//   confirmado + data passou → 'completed' (casamento aconteceu)
//   negociação + data passou → 'lost'      (a data foi embora sem contrato)
// São caminhos distintos de propósito: promover uma negociação a 'completed'
// inventaria um casamento que nunca houve e inflaria a receita do módulo.
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
    const done = await WeddingService.completePastWeddings();
    const lost = await WeddingService.archiveLapsedNegotiations();

    if (done.updated > 0 || lost.updated > 0) {
      const parts: string[] = [];
      if (done.updated) parts.push(`${done.updated} realizado(s): ${done.couples.join(', ')}`);
      if (lost.updated) parts.push(`${lost.updated} negociação(ões) perdida(s): ${lost.couples.join(', ')}`);
      await supabaseAdmin.from('audit_logs').insert({
        id: crypto.randomUUID(), propertyId: 'system', userId: 'cron', userName: 'Sistema (Cron)',
        action: 'WEDDING_AUTO_COMPLETED', entity: 'CRON', entityId: 'wedding-status',
        details: parts.join(' · '),
        newData: { completed: done, lost, startedAt, finishedAt: new Date().toISOString() },
        timestamp: new Date().toISOString(),
      }).then(() => {}, () => {});
    }

    return NextResponse.json({
      success: true,
      completed: done.updated, completedCouples: done.couples,
      lost: lost.updated, lostCouples: lost.couples,
    });
  } catch (e) {
    console.error('[Cron wedding-status] Erro:', e);
    return NextResponse.json({ error: 'Falha ao atualizar status dos casamentos.' }, { status: 500 });
  }
}
