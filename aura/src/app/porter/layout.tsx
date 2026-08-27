"use client";

import { AuthProvider } from "@/context/AuthContext";
import { PropertyProvider } from "@/context/PropertyContext";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { PushNotificationManager } from "@/components/PushNotificationManager";

export default function PorterLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <PropertyProvider>
        {/* Recepção entra junto: em turno vago é ela quem opera a guarita. */}
        <RoleGuard allowedRoles={["porter", "reception", "super_admin", "admin", "manager"]} redirectTo="/admin/login">
          <PushNotificationManager role="porter" />
          {children}
        </RoleGuard>
      </PropertyProvider>
    </AuthProvider>
  );
}
