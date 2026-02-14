// src/services/staff-service.ts
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where } from "firebase/firestore";
import { Staff, UserRole } from "@/types/aura";

/**
 * StaffService: Faz a ponte entre a UI e as APIs de servidor do Aura.
 */
export const StaffService = {
  /**
   * Chama a API Route para criar um novo funcionário.
   * Usamos fetch porque a criação de Auth exige privilégios de Admin.
   */
  async createStaffMember(params: {
    email: string;
    password?: string;
    fullName: string;
    role: UserRole;
    propertyId: string | null;
    actorId: string;
    actorName: string;
  }) {
    // Gerar uma password temporária se não for fornecida
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

    return { ...data, password }; // Retornamos a password para que o admin possa dar ao funcionário
  },

  /**
   * Lista funcionários via Firestore (Leitura permitida no client)
   */
  async getStaffByProperty(propertyId: string): Promise<Staff[]> {
    const q = query(collection(db, "users"), where("propertyId", "==", propertyId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Staff[];
  }
};