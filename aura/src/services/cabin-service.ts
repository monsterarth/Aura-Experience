// src/services/cabin-service.ts
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { Cabin } from "@/types/aura";

export const CabinService = {
  /**
   * Busca todas as cabanas de uma propriedade específica.
   */
  async getCabinsByProperty(propertyId: string): Promise<Cabin[]> {
    try {
      const cabinsRef = collection(db, "cabins");
      const q = query(
        cabinsRef, 
        where("propertyId", "==", propertyId),
        orderBy("name", "asc")
      );
      
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Cabin[];
    } catch (error) {
      console.error("[CabinService] Erro ao buscar cabanas:", error);
      return [];
    }
  }
};