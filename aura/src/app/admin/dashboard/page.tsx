"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { roleHome } from "@/lib/role-routes";

export default function DashboardRedirectPage() {
  const { userData, userDataReady } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!userDataReady) return;
    router.replace(roleHome(userData?.role));
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
