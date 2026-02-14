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

/**
 * RoleGuard: O vigilante de interface do Aura.
 * Bloqueia a renderização de componentes ou páginas se o cargo não for permitido.
 */
export const RoleGuard = ({ children, allowedRoles }: RoleGuardProps) => {
  const { userData, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && (!userData || !allowedRoles.includes(userData.role))) {
      // Opcional: Redirecionar para uma página de "Acesso Negado"
      console.warn("[Aura Security] Acesso negado para o cargo:", userData?.role);
    }
  }, [userData, loading, allowedRoles, router]);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!userData || !allowedRoles.includes(userData.role)) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center space-y-4 p-8 text-center">
        <div className="rounded-full bg-destructive/10 p-4 text-destructive">
          <ShieldAlert size={48} />
        </div>
        <h2 className="text-2xl font-bold">Acesso Restrito</h2>
        <p className="max-w-md text-muted-foreground">
          O seu cargo (<strong>{userData?.role || 'Visitante'}</strong>) não tem permissão para visualizar esta área.
          Contacte o administrador da <strong>{userData?.propertyId || 'Plataforma'}</strong>.
        </p>
      </div>
    );
  }

  return <>{children}</>;
};