// src/app/api/push/notify/route.ts
// Gatilho in-code de Web Push: chamado (fire-and-forget) pelos services no browser após
// criar/atribuir/concluir uma tarefa. Autenticado — substitui o gatilho por webhook do
// Supabase (que exigia configuração externa no painel, podendo quebrar silenciosamente).
import { NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import {
  notifyHousekeepingAssigned,
  notifyHousekeepingConference,
  notifyMaintenanceAssigned,
  getTaskPropertyId,
} from '@/lib/push-notify';

export const dynamic = 'force-dynamic';

type Domain = 'housekeeping' | 'maintenance';
type Event = 'assigned' | 'conference';

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  let body: { domain?: Domain; event?: Event; taskId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 });
  }

  const { domain, event, taskId } = body;
  if (!domain || !event || !taskId) return NextResponse.json({ ok: true });

  // Segurança: o caller precisa pertencer à propriedade da tarefa (ou ser admin-tier).
  const taskProperty = await getTaskPropertyId(domain, taskId);
  if (!taskProperty) return NextResponse.json({ ok: true });
  const isAdminTier = ['super_admin', 'admin', 'manager'].includes(auth.staff.role);
  if (!isAdminTier && auth.staff.propertyId !== taskProperty) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
  }

  try {
    if (domain === 'housekeeping' && event === 'assigned') await notifyHousekeepingAssigned(taskId);
    else if (domain === 'housekeeping' && event === 'conference') await notifyHousekeepingConference(taskId);
    else if (domain === 'maintenance' && event === 'assigned') await notifyMaintenanceAssigned(taskId);
  } catch (e) {
    // fire-and-forget: log mas não propaga erro ao caller
    console.error('[push/notify]', e);
  }

  return NextResponse.json({ ok: true });
}
