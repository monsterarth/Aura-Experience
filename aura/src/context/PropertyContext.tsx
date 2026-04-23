// src/context/PropertyContext.tsx
"use client";

import React, { createContext, useContext, useEffect, useState, useRef, ReactNode, useCallback } from "react";
import { Property } from "@/types/aura";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./AuthContext";

interface PropertyContextType {
  currentProperty: Property | null;
  setProperty: (property: Property | null) => void;
  loading: boolean;
  error: string | null;
  refreshProperty: (identifier: string) => Promise<void>;
}

const PropertyContext = createContext<PropertyContextType | undefined>(undefined);

const CACHE_KEY = 'aura-property-cache';
const PROPERTY_ID_KEY = 'aura-active-property';

function readCachedProperty(): Property | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Property) : null;
  } catch { return null; }
}

function writeCachedProperty(p: Property | null) {
  if (typeof window === 'undefined') return;
  try {
    if (p) {
      localStorage.setItem(CACHE_KEY, JSON.stringify(p));
      localStorage.setItem(PROPERTY_ID_KEY, p.id);
    } else {
      localStorage.removeItem(CACHE_KEY);
      localStorage.removeItem(PROPERTY_ID_KEY);
    }
  } catch { /* quota exceeded — não crítico */ }
}

// --- UTILITÁRIO: Converter Hex para HSL ---
function hexToHSL(hex: string): string {
  hex = hex.replace(/^#/, '');
  let r = parseInt(hex.substring(0, 2), 16);
  let g = parseInt(hex.substring(2, 4), 16);
  let b = parseInt(hex.substring(4, 6), 16);
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export const PropertyProvider = ({ children, initialSlug }: { children: ReactNode; initialSlug?: string; }) => {
  const { userData, isSuperAdmin, loading: authLoading, initialProperty, userDataReady } = useAuth();

  const [property, setPropertyState] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Ref para evitar re-runs: property já carregada nesta sessão
  const loadedRef = useRef(false);
  // Refs para ler valores sem adicionar como dependências do efeito
  const userDataRef = useRef(userData);
  const isSuperAdminRef = useRef(isSuperAdmin);
  const propertyRef = useRef(property);
  useEffect(() => { userDataRef.current = userData; }, [userData]);
  useEffect(() => { isSuperAdminRef.current = isSuperAdmin; }, [isSuperAdmin]);
  useEffect(() => { propertyRef.current = property; }, [property]);

  // Aplica o tema visualmente no CSS do navegador
  const applyTheme = useCallback((data: Property) => {
    if (!data.theme) return;
    const root = document.documentElement;
    const { colors, shape, typography } = data.theme;
    if (colors.primary) root.style.setProperty('--primary', hexToHSL(colors.primary));
    if (colors.onPrimary) root.style.setProperty('--primary-foreground', hexToHSL(colors.onPrimary));
    if (colors.secondary) root.style.setProperty('--secondary', hexToHSL(colors.secondary));
    if (colors.onSecondary) root.style.setProperty('--secondary-foreground', hexToHSL(colors.onSecondary));
    if (colors.background) root.style.setProperty('--background', hexToHSL(colors.background));
    if (colors.surface) {
      root.style.setProperty('--card', hexToHSL(colors.surface));
      root.style.setProperty('--popover', hexToHSL(colors.surface));
    }
    if (colors.textMain) {
      root.style.setProperty('--foreground', hexToHSL(colors.textMain));
      root.style.setProperty('--card-foreground', hexToHSL(colors.textMain));
    }
    if (colors.textMuted) root.style.setProperty('--muted-foreground', hexToHSL(colors.textMuted));
    if (colors.accent) {
      root.style.setProperty('--accent', hexToHSL(colors.accent));
      root.style.setProperty('--border', hexToHSL(colors.accent));
      root.style.setProperty('--input', hexToHSL(colors.accent));
    }
    if (colors.primary) root.style.setProperty('--ring', hexToHSL(colors.primary));
    if (colors.error) {
      root.style.setProperty('--destructive', hexToHSL(colors.error));
      root.style.setProperty('--destructive-foreground', '0 0% 98%');
    }
    if (shape?.radius) root.style.setProperty('--radius', shape.radius);
    if (typography?.fontFamilyHeading) root.style.setProperty('--font-heading', typography.fontFamilyHeading);
    if (typography?.fontFamilyBody) root.style.setProperty('--font-body', typography.fontFamilyBody);
  }, []);

  const handleSetProperty = useCallback((data: Property | null) => {
    if (data) {
      applyTheme(data);
      loadedRef.current = true;
      writeCachedProperty(data);
    } else {
      loadedRef.current = false;
      writeCachedProperty(null);
    }
    setPropertyState(data);
  }, [applyTheme]);


  // Busca por SLUG
  const fetchPropertyBySlug = useCallback(async (slug: string) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('properties')
        .select('*')
        .eq('slug', slug)
        .limit(1)
        .single();
      if (error || !data) throw new Error('Propriedade não encontrada.');
      handleSetProperty(data as Property);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [handleSetProperty]);

  // Busca por ID — com fallback para cache se Supabase falhar
  const fetchPropertyById = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('properties')
        .select('*')
        .eq('id', id)
        .single();
      if (error || !data) throw new Error('Propriedade não encontrada.');
      handleSetProperty(data as Property);
    } catch (err: any) {
      // Fallback: se já temos cache com o mesmo ID, usa ele e não mostra erro
      const cached = readCachedProperty();
      if (cached && cached.id === id) {
        handleSetProperty(cached);
        setError(null);
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [handleSetProperty]);

  useEffect(() => {
    // Aguarda auth resolver
    if (authLoading || !userDataReady) return;

    // Fast-path: AuthContext trouxe a property do servidor — usa direto
    if (initialProperty && !loadedRef.current) {
      handleSetProperty(initialProperty as Property);
      setLoading(false);
      return;
    }

    // Property já carregada nesta sessão — libera loading e atualiza em background
    if (loadedRef.current) {
      setLoading(false);
      // Refresh silencioso usando o ID da property em memória (não localStorage)
      const currentId = propertyRef.current?.id;
      if (currentId) {
        supabase.from('properties').select('*').eq('id', currentId).single()
          .then((res: { data: Property | null }) => { if (res.data) handleSetProperty(res.data); })
          .catch(() => { /* silencioso */ });
      }
      return;
    }

    // Slug fixo (portais de hóspede)
    if (initialSlug) {
      fetchPropertyBySlug(initialSlug);
      return;
    }

    const ud = userDataRef.current;
    const superAdmin = isSuperAdminRef.current;
    const savedId = typeof window !== 'undefined' ? localStorage.getItem(PROPERTY_ID_KEY) : null;

    if (!superAdmin) {
      // Usuário normal: usa SEMPRE seu propertyId do banco — nunca localStorage
      // (evita herdar property de sessão anterior de outro usuário)
      if (ud?.propertyId) {
        fetchPropertyById(ud.propertyId);
      } else {
        setLoading(false);
      }
    } else {
      if (savedId) {
        fetchPropertyById(savedId);
      } else {
        setLoading(false);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, userDataReady, initialProperty, initialSlug]);
  // userData e isSuperAdmin lidos via refs — não disparam re-run desnecessário

  return (
    <PropertyContext.Provider value={{
      currentProperty: property,
      setProperty: handleSetProperty,
      loading,
      error,
      refreshProperty: fetchPropertyBySlug,
    }}>
      {children}
    </PropertyContext.Provider>
  );
};

export const useProperty = () => {
  const context = useContext(PropertyContext);
  if (!context) throw new Error('useProperty deve ser usado dentro de um PropertyProvider');
  return context;
};
