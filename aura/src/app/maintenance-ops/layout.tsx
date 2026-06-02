"use client";

import { AuthProvider } from "@/context/AuthContext";
import { PropertyProvider } from "@/context/PropertyContext";
import { RoleGuard } from "@/components/auth/RoleGuard";

export default function MaintenanceOpsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <PropertyProvider>
        <RoleGuard allowedRoles={["maintenance", "super_admin", "admin", "manager"]} redirectTo="/admin/login">
          {children}
        </RoleGuard>
      </PropertyProvider>
    </AuthProvider>
  );
}
