"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/admin/Sidebar";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { AuthProvider } from "@/context/AuthContext";
import { PropertyProvider } from "@/context/PropertyContext";
import { Toaster } from "sonner";
import { NotificationProvider } from "@/context/NotificationContext";

export default function AdminLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/admin/login";

  return (
    <AuthProvider>
      <PropertyProvider>
      <NotificationProvider>
        <div className="aura-admin-root flex min-[100dvh] w-full bg-[#141414] font-sans text-white overflow-hidden">
          <style>{`
            .aura-admin-root {
               /* Aura Core Theme (The Engine) Overrides */
               --background: 0 0% 8% !important;       /* #141414 */
               --foreground: 0 0% 100% !important;     /* #ffffff */
               --card: 0 0% 11% !important;            /* #1c1c1c */
               --card-foreground: 0 0% 100% !important;
               --popover: 0 0% 11% !important;
               --popover-foreground: 0 0% 100% !important;
               --primary: 180 100% 94% !important;     /* #E0FFFF */
               --primary-foreground: 0 0% 9% !important;
               --secondary: 0 0% 16% !important;
               --secondary-foreground: 0 0% 100% !important;
               --muted: 0 0% 16% !important;
               --muted-foreground: 0 0% 60% !important;
               --accent: 195 100% 80% !important;
               --accent-foreground: 0 0% 9% !important;
               --border: 0 0% 20% !important;          /* white/20 */
               --input: 0 0% 20% !important;
               --ring: 195 100% 50% !important;        /* #00BFFF */
               --radius: 1rem !important;
            }
          `}</style>
          
          {!isLoginPage && <Sidebar />}

          <main className="flex-1 bg-[#151515] relative z-10 flex flex-col h-[100dvh]">
            <div className="absolute top-0 right-0 w-[600px] h-[300px] bg-gradient-to-bl from-[#E6E6FA] via-[#B0E0E6]/20 to-transparent opacity-10 pointer-events-none rounded-full blur-[100px]" />
            {!isLoginPage && <AdminTopbar />}
            <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar bg-[linear-gradient(135deg,rgba(20,20,20,1)_0%,rgba(26,26,26,1)_100%)]">
              <div className="w-full max-w-[1400px] mx-auto min-h-full pb-20 p-4 lg:p-8">
                {children}
              </div>
            </div>
          </main>
        </div>
        <Toaster position="top-right" richColors expand duration={7000} />
      </NotificationProvider>
      </PropertyProvider>
    </AuthProvider>
  );
}
