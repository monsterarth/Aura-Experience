// src/app/admin/logs/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { AuditLog } from "@/types/aura";
import { Search, Filter, Clock, RefreshCw, ChevronDown, FileText } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

// ─── Action label map ─────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  CREATE: "Criado",
  UPDATE: "Atualizado",
  DELETE: "Excluído",
  MESSAGE_SENT: "Mensagem enviada",
  MESSAGE_FAILED: "Mensagem falhou",
  MESSAGE_RESENT: "Mensagem reenviada",
  CHECKIN: "Check-in",
  CHECKOUT: "Check-out",
  USER_CREATE: "Usuário criado",
  USER_UPDATE: "Usuário atualizado",
  CREATE_STAY: "Estadia criada",
  COMPLETE_STAY: "Estadia concluída",
  STAY_GROUP_CREATE: "Grupo de estadias criado",
  STRUCTURE_CREATED: "Estrutura criada",
  STRUCTURE_UPDATED: "Estrutura atualizada",
  STRUCTURE_DELETED: "Estrutura excluída",
  STRUCTURE_BOOKING_CREATED: "Agendamento criado",
  STRUCTURE_BOOKING_STATUS_CHANGED: "Agendamento atualizado",
  EVENT_CREATED: "Evento criado",
  EVENT_UPDATED: "Evento atualizado",
  EVENT_DELETED: "Evento excluído",
  EVENT_PUBLISHED: "Evento publicado",
  CONCIERGE_REQUESTED: "Pedido de concierge",
  CONCIERGE_DELIVERED: "Concierge entregue",
  CONCIERGE_RETURNED: "Concierge devolvido",
  CONCIERGE_LOST: "Concierge extraviado",
  FB_ORDER_CREATED: "Pedido F&B criado",
  FB_ORDER_STATUS_CHANGED: "Pedido F&B atualizado",
  REASSIGN_GUEST: "Hóspede reatribuído",
};

const ENTITY_LABELS: Record<string, string> = {
  STAY: "Estadias",
  GUEST: "Hóspedes",
  CABIN: "Cabanas",
  USER: "Usuários",
  PROPERTY: "Configurações",
  MESSAGE: "Mensagens",
  STOCK: "Estoque",
  STRUCTURE: "Estruturas",
  STRUCTURE_BOOKING: "Agendamentos",
  MAINTENANCE: "Manutenção",
  EVENT: "Eventos",
  CONCIERGE: "Concierge",
  FB_ORDER: "F&B",
};

function actionBadgeClass(action: string): string {
  if (action.includes('DELETE') || action.includes('LOST')) return "bg-red-500/10 text-red-400";
  if (action.includes('UPDATE') || action.includes('STATUS_CHANGED') || action.includes('RETURNED')) return "bg-blue-500/10 text-blue-400";
  if (action.includes('MESSAGE')) return "bg-yellow-500/10 text-yellow-400";
  if (action.includes('BOOKING') || action.includes('CHECKIN') || action.includes('CHECKOUT')) return "bg-purple-500/10 text-purple-400";
  if (action.includes('CONCIERGE')) return "bg-orange-500/10 text-orange-400";
  return "bg-green-500/10 text-green-400";
}

function authorInitials(name: string): string {
  const parts = name.split(' ');
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);

  // Filters
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);
  const [startDate, setStartDate] = useState(sevenDaysAgo.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);
  const [entity, setEntity] = useState("");
  const [search, setSearch] = useState("");

  const buildUrl = useCallback((off: number) => {
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(off),
    });
    if (entity) params.set('entity', entity);
    if (search) params.set('search', search);
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    return `/api/admin/audit-logs?${params.toString()}`;
  }, [entity, search, startDate, endDate]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setOffset(0);
    try {
      const res = await fetch(buildUrl(0));
      const json = await res.json();
      setLogs(json.logs || []);
      setTotal(json.total || 0);
    } catch (e) {
      console.error("Erro ao buscar logs:", e);
    } finally {
      setLoading(false);
    }
  }, [buildUrl]);

  const loadMore = async () => {
    const newOffset = offset + PAGE_SIZE;
    setLoadingMore(true);
    try {
      const res = await fetch(buildUrl(newOffset));
      const json = await res.json();
      setLogs(prev => [...prev, ...(json.logs || [])]);
      setOffset(newOffset);
    } catch (e) {
      console.error("Erro ao carregar mais logs:", e);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const hasMore = logs.length < total;

  return (
    <RoleGuard allowedRoles={["super_admin", "admin"]}>
      <div className="p-4 md:p-8 max-w-[1400px] mx-auto space-y-6 animate-in fade-in duration-500">

        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border pb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-primary font-bold uppercase tracking-widest text-xs">
              <FileText size={14} /> Auditoria
            </div>
            <h1 className="text-3xl font-black tracking-tighter">Logs de Auditoria</h1>
            <p className="text-muted-foreground text-sm">Histórico de ações realizadas na propriedade.</p>
          </div>
          <button
            onClick={fetchLogs}
            className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-border rounded-xl text-sm font-bold transition-all self-start"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Atualizar
          </button>
        </header>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && fetchLogs()}
              placeholder="Buscar autor ou detalhe..."
              className="pl-9 pr-3 py-2 bg-card border border-border rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20 w-56"
            />
          </div>

          {/* Entity filter */}
          <div className="flex items-center gap-2 bg-card border border-border px-3 py-2 rounded-xl">
            <Filter size={14} className="text-muted-foreground shrink-0" />
            <select
              value={entity}
              onChange={e => setEntity(e.target.value)}
              className="bg-transparent text-sm font-medium outline-none"
            >
              <option value="">Todas entidades</option>
              {Object.entries(ENTITY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          {/* Date range */}
          <div className="flex items-center gap-2 bg-card border border-border px-3 py-2 rounded-xl">
            <Clock size={14} className="text-muted-foreground shrink-0" />
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="bg-transparent text-sm outline-none"
            />
            <span className="text-muted-foreground text-xs">até</span>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="bg-transparent text-sm outline-none"
            />
          </div>
        </div>

        {/* Results count */}
        {!loading && (
          <p className="text-xs text-muted-foreground">
            Exibindo {logs.length} de {total} registros
          </p>
        )}

        {/* Table */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="p-4 text-[10px] font-black uppercase text-muted-foreground tracking-widest whitespace-nowrap">Data/Hora</th>
                  <th className="p-4 text-[10px] font-black uppercase text-muted-foreground tracking-widest">Autor</th>
                  <th className="p-4 text-[10px] font-black uppercase text-muted-foreground tracking-widest">Ação</th>
                  <th className="p-4 text-[10px] font-black uppercase text-muted-foreground tracking-widest">Detalhes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="p-12 text-center text-muted-foreground">
                      <RefreshCw className="animate-spin mx-auto mb-2" size={20} />
                      <span className="text-sm">Carregando logs...</span>
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-12 text-center text-muted-foreground text-sm">
                      Nenhum registro encontrado com estes filtros.
                    </td>
                  </tr>
                ) : (
                  logs.map(log => (
                    <tr key={log.id} className="hover:bg-muted/20 transition-colors">
                      <td className="p-4 whitespace-nowrap">
                        <div className="font-mono text-xs text-muted-foreground">
                          {log.timestamp
                            ? format(new Date(log.timestamp), "dd/MM HH:mm", { locale: ptBR })
                            : "—"}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-[9px] font-black text-primary uppercase shrink-0">
                            {authorInitials(log.userName)}
                          </div>
                          <span className="text-sm font-semibold">{log.userName}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={cn(
                          "px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-tight whitespace-nowrap",
                          actionBadgeClass(log.action)
                        )}>
                          {ACTION_LABELS[log.action] || log.action.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="p-4 max-w-md">
                        <p className="text-sm text-foreground/80">{log.details}</p>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Load more */}
          {hasMore && !loading && (
            <div className="p-4 border-t border-border text-center">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="flex items-center gap-2 mx-auto px-5 py-2.5 bg-muted hover:bg-border rounded-xl text-sm font-bold transition-all disabled:opacity-50"
              >
                {loadingMore ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <ChevronDown size={14} />
                )}
                Carregar mais
              </button>
            </div>
          )}
        </div>
      </div>
    </RoleGuard>
  );
}
