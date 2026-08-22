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

// Loader neutro: herda o fundo do tema em vez de pintar a tela de preto
// (no tema claro isso era um flash preto a cada navegação com RoleGuard).
function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "60dvh", width: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, textAlign: "center" }}>{children}</div>
    </div>
  );
}

const capsStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", opacity: 0.4 };

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
        <Centered>
          <RefreshCw className="h-8 w-8" style={{ opacity: 0.5 }} />
          <p style={{ fontSize: 13, fontWeight: 700, opacity: 0.7 }}>Não foi possível carregar a sessão.</p>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => window.location.reload()}
              style={{ padding: "10px 16px", borderRadius: 10, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 800, textTransform: "uppercase", background: "linear-gradient(135deg,#9b6dff,#4ec9d4)", color: "#fff" }}
            >
              Recarregar
            </button>
            <a
              href="/admin/login"
              style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid rgba(128,128,128,0.35)", fontSize: 12, fontWeight: 800, textTransform: "uppercase", textDecoration: "none", color: "inherit" }}
            >
              Ir para Login
            </a>
          </div>
        </Centered>
      );
    }
    return (
      <Centered>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#9b6dff" }} />
        <p style={capsStyle}>Verificando permissões…</p>
      </Centered>
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
      <Centered>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#9b6dff" }} />
        <p style={capsStyle}>Redirecionando…</p>
      </Centered>
    );
  }

  return <>{children}</>;
};
