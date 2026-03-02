import { supabase } from "@/lib/supabase";
import { AuditLog } from "@/types/aura";

export const AuditService = {
  async log(data: Omit<AuditLog, "id" | "timestamp">): Promise<string> {
    try {
      const id = crypto.randomUUID();

      const payload = {
        ...data,
        id,
        timestamp: new Date().toISOString()
      };

      const { error } = await supabase.from('audit_logs').insert(payload);
      if (error) throw error;

      console.log(`[Aura Audit] Log registrado: ${data.action} em ${data.entityId}`);
      return id;
    } catch (error) {
      console.error("CRITICAL_ERROR: Falha ao gravar log de auditoria no Supabase.", error);
      throw new Error("Erro de integridade: Não foi possível registrar a auditoria da ação.");
    }
  },

  async getEntityHistory(entityId: string, propertyId: string) {
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('propertyId', propertyId)
        .eq('entityId', entityId)
        .order('timestamp', { ascending: false });

      if (error) throw error;
      return data as AuditLog[];
    } catch (error) {
      console.error("Erro ao buscar histórico de auditoria:", error);
      return [];
    }
  },

  async getPropertyRecentActivity(propertyId: string, maxLogs: number = 20) {
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('propertyId', propertyId)
        .order('timestamp', { ascending: false })
        .limit(maxLogs);

      if (error) throw error;
      return data as AuditLog[];
    } catch (error) {
      console.error("Erro ao buscar atividade recente:", error);
      return [];
    }
  },

  async getGlobalActivity(maxLogs: number = 50) {
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(maxLogs);

      if (error) throw error;
      return data as AuditLog[];
    } catch (error) {
      console.error("Erro ao buscar logs globais:", error);
      return [];
    }
  }
};