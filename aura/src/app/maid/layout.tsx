"use client";

import { AuthProvider } from "@/context/AuthContext";
import { PropertyProvider } from "@/context/PropertyContext";
import { RoleGuard } from "@/components/auth/RoleGuard";

export default function MaidLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <PropertyProvider>
        <RoleGuard allowedRoles={["maid"]} redirectTo="/admin/login">
          {children}
        </RoleGuard>
      </PropertyProvider>
    </AuthProvider>
  );
}
