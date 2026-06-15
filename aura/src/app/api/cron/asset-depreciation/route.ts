// src/app/api/cron/asset-depreciation/route.ts
// Mensal: lança a depreciação do mês corrente (YYYY-MM) para os ativos lineares
// ativos de cada propriedade. Idempotente por (assetId, period).
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { AssetService } from '@/services/asset-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function writeCronLog(action: string, entityId: string, details: string, newData: object) {
  try {
    await supabaseAdmin.from('audit_logs').insert({
      id: crypto.randomUUID(), propertyId: 'system', userId: 'cron', userName: 'Sistema (Cron)',
      action, entity: 'CRON', entityId, details, newData, timestamp: new Date().toISOString(),
    });
  } catch (e) { console.error('[Audit] Falha ao gravar log de cron:', e); }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Unauthorized via CRON' }, { status: 401 });
  }
  const startedAt = new Date().toISOString();
  const period = new Date().toISOString().slice(0, 7); // YYYY-MM

  try {
    const { data: properties } = await supabaseAdmin.from('properties').select('id');
    let total = 0;
    for (const prop of (properties ?? [])) {
      total += await AssetService.runDepreciation(prop.id as string, period);
    }
    const finishedAt = new Date().toISOString();
    await writeCronLog('CRON_ASSET_DEPRECIATION', period, `${total} ativo(s) depreciado(s) no período ${period}`, { total, period, startedAt, finishedAt });
    return NextResponse.json({ success: true, period, assets: total });
  } catch (error: unknown) {
    console.error('CRON asset-depreciation ERROR:', error);
    await writeCronLog('CRON_ASSET_DEPRECIATION', period, `ERRO: ${(error as Error)?.message ?? error}`, { period, startedAt, finishedAt: new Date().toISOString() });
    return NextResponse.json({ error: 'Falha ao processar depreciação.' }, { status: 500 });
  }
}
