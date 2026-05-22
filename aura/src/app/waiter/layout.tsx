"use client";

import { AuthProvider } from "@/context/AuthContext";
import { PropertyProvider } from "@/context/PropertyContext";
import { PushNotificationManager } from "@/components/PushNotificationManager";

export default function WaiterLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <PropertyProvider>
        <PushNotificationManager role="waiter" />
        {children}
      </PropertyProvider>
    </AuthProvider>
  );
}
