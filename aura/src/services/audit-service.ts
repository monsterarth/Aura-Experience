import { supabase, supabaseAdmin } from "@/lib/supabase";
import { AuditLog } from "@/types/aura";

export const AuditService = {
  async log(data: Omit<AuditLog, "id" | "timestamp">): Promise<string> {
    try {
      const client = (typeof window === 'undefined' && supabaseAdmin) ? supabaseAdmin : supabase;

      // Dedup: skip if an identical log (same user + entity + details) exists in the last 10s.
      // Prevents duplicate entries when the same action fires from multiple open tabs/devices.
      if (data.entityId && data.details) {
        const since = new Date(Date.now() - 10_000).toISOString();
        const { data: existing } = await client
          .from('audit_logs')
          .select('id')
          .eq('userId', data.userId)
          .eq('entityId', data.entityId)
          .eq('details', data.details)
          .gte('timestamp', since)
          .limit(1)
          .maybeSingle();
        if (existing) {
          console.log(`[Aura Audit] Dedup — log idêntico ignorado: ${data.details}`);
          return existing.id as string;
        }
      }

      const id = crypto.randomUUID();
      const { error } = await client.from('audit_logs').insert({ ...data, id, timestamp: new Date().toISOString() });
      if (error) throw error;

      console.log(`[Aura Audit] Log registrado: ${data.action} em ${data.entityId}`);
      return id;
    } catch (error) {
      // Never re-throw — audit failure must not abort the caller's operation
      console.error("CRITICAL_ERROR: Falha ao gravar log de auditoria no Supabase.", error);
      return "";
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