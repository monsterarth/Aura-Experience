import { db } from "@/lib/firebase";
import {
    collection, doc, getDocs, updateDoc,
    serverTimestamp, query, where, setDoc, getDoc, onSnapshot, deleteDoc
} from "firebase/firestore";
import { MaintenanceTask, Cabin, Structure } from "@/types/aura";
import { v4 as uuidv4 } from 'uuid';
import { AuditService } from "./audit-service";

export const MaintenanceService = {
    /**
     * Realtime Listener for active maintenance tasks (excludes cancelled if needed)
     */
    listenToActiveTasks(propertyId: string, callback: (tasks: MaintenanceTask[]) => void) {
        const q = query(
            collection(db, "properties", propertyId, "maintenance_tasks")
        );

        return onSnapshot(q, (snap) => {
            const tasks = snap.docs.map(d => ({ id: d.id, ...d.data() } as MaintenanceTask));
            callback(tasks);
        }, (error) => {
            console.error("Erro no listener de manutenção:", error);
        });
    },

    /**
     * Create a new Maintenance Task
     */
    async createTask(propertyId: string, data: Partial<MaintenanceTask>, actorId: string, actorName: string) {
        const taskId = uuidv4();
        const taskRef = doc(db, "properties", propertyId, "maintenance_tasks", taskId);

        await setDoc(taskRef, {
            ...data,
            id: taskId,
            propertyId,
            status: data.status || 'pending',
            checklist: data.checklist || [],
            assignedTo: data.assignedTo || [],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });

        await AuditService.log({
            propertyId, userId: actorId, userName: actorName, action: "CREATE", entity: "MAINTENANCE", entityId: taskId,
            details: `Tarefa de manutenção '${data.title}' criada.`
        });
    },

    /**
     * Update a Maintenance Task
     */
    async updateTask(propertyId: string, taskId: string, updates: Partial<MaintenanceTask>, actorId: string, actorName: string) {
        const taskRef = doc(db, "properties", propertyId, "maintenance_tasks", taskId);
        await updateDoc(taskRef, {
            ...updates,
            updatedAt: serverTimestamp()
        });

        await AuditService.log({
            propertyId, userId: actorId, userName: actorName, action: "UPDATE", entity: "MAINTENANCE", entityId: taskId,
            details: "Tarefa de manutenção editada."
        });
    },

    /**
     * Delete a Maintenance Task
     */
    async deleteTask(propertyId: string, taskId: string, actorId: string, actorName: string) {
        const taskRef = doc(db, "properties", propertyId, "maintenance_tasks", taskId);
        await deleteDoc(taskRef);

        await AuditService.log({
            propertyId, userId: actorId, userName: actorName, action: "DELETE", entity: "MAINTENANCE", entityId: taskId,
            details: "Tarefa de manutenção apagada."
        });
    },

    /**
     * Assign task to technicians
     */
    async assignTask(propertyId: string, taskId: string, techIds: string[], actorId: string, actorName: string) {
        const taskRef = doc(db, "properties", propertyId, "maintenance_tasks", taskId);

        await updateDoc(taskRef, {
            assignedTo: techIds,
            updatedAt: serverTimestamp()
        });

        await AuditService.log({
            propertyId, userId: actorId, userName: actorName, action: "UPDATE", entity: "MAINTENANCE", entityId: taskId,
            details: `Tarefa alocada para técnica(s).`
        });
    },

    /**
     * Technician starts the maintenance (sets to in_progress)
     */
    async startTask(propertyId: string, taskId: string, techId: string, actorName: string) {
        const taskRef = doc(db, "properties", propertyId, "maintenance_tasks", taskId);
        const taskSnap = await getDoc(taskRef);
        if (!taskSnap.exists()) return;

        const taskData = taskSnap.data() as MaintenanceTask;
        const currentAssignees = taskData.assignedTo || [];
        const newAssignees = currentAssignees.includes(techId) ? currentAssignees : [...currentAssignees, techId];

        await updateDoc(taskRef, {
            status: 'in_progress',
            assignedTo: newAssignees,
            startedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });

        await AuditService.log({
            propertyId, userId: techId, userName: actorName, action: "UPDATE", entity: "MAINTENANCE", entityId: taskId,
            details: "Iniciou o serviço de manutenção."
        });
    },

    /**
     * Finish / Complete Maintenance (handles the flow of checking if needs cleaning or verification)
     */
    async finishTask(
        propertyId: string,
        taskId: string,
        completionData: NonNullable<MaintenanceTask['completion']>,
        actorId: string,
        actorName: string
    ) {
        const taskRef = doc(db, "properties", propertyId, "maintenance_tasks", taskId);
        const taskSnap = await getDoc(taskRef);
        if (!taskSnap.exists()) throw new Error("Tarefa não encontrada.");

        const taskData = taskSnap.data() as MaintenanceTask;

        // Define next status based on resolution
        let finalStatus: MaintenanceTask['status'] = 'completed';
        if (!completionData.resolved) {
            finalStatus = 'waiting_conference'; // Not solved, manager needs to verify
        }

        await updateDoc(taskRef, {
            status: finalStatus,
            completion: completionData,
            finishedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });

        // Smart Actions for Cabins and Structures
        const applyStatus = async (cabinId?: string, structureId?: string, unitId?: string) => {
            // Priority: If Needs Cleaning -> Go to 'cleaning'
            // If Solved and Does NOT need cleaning -> Go to 'available'
            if (!cabinId && !structureId) return;

            const newTargetStatus = completionData.needsCleaning ? 'cleaning' : completionData.resolved ? 'available' : undefined;

            if (!newTargetStatus) return; // If not resolved and no cleaning required, don't change space status.

            if (cabinId) {
                const cabinRef = doc(db, "properties", propertyId, "cabins", cabinId);
                await updateDoc(cabinRef, { status: newTargetStatus });
            } else if (structureId) {
                // Technically structures don't strictly track individual unit status in a single field 
                // identical to cabins right now, but we update the main structure status here.
                const structRef = doc(db, "properties", propertyId, "structures", structureId);
                await updateDoc(structRef, { status: newTargetStatus });
            }
        };

        await applyStatus(taskData.cabinId, taskData.structureId, taskData.unitId);

        await AuditService.log({
            propertyId, userId: actorId, userName: actorName, action: "UPDATE", entity: "MAINTENANCE", entityId: taskId,
            details: `Finalizou tarefa. Resolvida: ${completionData.resolved}, Limpeza Necessária: ${completionData.needsCleaning}`
        });
    }
};
