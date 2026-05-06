// src/components/auth/RoleGuard.tsx
"use client";

import { useAuth } from "@/context/AuthContext";
import { UserRole } from "@/types/aura";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Loader2, RefreshCw } from "lucide-react";

interface RoleGuardProps {
  children: React.ReactNode;
  allowedRoles: UserRole[];
  /** Rota para redirecionar se o cargo não bater. Padrão: /admin/login */
  redirectTo?: string;
}

export const RoleGuard = ({ children, allowedRoles, redirectTo = "/admin/login" }: RoleGuardProps) => {
  const { userData, loading } = useAuth();
  const router = useRouter();
  const [stuckTooLong, setStuckTooLong] = useState(false);

  // Safety: se loading não resolver em 8s, mostra tela de recovery
  useEffect(() => {
    if (!loading && userData) { setStuckTooLong(false); return; }
    const t = setTimeout(() => setStuckTooLong(true), 8000);
    return () => clearTimeout(t);
  }, [loading, userData]);

  // Sessão resolveu mas não há usuário → redireciona para login
  useEffect(() => {
    if (!loading && !userData) {
      router.replace("/admin/login");
    }
  }, [loading, userData, router]);

  if (loading || !userData) {
    if (stuckTooLong) {
      return (
        <div className="flex h-screen w-full items-center justify-center bg-[#0a0a0a]">
          <div className="flex flex-col items-center gap-4 text-center">
            <RefreshCw className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-bold text-foreground/60">Não foi possível carregar a sessão.</p>
            <div className="flex gap-3">
              <button onClick={() => window.location.reload()}
                className="px-5 py-2 bg-primary text-primary-foreground font-bold text-xs uppercase rounded-xl hover:opacity-90">
                Recarregar
              </button>
              <a href="/admin/login"
                className="px-5 py-2 bg-white/5 hover:bg-white/10 text-foreground font-bold text-xs uppercase rounded-xl">
                Ir para Login
              </a>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#0a0a0a]">
        <div className="flex flex-col items-center gap-4">
           <Loader2 className="h-10 w-10 animate-spin text-primary" />
           <p className="text-xs font-bold uppercase tracking-widest text-foreground/20">Verificando Permissões...</p>
        </div>
      </div>
    );
  }

  // Acesso permitido se role principal OU qualquer secondaryRole estiver na lista
  const hasAccess =
    allowedRoles.includes(userData.role) ||
    (userData.secondaryRoles ?? []).some(r => allowedRoles.includes(r));

  // Role não autorizado → redireciona para a rota configurada
  if (!hasAccess) {
    router.replace(redirectTo);
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#0a0a0a]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-xs font-bold uppercase tracking-widest text-foreground/20">Redirecionando...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
