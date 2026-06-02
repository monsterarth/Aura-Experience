"use client";

import { AuthProvider } from "@/context/AuthContext";
import { PropertyProvider } from "@/context/PropertyContext";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { PushNotificationManager } from "@/components/PushNotificationManager";

export default function DirectorLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <PropertyProvider>
        <RoleGuard allowedRoles={["director", "super_admin", "admin", "manager"]} redirectTo="/admin/login">
          <PushNotificationManager role="director" />
          {children}
        </RoleGuard>
      </PropertyProvider>
    </AuthProvider>
  );
}
