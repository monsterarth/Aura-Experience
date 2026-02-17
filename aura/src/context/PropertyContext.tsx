// src/context/PropertyContext.tsx
"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Property } from "@/types/aura";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, limit, doc, getDoc } from "firebase/firestore";
import { useAuth } from "./AuthContext";

interface PropertyContextType {
  property: Property | null;
  setProperty: (property: Property | null) => void;
  loading: boolean;
  error: string | null;
  refreshProperty: (identifier: string) => Promise<void>;
}

const PropertyContext = createContext<PropertyContextType | undefined>(undefined);

export const PropertyProvider = ({ children, initialSlug }: { children: ReactNode; initialSlug?: string; }) => {
  const { userData, isSuperAdmin, loading: authLoading } = useAuth();
  const [property, setProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Busca por SLUG (Geralmente usado em rotas públicas ou Super Admin)
  const fetchPropertyBySlug = async (slug: string) => {
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
  };

  // Busca por ID (Usado para Admins logados)
  const fetchPropertyById = async (id: string) => {
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
  };

  const updateTheme = (data: Property) => {
    if (data.primaryColor) document.documentElement.style.setProperty('--primary', data.primaryColor);
    if (data.secondaryColor) document.documentElement.style.setProperty('--secondary', data.secondaryColor);
  };

  const handleSetProperty = (data: Property | null) => {
    if (data) updateTheme(data);
    setProperty(data);
  };

  useEffect(() => {
    // Só roda a lógica quando a autenticação terminar de carregar
    if (authLoading) return;

    // 1. Se tiver initialSlug (URL), prioriza ele
    if (initialSlug) {
        fetchPropertyBySlug(initialSlug);
    } 
    // 2. Se for Admin Comum (não Super Admin) e tiver propertyId no cadastro
    else if (!isSuperAdmin && userData?.propertyId) {
        // Evita refetch se já estiver carregada a mesma propriedade
        if (property?.id !== userData.propertyId) {
            fetchPropertyById(userData.propertyId);
        } else {
            setLoading(false);
        }
    } 
    // 3. Se for Super Admin e não tiver nada selecionado, apenas termina o loading
    else {
        setLoading(false);
    }
  }, [initialSlug, userData, isSuperAdmin, authLoading]);

  return (
    <PropertyContext.Provider value={{ property, setProperty: handleSetProperty, loading, error, refreshProperty: fetchPropertyBySlug }}>
      {children}
    </PropertyContext.Provider>
  );
};

export const useProperty = () => {
  const context = useContext(PropertyContext);
  if (!context) throw new Error("useProperty deve ser usado dentro de um PropertyProvider");
  return context;
};