// src/lib/push-notify.ts
// Server-only. NUNCA importe em client components.
//
// Disparo de Web Push a partir de eventos de tarefa (gatilho in-code, sem webhook do Supabase).
// Reúne o fan-out (antes duplicado em /api/push/send/*) e as notificações de alto nível usadas
// pela rota /api/push/notify (chamada pelos services no browser) e diretamente pelo cron.
import { supabaseAdmin } from '@/lib/supabase';
import { sendPushNotification, PushPayload } from '@/lib/push-server';

async function cleanExpired(endpoint: string) {
  await supabaseAdmin!.from('push_subscriptions').delete().eq('endpoint', endpoint);
}

/** Envia para as subscriptions de um conjunto de staff dentro de uma propriedade. */
export async function fanOut(staffIds: string[], propertyId: string, payload: PushPayload) {
  if (!staffIds.length) return;
  const { data: subs } = await supabaseAdmin!
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .in('staffId', staffIds)
    .eq('propertyId', propertyId);

  if (!subs?.length) return;

  await Promise.all(
    subs.map(async (sub) => {
      const result = await sendPushNotification(sub, payload);
      if (result.gone) await cleanExpired(sub.endpoint);
    })
  );
}

/** Envia para todas as subscriptions de um conjunto de roles dentro de uma propriedade. */
export async function fanOutByRole(propertyId: string, roles: string[], payload: PushPayload) {
  const { data: subs } = await supabaseAdmin!
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('propertyId', propertyId)
    .in('role', roles);

  if (!subs?.length) return;

  await Promise.all(
    subs.map(async (sub) => {
      const result = await sendPushNotification(sub, payload);
      if (result.gone) await cleanExpired(sub.endpoint);
    })
  );
}

/** Notifica as camareiras atribuídas a uma faxina. */
export async function notifyHousekeepingAssigned(taskId: string) {
  const { data: task } = await supabaseAdmin!
    .from('housekeeping_tasks')
    .select('id, propertyId, assignedTo')
    .eq('id', taskId)
    .single();
  if (!task?.propertyId) return;

  const assignedTo: string[] = task.assignedTo ?? [];
  if (!assignedTo.length) return;

  await fanOut(assignedTo, task.propertyId, {
    title: 'Nova faxina',
    body: 'Você recebeu uma nova tarefa de governança.',
    url: '/maid',
    tag: `maid-task-${task.id}`,
    role: 'maid',
  });
}

/** Notifica a governança/admin de que uma faxina aguarda conferência de qualidade. */
export async function notifyHousekeepingConference(taskId: string) {
  const { data: task } = await supabaseAdmin!
    .from('housekeeping_tasks')
    .select('id, propertyId')
    .eq('id', taskId)
    .single();
  if (!task?.propertyId) return;

  await fanOutByRole(task.propertyId, ['governance', 'admin', 'manager', 'super_admin'], {
    title: 'Conferência pendente',
    body: 'Uma faxina aguarda sua conferência de qualidade.',
    url: '/governanta',
    tag: `gov-conference-${task.id}`,
    role: 'governance',
  });
}

/** Notifica os técnicos atribuídos a uma manutenção (ou toda a equipe se sem responsável). */
export async function notifyMaintenanceAssigned(taskId: string) {
  const { data: task } = await supabaseAdmin!
    .from('maintenance_tasks')
    .select('id, propertyId, assignedTo, title')
    .eq('id', taskId)
    .single();
  if (!task?.propertyId) return;

  const assignedTo: string[] = task.assignedTo ?? [];
  const payload: PushPayload = {
    title: 'Nova manutenção',
    body: task.title ? `Tarefa: ${task.title}` : 'Você recebeu uma nova tarefa de manutenção.',
    url: '/maintenance',
    tag: `maint-task-${task.id}`,
    role: 'maintenance',
  };

  if (assignedTo.length) {
    await fanOut(assignedTo, task.propertyId, payload);
  } else {
    await fanOutByRole(task.propertyId, ['maintenance', 'technician'], payload);
  }
}

/** Lê o propertyId de uma tarefa — usado para validar acesso do caller na rota /api/push/notify. */
export async function getTaskPropertyId(
  domain: 'housekeeping' | 'maintenance',
  taskId: string
): Promise<string | null> {
  const table = domain === 'housekeeping' ? 'housekeeping_tasks' : 'maintenance_tasks';
  const { data } = await supabaseAdmin!.from(table).select('propertyId').eq('id', taskId).single();
  return (data as { propertyId?: string } | null)?.propertyId ?? null;
}
