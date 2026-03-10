// src/app/admin/layout.tsx
"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/admin/Sidebar";
import { AuthProvider } from "@/context/AuthContext";
import { PropertyProvider } from "@/context/PropertyContext";
import { Toaster } from "sonner";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/admin/login";

  return (
    <AuthProvider>
      <PropertyProvider>
        <div className="flex min-h-screen bg-background text-foreground">
          {/* Só mostra a Sidebar se não for a página de login */}
          {!isLoginPage && <Sidebar />}
          <main className="flex-1 flex flex-col w-full min-h-screen overflow-x-hidden">
            <div className="w-full max-w-[1300px] mx-auto flex-1 pb-20 lg:pb-0">
              {children}
            </div>
          </main>
        </div>
        <Toaster position="bottom-right" richColors />
      </PropertyProvider>
    </AuthProvider>
  );
}
