import { supabase } from "@/lib/supabase";
import { MaintenanceTask, Cabin, Structure } from "@/types/aura";
import { v4 as uuidv4 } from 'uuid';
import { AuditService } from "./audit-service";

export const MaintenanceService = {

    listenToActiveTasks(propertyId: string, callback: (tasks: MaintenanceTask[]) => void) {
        const fetchInitial = async () => {
            const { data } = await supabase
                .from('maintenance_tasks')
                .select('*')
                .eq('propertyId', propertyId);

            if (data) callback(data as MaintenanceTask[]);
        };

        fetchInitial();

        const channel = supabase.channel(`mt_tasks_${propertyId}`)
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'maintenance_tasks', filter: `propertyId=eq.${propertyId}` },
                () => fetchInitial()
            )
            .subscribe();

        return () => supabase.removeChannel(channel);
    },

    async checkCabinMaintenanceConflict(cabinId: string, expectedStart: string, expectedEnd: string): Promise<void> {
        const { data } = await supabase
            .from('stays')
            .select('id')
            .eq('cabinId', cabinId)
            .in('status', ['pending', 'pre_checkin_done', 'active'])
            .lt('checkIn', expectedEnd)
            .gt('checkOut', expectedStart)
            .limit(1);

        if (data && data.length > 0) {
            throw new Error(`MAINTENANCE_STAY_CONFLICT:${cabinId}`);
        }
    },

    async createTask(propertyId: string, data: Partial<MaintenanceTask>, actorId: string, actorName: string, skipConflictCheck = false) {
        if (!skipConflictCheck && data.blocksCabin && data.cabinId && data.expectedStart && data.expectedEnd) {
            await this.checkCabinMaintenanceConflict(data.cabinId, data.expectedStart, data.expectedEnd);
        }

        const taskId = uuidv4();

        await supabase.from('maintenance_tasks').insert({
            ...data,
            id: taskId,
            propertyId,
            status: data.status || 'pending',
            checklist: data.checklist || [],
            assignedTo: data.assignedTo || []
        });

        await AuditService.log({
            propertyId, userId: actorId, userName: actorName, action: "CREATE", entity: "MAINTENANCE", entityId: taskId,
            details: `Tarefa de manutenção '${data.title}' criada.`
        });
    },

    async updateTask(propertyId: string, taskId: string, updates: Partial<MaintenanceTask>, actorId: string, actorName: string) {
        await supabase.from('maintenance_tasks')
            .update({ ...updates, updatedAt: new Date().toISOString() })
            .eq('id', taskId);

        await AuditService.log({
            propertyId, userId: actorId, userName: actorName, action: "UPDATE", entity: "MAINTENANCE", entityId: taskId,
            details: "Tarefa de manutenção editada."
        });
    },

    async deleteTask(propertyId: string, taskId: string, actorId: string, actorName: string) {
        await supabase.from('maintenance_tasks').delete().eq('id', taskId).eq('propertyId', propertyId);

        await AuditService.log({
            propertyId, userId: actorId, userName: actorName, action: "DELETE", entity: "MAINTENANCE", entityId: taskId,
            details: "Tarefa de manutenção apagada."
        });
    },

    async assignTask(propertyId: string, taskId: string, techIds: string[], actorId: string, actorName: string) {
        await supabase.from('maintenance_tasks')
            .update({ assignedTo: techIds, updatedAt: new Date().toISOString() })
            .eq('id', taskId);

        await AuditService.log({
            propertyId, userId: actorId, userName: actorName, action: "UPDATE", entity: "MAINTENANCE", entityId: taskId,
            details: `Tarefa alocada para técnica(s).`
        });
    },

    async startTask(propertyId: string, taskId: string, techId: string, actorName: string) {
        const { data: task } = await supabase.from('maintenance_tasks').select('assignedTo').eq('id', taskId).single();
        if (!task) return;

        const currentAssignees = task.assignedTo || [];
        const newAssignees = Array.from(new Set([...currentAssignees, techId]));

        await supabase.from('maintenance_tasks')
            .update({
                status: 'in_progress',
                assignedTo: newAssignees,
                startedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            })
            .eq('id', taskId);

        await AuditService.log({
            propertyId, userId: techId, userName: actorName, action: "UPDATE", entity: "MAINTENANCE", entityId: taskId,
            details: "Iniciou o serviço de manutenção."
        });
    },

    async finishTask(
        propertyId: string,
        taskId: string,
        completionData: NonNullable<MaintenanceTask['completion']>,
        actorId: string,
        actorName: string
    ) {
        const { data: taskData } = await supabase.from('maintenance_tasks').select('*').eq('id', taskId).single();
        if (!taskData) throw new Error("Tarefa não encontrada.");

        let finalStatus: MaintenanceTask['status'] = 'completed';
        if (!completionData.resolved) {
            finalStatus = 'waiting_conference';
        }

        await supabase.from('maintenance_tasks')
            .update({
                status: finalStatus,
                completion: completionData,
                finishedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            })
            .eq('id', taskId);

        const applyStatus = async (cabinId?: string, structureId?: string, unitId?: string) => {
            if (!cabinId && !structureId) return;
            const newTargetStatus = completionData.needsCleaning ? 'cleaning' : completionData.resolved ? 'available' : undefined;
            if (!newTargetStatus) return;

            if (cabinId) {
                await supabase.from('cabins').update({ status: newTargetStatus }).eq('id', cabinId);
            } else if (structureId) {
                await supabase.from('structures').update({ status: newTargetStatus }).eq('id', structureId);
            }
        };

        await applyStatus(taskData.cabinId, taskData.structureId, taskData.unitId);

        await AuditService.log({
            propertyId, userId: actorId, userName: actorName, action: "UPDATE", entity: "MAINTENANCE", entityId: taskId,
            details: `Finalizou tarefa. Resolvida: ${completionData.resolved}, Limpeza Necessária: ${completionData.needsCleaning}`
        });
    }
};
