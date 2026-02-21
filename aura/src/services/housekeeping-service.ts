// src/services/housekeeping-service.ts
import { db } from "@/lib/firebase";
import { 
  collection, doc, getDocs, updateDoc, writeBatch, 
  serverTimestamp, query, where, orderBy, setDoc, getDoc, onSnapshot, deleteDoc
} from "firebase/firestore";
import { HousekeepingTask, FolioItem } from "@/types/aura";
import { v4 as uuidv4 } from 'uuid';
import { AuditService } from "./audit-service";

export const HousekeepingService = {
  
  /**
   * Busca todas as tarefas ativas do dia na propriedade (Busca Estática Original)
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
   * Listener em Tempo Real para as tarefas da propriedade (Substitui o getActiveTasks na UI)
   */
  listenToActiveTasks(propertyId: string, callback: (tasks: HousekeepingTask[]) => void) {
    const q = query(
      collection(db, "properties", propertyId, "housekeeping_tasks"),
      where("status", "!=", "cancelled")
    );
    
    return onSnapshot(q, (snap) => {
      const tasks = snap.docs.map(d => ({ id: d.id, ...d.data() } as HousekeepingTask));
      callback(tasks);
    }, (error) => {
      console.error("Erro no listener de tarefas:", error);
    });
  },

  /**
   * Gestão Completa: Criação manual de Tarefa
   */
  async createTask(propertyId: string, data: Partial<HousekeepingTask>, actorId: string, actorName: string) {
    const taskId = uuidv4();
    const taskRef = doc(db, "properties", propertyId, "housekeeping_tasks", taskId);
    
    await setDoc(taskRef, {
      ...data,
      id: taskId,
      propertyId,
      status: data.status || 'pending',
      checklist: [],
      assignedTo: data.assignedTo || [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    await AuditService.log({
      propertyId, userId: actorId, userName: actorName, action: "CREATE", entity: "CABIN", entityId: taskId,
      details: `Tarefa de limpeza (${data.type}) criada manualmente.`
    });
  },

  /**
   * Gestão Completa: Atualização de Tarefa (Mobilidade/Edição)
   */
  async updateTask(propertyId: string, taskId: string, updates: Partial<HousekeepingTask>, actorId: string, actorName: string) {
    const taskRef = doc(db, "properties", propertyId, "housekeeping_tasks", taskId);
    await updateDoc(taskRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });

    await AuditService.log({
      propertyId, userId: actorId, userName: actorName, action: "UPDATE", entity: "CABIN", entityId: taskId,
      details: "Tarefa de limpeza editada pela gestão."
    });
  },

  /**
   * Gestão Completa: Excluir Tarefa
   */
  async deleteTask(propertyId: string, taskId: string, actorId: string, actorName: string) {
    const taskRef = doc(db, "properties", propertyId, "housekeeping_tasks", taskId);
    await deleteDoc(taskRef);

    await AuditService.log({
      propertyId, userId: actorId, userName: actorName, action: "DELETE", entity: "CABIN", entityId: taskId,
      details: "Tarefa de limpeza deletada manualmente."
    });
  },

  /**
   * Governanta delega a tarefa para uma ou MÚLTIPLAS camareiras específicas
   */
  async assignTask(propertyId: string, taskId: string, maidIds: string[], actorId: string, actorName: string) {
    const taskRef = doc(db, "properties", propertyId, "housekeeping_tasks", taskId);
    
    await updateDoc(taskRef, {
      assignedTo: maidIds, // Atualizado para suportar Arrays
      updatedAt: serverTimestamp()
    });

    await AuditService.log({
      propertyId,
      userId: actorId,
      userName: actorName,
      action: "UPDATE",
      entity: "CABIN",
      entityId: taskId,
      details: `Tarefa delegada para ${maidIds.length} camareira(s).`
    });
  },

  /**
   * Camareira Inicia a Limpeza (Dispara o Cronômetro)
   */
  async startTask(propertyId: string, taskId: string, assignedToId: string, actorName: string) {
    const taskRef = doc(db, "properties", propertyId, "housekeeping_tasks", taskId);
    const taskSnap = await getDoc(taskRef);
    const currentAssignees = taskSnap.data()?.assignedTo || [];
    
    // Se a camareira iniciou e não estava no array, adiciona ela para registro
    const newAssignees = currentAssignees.includes(assignedToId) ? currentAssignees : [...currentAssignees, assignedToId];

    await updateDoc(taskRef, {
      status: 'in_progress',
      assignedTo: newAssignees,
      startedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    await AuditService.log({
      propertyId,
      userId: assignedToId, // Alterado para o ID da pessoa logada agindo na hora
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
  },

  // ==========================================
  // TEMPLATES DE CHECKLIST (PROCEDIMENTOS)
  // ==========================================

  /**
   * Busca os templates de checklist da propriedade
   */
  async getChecklistTemplates(propertyId: string) {
    const q = query(collection(db, "properties", propertyId, "checklists"));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
  },

  /**
   * Salva ou atualiza um template de checklist
   */
  async saveChecklistTemplate(propertyId: string, template: any, actorId: string, actorName: string) {
    const templateId = template.id || uuidv4();
    const ref = doc(db, "properties", propertyId, "checklists", templateId);
    
    await setDoc(ref, {
      ...template,
      id: templateId,
      propertyId,
      updatedAt: serverTimestamp(),
      createdAt: template.createdAt || serverTimestamp()
    }, { merge: true });

    await AuditService.log({
      propertyId,
      userId: actorId,
      userName: actorName,
      action: "UPDATE",
      entity: "PROPERTY",
      entityId: templateId,
      details: `Atualizou o procedimento de limpeza: ${template.type}`
    });
  }
};