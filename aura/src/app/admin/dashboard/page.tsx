"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

const ROLE_DESTINATIONS: Record<string, string> = {
  super_admin:  "/admin/core/dashboard",
  admin:        "/admin/reception",
  hr:           "/admin/hr",
  reception:    "/admin/reception",
  governance:   "/admin/governance",
  maid:         "/admin/governance",
  maintenance:  "/admin/maintenance",
  technician:   "/admin/maintenance",
  kitchen:      "/admin/cafe-salao/kds",
  waiter:       "/admin/cafe-salao/kds",
  marketing:    "/admin/surveys/responses",
  porter:       "/admin/stays",
  houseman:     "/admin/stays",
};

export default function DashboardRedirectPage() {
  const { userData, userDataReady } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!userDataReady) return;
    const role = userData?.role ?? "";
    const dest = ROLE_DESTINATIONS[role] ?? "/admin/stays";
    router.replace(dest);
  }, [userDataReady, userData, router]);

  return (
    <div className="flex h-full items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-3 text-white/40">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
        <span className="text-sm">Carregando painel…</span>
      </div>
    </div>
  );
}
