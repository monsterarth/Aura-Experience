// src/lib/push-trigger.ts
// Client-safe. Dispara (fire-and-forget) o gatilho de Web Push após uma mutação de tarefa.
// No server (ex: cron), use as funções de @/lib/push-notify diretamente — este helper é no-op
// fora do browser. keepalive garante a entrega mesmo se a página navegar logo em seguida.
export function triggerTaskPush(
  domain: 'housekeeping' | 'maintenance',
  event: 'assigned' | 'conference',
  taskId: string
): void {
  if (typeof window === 'undefined') return;
  fetch('/api/push/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domain, event, taskId }),
    keepalive: true,
  }).catch(() => {});
}
