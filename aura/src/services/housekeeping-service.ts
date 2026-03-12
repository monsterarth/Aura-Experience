import { supabase } from "@/lib/supabase";
import { HousekeepingTask } from "@/types/aura";
import { v4 as uuidv4 } from 'uuid';
import { AuditService } from "./audit-service";

export const HousekeepingService = {
  async getChecklistTemplates(propertyId: string) {
    const { data } = await supabase.from('checklists').select('*').eq('propertyId', propertyId);
    return data || [];
  },

  async saveChecklistTemplate(propertyId: string, template: any, actorId: string, actorName: string) {
    const payload = {
      ...template,
      propertyId,
      id: template.id || crypto.randomUUID(),
      updatedAt: new Date().toISOString()
    };
    if (!template.id) payload.createdAt = new Date().toISOString();

    const { error } = await supabase.from('checklists').upsert(payload, { onConflict: 'id' });
    if (error) throw error;
  },

  async getActiveTasks(propertyId: string): Promise<HousekeepingTask[]> {
    const { data, error } = await supabase
      .from('housekeeping_tasks')
      .select('*')
      .eq('propertyId', propertyId)
      .neq('status', 'cancelled');

    if (error) {
      console.error("Error fetching active tasks:", error);
      return [];
    }
    return data as HousekeepingTask[];
  },

  listenToActiveTasks(propertyId: string, callback: (tasks: HousekeepingTask[]) => void) {
    const fetchInitial = async () => {
      const tasks = await this.getActiveTasks(propertyId);
      callback(tasks);
    };

    fetchInitial();

    const channel = supabase.channel(`hk_tasks_${propertyId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'housekeeping_tasks', filter: `propertyId=eq.${propertyId}` },
        () => {
          // Refetch na integridade ao invés de merge manual de diffs pra reduzir bugs em tasks aninhadas
          fetchInitial();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },

  async createTask(propertyId: string, data: Partial<HousekeepingTask>, actorId: string, actorName: string) {
    const taskId = uuidv4();
    const payload = {
      ...data,
      id: taskId,
      propertyId,
      status: data.status || 'pending',
      checklist: data.checklist || [],
      assignedTo: data.assignedTo || []
    };

    await supabase.from('housekeeping_tasks').insert(payload);

    await AuditService.log({
      propertyId, userId: actorId, userName: actorName, action: "CREATE", entity: "CABIN", entityId: taskId,
      details: `Tarefa de limpeza (${data.type}) criada manualmente.`
    });
  },

  async updateTask(propertyId: string, taskId: string, updates: Partial<HousekeepingTask>, actorId: string, actorName: string) {
    await supabase.from('housekeeping_tasks')
      .update({ ...updates, updatedAt: new Date().toISOString() })
      .eq('id', taskId);

    await AuditService.log({
      propertyId, userId: actorId, userName: actorName, action: "UPDATE", entity: "CABIN", entityId: taskId,
      details: "Tarefa de limpeza editada pela gestão."
    });
  },

  async deleteTask(propertyId: string, taskId: string, actorId: string, actorName: string) {
    await supabase.from('housekeeping_tasks').delete().eq('id', taskId);

    await AuditService.log({
      propertyId, userId: actorId, userName: actorName, action: "DELETE", entity: "CABIN", entityId: taskId,
      details: "Tarefa de limpeza deletada manualmente."
    });
  },

  async assignTask(propertyId: string, taskId: string, maidIds: string[], actorId: string, actorName: string) {
    await supabase.from('housekeeping_tasks')
      .update({
        assignedTo: maidIds,
        updatedAt: new Date().toISOString()
      })
      .eq('id', taskId);

    await AuditService.log({
      propertyId, userId: actorId, userName: actorName, action: "UPDATE", entity: "CABIN", entityId: taskId,
      details: `Tarefa delegada para ${maidIds.length} camareira(s).`
    });
  },

  async startTask(propertyId: string, taskId: string, assignedToId: string, actorName: string) {
    const { data: task } = await supabase.from('housekeeping_tasks').select('assignedTo').eq('id', taskId).single();
    if (!task) return;

    const currentAssignees = task.assignedTo || [];
    const newAssignees = Array.from(new Set([...currentAssignees, assignedToId]));

    await supabase.from('housekeeping_tasks')
      .update({
        status: 'in_progress',
        assignedTo: newAssignees,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
      .eq('id', taskId);

    await AuditService.log({
      propertyId, userId: assignedToId, userName: actorName, action: "UPDATE", entity: "CABIN", entityId: taskId,
      details: "Iniciou o serviço de limpeza local."
    });
  },

  async finishTask(propertyId: string, taskId: string, checklist: any[], observations: string, actorId: string, actorName: string) {
    const { data: task } = await supabase.from('housekeeping_tasks').select('*').eq('id', taskId).single();
    if (!task) throw new Error("Tarefa não encontrada.");

    // Require at least one checked item when the checklist has items
    if (checklist.length > 0 && !checklist.some((item: any) => item.checked)) {
      throw new Error('CHECKLIST_INCOMPLETE');
    }

    // Atualiza status da tarefa para waiting_conference se for Turnover, se não, pula para Completed (Diária/Custom)
    const newStatus = task.type === 'turnover' ? 'waiting_conference' : 'completed';

    await supabase.from('housekeeping_tasks')
      .update({
        status: newStatus,
        checklist,
        observations,
        finishedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
      .eq('id', taskId);

    // Se concluiu Diária ou Custom, o status do espaço fica Available
    if (newStatus === 'completed') {
      if (task.cabinId) {
        await supabase.from('cabins').update({ status: 'available' }).eq('id', task.cabinId);
      } else if (task.structureId) {
        await supabase.from('structures').update({ status: 'available' }).eq('id', task.structureId);
      }
    }

    await AuditService.log({
      propertyId, userId: actorId, userName: actorName, action: "UPDATE", entity: "CABIN", entityId: taskId,
      details: `Marcou serviço como feito. Novo status: ${newStatus}.`
    });
  },

  async confirmTaskQuality(propertyId: string, taskId: string, observations: string, actorId: string, actorName: string) {
    const { data: task } = await supabase.from('housekeeping_tasks').select('*').eq('id', taskId).single();
    if (!task) throw new Error("Tarefa não encontrada");

    await supabase.from('housekeeping_tasks')
      .update({
        status: 'completed',
        conferredBy: actorId,
        observations,
        updatedAt: new Date().toISOString()
      })
      .eq('id', taskId);

    if (task.cabinId) {
      await supabase.from('cabins').update({ status: 'available' }).eq('id', task.cabinId);
    } else if (task.structureId) {
      await supabase.from('structures').update({ status: 'available' }).eq('id', task.structureId);
    }

    await AuditService.log({
      propertyId, userId: actorId, userName: actorName, action: "UPDATE", entity: "CABIN", entityId: taskId,
      details: `Governanta aprovou e liberou a acomodação (${task.cabinId || task.structureId}). Obs: ${observations}`
    });
  },

  async rollbackTaskStatus(propertyId: string, taskId: string, reason: string, actorId: string, actorName: string) {
    const { data: task } = await supabase.from('housekeeping_tasks').select('*').eq('id', taskId).single();
    if (!task) throw new Error("Tarefa não encontrada.");

    await supabase.from('housekeeping_tasks')
      .update({
        status: 'in_progress',
        observations: reason,
        updatedAt: new Date().toISOString()
      })
      .eq('id', taskId);

    if (task.cabinId) {
      await supabase.from('cabins').update({ status: 'cleaning' }).eq('id', task.cabinId);
    } else if (task.structureId) {
      await supabase.from('structures').update({ status: 'cleaning' }).eq('id', task.structureId);
    }

    await AuditService.log({
      propertyId, userId: actorId, userName: actorName, action: "UPDATE", entity: "CABIN", entityId: taskId,
      details: `Governança REJEITOU a limpeza. Retornou para camareira. Motivo: ${reason}`
    });
  }
};