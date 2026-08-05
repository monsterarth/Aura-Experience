// src/app/api/cron/wedding-status/route.ts
// Diário, fecha os ciclos automáticos do módulo:
//   confirmado + data passou      → 'completed' (casamento aconteceu)
//   negociação + data passou      → 'lost'      (a data foi embora sem contrato)
//   negociação + validade vencida → 'lost'      (lead parado, sem retorno)
//
// A validade é o que impede um lead de casamento em 2028 ficar dois anos na
// lista ativa esperando a data chegar. Promover negociação a 'completed'
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
    const lapsed = await WeddingService.archiveLapsedNegotiations();
    const expired = await WeddingService.archiveExpiredLeads();
    const lost = {
      updated: lapsed.updated + expired.updated,
      couples: [...lapsed.couples, ...expired.couples],
    };

    if (done.updated > 0 || lost.updated > 0) {
      const parts: string[] = [];
      if (done.updated) parts.push(`${done.updated} realizado(s): ${done.couples.join(', ')}`);
      if (lapsed.updated) parts.push(`${lapsed.updated} com data vencida: ${lapsed.couples.join(', ')}`);
      if (expired.updated) parts.push(`${expired.updated} com prazo de negociação vencido: ${expired.couples.join(', ')}`);
      await supabaseAdmin.from('audit_logs').insert({
        id: crypto.randomUUID(), propertyId: 'system', userId: 'cron', userName: 'Sistema (Cron)',
        action: 'WEDDING_AUTO_COMPLETED', entity: 'CRON', entityId: 'wedding-status',
        details: parts.join(' · '),
        newData: { completed: done, lapsed, expired, startedAt, finishedAt: new Date().toISOString() },
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
