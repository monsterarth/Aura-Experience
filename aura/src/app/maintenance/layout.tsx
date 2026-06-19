"use client";

import { AuthProvider } from "@/context/AuthContext";
import { PropertyProvider } from "@/context/PropertyContext";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { PushNotificationManager } from "@/components/PushNotificationManager";

export default function MaintenanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <PropertyProvider>
        <RoleGuard allowedRoles={["maintenance", "technician", "super_admin", "admin", "manager"]} redirectTo="/admin/login">
          <PushNotificationManager role="maintenance" />
          {children}
        </RoleGuard>
      </PropertyProvider>
    </AuthProvider>
  );
}
