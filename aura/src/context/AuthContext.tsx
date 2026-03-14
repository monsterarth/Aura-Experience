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
  // Guard contra double-mount do React Strict Mode (dev)
  const initStarted = useRef(false);

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

  /**
   * Tenta renovar a sessão de forma segura.
   * 1. getSession() — lê os cookies e usa o refresh token para trocar por novo access token
   * 2. getUser() — valida o token com o servidor Supabase Auth
   * 
   * Se o access token expirou, getSession() faz o refresh automaticamente via o refresh_token
   * armazenado nos cookies pelo @supabase/ssr.
   */
  const refreshSession = useCallback(async (): Promise<SupabaseUser | null> => {
    try {
      // Passo 1: Força o client a tentar refresh do token via cookies
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        console.warn("[Auth] Sessão não encontrada ou expirada:", sessionError?.message);
        return null;
      }

      // Passo 2: Valida o user com o servidor (garante que o token é válido)
      const { data: { user: validatedUser }, error: userError } = await supabase.auth.getUser();

      if (userError || !validatedUser) {
        console.warn("[Auth] Usuário não validado:", userError?.message);
        return null;
      }

      return validatedUser;
    } catch (err: any) {
      // AbortError é esperado no React Strict Mode (dev): o double-mount faz a segunda
      // instância roubar o navigator lock da primeira via 'steal'. Silenciar.
      if (err?.name !== 'AbortError') {
        console.error("[Auth] Erro ao renovar sessão:", err);
      }
      return null;
    }
  }, [supabase]);

  useEffect(() => {
    let mounted = true;

    /**
     * Inicialização: Usa refreshSession() que faz getSession() + getUser().
     * NÃO redireciona para login — o middleware já protege as rotas.
     * Se falhar, simplesmente fica sem auth e a UI mostra o estado adequado.
     */
    async function initializeAuth() {
      // React Strict Mode monta/desmonta/remonta em dev — pula se já iniciou.
      if (initStarted.current) return;
      initStarted.current = true;
      try {
        const currentUser = await refreshSession();

        if (!mounted) return;

        if (!currentUser) {
          setUser(null);
          setUserData(null);
          setLoading(false);
          return;
        }

        setUser(currentUser);
        const staff = await fetchStaffData(currentUser.id);
        if (mounted && staff) {
          setUserData(staff);
        }
      } catch (err) {
        console.error("[Auth] Erro na inicialização:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    initializeAuth();

    /**
     * Listener de mudança de estado de auth.
     * IMPORTANTE: Só faz logout no evento SIGNED_OUT explícito.
     * Eventos transitórios com session=null (durante refresh) são ignorados.
     */
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        if (!mounted) return;

        const currentUser = session?.user || null;

        if (event === 'SIGNED_OUT') {
          setUser(null);
          setUserData(null);

          // Só redireciona se não estiver já na página de login
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
            // Só busca staff se mudou o user ou se não temos dados ainda
            if (currentUser.id !== userRef.current?.id || !userDataRef.current) {
              const staff = await fetchStaffData(currentUser.id);
              if (mounted && staff) {
                setUserData(staff);
              }
            }
          }
        }

        // Para outros eventos (INITIAL_SESSION, USER_UPDATED, etc.)
        if (currentUser && event !== 'TOKEN_REFRESHED' && event !== 'SIGNED_IN') {
          setUser(currentUser);
        }
      }
    );

    /**
     * Listener de visibilidade da aba.
     * Quando o usuário volta para a aba após idle, re-valida a sessão
     * via refreshSession() (getSession + getUser) para renovar os tokens.
     * 
     * Usa refs para comparar com o estado atual (evita closure stale).
     * NÃO zera userData em caso de falha — mantém cache, o middleware cuida da proteção.
     */
    const handleVisibilityChange = async () => {
      if (document.visibilityState !== 'visible' || !mounted) return;

      try {
        const refreshedUser = await refreshSession();

        if (!mounted) return;

        if (!refreshedUser) {
          // Erro transitório ou sessão realmente morta.
          // NÃO zeramos userData — mantemos o cache.
          // O middleware vai redirecionar se a sessão está realmente morta
          // na próxima navegação.
          console.warn("[Auth] Falha ao renovar sessão no visibility change — mantendo cache.");
          return;
        }

        setUser(refreshedUser);

        // Só refaz fetch do staff se o user mudou ou não temos dados
        if (refreshedUser.id !== userRef.current?.id || !userDataRef.current) {
          const staff = await fetchStaffData(refreshedUser.id);
          if (mounted && staff) setUserData(staff);
        }
      } catch {
        // Erro de rede transitório — não fazer nada, manter cache
        console.warn("[Auth] Erro de rede no visibility change — mantendo cache.");
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      mounted = false;
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
