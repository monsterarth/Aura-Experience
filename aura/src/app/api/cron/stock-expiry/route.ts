// src/app/api/cron/stock-expiry/route.ts
// Diário: verifica lotes vencendo/vencidos por propriedade. Se autoLossOnExpiry
// estiver ligado, lança perda automática (lossType='expiry') dos lotes vencidos.
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { StockService } from '@/services/stock-service';

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
  const cronActor = { id: 'cron', name: 'Sistema (Cron)' };

  try {
    const { data: properties } = await supabaseAdmin.from('properties').select('id');
    const todayStr = new Date().toISOString().slice(0, 10);
    let expiringTotal = 0, expiredTotal = 0, lossesCreated = 0;

    for (const prop of (properties ?? [])) {
      const propertyId = prop.id as string;
      const { data: settings } = await supabaseAdmin.from('stock_settings').select('*').eq('propertyId', propertyId).maybeSingle();
      const lead = Number(settings?.expiryAlertLeadDays ?? 30);
      const autoLoss = !!settings?.autoLossOnExpiry;

      const batches = await StockService.getExpiringBatches(propertyId, lead);
      expiringTotal += batches.length;
      const expired = batches.filter((b) => b.expiryDate && b.expiryDate < todayStr && Number(b.quantity) > 0);
      expiredTotal += expired.length;

      if (autoLoss) {
        for (const b of expired) {
          await StockService.registerMovement(propertyId, {
            productId: b.productId, type: 'loss', quantity: Number(b.quantity),
            fromLocationId: b.locationId, lossType: 'expiry', referenceType: 'manual',
            notes: 'Perda automática por vencimento', allowNegative: true,
          }, cronActor);
          lossesCreated++;
        }
      }
    }

    const finishedAt = new Date().toISOString();
    await writeCronLog('CRON_STOCK_EXPIRY', 'stock-expiry',
      `${expiringTotal} lote(s) vencendo, ${expiredTotal} vencido(s), ${lossesCreated} perda(s) automática(s)`,
      { expiringTotal, expiredTotal, lossesCreated, startedAt, finishedAt });
    return NextResponse.json({ success: true, expiringTotal, expiredTotal, lossesCreated });
  } catch (error: unknown) {
    console.error('CRON stock-expiry ERROR:', error);
    await writeCronLog('CRON_STOCK_EXPIRY', 'stock-expiry', `ERRO: ${(error as Error)?.message ?? error}`, { startedAt, finishedAt: new Date().toISOString() });
    return NextResponse.json({ error: 'Falha ao processar validade.' }, { status: 500 });
  }
}
