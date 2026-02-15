// src/context/PropertyContext.tsx
"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Property } from "@/types/aura";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, limit } from "firebase/firestore";
import { useAuth } from "./AuthContext"; // Import necessário para saber se é super_admin

interface PropertyContextType {
  property: Property | null;
  setProperty: (property: Property | null) => void; // Permite alteração global
  loading: boolean;
  error: string | null;
  refreshProperty: (identifier: string) => Promise<void>;
}

const PropertyContext = createContext<PropertyContextType | undefined>(undefined);

export const PropertyProvider = ({ children, initialSlug }: { children: ReactNode; initialSlug?: string; }) => {
  const { userData, isSuperAdmin } = useAuth();
  const [property, setProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProperty = async (identifier: string) => {
    try {
      setLoading(true);
      const q = query(collection(db, "properties"), where("slug", "==", identifier), limit(1));
      const snap = await getDocs(q);
      if (snap.empty) throw new Error("Propriedade não encontrada.");

      const data = { id: snap.docs[0].id, ...snap.docs[0].data() } as Property;
      updateTheme(data);
      setProperty(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const updateTheme = (data: Property) => {
    if (data.primaryColor) document.documentElement.style.setProperty('--primary', data.primaryColor);
    if (data.secondaryColor) document.documentElement.style.setProperty('--secondary', data.secondaryColor);
  };

  // Se o admin mudar a propriedade no sidebar, atualizamos o tema
  const handleSetProperty = (data: Property | null) => {
    if (data) updateTheme(data);
    setProperty(data);
  };

  useEffect(() => {
    if (initialSlug) fetchProperty(initialSlug);
    // Se não for super admin, ele já nasce com a propriedade do seu userData
    else if (!isSuperAdmin && userData?.propertyId && !property) {
       // Aqui você pode fazer um fetch pelo ID se necessário
    }
  }, [initialSlug, userData, isSuperAdmin]);

  return (
    <PropertyContext.Provider value={{ property, setProperty: handleSetProperty, loading, error, refreshProperty: fetchProperty }}>
      {children}
    </PropertyContext.Provider>
  );
};

export const useProperty = () => {
  const context = useContext(PropertyContext);
  if (!context) throw new Error("useProperty deve ser usado dentro de um PropertyProvider");
  return context;
};