// src/components/auth/RoleGuard.tsx
"use client";

import { useAuth } from "@/context/AuthContext";
import { UserRole } from "@/types/aura";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Loader2, ShieldAlert, RefreshCw } from "lucide-react";

interface RoleGuardProps {
  children: React.ReactNode;
  allowedRoles: UserRole[];
}

export const RoleGuard = ({ children, allowedRoles }: RoleGuardProps) => {
  const { userData, loading } = useAuth();
  const router = useRouter();
  const [stuckTooLong, setStuckTooLong] = useState(false);

  // Safety: se ficar preso em loading/sem userData por 15s, mostra tela de recovery
  useEffect(() => {
    if (!loading && userData) { setStuckTooLong(false); return; }
    const t = setTimeout(() => setStuckTooLong(true), 15000);
    return () => clearTimeout(t);
  }, [loading, userData]);

  // Enquanto auth resolve (loading ou userData ainda não carregou), mostra spinner.
  // Não redirecionamos aqui — o middleware já protege rotas admin server-side,
  // e o SIGNED_OUT handler no AuthContext redireciona quando a sessão expira client-side.
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

  // Se tem usuário mas cargo errado -> Mostra tela de bloqueio
  if (!allowedRoles.includes(userData.role)) {
    return (
      <div className="flex h-[80vh] flex-col items-center justify-center space-y-6 p-8 text-center animate-in zoom-in duration-300">
        <div className="rounded-full bg-red-500/10 p-6 text-red-500 ring-1 ring-red-500/20">
          <ShieldAlert size={64} />
        </div>
        <div className="space-y-2">
            <h2 className="text-3xl font-black text-foreground">Acesso Restrito</h2>
            <p className="max-w-md text-foreground/40">
            O seu cargo (<strong>{userData?.role}</strong>) não possui as credenciais de segurança necessárias para acessar esta área.
            </p>
        </div>
        <button 
            onClick={() => router.back()}
            className="px-8 py-3 bg-white/5 hover:bg-white/10 text-foreground font-bold rounded-xl transition-all"
        >
            Voltar
        </button>
      </div>
    );
  }

  return <>{children}</>;
};
