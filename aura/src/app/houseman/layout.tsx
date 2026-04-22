"use client";

import { AuthProvider } from "@/context/AuthContext";
import { PropertyProvider } from "@/context/PropertyContext";

export default function HousemanLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <PropertyProvider>
        {children}
      </PropertyProvider>
    </AuthProvider>
  );
}
