import { supabase } from "@/lib/supabase";
import { Staff, UserRole } from "@/types/aura";

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
  }
};