import { supabase } from "@/lib/supabase";
import { HousekeepingTask, HousekeepingRule } from "@/types/aura";
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

    // Safety net: cobre DELETEs perdidos por RLS e reconexões de canal
    const intervalId = setInterval(fetchInitial, 15_000);

    const channel = supabase.channel(`hk_tasks_${propertyId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'housekeeping_tasks', filter: `propertyId=eq.${propertyId}` },
        () => { fetchInitial(); }
      )
      .subscribe();

    return () => {
      clearInterval(intervalId);
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
    await supabase.from('housekeeping_tasks').delete().eq('id', taskId).eq('propertyId', propertyId);

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

    // turnover e inspection passam por conferência da governanta; os demais concluem direto
    const NEEDS_CONFERENCE = ['turnover', 'inspection_checkin', 'inspection_checkout'];
    const newStatus = NEEDS_CONFERENCE.includes(task.type) ? 'waiting_conference' : 'completed';

    await supabase.from('housekeeping_tasks')
      .update({
        status: newStatus,
        checklist,
        observations,
        finishedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
      .eq('id', taskId);

    // Se concluiu Diária ou Custom, respeita hóspede in-house
    if (newStatus === 'completed') {
      if (task.cabinId) {
        const { data: cabin } = await supabase.from('cabins').select('currentStayId').eq('id', task.cabinId).single();
        const cabinStatus = cabin?.currentStayId ? 'occupied' : 'available';
        await supabase.from('cabins').update({ status: cabinStatus }).eq('id', task.cabinId);
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
      const { data: cabin } = await supabase.from('cabins').select('currentStayId').eq('id', task.cabinId).single();
      const cabinStatus = cabin?.currentStayId ? 'occupied' : 'available';
      await supabase.from('cabins').update({ status: cabinStatus }).eq('id', task.cabinId);
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
  },

  async upgradeToLinenChange(propertyId: string, taskId: string, actorId: string, actorName: string) {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('housekeeping_tasks')
      .update({ type: 'linen_change', updatedAt: now })
      .eq('id', taskId)
      .eq('propertyId', propertyId)
      .eq('type', 'daily'); // guard: só converte daily

    if (error) throw error;

    await AuditService.log({
      propertyId, userId: actorId, userName: actorName, action: "UPDATE", entity: "CABIN", entityId: taskId,
      details: "Arrumação convertida em Arrumação com Troca pela equipe."
    });
  },

  // --- REGRAS DE AUTOMAÇÃO ---

  async getRules(propertyId: string): Promise<HousekeepingRule[]> {
    const { data, error } = await supabase
      .from('housekeeping_rules')
      .select('*')
      .eq('propertyId', propertyId)
      .order('createdAt', { ascending: true });
    if (error) throw error;
    return (data || []) as HousekeepingRule[];
  },

  async saveRule(propertyId: string, data: Partial<HousekeepingRule>, actorId: string, actorName: string): Promise<HousekeepingRule> {
    const isNew = !data.id;
    const now = new Date().toISOString();
    const payload = {
      ...data,
      propertyId,
      id: data.id || uuidv4(),
      updatedAt: now,
      ...(isNew ? { createdAt: now, active: true } : {})
    };

    const { data: saved, error } = await supabase
      .from('housekeeping_rules')
      .upsert(payload, { onConflict: 'id' })
      .select()
      .single();
    if (error) throw error;

    const triggerLabels: Record<string, string> = {
      on_checkout: 'Checkout → Tarefa',
      active_stay_daily: 'Estadia Ativa → Diária',
      stay_duration_days: `${data.intervalDays} dias de estadia → Tarefa`,
      fixed_interval_days: `A cada ${data.intervalDays} dias → Tarefa`,
    };

    await AuditService.log({
      propertyId, userId: actorId, userName: actorName,
      action: isNew ? "CREATE" : "UPDATE", entity: "CABIN", entityId: payload.id,
      details: `Regra de automação ${isNew ? 'criada' : 'editada'}: ${triggerLabels[data.trigger || ''] || data.trigger}.`
    });

    return saved as HousekeepingRule;
  },

  async deleteRule(propertyId: string, ruleId: string, actorId: string, actorName: string) {
    const { error } = await supabase
      .from('housekeeping_rules')
      .delete()
      .eq('id', ruleId)
      .eq('propertyId', propertyId);
    if (error) throw error;

    await AuditService.log({
      propertyId, userId: actorId, userName: actorName, action: "DELETE", entity: "CABIN", entityId: ruleId,
      details: "Regra de automação de governança excluída."
    });
  }
};