// src/services/housekeeping-service.ts
import { db } from "@/lib/firebase";
import { 
  collection, doc, getDocs, updateDoc, writeBatch, 
  serverTimestamp, query, where, orderBy, setDoc, getDoc
} from "firebase/firestore";
import { HousekeepingTask, FolioItem } from "@/types/aura";
import { v4 as uuidv4 } from 'uuid';
import { AuditService } from "./audit-service";

export const HousekeepingService = {
  
  /**
   * Busca todas as tarefas ativas do dia na propriedade
   */
  async getActiveTasks(propertyId: string): Promise<HousekeepingTask[]> {
    const q = query(
      collection(db, "properties", propertyId, "housekeeping_tasks"),
      where("status", "!=", "cancelled") // Traz pendentes, em progresso, aguardando e concluídas
    );
    
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as HousekeepingTask));
  },

  /**
   * Governanta delega a tarefa para uma camareira específica
   */
  async assignTask(propertyId: string, taskId: string, maidId: string, actorId: string, actorName: string) {
    const taskRef = doc(db, "properties", propertyId, "housekeeping_tasks", taskId);
    
    await updateDoc(taskRef, {
      assignedTo: maidId,
      updatedAt: serverTimestamp()
    });

    await AuditService.log({
      propertyId,
      userId: actorId,
      userName: actorName,
      action: "UPDATE",
      entity: "CABIN",
      entityId: taskId,
      details: `Tarefa delegada para a camareira (ID: ${maidId}).`
    });
  },

  /**
   * Camareira Inicia a Limpeza (Dispara o Cronômetro)
   */
  async startTask(propertyId: string, taskId: string, assignedTo: string, actorName: string) {
    const taskRef = doc(db, "properties", propertyId, "housekeeping_tasks", taskId);
    
    await updateDoc(taskRef, {
      status: 'in_progress',
      assignedTo,
      startedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    await AuditService.log({
      propertyId,
      userId: assignedTo,
      userName: actorName,
      action: "UPDATE",
      entity: "CABIN", // Usamos CABIN como entidade principal de impacto
      entityId: taskId,
      details: "Iniciou a limpeza da acomodação."
    });
  },

  /**
   * Camareira Finaliza a Limpeza (Salva o Checklist e para o Cronômetro)
   */
  async finishTask(
    propertyId: string, 
    taskId: string, 
    checklist: any[], 
    observations: string,
    actorId: string,
    actorName: string
  ) {
    const taskRef = doc(db, "properties", propertyId, "housekeeping_tasks", taskId);
    
    await updateDoc(taskRef, {
      status: 'waiting_conference',
      checklist,
      observations,
      finishedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    await AuditService.log({
      propertyId,
      userId: actorId,
      userName: actorName,
      action: "UPDATE",
      entity: "CABIN",
      entityId: taskId,
      details: "Finalizou a limpeza e enviou para conferência."
    });
  },

  /**
   * Governanta Confere e Libera a Cabana
   */
  async conferTask(
    propertyId: string, 
    taskId: string, 
    cabinId: string, 
    isApproved: boolean, 
    actorId: string,
    actorName: string
  ) {
    const batch = writeBatch(db);
    const taskRef = doc(db, "properties", propertyId, "housekeeping_tasks", taskId);
    const cabinRef = doc(db, "properties", propertyId, "cabins", cabinId);

    if (isApproved) {
      // 1. Encerra a Tarefa
      batch.update(taskRef, {
        status: 'completed',
        conferredBy: actorId,
        updatedAt: serverTimestamp()
      });
      // 2. Libera a Cabana para uso da Recepção
      batch.update(cabinRef, {
        status: 'available'
      });
    } else {
      // Reprovou: Volta para a camareira refazer
      batch.update(taskRef, {
        status: 'in_progress',
        observations: "Reprovado na conferência. Necessita repasse.",
        updatedAt: serverTimestamp()
      });
    }

    await batch.commit();

    await AuditService.log({
      propertyId,
      userId: actorId,
      userName: actorName,
      action: "UPDATE",
      entity: "CABIN",
      entityId: cabinId,
      details: isApproved ? "Acomodação conferida e liberada (Available)." : "Limpeza reprovada, retornou para repasse."
    });
  },

  /**
   * Lança um item de consumo (Frigobar) direto na conta da Estadia
   */
  async addFolioItem(propertyId: string, stayId: string, item: Omit<FolioItem, 'id' | 'createdAt'>) {
    if (!stayId) throw new Error("Esta cabana não possui uma estadia ativa vinculada.");

    const itemId = uuidv4();
    const folioRef = doc(db, "properties", propertyId, "stays", stayId, "folio", itemId);
    
    await setDoc(folioRef, {
      ...item,
      id: itemId,
      createdAt: serverTimestamp()
    });
  }
};