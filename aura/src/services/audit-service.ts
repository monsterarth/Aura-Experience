// src/services/audit-service.ts
import { db } from "@/lib/firebase";
import { 
  collection, 
  addDoc, 
  serverTimestamp, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  limit 
} from "firebase/firestore";
import { AuditLog } from "@/types/aura";

/**
 * AuditService: O motor de vigilância do Projeto Aura.
 * Garante que toda ação tenha um responsável, um timestamp e um rastro de dados.
 */
export const AuditService = {
  /**
   * Registra uma nova entrada de auditoria no Firestore.
   */
  async log(data: Omit<AuditLog, "id" | "timestamp">): Promise<string> {
    try {
      const auditRef = collection(db, "audit_logs");
      
      const docRef = await addDoc(auditRef, {
        ...data,
        timestamp: serverTimestamp(),
      });

      console.log(`[Aura Audit] Log registrado: ${data.action} em ${data.entityId}`);
      return docRef.id;
    } catch (error) {
      // Falha na auditoria é um erro crítico no Aura
      console.error("CRITICAL_ERROR: Falha ao gravar log de auditoria no Firestore.", error);
      throw new Error("Erro de integridade: Não foi possível registrar a auditoria da ação.");
    }
  },

  /**
   * Recupera o histórico de auditoria de uma entidade específica (ex: uma Estadia ou um Hóspede).
   */
  async getEntityHistory(entityId: string, propertyId: string) {
    try {
      const auditRef = collection(db, "audit_logs");
      const q = query(
        auditRef,
        where("propertyId", "==", propertyId),
        where("entityId", "==", entityId),
        orderBy("timestamp", "desc")
      );

      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as AuditLog[];
    } catch (error) {
      console.error("Erro ao buscar histórico de auditoria:", error);
      return [];
    }
  },

  /**
   * Busca as últimas ações realizadas em uma propriedade para o dashboard administrativo.
   */
  async getPropertyRecentActivity(propertyId: string, maxLogs: number = 20) {
    try {
      const auditRef = collection(db, "audit_logs");
      const q = query(
        auditRef,
        where("propertyId", "==", propertyId),
        orderBy("timestamp", "desc"),
        limit(maxLogs)
      );

      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as AuditLog[];
    } catch (error) {
      console.error("Erro ao buscar atividade recente:", error);
      return [];
    }
  },

  /**
   * Busca logs de todas as propriedades (Exclusivo Super Admin)
   */
  async getGlobalActivity(maxLogs: number = 50) {
    try {
      const auditRef = collection(db, "audit_logs");
      // Busca geral sem filtro de propertyId, ordenada por tempo
      const q = query(
        auditRef,
        orderBy("timestamp", "desc"),
        limit(maxLogs)
      );

      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as AuditLog[];
    } catch (error) {
      console.error("Erro ao buscar logs globais:", error);
      return [];
    }
  }
};