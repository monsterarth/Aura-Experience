"use client";

import { AuthProvider } from "@/context/AuthContext";
import { PropertyProvider } from "@/context/PropertyContext";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { PushNotificationManager } from "@/components/PushNotificationManager";

export default function GovernantaLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <PropertyProvider>
        <RoleGuard allowedRoles={["governance", "super_admin", "admin", "manager"]} redirectTo="/admin/login">
          <PushNotificationManager role="governance" />
          {children}
        </RoleGuard>
      </PropertyProvider>
    </AuthProvider>
  );
}
