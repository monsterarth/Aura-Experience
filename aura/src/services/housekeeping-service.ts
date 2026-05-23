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

    // Rastreia se o canal chegou a subscrever — usado no cleanup para evitar
    // fechar o WebSocket enquanto ainda está em CONNECTING (browser warning:
    // "WebSocket is closed before the connection is established").
    let subscribed = false;

    const channel = supabase.channel(`hk_tasks_${propertyId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'housekeeping_tasks', filter: `propertyId=eq.${propertyId}` },
        () => { fetchInitial(); }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') subscribed = true;
      });

    return () => {
      clearInterval(intervalId);
      if (subscribed) {
        // Canal conectado: remoção limpa (fecha o join + socket se não há mais canais)
        supabase.removeChannel(channel);
      } else {
        // Canal ainda conectando: cancela o join sem fechar o socket → sem browser warning
        channel.unsubscribe().catch(() => {});
      }
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

  async pauseTask(propertyId: string, taskId: string, actorId: string, actorName: string) {
    await supabase.from('housekeeping_tasks')
      .update({
        status: 'pending',
        pausedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
      .eq('id', taskId);

    await AuditService.log({
      propertyId, userId: actorId, userName: actorName, action: "UPDATE", entity: "CABIN", entityId: taskId,
      details: "Pausou a tarefa de limpeza."
    });
  },

  async skipTask(propertyId: string, taskId: string, actorId: string, actorName: string) {
    const now = new Date().toISOString();
    await supabase.from('housekeeping_tasks')
      .update({ status: 'skipped', skippedAt: now, updatedAt: now })
      .eq('id', taskId);

    await AuditService.log({
      propertyId, userId: actorId, userName: actorName, action: "UPDATE", entity: "CABIN", entityId: taskId,
      details: "Camareira registrou que o hóspede pediu para não limpar."
    });
  },

  async resumeTask(propertyId: string, taskId: string, actorId: string, actorName: string) {
    const { data: task } = await supabase.from('housekeeping_tasks')
      .select('pausedAt, totalPausedDuration, assignedTo').eq('id', taskId).single();
    if (!task) return;

    const pausedMs = task.pausedAt ? Date.now() - new Date(task.pausedAt).getTime() : 0;
    const accumulated = (task.totalPausedDuration || 0) + Math.floor(pausedMs / 1000);
    const currentAssignees = task.assignedTo || [];
    const newAssignees = Array.from(new Set([...currentAssignees, actorId]));

    await supabase.from('housekeeping_tasks')
      .update({
        status: 'in_progress',
        pausedAt: null,
        totalPausedDuration: accumulated,
        assignedTo: newAssignees,
        updatedAt: new Date().toISOString()
      })
      .eq('id', taskId);

    await AuditService.log({
      propertyId, userId: actorId, userName: actorName, action: "UPDATE", entity: "CABIN", entityId: taskId,
      details: "Retomou a tarefa de limpeza."
    });
  },

  async finishTask(propertyId: string, taskId: string, checklist: any[], observations: string, actorId: string, actorName: string) {
    const { data: task } = await supabase.from('housekeeping_tasks').select('*').eq('id', taskId).single();
    if (!task) throw new Error("Tarefa não encontrada.");

    // Require at least one checked item when the checklist has items
    if (checklist.length > 0 && !checklist.some((item: any) => item.checked)) {
      throw new Error('CHECKLIST_INCOMPLETE');
    }

    // daily e linen_change concluem direto; turnover/inspection sempre conferência; custom depende do flag
    const requiresConference =
      ['turnover', 'inspection_checkin', 'inspection_checkout'].includes(task.type) ||
      (task.type === 'custom' && task.needsConference === true);
    const newStatus = requiresConference ? 'waiting_conference' : 'completed';

    await supabase.from('housekeeping_tasks')
      .update({
        status: newStatus,
        checklist,
        observations,
        finishedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
      .eq('id', taskId);

    // daily e linen_change concluídas liberam a cabana imediatamente
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