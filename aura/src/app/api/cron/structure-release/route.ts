// src/app/api/cron/structure-release/route.ts
//
// Cobra a liberação diária das áreas que começam o dia fechadas (jacuzzi, quiosque).
// Roda de 15 em 15 min na faixa da manhã e manda UM push por área, por dia, no
// momento em que faltam 30 min para ela abrir.
//
// Por que existe (medido em produção, 06/06→05/09/2026): em 92 dias, 43 tiveram
// hóspede na casa e a jacuzzi nunca foi liberada — nenhum por manutenção. As 14
// reservas de hóspede do período caíram todas em dia liberado: nos 43 esquecidos
// ninguém pediu, porque a área não existia no portal. O esquecimento não deixa
// rastro, então precisa de alarme.
//
// O sino faz o trabalho de dentro do sistema (derivado de `releasedForDate`, sem
// linha de notificação); este cron é o braço que alcança quem ainda não abriu o
// admin. Mesma regra dos dois lados: `@/lib/structure-release`.
//
// Calibragem do limiar (mesmos 42 eventos de liberação): 30 delas — 71% — já
// acontecem antes de faltarem 30 min para abrir, então nos dias em que a rotina
// funciona este cron não avisa NADA. As 12 restantes cairiam no sino, e 9 delas
// depois da abertura (a última às 16:01, com a área fechada desde as 11:00).
// Silêncio no dia bom é o que mantém o alerta valendo alguma coisa no dia ruim.
//
// JANELA: agendado em `vercel.json` como `*/15 9-16 * * *` (UTC) = 06:00–13:59 no
// fuso da casa. Cobre o T-30 de área que abre entre 06:30 e 14:29 — hoje o quiosque
// (10:30) e a jacuzzi (11:00). Área de liberação diária que abrisse fora dessa faixa
// continuaria aparecendo no sino, mas não geraria push: se isso acontecer, esticar a
// janela aqui é a correção, não mexer na regra.
//
// Sem gate de módulo de propósito: estruturas é core (portal, mapa e agenda
// dependem dela), não um módulo desligável do registry em `@/lib/modules`.
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { fanOutByRole } from '@/lib/push-notify';
import { nowInProperty, releaseAlertLevel, RELEASE_WARN_LEAD_MINUTES } from '@/lib/structure-release';
import type { Structure } from '@/types/aura';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Quem recebe o push. A recepção é quem executa a liberação (em 43 eventos do
 * histórico, sempre ela); o gerente entra como rede de segurança. Admin e
 * super_admin ficam de fora de propósito — é aviso de rotina diária, e telefone
 * de dono tocando todo dia às 10h é como um canal de alarme morre.
 */
const RELEASE_PUSH_ROLES = ['reception', 'manager'];

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Unauthorized via CRON' }, { status: 401 });
  }
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  const { today, minutes } = nowInProperty();

  // Só as que exigem liberação e não são local informativo. `releaseAlertSentFor`
  // é a trava de repetição: sem ela o push sairia de novo a cada rodada.
  const { data, error } = await supabaseAdmin
    .from('structures')
    .select('id, propertyId, name, requiresDailyRelease, releasedForDate, releaseAlertSentFor, operatingHours, units, unitStatus, outOfService')
    .eq('requiresDailyRelease', true)
    .neq('visibility', 'map_only');

  if (error) {
    console.error('[cron/structure-release] leitura falhou:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const structures = (data ?? []) as (Structure & { releaseAlertSentFor?: string })[];
  const notified: string[] = [];
  const skipped: string[] = [];

  for (const s of structures) {
    const level = releaseAlertLevel(s, today, minutes);
    if (level === 'none') { skipped.push(`${s.name}: nada a cobrar`); continue; }
    if (s.releaseAlertSentFor === today) { skipped.push(`${s.name}: já avisado hoje`); continue; }

    const open = s.operatingHours?.openTime;
    await fanOutByRole(s.propertyId, RELEASE_PUSH_ROLES, {
      title: 'Área ainda fechada',
      body: open
        ? `${s.name} abre às ${open} e continua bloqueada para o hóspede. Libere na agenda.`
        : `${s.name} continua bloqueada para o hóspede. Libere na agenda.`,
      url: '/admin/estruturas/bookings',
      // Uma área = uma notificação por dia; a mesma tag substitui em vez de empilhar.
      tag: `release-${s.id}-${today}`,
      role: 'reception',
    });

    // Grava DEPOIS do envio: se o push falhar, a próxima rodada tenta de novo.
    const { error: markError } = await supabaseAdmin
      .from('structures')
      .update({ releaseAlertSentFor: today })
      .eq('id', s.id);
    if (markError) console.error('[cron/structure-release] marca falhou:', s.id, markError.message);

    notified.push(`${s.name} (${level})`);
  }

  // Deixa rastro: com o log de aviso ao lado do STRUCTURE_RELEASED dá para medir,
  // daqui a um mês, se o alerta mudou a taxa de esquecimento — que é a razão dele.
  if (notified.length) {
    try {
      await supabaseAdmin.from('audit_logs').insert({
        id: crypto.randomUUID(),
        propertyId: 'system',
        userId: 'cron',
        userName: 'Sistema (Cron)',
        action: 'STRUCTURE_RELEASE_ALERT',
        entity: 'CRON',
        entityId: 'structure-release',
        details: `Push de área não liberada: ${notified.join(', ')}.`,
        timestamp: new Date().toISOString(),
      });
    } catch (e) {
      console.error('[cron/structure-release] audit:', e);
    }
  }

  return NextResponse.json({
    ok: true,
    today,
    minutes,
    leadMinutes: RELEASE_WARN_LEAD_MINUTES,
    checked: structures.length,
    notified,
    skipped,
  });
}
