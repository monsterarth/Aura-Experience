"use client";

import { AuthProvider } from "@/context/AuthContext";
import { PropertyProvider } from "@/context/PropertyContext";
import { RoleGuard } from "@/components/auth/RoleGuard";

export default function EquipeLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <PropertyProvider>
        <RoleGuard
          allowedRoles={[
            "maid", "governance", "houseman", "maintenance", "technician",
            "kitchen", "waiter", "porter", "reception", "marketing",
            "manager", "admin", "super_admin",
          ]}
          redirectTo="/admin/login"
        >
          <div className="dark min-h-screen bg-background">
            {children}
          </div>
        </RoleGuard>
      </PropertyProvider>
    </AuthProvider>
  );
}
