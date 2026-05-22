"use client";

import { AuthProvider } from "@/context/AuthContext";
import { PropertyProvider } from "@/context/PropertyContext";
import { PushNotificationManager } from "@/components/PushNotificationManager";

export default function HousemanLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <PropertyProvider>
        <PushNotificationManager role="houseman" />
        {children}
      </PropertyProvider>
    </AuthProvider>
  );
}
