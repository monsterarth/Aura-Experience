// src/context/PropertyContext.tsx
"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Property } from "@/types/aura";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, limit } from "firebase/firestore";

interface PropertyContextType {
  property: Property | null;
  loading: boolean;
  error: string | null;
  refreshProperty: (identifier: string) => Promise<void>;
}

const PropertyContext = createContext<PropertyContextType | undefined>(undefined);

/**
 * PropertyProvider: Garante que todos os componentes saibam em qual "instância" de propriedade estão.
 * No Aura, isso isola os dados e aplica o branding dinamicamente.
 */
export const PropertyProvider = ({ 
  children, 
  initialSlug 
}: { 
  children: ReactNode; 
  initialSlug?: string; 
}) => {
  const [property, setProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProperty = async (identifier: string) => {
    try {
      setLoading(true);
      setError(null);

      // Busca a propriedade pelo slug (subdomínio ou identificador de URL)
      const propertiesRef = collection(db, "properties");
      const q = query(propertiesRef, where("slug", "==", identifier), limit(1));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        throw new Error("Propriedade não encontrada.");
      }

      const propertyData = {
        id: querySnapshot.docs[0].id,
        ...querySnapshot.docs[0].data()
      } as Property;

      setProperty(propertyData);
      
      // Aplica as cores da marca no CSS Global via CSS Variables
      if (propertyData.primaryColor) {
        document.documentElement.style.setProperty('--primary', propertyData.primaryColor);
      }
      if (propertyData.secondaryColor) {
        document.documentElement.style.setProperty('--secondary', propertyData.secondaryColor);
      }

    } catch (err: any) {
      console.error("[Aura PropertyContext] Erro:", err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialSlug) {
      fetchProperty(initialSlug);
    }
  }, [initialSlug]);

  return (
    <PropertyContext.Provider value={{ property, loading, error, refreshProperty: fetchProperty }}>
      {children}
    </PropertyContext.Provider>
  );
};

export const useProperty = () => {
  const context = useContext(PropertyContext);
  if (context === undefined) {
    throw new Error("useProperty deve ser usado dentro de um PropertyProvider");
  }
  return context;
};