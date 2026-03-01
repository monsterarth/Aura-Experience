// src/components/auth/RoleGuard.tsx
"use client";

import { useAuth } from "@/context/AuthContext";
import { UserRole } from "@/types/aura";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loader2, ShieldAlert } from "lucide-react";

interface RoleGuardProps {
  children: React.ReactNode;
  allowedRoles: UserRole[];
}

export const RoleGuard = ({ children, allowedRoles }: RoleGuardProps) => {
  const { userData, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      // Se não tem usuário (Visitante), manda pro login imediatamente
      if (!userData) {
        router.push("/admin/login");
        return;
      }
      
      // Se tem usuário mas não tem permissão, apenas loga o aviso (o componente visual vai tratar)
      if (!allowedRoles.includes(userData.role)) {
        console.warn("[Aura Security] Acesso negado para o cargo:", userData.role);
      }
    }
  }, [userData, loading, allowedRoles, router]);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#0a0a0a]">
        <div className="flex flex-col items-center gap-4">
           <Loader2 className="h-10 w-10 animate-spin text-primary" />
           <p className="text-xs font-bold uppercase tracking-widest text-foreground/20">Verificando Permissões...</p>
        </div>
      </div>
    );
  }

  // Se não tem userData, o useEffect acima já disparou o redirect, 
  // mas retornamos null para não piscar a tela de erro
  if (!userData) return null; 

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
