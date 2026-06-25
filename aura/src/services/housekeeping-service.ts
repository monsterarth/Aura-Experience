import { supabase, supabaseAdmin } from "@/lib/supabase";
import { HousekeepingTask, HousekeepingRule } from "@/types/aura";
import { v4 as uuidv4 } from 'uuid';
import { AuditService } from "./audit-service";
import { triggerTaskPush } from "@/lib/push-trigger";

// Resolve o client certo conforme o ambiente. No servidor (rota de campo
// /api/field/housekeeping-tasks) usa service-role: a mutação vira 1 round-trip a partir do
// dispositivo e o update + cabana + auditoria/push completam server-side, independente de a
// camareira bloquear o celular logo após o toque. No browser, mantém o client autenticado do
// usuário (RLS). Mesmo padrão do AuditService — por isso os métodos de escrita usam db().
const db = () => (typeof window === 'undefined' && supabaseAdmin ? supabaseAdmin : supabase);

// ─── Log helpers ─────────────────────────────────────────────────────────────

const TASK_TYPE_LABELS: Record<string, string> = {
  turnover: 'Faxina',
  daily: 'Arrumação',
  linen_change: 'Troca de Roupa',
  inspection_checkin: 'Inspeção Check-in',
  inspection_checkout: 'Inspeção Check-out',
  custom: 'Personalizada',
};

const TASK_STATUS_LABELS: Record<string, string> = {
  waiting_conference: 'Aguardando conferência',
  completed: 'Concluída',
  cancelled: 'Cancelada',
};

async function resolveLocation(cabinId?: string | null, structureId?: string | null, customLocation?: string | null): Promise<string> {
  if (cabinId) {
    const { data } = await db().from('cabins').select('name').eq('id', cabinId).single();
    if (data?.name) return data.name;
  }
  if (structureId) {
    const { data } = await db().from('structures').select('name').eq('id', structureId).single();
    if (data?.name) return data.name;
  }
  return customLocation || '—';
}

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

  async getActiveTasks(propertyId: string): Promise<HousekeepingTask[] | null> {
    // Lê via rota de servidor (sessão validada/renovada pelo middleware) em vez da query
    // RLS do browser — esta retornava [] quando o access token estava brevemente expirado
    // (refresh mobile), apagando o quadro de faxinas mesmo havendo tarefas.
    // Em erro (rede/sessão), retorna null (não []) para que listenToActiveTasks PRESERVE
    // o quadro atual em vez de apagá-lo.
    try {
      const res = await fetch(`/api/field/housekeeping-tasks?propertyId=${encodeURIComponent(propertyId)}`, { cache: 'no-store' });
      if (!res.ok) {
        console.error("Error fetching active tasks:", res.status);
        return null;
      }
      return (await res.json()) as HousekeepingTask[];
    } catch (e) {
      console.error("Error fetching active tasks:", e);
      return null;
    }
  },

  listenToActiveTasks(propertyId: string, callback: (tasks: HousekeepingTask[]) => void) {
    const fetchInitial = async () => {
      const tasks = await this.getActiveTasks(propertyId);
      // null = erro na query → preserva o quadro atual, não apaga as tarefas
      if (tasks !== null) callback(tasks);
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
      .subscribe((status: string) => {
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

    // db(): server-side usa service-role (rota de campo) — evita o lock frio do browser.
    await db().from('housekeeping_tasks').insert(payload);

    const location = await resolveLocation(data.cabinId, data.structureId, data.customLocation);
    const typeLabel = TASK_TYPE_LABELS[data.type || ''] || data.type || 'limpeza';
    await AuditService.log({
      propertyId, userId: actorId, userName: actorName, action: "CREATE", entity: "CABIN", entityId: taskId,
      details: `Criou tarefa (${typeLabel}): ${location}.`
    });

    // Push para camareiras já atribuídas na criação (criação manual no admin).
    if (payload.assignedTo.length > 0) {
      triggerTaskPush('housekeeping', 'assigned', taskId);
    }

    return taskId;
  },

  async updateTask(propertyId: string, taskId: string, updates: Partial<HousekeepingTask>, actorId: string, actorName: string) {
    // db(): server-side usa service-role (rota de campo) — evita o lock frio do browser.
    const { data: task } = await db().from('housekeeping_tasks')
      .select('cabinId, structureId, customLocation, type').eq('id', taskId).single();

    await db().from('housekeeping_tasks')
      .update({ ...updates, updatedAt: new Date().toISOString() })
      .eq('id', taskId);

    const location = await resolveLocation(task?.cabinId, task?.structureId, task?.customLocation);
    const verb = updates.status === 'cancelled' ? 'Cancelou tarefa' : 'Editou tarefa de limpeza';
    await AuditService.log({
      propertyId, userId: actorId, userName: actorName, action: "UPDATE", entity: "CABIN", entityId: taskId,
      details: `${verb}: ${location}.`
    });
  },

  async deleteTask(propertyId: string, taskId: string, actorId: string, actorName: string) {
    const { data: task } = await supabase.from('housekeeping_tasks')
      .select('cabinId, structureId, customLocation, type').eq('id', taskId).single();

    await supabase.from('housekeeping_tasks').delete().eq('id', taskId).eq('propertyId', propertyId);

    const location = await resolveLocation(task?.cabinId, task?.structureId, task?.customLocation);
    await AuditService.log({
      propertyId, userId: actorId, userName: actorName, action: "DELETE", entity: "CABIN", entityId: taskId,
      details: `Deletou tarefa de limpeza: ${location}.`
    });
  },

  async assignTask(propertyId: string, taskId: string, maidIds: string[], actorId: string, actorName: string) {
    // db(): server-side usa service-role (rota de campo) — evita o lock frio do browser.
    const [{ data: task }, { data: staffRows }] = await Promise.all([
      db().from('housekeeping_tasks').select('cabinId, structureId, customLocation, type').eq('id', taskId).single(),
      db().from('staff').select('id, fullName').in('id', maidIds),
    ]);

    await db().from('housekeeping_tasks')
      .update({ assignedTo: maidIds, updatedAt: new Date().toISOString() })
      .eq('id', taskId);

    const location = await resolveLocation(task?.cabinId, task?.structureId, task?.customLocation);
    const maidNames = (staffRows as { id: string; fullName: string }[] | null)
      ?.map(s => s.fullName.split(' ')[0]).join(', ') || `${maidIds.length} camareira(s)`;
    await AuditService.log({
      propertyId, userId: actorId, userName: actorName, action: "UPDATE", entity: "CABIN", entityId: taskId,
      details: `Delegou ${location} para: ${maidNames}.`
    });

    triggerTaskPush('housekeeping', 'assigned', taskId);
  },

  async startTask(propertyId: string, taskId: string, assignedToId: string, actorName: string) {
    const { data: task } = await db().from('housekeeping_tasks')
      .select('assignedTo, cabinId, structureId, customLocation, type').eq('id', taskId).single();
    if (!task) return;

    const currentAssignees = task.assignedTo || [];
    const newAssignees = Array.from(new Set([...currentAssignees, assignedToId]));

    await db().from('housekeeping_tasks')
      .update({
        status: 'in_progress',
        assignedTo: newAssignees,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
      .eq('id', taskId);

    const location = await resolveLocation(task.cabinId, task.structureId, task.customLocation);
    await AuditService.log({
      propertyId, userId: assignedToId, userName: actorName, action: "UPDATE", entity: "CABIN", entityId: taskId,
      details: `Iniciou a limpeza: ${location}.`
    });
  },

  async pauseTask(propertyId: string, taskId: string, actorId: string, actorName: string) {
    const { data: task } = await db().from('housekeeping_tasks')
      .select('cabinId, structureId, customLocation, type').eq('id', taskId).single();

    await db().from('housekeeping_tasks')
      .update({
        status: 'pending',
        pausedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
      .eq('id', taskId);

    const location = await resolveLocation(task?.cabinId, task?.structureId, task?.customLocation);
    await AuditService.log({
      propertyId, userId: actorId, userName: actorName, action: "UPDATE", entity: "CABIN", entityId: taskId,
      details: `Pausou a limpeza: ${location}.`
    });
  },

  async skipTask(propertyId: string, taskId: string, actorId: string, actorName: string) {
    const { data: task } = await db().from('housekeeping_tasks')
      .select('cabinId, structureId, customLocation, type').eq('id', taskId).single();

    const now = new Date().toISOString();
    await db().from('housekeeping_tasks')
      .update({ status: 'skipped', skippedAt: now, updatedAt: now })
      .eq('id', taskId);

    const location = await resolveLocation(task?.cabinId, task?.structureId, task?.customLocation);
    await AuditService.log({
      propertyId, userId: actorId, userName: actorName, action: "UPDATE", entity: "CABIN", entityId: taskId,
      details: `Hóspede pediu para não limpar: ${location}.`
    });
  },

  async resumeTask(propertyId: string, taskId: string, actorId: string, actorName: string) {
    const { data: task } = await db().from('housekeeping_tasks')
      .select('pausedAt, totalPausedDuration, assignedTo, cabinId, structureId, customLocation, type').eq('id', taskId).single();
    if (!task) return;

    const pausedMs = task.pausedAt ? Date.now() - new Date(task.pausedAt).getTime() : 0;
    const accumulated = (task.totalPausedDuration || 0) + Math.floor(pausedMs / 1000);
    const currentAssignees = task.assignedTo || [];
    const newAssignees = Array.from(new Set([...currentAssignees, actorId]));

    await db().from('housekeeping_tasks')
      .update({
        status: 'in_progress',
        pausedAt: null,
        totalPausedDuration: accumulated,
        assignedTo: newAssignees,
        updatedAt: new Date().toISOString()
      })
      .eq('id', taskId);

    const location = await resolveLocation(task?.cabinId, task?.structureId, task?.customLocation);
    await AuditService.log({
      propertyId, userId: actorId, userName: actorName, action: "UPDATE", entity: "CABIN", entityId: taskId,
      details: `Retomou a limpeza: ${location}.`
    });
  },

  async finishTask(propertyId: string, taskId: string, checklist: any[], observations: string, actorId: string, actorName: string) {
    const client = db();
    const { data: task } = await client.from('housekeeping_tasks').select('*').eq('id', taskId).single();
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

    await client.from('housekeeping_tasks')
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
        const { data: cabin } = await client.from('cabins').select('currentStayId').eq('id', task.cabinId).single();
        const cabinStatus = cabin?.currentStayId ? 'occupied' : 'available';
        await client.from('cabins').update({ status: cabinStatus }).eq('id', task.cabinId);
      } else if (task.structureId) {
        await client.from('structures').update({ status: 'available' }).eq('id', task.structureId);
      }
    }

    const location = await resolveLocation(task.cabinId, task.structureId, task.customLocation);
    const statusLabel = TASK_STATUS_LABELS[newStatus] || newStatus;
    await AuditService.log({
      propertyId, userId: actorId, userName: actorName, action: "UPDATE", entity: "CABIN", entityId: taskId,
      details: `Concluiu a limpeza: ${location}. ${statusLabel}.`
    });

    // Faxina que exige conferência → notifica a governança.
    // No browser, gatilho client-safe (fetch keepalive). No servidor triggerTaskPush é no-op
    // — e push-notify é server-only/client-reachable via maid/page.tsx, então NÃO pode ser
    // importado aqui. A rota de campo dispara o push server-side a partir do status retornado.
    if (newStatus === 'waiting_conference') {
      triggerTaskPush('housekeeping', 'conference', taskId);
    }

    return newStatus;
  },

  async confirmTaskQuality(propertyId: string, taskId: string, observations: string, actorId: string, actorName: string) {
    // db(): no servidor (rota de campo) usa service-role — antes rodava pelo client do browser e
    // pendurava no lock/token frio do app da governanta (spinner infinito ao "Liberar Cabana").
    const { data: task } = await db().from('housekeeping_tasks').select('*').eq('id', taskId).single();
    if (!task) throw new Error("Tarefa não encontrada");

    await db().from('housekeeping_tasks')
      .update({
        status: 'completed',
        conferredBy: actorId,
        observations,
        updatedAt: new Date().toISOString()
      })
      .eq('id', taskId);

    if (task.cabinId) {
      const { data: cabin } = await db().from('cabins').select('currentStayId').eq('id', task.cabinId).single();
      const cabinStatus = cabin?.currentStayId ? 'occupied' : 'available';
      await db().from('cabins').update({ status: cabinStatus }).eq('id', task.cabinId);
    } else if (task.structureId) {
      await db().from('structures').update({ status: 'available' }).eq('id', task.structureId);
    }

    const location = await resolveLocation(task.cabinId, task.structureId, task.customLocation);
    await AuditService.log({
      propertyId, userId: actorId, userName: actorName, action: "UPDATE", entity: "CABIN", entityId: taskId,
      details: `Governanta aprovou e liberou: ${location}.${observations ? ` Obs: ${observations}` : ''}`
    });
  },

  async rollbackTaskStatus(propertyId: string, taskId: string, reason: string, actorId: string, actorName: string) {
    // db(): server-side usa service-role (rota de campo) — evita o lock frio do browser.
    const { data: task } = await db().from('housekeeping_tasks').select('*').eq('id', taskId).single();
    if (!task) throw new Error("Tarefa não encontrada.");

    await db().from('housekeeping_tasks')
      .update({
        status: 'in_progress',
        observations: reason,
        updatedAt: new Date().toISOString()
      })
      .eq('id', taskId);

    if (task.cabinId) {
      await db().from('cabins').update({ status: 'cleaning' }).eq('id', task.cabinId);
    } else if (task.structureId) {
      await db().from('structures').update({ status: 'cleaning' }).eq('id', task.structureId);
    }

    const location = await resolveLocation(task.cabinId, task.structureId, task.customLocation);
    await AuditService.log({
      propertyId, userId: actorId, userName: actorName, action: "UPDATE", entity: "CABIN", entityId: taskId,
      details: `Governanta REJEITOU: ${location}. Motivo: ${reason}`
    });
  },

  async upgradeToLinenChange(propertyId: string, taskId: string, actorId: string, actorName: string) {
    const { data: task } = await db().from('housekeeping_tasks')
      .select('cabinId, structureId, customLocation').eq('id', taskId).single();

    const now = new Date().toISOString();
    const { error } = await db()
      .from('housekeeping_tasks')
      .update({ type: 'linen_change', updatedAt: now })
      .eq('id', taskId)
      .eq('propertyId', propertyId)
      .eq('type', 'daily'); // guard: só converte daily

    if (error) throw error;

    const location = await resolveLocation(task?.cabinId, task?.structureId, task?.customLocation);
    await AuditService.log({
      propertyId, userId: actorId, userName: actorName, action: "UPDATE", entity: "CABIN", entityId: taskId,
      details: `Converteu arrumação em Troca de Roupa: ${location}.`
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