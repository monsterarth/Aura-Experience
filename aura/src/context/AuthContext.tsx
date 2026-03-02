// src/context/AuthContext.tsx
"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { User as SupabaseUser } from "@supabase/supabase-js";
import { Staff, UserRole } from "@/types/aura";

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

  useEffect(() => {
    let mounted = true;

    async function initializeAuth() {
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        setUser(session.user);
        const { data: staffData } = await supabase.from('staff').select('*').eq('id', session.user.id).single();
        if (mounted && staffData) {
          setUserData(staffData as Staff);
        }
      } else {
        if (mounted) {
          setUser(null);
          setUserData(null);
        }
      }
      if (mounted) setLoading(false);
    }

    initializeAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      const currentUser = session?.user || null;
      setUser(currentUser);

      if (currentUser) {
        const { data: staffData } = await supabase.from('staff').select('*').eq('id', currentUser.id).single();
        if (mounted && staffData) {
          setUserData(staffData as Staff);
        }
      } else {
        if (mounted) setUserData(null);
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
