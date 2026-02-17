// src/services/property-service.ts
import { db } from "@/lib/firebase";
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, // Adicionado
  getDocs, 
  query, 
  orderBy, 
  serverTimestamp, 
  updateDoc 
} from "firebase/firestore";
import { Property } from "@/types/aura";
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

      // Auditoria
      await AuditService.log({
        propertyId: "SYSTEM", 
        userId: actorId,
        userName: actorName,
        action: "CREATE",
        entity: "PROPERTY" as any, // Cast as any caso o enum ainda não tenha PROPERTY
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
   * Busca uma propriedade específica pelo ID (ou Slug, já que usamos slug como ID).
   * NECESSÁRIO PARA A TELA DE CONFIGURAÇÃO DE TEMA.
   */
  async getPropertyById(id: string): Promise<Property | null> {
    try {
      const docRef = doc(db, "properties", id);
      const snap = await getDoc(docRef);
      
      if (snap.exists()) {
        return { id: snap.id, ...snap.data() } as Property;
      }
      return null;
    } catch (error) {
      console.error("[PropertyService] Erro ao buscar propriedade por ID:", error);
      return null;
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
   * Atualiza dados de uma propriedade.
   * Usado pela tela de "Configurações" (Theme Builder).
   */
  async updateProperty(propertyId: string, updates: Partial<Property>) {
    const docRef = doc(db, "properties", propertyId);
    
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });

    // Nota: Como a tela de Theme Builder atual não passa o ID do admin logado,
    // não estamos chamando o AuditService aqui para evitar erros de typescript.
    // Se quiser auditoria aqui, precisaremos atualizar o handleSave na página para passar o user ID.
  },

  /**
   * Método legado ou específico para configurações com auditoria completa.
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
      entity: "PROPERTY" as any, 
      entityId: propertyId,
      newData: updates,
      details: `Configurações da propriedade ${propertyId} atualizadas.`
    });
  }
};