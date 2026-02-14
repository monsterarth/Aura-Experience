// src/services/property-service.ts
import { db } from "@/lib/firebase";
import { 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  query, 
  orderBy, 
  serverTimestamp, 
  updateDoc 
} from "firebase/firestore";
import { Property, AuditLog } from "@/types/aura";
import { AuditService } from "./audit-service";

/**
 * PropertyService: Gerencia as instâncias de propriedades no ecossistema Aura.
 */
export const PropertyService = {
  /**
   * Registra uma nova propriedade no Aura.
   */
  async createProperty(propertyData: Omit<Property, "id" | "createdAt">, actorId: string, actorName: string) {
    try {
      // Usamos o slug como ID para facilitar a resolução de URL
      const propertyId = propertyData.slug;
      const docRef = doc(db, "properties", propertyId);

      const newProperty = {
        ...propertyData,
        id: propertyId,
        createdAt: serverTimestamp(),
      };

      await setDoc(docRef, newProperty);

      // Auditoria Obrigatória
      await AuditService.log({
        propertyId: "SYSTEM", // Ações de super-admin são marcadas como SYSTEM
        userId: actorId,
        userName: actorName,
        action: "CREATE",
        entity: "CABIN", // Usando CABIN como placeholder se não houver 'PROPERTY' no enum, 
                         // mas recomendo atualizar o enum AuditLog no aura.ts para incluir 'PROPERTY'
        entityId: propertyId,
        newData: newProperty,
        details: `Propriedade ${propertyData.name} registrada na plataforma.`
      });

      return { success: true, id: propertyId };
    } catch (error: any) {
      console.error("[PropertyService] Erro ao criar propriedade:", error);
      throw error;
    }
  },

  /**
   * Lista todas as propriedades para o Super Admin.
   */
  async getAllProperties(): Promise<Property[]> {
    const q = query(collection(db, "properties"), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Property[];
  },

  /**
   * Atualiza configurações de uma propriedade existente.
   */
  async updateSettings(propertyId: string, updates: Partial<Property>, actorId: string, actorName: string) {
    const docRef = doc(db, "properties", propertyId);
    
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });

    await AuditService.log({
      propertyId: "SYSTEM",
      userId: actorId,
      userName: actorName,
      action: "UPDATE",
      entity: "CABIN", 
      entityId: propertyId,
      newData: updates,
      details: `Configurações da propriedade ${propertyId} atualizadas.`
    });
  }
};