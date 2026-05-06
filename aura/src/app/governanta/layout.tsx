"use client";

import { AuthProvider } from "@/context/AuthContext";
import { PropertyProvider } from "@/context/PropertyContext";
import { RoleGuard } from "@/components/auth/RoleGuard";

export default function GovernantaLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <PropertyProvider>
        <RoleGuard allowedRoles={["governance"]} redirectTo="/admin/login">
          {children}
        </RoleGuard>
      </PropertyProvider>
    </AuthProvider>
  );
}
