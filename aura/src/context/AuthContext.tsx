// src/context/AuthContext.tsx
"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { createClientBrowser } from "@/lib/supabase-browser";
import { User as SupabaseUser, AuthChangeEvent, Session } from "@supabase/supabase-js";
import { Staff, UserRole } from "@/types/aura";
import { deleteCookie } from "cookies-next";

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

  // Vercel SSR requirement: instantiate here inside the boundary
  const supabase = createClientBrowser();

  useEffect(() => {
    let mounted = true;

    const handleLogout = async () => {
      if (typeof window !== 'undefined' && !window.location.pathname.includes('/admin/login')) {
        deleteCookie('aura-session');
        try {
          const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 3000));
          await Promise.race([supabase.auth.signOut(), timeout]);
        } catch (err) {
          console.error("Erro ao sair no AuthContext:", err);
        } finally {
          window.location.href = '/admin/login';
        }
      }
    };

    async function initializeAuth() {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        console.error("Auth session error:", sessionError);
        await handleLogout();
        if (mounted) setLoading(false);
        return;
      }

      if (session?.user) {
        setUser(session.user);
        const { data: staffData, error: staffError } = await supabase.from('staff').select('*').eq('id', session.user.id).single();

        if (staffError) {
          console.error("Auth staff fetch error:", staffError);
          // If the error indicates a JWT/Auth issue (e.g., 401 or PGRST301), logout
          if (staffError.code === 'PGRST301' || staffError.code === '401' || staffError.message.includes('JWT')) {
            await handleLogout();
          } else if (mounted) {
            // Maybe a temporary network error, don't forcefully logout but keep them in "loading" or missing data?
          }
        } else if (mounted && staffData) {
          setUserData(staffData as Staff);
        }
      } else {
        if (mounted) {
          setUser(null);
          setUserData(null);
        }
        await handleLogout();
      }
      if (mounted) setLoading(false);
    }

    initializeAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session: Session | null) => {
      const currentUser = session?.user || null;
      setUser(currentUser);

      if (event === 'SIGNED_OUT') {
        await handleLogout();
      } else if (currentUser) {
        const { data: staffData, error: staffError } = await supabase.from('staff').select('*').eq('id', currentUser.id).single();

        if (staffError && (staffError.code === 'PGRST301' || staffError.code === '401' || staffError.message.includes('JWT'))) {
          await handleLogout();
        } else if (mounted && staffData) {
          setUserData(staffData as Staff);
        }
      } else {
        if (mounted) setUserData(null);
        // Force logout if we somehow lose user without SIGNED_OUT event
        await handleLogout();
      }
      if (mounted) setLoading(false);
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

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
