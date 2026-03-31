// src/context/AuthContext.tsx
"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { createClientBrowser } from "@/lib/supabase-browser";
import { User as SupabaseUser, AuthChangeEvent, Session } from "@supabase/supabase-js";
import { Staff } from "@/types/aura";

interface AuthContextType {
  user: SupabaseUser | null;
  userData: Staff | null;
  loading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userData: null,
  loading: true,
  isAdmin: false,
  isSuperAdmin: false,
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [userData, setUserData] = useState<Staff | null>(null);
  const [loading, setLoading] = useState(true);

  // Refs para evitar closures stale no visibility handler e onAuthStateChange
  const userRef = useRef<SupabaseUser | null>(null);
  const userDataRef = useRef<Staff | null>(null);
  const isLoggingOut = useRef(false);
  const initialSessionReceived = useRef(false);

  const supabase = createClientBrowser();

  // Sync refs com state
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { userDataRef.current = userData; }, [userData]);

  /**
   * Busca os dados do staff vinculado ao user autenticado.
   */
  const fetchStaffData = useCallback(async (userId: string): Promise<Staff | null> => {
    try {
      const { data, error } = await supabase.from('staff').select('*').eq('id', userId).single();
      if (error) {
        console.warn("[Auth] Falha ao buscar staff:", error.code, error.message);
        return null;
      }
      return data as Staff;
    } catch {
      return null;
    }
  }, [supabase]);

  useEffect(() => {
    let mounted = true;

    /**
     * Safety timeout: se INITIAL_SESSION demorar (ex: lock preso pela aba anterior em um F5),
     * tenta forçar a leitura da sessão com getUser(). Como getUser() também aguarda a
     * liberação do lock, isso previne que o usuário seja deslogado precocemente antes
     * do lock ser solto pelo navegador (o que pode levar até 10s).
     */
    const safetyTimeout = setTimeout(async () => {
      if (mounted && !initialSessionReceived.current) {
        console.warn("[Auth] Timeout aguardando INITIAL_SESSION — acionando fallback getUser().");
        initialSessionReceived.current = true;

        try {
          const { data: { user: fallbackUser }, error } = await supabase.auth.getUser();
          
          if (!mounted) return;

          if (error) {
            console.warn("[Auth] Erro no getUser fallback:", error.message);
            // Non-blocking fallback
          } else if (fallbackUser) {
            setUser(fallbackUser);
            let staff = await fetchStaffData(fallbackUser.id);
            if (!staff) {
              await new Promise(r => setTimeout(r, 1000));
              staff = await fetchStaffData(fallbackUser.id);
            }
            if (mounted && staff) setUserData(staff);
          } else {
            setUser(null);
            setUserData(null);
          }
        } catch (err) {
          console.warn("[Auth] Exception no getUser fallback:", err);
        } finally {
          if (mounted) setLoading(false);
        }
      }
    }, 5000);

    /**
     * onAuthStateChange é a fonte principal de verdade.
     *
     * NÃO usamos getSession()/getUser() manuais na inicialização, pois ambos
     * competem pelo mesmo navigator lock que o initialize() interno do cliente
     * já está segurando. Isso causava o travamento de 5s e, em condições de
     * corrida (React Strict Mode, múltiplas abas), o loading ficava eterno.
     *
     * O evento INITIAL_SESSION dispara APÓS o initialize() interno completar —
     * sem competição de lock. É o padrão recomendado pelo Supabase para React.
     */
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        if (!mounted) return;

        const currentUser = session?.user || null;

        if (event === 'INITIAL_SESSION') {
          initialSessionReceived.current = true;
          clearTimeout(safetyTimeout);

          if (currentUser) {
            setUser(currentUser);
            let staff = await fetchStaffData(currentUser.id);
            if (!staff) {
              await new Promise(r => setTimeout(r, 1000));
              staff = await fetchStaffData(currentUser.id);
            }
            if (mounted && staff) setUserData(staff);
          } else {
            setUser(null);
            setUserData(null);
          }

          if (mounted) setLoading(false);
          return;
        }

        if (event === 'SIGNED_OUT') {
          setUser(null);
          setUserData(null);

          if (typeof window !== 'undefined' &&
            !window.location.pathname.includes('/admin/login') &&
            !isLoggingOut.current) {
            isLoggingOut.current = true;
            window.location.href = '/admin/login';
          }
          return;
        }

        if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
          if (currentUser) {
            setUser(currentUser);
            if (currentUser.id !== userRef.current?.id || !userDataRef.current) {
              const staff = await fetchStaffData(currentUser.id);
              if (mounted && staff) setUserData(staff);
            }
          }
          return;
        }

        // USER_UPDATED e outros eventos
        if (currentUser) {
          setUser(currentUser);
        }
      }
    );

    /**
     * Listener de visibilidade da aba.
     * Quando o usuário volta para a aba após idle, re-valida a sessão com getUser()
     * (chamada ao servidor Supabase Auth — não compete com o lock de inicialização).
     */
    const handleVisibilityChange = async () => {
      if (document.visibilityState !== 'visible' || !mounted) return;

      try {
        const { data: { user: refreshedUser }, error } = await supabase.auth.getUser();

        if (!mounted) return;

        if (error || !refreshedUser) {
          console.warn("[Auth] Sessão não encontrada no visibility change — mantendo cache.");
          return;
        }

        setUser(refreshedUser);

        if (refreshedUser.id !== userRef.current?.id || !userDataRef.current) {
          const staff = await fetchStaffData(refreshedUser.id);
          if (mounted && staff) setUserData(staff);
        }
      } catch {
        console.warn("[Auth] Erro de rede no visibility change — mantendo cache.");
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      mounted = false;
      clearTimeout(safetyTimeout);
      authListener.subscription.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const value = {
    user,
    userData,
    loading,
    isAdmin: userData?.role === 'admin' || userData?.role === 'super_admin',
    isSuperAdmin: userData?.role === 'super_admin',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
