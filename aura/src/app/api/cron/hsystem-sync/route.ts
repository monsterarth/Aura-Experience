// src/app/api/cron/hsystem-sync/route.ts
//
// Polling do HUNIT (Hsystem) — reservas inbound + disponibilidade outbound.
// NÃO está no vercel.json: é acionado por cron EXTERNO (cronjob.org, a cada
// 1–5 min, como o watchdog do WhatsApp), com Authorization: Bearer $CRON_SECRET.
// A Hsystem recomenda busca de reservas a cada 1 minuto; limites: 60 req/min.
//
// Por propriedade com settings.hasHsystem=true:
//   1) syncBookings  — booking/read → cria/atualiza/cancela estadias → confirme/post
//                      (confirmação SÓ em mode=active; em sombra a fila fica intacta
//                      para o PMS oficial).
//   2) pushAvailability — só mode=active + pushAvailability=true; idempotente por
//                      hash (recomputa o mapa e só envia se mudou — cobre criação,
//                      cancelamento, transferência, uso da casa e manutenção sem
//                      precisar de gancho em cada tela).
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { HsystemService } from '@/services/hsystem-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Unauthorized via CRON' }, { status: 401 });
  }
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  // SÓ as duas chaves que esta rota lê. `settings` inteiro são ~17KB comprimidos
  // por chamada (quase tudo texto de política — `generalPolicyText` sozinho tem
  // 16KB), e este cron roda a cada 1–5 min: medido em 02/09/2026, o `select`
  // largo daqui e das outras duas rotas de servidor custava ~1GB/mês, um quinto
  // da cota de egress. Chave ausente volta `null`, então o `=== true` abaixo
  // continua se comportando igual.
  const { data: properties } = await supabaseAdmin
    .from('properties')
    .select('id, hasHsystem:settings->hasHsystem, hsystemConfig:settings->hsystemConfig');
  const enabled = (properties ?? []).filter((p) => (p as any).hasHsystem === true);

  const results: Record<string, unknown> = {};
  for (const prop of enabled) {
    const bookings = await HsystemService.syncBookings(prop.id);
    let availability: unknown = { skipped: 'desligado' };
    const cfg = (prop as any).hsystemConfig ?? {};
    if (cfg.mode === 'active' && cfg.pushAvailability) {
      availability = await HsystemService.pushAvailability(prop.id);
    }
    results[prop.id] = { bookings, availability };
  }

  return NextResponse.json({ success: true, properties: enabled.length, results });
}
