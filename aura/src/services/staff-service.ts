import { supabase } from "@/lib/supabase";
import { Staff, StaffSchedule, StaffScheduleOverride, UserRole, ScheduleType, ScheduleConfig, ScheduleCheckpoint } from "@/types/aura";

export const StaffService = {
  async createStaffMember(params: {
    email: string;
    password?: string;
    fullName: string;
    role: UserRole;
    propertyId: string | null;
    actorId: string;
    actorName: string;
  }) {
    const password = params.password || Math.random().toString(36).slice(-10);

    const response = await fetch("/api/admin/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...params, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Erro ao criar funcionário.");
    }

    return { ...data, password };
  },

  async getStaffByProperty(propertyId: string): Promise<Staff[]> {
    const { data, error } = await supabase
      .from('staff')
      .select('*')
      .eq('propertyId', propertyId);

    if (error) {
      console.error("Error fetching staff:", error);
      return [];
    }

    return data as Staff[];
  },

  async updateStaff(staffId: string, updates: Partial<Staff>): Promise<void> {
    const response = await fetch("/api/admin/staff", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffId, updates }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Erro ao atualizar perfil do funcionário.");
  },

  async changeEmail(staffId: string, newEmail: string): Promise<{ message: string }> {
    const response = await fetch("/api/admin/staff", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffId, action: "changeEmail", newEmail }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Erro ao alterar e-mail.");
    return data;
  },

  async changePassword(staffId: string, newPassword: string, currentPassword?: string): Promise<void> {
    const response = await fetch("/api/admin/staff", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffId, action: "changePassword", newPassword, currentPassword }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Erro ao alterar senha.");
  },

  async deleteStaff(staffId: string): Promise<void> {
    const response = await fetch(`/api/admin/staff?staffId=${staffId}`, {
      method: "DELETE",
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Erro ao excluir utilizador.");
  },

  // --- ESCALAS ---




  async getPropertyScheduleView(propertyId: string): Promise<(Staff & { schedules: StaffSchedule[] })[]> {
    const response = await fetch(`/api/admin/staff/schedules?propertyId=${propertyId}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Erro ao carregar escalas.');
    return data;
  },






  // --- CHECKPOINTS DE CICLO ---



  async upsertScheduleCheckpoint(payload: Omit<ScheduleCheckpoint, 'id' | 'createdAt'>): Promise<void> {
    const response = await fetch('/api/admin/staff/schedule-checkpoints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Erro ao salvar checkpoint.');
  },

  async deleteScheduleCheckpoint(id: string): Promise<void> {
    const response = await fetch(`/api/admin/staff/schedule-checkpoints?id=${id}`, { method: 'DELETE' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Erro ao remover checkpoint.');
  },
};