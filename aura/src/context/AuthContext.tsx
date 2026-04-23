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
  initialProperty: any | null;
  userDataReady: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userData: null,
  loading: true,
  isAdmin: false,
  isSuperAdmin: false,
  initialProperty: null,
  userDataReady: false,
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [userData, setUserData] = useState<Staff | null>(null);
  const [loading, setLoading] = useState(true);
  const [userDataReady, setUserDataReady] = useState(false);
  const [initialProperty, setInitialProperty] = useState<any | null>(null);

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
     * ═══ Fast-path: API call server-side (bypassa browser lock) ═══════════
     * No F5/reload, o browser lock do Supabase pode travar o onAuthStateChange
     * por até 10s. Esta chamada lê a sessão diretamente dos cookies no server,
     * sem nenhuma dependência do lock. Resultado: página renderiza em <500ms.
     */
    fetch('/api/admin/auth/me')
      .then(res => { if (!res.ok) throw new Error('auth-api'); return res.json(); })
      .then(data => {
        if (mounted && data?.staff && !userDataRef.current) {
          userDataRef.current = data.staff; // Guard ref immediately — prevents INITIAL_SESSION race
          setUserData(data.staff);
          setUserDataReady(true);
          if (data.property) setInitialProperty(data.property);
          setLoading(false);
        }
      })
      .catch(() => {}); // Silent — onAuthStateChange + safety timeout tratam o fallback

    /**
     * Safety timeout: se INITIAL_SESSION e o fast-path falharem, tenta getUser().
     */
    const safetyTimeout = setTimeout(async () => {
      if (mounted && !initialSessionReceived.current && !userDataRef.current) {
        console.warn("[Auth] Timeout — acionando fallback getUser().");
        initialSessionReceived.current = true;

        try {
          const { data: { user: fallbackUser }, error } = await supabase.auth.getUser();
          if (!mounted || userDataRef.current) return;

          if (error) {
            const retry = await supabase.auth.getUser();
            if (!mounted || userDataRef.current) return;
            if (!retry.error && retry.data.user) {
              setUser(retry.data.user);
              const staff = await fetchStaffData(retry.data.user.id);
              if (mounted) { setUserData(staff); setUserDataReady(true); }
            } else {
              if (mounted) { setUser(null); setUserData(null); setUserDataReady(true); }
            }
          } else if (fallbackUser) {
            setUser(fallbackUser);
            const staff = await fetchStaffData(fallbackUser.id);
            if (mounted) { setUserData(staff); setUserDataReady(true); }
          } else {
            if (mounted) { setUser(null); setUserData(null); setUserDataReady(true); }
          }
        } catch (err) {
          console.warn("[Auth] Exception no getUser fallback:", err);
          if (mounted) setUserDataReady(true); // Libera mesmo em erro — evita loading infinito
        } finally {
          if (mounted) setLoading(false);
        }
      }
    }, 5000);

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
              if (mounted && staff) { setUserData(staff); setUserDataReady(true); }
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
    initialProperty,
    userDataReady,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
