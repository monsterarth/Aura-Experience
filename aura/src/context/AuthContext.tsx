// src/context/AuthContext.tsx
"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { createClientBrowserAuto } from "@/lib/supabase-browser";
import { User as SupabaseUser, AuthChangeEvent, Session } from "@supabase/supabase-js";
import { Staff, ImpersonatingState } from "@/types/aura";

interface AuthContextType {
  user: SupabaseUser | null;
  userData: Staff | null;
  loading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  initialProperty: any | null;
  userDataReady: boolean;
  impersonating: ImpersonatingState | null;
  startImpersonation: (target: Staff) => void;
  stopImpersonation: () => void;
  refreshUserData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userData: null,
  loading: true,
  isAdmin: false,
  isSuperAdmin: false,
  initialProperty: null,
  userDataReady: false,
  impersonating: null,
  startImpersonation: () => {},
  stopImpersonation: () => {},
  refreshUserData: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [userData, setUserData] = useState<Staff | null>(null);
  const [loading, setLoading] = useState(true);
  const [userDataReady, setUserDataReady] = useState(false);
  const [initialProperty, setInitialProperty] = useState<any | null>(null);
  const [impersonating, setImpersonating] = useState<ImpersonatingState | null>(null);

  // Refs para evitar closures stale no visibility handler e onAuthStateChange
  const userRef = useRef<SupabaseUser | null>(null);
  const userDataRef = useRef<Staff | null>(null);
  const isLoggingOut = useRef(false);
  const initialSessionReceived = useRef(false);

  const supabase = createClientBrowserAuto();

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
     * ═══ Fast-path: API call server-side (bypassa browser lock) ═══════════
     * No F5/reload, o browser lock do Supabase pode travar o onAuthStateChange
     * por até 10s. Esta chamada lê a sessão diretamente dos cookies no server,
     * sem nenhuma dependência do lock. Resultado: página renderiza em <500ms.
     */
    const isLoginPage = typeof window !== 'undefined' && window.location.pathname.includes('/admin/login');

    // Fast-path: não chamar na página de login (middleware bloqueia com 401)
    if (!isLoginPage) {
      fetch('/api/admin/auth/me')
        .then(res => { if (!res.ok) throw new Error('auth-api'); return res.json(); })
        .then(data => {
          if (mounted && data?.staff && !userDataRef.current) {
            userDataRef.current = data.staff;
            setUserData(data.staff);
            if (data.property) setInitialProperty(data.property);
            setUserDataReady(true);
            setLoading(false);
          }
        })
        .catch(() => {});
    }

    /**
     * Hard timeout: só age fora da página de login e só se userData nunca chegou.
     * Redireciona para login para forçar nova autenticação.
     */
    const hardTimeout = setTimeout(() => {
      if (!mounted || userDataRef.current || isLoginPage) return;
      console.warn("[Auth] Hard timeout — sem dados de sessão, redirecionando para login.");
      fetch('/api/auth/signout', { method: 'POST' })
        .catch(() => {})
        .finally(() => {
          if (typeof window !== 'undefined') window.location.href = '/admin/login';
        });
    }, 4000);

    /**
     * Safety timeout: re-tenta o fast-path server-side se o INITIAL_SESSION
     * não chegou em 1.5s (evita depender do browser lock do Supabase).
     */
    const safetyTimeout = setTimeout(async () => {
      if (!mounted || userDataRef.current || isLoginPage) return;
      console.warn("[Auth] Safety timeout — re-tentando fast-path.");
      initialSessionReceived.current = true;
      try {
        const res = await fetch('/api/admin/auth/me');
        if (!mounted || userDataRef.current) return;
        if (res.ok) {
          const data = await res.json();
          if (mounted && data?.staff) {
            userDataRef.current = data.staff;
            setUserData(data.staff);
            if (data.property) setInitialProperty(data.property);
          }
        }
      } catch { /* silencioso — hard timeout cobre */ }
      finally {
        if (mounted && !userDataRef.current) { setUser(null); setUserData(null); }
        if (mounted) { setUserDataReady(true); setLoading(false); }
      }
    }, 1500);

    /**
     * onAuthStateChange: fonte de verdade para eventos contínuos.
     * O fast-path acima cuida da sessão inicial; este listener cuida
     * de SIGNED_OUT, TOKEN_REFRESHED, SIGNED_IN e atualizações.
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
            // Só busca staff se o fast-path ainda não resolveu
            if (!userDataRef.current) {
              const staff = await fetchStaffData(currentUser.id);
              if (mounted) { setUserData(staff); setUserDataReady(true); }
            }
          } else if (!userDataRef.current) {
            setUser(null);
            setUserData(null);
            if (mounted) setUserDataReady(true); // unauthenticated — signal ready
          }

          if (mounted) setLoading(false);
          return;
        }

        if (event === 'SIGNED_OUT') {
          setUser(null);
          setUserData(null);

          // Limpa cache de property para o próximo usuário não herdar a sessão anterior
          if (typeof window !== 'undefined') {
            localStorage.removeItem('aura-property-cache');
            localStorage.removeItem('aura-active-property');
          }

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
              if (mounted && staff) { setUserData(staff); setUserDataReady(true); }
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
      if (window.location.pathname.includes('/admin/login')) return;

      try {
        // Usa o fast-path server-side para não competir com o browser lock
        const res = await fetch('/api/admin/auth/me');
        if (!mounted) return;
        if (!res.ok) {
          console.warn("[Auth] Sessão não encontrada no visibility change — mantendo cache.");
          return;
        }
        const data = await res.json();
        if (!mounted || !data?.staff) return;
        if (data.staff.id !== userDataRef.current?.id || !userDataRef.current) {
          userDataRef.current = data.staff;
          setUserData(data.staff);
        }
      } catch {
        console.warn("[Auth] Erro de rede no visibility change — mantendo cache.");
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      mounted = false;
      clearTimeout(hardTimeout);
      clearTimeout(safetyTimeout);
      authListener.subscription.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshUserData = useCallback(async () => {
    if (!userRef.current) return;
    const staff = await fetchStaffData(userRef.current.id);
    if (staff) setUserData(staff);
  }, [fetchStaffData]);

  const startImpersonation = useCallback((target: Staff) => {
    setImpersonating(prev => ({
      staff: target,
      originalUserData: prev?.originalUserData ?? (userData as Staff),
    }));
  }, [userData]);

  const stopImpersonation = useCallback(() => {
    setImpersonating(null);
  }, []);

  const effectiveUserData = impersonating ? impersonating.staff : userData;

  const value = {
    user,
    userData: effectiveUserData,
    loading,
    isAdmin: effectiveUserData?.role === 'admin' || effectiveUserData?.role === 'super_admin',
    isSuperAdmin: effectiveUserData?.role === 'super_admin',
    initialProperty,
    userDataReady,
    impersonating,
    startImpersonation,
    stopImpersonation,
    refreshUserData,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
