"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/admin/Sidebar";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { PropertyProvider } from "@/context/PropertyContext";
import { Toaster } from "sonner";
import { NotificationProvider } from "@/context/NotificationContext";
import { ImpersonateBanner } from "@/components/admin/ImpersonateBanner";

const DARK_VARS = `
  --background: 0 0% 8% !important;
  --foreground: 0 0% 100% !important;
  --card: 0 0% 11% !important;
  --card-foreground: 0 0% 100% !important;
  --popover: 0 0% 11% !important;
  --popover-foreground: 0 0% 100% !important;
  --primary: 180 100% 94% !important;
  --primary-foreground: 0 0% 9% !important;
  --secondary: 0 0% 16% !important;
  --secondary-foreground: 0 0% 100% !important;
  --muted: 0 0% 16% !important;
  --muted-foreground: 0 0% 60% !important;
  --accent: 195 100% 80% !important;
  --accent-foreground: 0 0% 9% !important;
  --border: 0 0% 20% !important;
  --input: 0 0% 20% !important;
  --ring: 195 100% 50% !important;
  --radius: 1rem !important;
`;

const LIGHT_VARS = `
  --background: 30 15% 96% !important;
  --foreground: 220 13% 18% !important;
  --card: 0 0% 100% !important;
  --card-foreground: 220 13% 18% !important;
  --popover: 0 0% 100% !important;
  --popover-foreground: 220 13% 18% !important;
  --primary: 180 100% 94% !important;
  --primary-foreground: 220 13% 14% !important;
  --secondary: 30 10% 91% !important;
  --secondary-foreground: 220 13% 18% !important;
  --muted: 30 10% 91% !important;
  --muted-foreground: 220 9% 46% !important;
  --accent: 195 100% 80% !important;
  --accent-foreground: 220 13% 14% !important;
  --border: 220 13% 86% !important;
  --input: 220 13% 86% !important;
  --ring: 195 100% 50% !important;
  --radius: 1rem !important;
`;

function AdminLayoutInner({ children, initialTheme }: { children: React.ReactNode; initialTheme: 'dark' | 'light' }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/admin/login";
  const { impersonating, userData } = useAuth();

  const isLight = (userData?.uiTheme ?? initialTheme) === 'light';

  return (
    <div
      className={`aura-admin-root flex min-[100dvh] w-full font-sans overflow-hidden ${isLight ? 'bg-[#f5f3f0] text-[#262d38]' : 'bg-[#141414] text-white'}`}
    >
      <style>{`.aura-admin-root { ${isLight ? LIGHT_VARS : DARK_VARS} }`}</style>

      {!isLoginPage && <Sidebar />}
      {!isLoginPage && <ImpersonateBanner />}

      <main
        className={`flex-1 relative z-10 flex flex-col h-[100dvh] ${isLight ? 'bg-[#ede9e4]' : 'bg-[#151515]'}`}
        style={impersonating ? { paddingTop: 42 } : undefined}
      >
        <div className="absolute top-0 right-0 w-[600px] h-[300px] bg-gradient-to-bl from-[#E6E6FA] via-[#B0E0E6]/20 to-transparent opacity-10 pointer-events-none rounded-full blur-[100px]" />
        {!isLoginPage && <AdminTopbar />}
        <div className={`flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar ${isLight ? 'bg-[#ede9e4]' : 'bg-[linear-gradient(135deg,rgba(20,20,20,1)_0%,rgba(26,26,26,1)_100%)]'}`}>
          <div className="w-full max-w-[1400px] mx-auto min-h-full pb-20 p-4 lg:p-8">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function AdminLayoutClient({ children, initialTheme = 'dark' }: { children: React.ReactNode; initialTheme?: 'dark' | 'light' }) {
  return (
    <AuthProvider>
      <PropertyProvider>
        <NotificationProvider>
          <AdminLayoutInner initialTheme={initialTheme}>{children}</AdminLayoutInner>
          <Toaster position="top-right" richColors expand duration={7000} />
        </NotificationProvider>
      </PropertyProvider>
    </AuthProvider>
  );
}
