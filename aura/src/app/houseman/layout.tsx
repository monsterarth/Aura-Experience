"use client";

import { AuthProvider } from "@/context/AuthContext";
import { PropertyProvider } from "@/context/PropertyContext";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { PushNotificationManager } from "@/components/PushNotificationManager";

export default function HousemanLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <PropertyProvider>
        <RoleGuard allowedRoles={["houseman", "super_admin", "admin", "manager"]} redirectTo="/admin/login">
          <PushNotificationManager role="houseman" />
          {children}
        </RoleGuard>
      </PropertyProvider>
    </AuthProvider>
  );
}
