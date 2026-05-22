// Server-only. Never importe em client components.
import webpush from 'web-push';

let vapidInitialized = false;

function ensureVapid() {
  if (vapidInitialized) return;
  if (!process.env.VAPID_SUBJECT || !process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    throw new Error('[Push] VAPID env vars não configuradas.');
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  vapidInitialized = true;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
  role?: string;
}

export interface StoredSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Envia uma notificação Web Push para uma subscription.
 * Retorna { ok: false, gone: true } quando a subscription expirou (410/404)
 * — sinal para deletar do banco.
 */
export async function sendPushNotification(
  sub: StoredSubscription,
  payload: PushPayload
): Promise<{ ok: boolean; gone?: boolean }> {
  const pushSubscription = {
    endpoint: sub.endpoint,
    keys: { p256dh: sub.p256dh, auth: sub.auth },
  };

  try {
    ensureVapid();
    await webpush.sendNotification(pushSubscription, JSON.stringify(payload));
    return { ok: true };
  } catch (err: any) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      return { ok: false, gone: true };
    }
    console.error('[Push] sendPushNotification error:', err.statusCode, err.message);
    return { ok: false };
  }
}
