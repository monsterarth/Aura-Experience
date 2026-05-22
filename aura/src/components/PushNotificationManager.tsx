"use client";

import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";

interface Props {
  role: string;
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i++) {
    view[i] = rawData.charCodeAt(i);
  }
  return buffer;
}

export function PushNotificationManager({ role }: Props) {
  const { userData } = useAuth();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!userData) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) return;

    let mounted = true;

    async function setup() {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        await navigator.serviceWorker.ready;

        // Evita repedir permissão se já inscrito
        const stored = localStorage.getItem(`push_subscribed_${userData!.id}`);
        if (stored === "true") {
          // Verifica se a subscription ainda é válida
          const existing = await registration.pushManager.getSubscription();
          if (existing) return;
          // Subscription foi perdida (limpeza de dados) — reinscreve
          localStorage.removeItem(`push_subscribed_${userData!.id}`);
        }

        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey!),
        });

        const subJson = subscription.toJSON();
        const response = await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: subJson.endpoint,
            p256dh: subJson.keys?.p256dh,
            auth: subJson.keys?.auth,
          }),
        });

        if (response.ok && mounted) {
          localStorage.setItem(`push_subscribed_${userData!.id}`, "true");
        }
      } catch (err) {
        console.warn("[PushManager] Setup failed:", err);
      }
    }

    setup();

    // Reproduz som quando o app está em foreground e chega um push
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "PUSH_RECEIVED" && mounted) {
        try {
          const audio = new Audio("/notification.mp3");
          audio.play().catch(() => {});
        } catch {}
      }
    };
    navigator.serviceWorker.addEventListener("message", handleMessage);

    return () => {
      mounted = false;
      navigator.serviceWorker.removeEventListener("message", handleMessage);
    };
  }, [userData]);

  return null;
}
