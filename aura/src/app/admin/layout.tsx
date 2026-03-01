// src/app/admin/layout.tsx
"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/admin/Sidebar";
import { AuthProvider } from "@/context/AuthContext";
import { PropertyProvider } from "@/context/PropertyContext";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/admin/login";

  return (
    <AuthProvider>
      <PropertyProvider>
        <div className="flex min-h-screen bg-background text-foreground">
          {/* Só mostra a Sidebar se não for a página de login */}
          {!isLoginPage && <Sidebar />}
          <main className="flex-1 w-full">
            {children}
          </main>
        </div>
      </PropertyProvider>
    </AuthProvider>
  );
}
