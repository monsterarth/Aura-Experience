// src/context/PropertyContext.tsx
"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { Property, PropertyTheme } from "@/types/aura";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, limit, doc, getDoc } from "firebase/firestore";
import { useAuth } from "./AuthContext";

interface PropertyContextType {
  currentProperty: Property | null;
  setProperty: (property: Property | null) => void;
  loading: boolean;
  error: string | null;
  refreshProperty: (identifier: string) => Promise<void>;
}

const PropertyContext = createContext<PropertyContextType | undefined>(undefined);

// --- UTILITÁRIO: Converter Hex para HSL ---
function hexToHSL(hex: string): string {
  hex = hex.replace(/^#/, '');
  let r = parseInt(hex.substring(0, 2), 16);
  let g = parseInt(hex.substring(2, 4), 16);
  let b = parseInt(hex.substring(4, 6), 16);
  r /= 255; g /= 255; b /= 255;
  let max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max !== min) {
    let d = max - min;
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
  const { userData, isSuperAdmin, loading: authLoading } = useAuth();
  const [property, setProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Aplica o tema visualmente no CSS do navegador
  const updateTheme = useCallback((data: Property) => {
    if (!data.theme) return;

    const root = document.documentElement;
    const { colors, shape, typography } = data.theme;

    // 1. Cores
    if (colors.primary) {
      root.style.setProperty('--primary', hexToHSL(colors.primary));
    }
    if (colors.onPrimary) {
      root.style.setProperty('--primary-foreground', hexToHSL(colors.onPrimary));
    }
    if (colors.secondary) {
      root.style.setProperty('--secondary', hexToHSL(colors.secondary));
    }
    if (colors.onSecondary) {
      root.style.setProperty('--secondary-foreground', hexToHSL(colors.onSecondary));
    }
    if (colors.background) {
      root.style.setProperty('--background', hexToHSL(colors.background));
    }
    if (colors.surface) {
      root.style.setProperty('--card', hexToHSL(colors.surface));
      root.style.setProperty('--popover', hexToHSL(colors.surface));
    }
    if (colors.textMain) {
      root.style.setProperty('--foreground', hexToHSL(colors.textMain));
      root.style.setProperty('--card-foreground', hexToHSL(colors.textMain));
    }
    if (colors.textMuted) {
      root.style.setProperty('--muted-foreground', hexToHSL(colors.textMuted));
    }
    if (colors.accent) {
      root.style.setProperty('--accent', hexToHSL(colors.accent));
      root.style.setProperty('--border', hexToHSL(colors.accent));
      root.style.setProperty('--input', hexToHSL(colors.accent));
      root.style.setProperty('--ring', hexToHSL(colors.primary));
    }
    if (colors.error) {
      root.style.setProperty('--destructive', hexToHSL(colors.error));
      root.style.setProperty('--destructive-foreground', "0 0% 98%");
    }

    // 2. Formas
    if (shape && shape.radius) {
      root.style.setProperty('--radius', shape.radius);
    }

    // 3. Fontes
    if (typography) {
      if (typography.fontFamilyHeading) root.style.setProperty('--font-heading', typography.fontFamilyHeading);
      if (typography.fontFamilyBody) root.style.setProperty('--font-body', typography.fontFamilyBody);
    }
  }, []);

  const handleSetProperty = useCallback((data: Property | null) => {
    if (data) updateTheme(data);
    setProperty(data);
  }, [updateTheme]);

  // Busca por SLUG
  const fetchPropertyBySlug = useCallback(async (slug: string) => {
    try {
      setLoading(true);
      const q = query(collection(db, "properties"), where("slug", "==", slug), limit(1));
      const snap = await getDocs(q);
      if (snap.empty) throw new Error("Propriedade não encontrada.");

      const data = { id: snap.docs[0].id, ...snap.docs[0].data() } as Property;
      handleSetProperty(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [handleSetProperty]);

  // Busca por ID
  const fetchPropertyById = useCallback(async (id: string) => {
    try {
      setLoading(true);
      const docRef = doc(db, "properties", id);
      const snap = await getDoc(docRef);

      if (!snap.exists()) throw new Error("Propriedade vinculada não encontrada.");

      const data = { id: snap.id, ...snap.data() } as Property;
      handleSetProperty(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [handleSetProperty]);

  useEffect(() => {
    if (authLoading) return;

    if (initialSlug) {
      fetchPropertyBySlug(initialSlug);
    } else if (!isSuperAdmin && userData?.propertyId) {
      // Verifica se a propriedade já está carregada para evitar loops
      if (property?.id !== userData.propertyId) {
        fetchPropertyById(userData.propertyId);
      } else {
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  }, [initialSlug, userData, isSuperAdmin, authLoading, fetchPropertyBySlug, fetchPropertyById, property?.id]);

  return (
    <PropertyContext.Provider value={{ currentProperty: property, setProperty: handleSetProperty, loading, error, refreshProperty: fetchPropertyBySlug }}>
      {children}
    </PropertyContext.Provider>
  );
};

export const useProperty = () => {
  const context = useContext(PropertyContext);
  if (!context) throw new Error("useProperty deve ser usado dentro de um PropertyProvider");
  return context;
};
