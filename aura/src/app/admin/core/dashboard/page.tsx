"use client";

import React, { useState, useEffect, useCallback } from "react";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { AuditService } from "@/services/audit-service";
import { PropertyService } from "@/services/property-service";
import { AuditLog, Property } from "@/types/aura";
import {
  Activity, BarChart3, Building2, Search, Filter, Clock, User, Tag,
  Layers, Calendar, RefreshCw, Infinity, Circle, Lightbulb,
  Users, CheckCircle2, MessageSquareX, Wifi
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

// -------------------------------------------------------
// HELPERS
// -------------------------------------------------------

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
  STAY_GROUP_CREATE: "Grupo criado",
  STRUCTURE_CREATED: "Estrutura criada",
  STRUCTURE_UPDATED: "Estrutura atualizada",
  STRUCTURE_DELETED: "Estrutura excluída",
  STRUCTURE_BOOKING_CREATED: "Agendamento criado",
  STRUCTURE_BOOKING_STATUS_CHANGED: "Agendamento atualizado",
  EVENT_CREATED: "Evento criado",
  EVENT_UPDATED: "Evento atualizado",
  EVENT_DELETED: "Evento excluído",
  EVENT_PUBLISHED: "Evento publicado",
  CONCIERGE_REQUESTED: "Pedido concierge",
  CONCIERGE_DELIVERED: "Concierge entregue",
  CONCIERGE_RETURNED: "Concierge devolvido",
  CONCIERGE_LOST: "Concierge extraviado",
  FB_ORDER_CREATED: "Pedido F&B",
  FB_ORDER_STATUS_CHANGED: "F&B atualizado",
  REASSIGN_GUEST: "Hóspede reatribuído",
};

function actionBadgeClass(action: string): string {
  if (action.includes("DELETE") || action.includes("LOST"))
    return "bg-red-500/10 text-red-400 border-red-500/20";
  if (action.includes("UPDATE") || action.includes("STATUS_CHANGED") || action.includes("RETURNED"))
    return "bg-[#B0E0E6]/10 text-[#B0E0E6] border-[#B0E0E6]/20";
  if (action.includes("MESSAGE"))
    return "bg-orange-500/10 text-orange-400 border-orange-500/20";
  if (action.includes("BOOKING") || action === "CHECKIN" || action === "CHECKOUT")
    return "bg-[#E6E6FA]/10 text-[#E6E6FA] border-[#E6E6FA]/20";
  if (action.includes("CONCIERGE"))
    return "bg-orange-500/10 text-orange-400 border-orange-500/20";
  return "bg-[#E0FFFF]/10 text-[#E0FFFF] border-[#E0FFFF]/20";
}

// -------------------------------------------------------
// STAT CARD
// -------------------------------------------------------

interface StatCardProps {
  title: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  accent: string; // tailwind/hex color hint
  loading?: boolean;
}

function StatCard({ title, value, sub, icon: Icon, accent, loading }: StatCardProps) {
  return (
    <div className="bg-[#1c1c1c] rounded-[24px] p-6 border border-white/5 shadow-[0_8px_30px_rgba(0,0,0,0.5)] relative overflow-hidden group">
      <div className="absolute inset-0 opacity-[0.015] bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]" />
      <div className="relative z-10 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div
            className="p-2.5 rounded-xl border"
            style={{ background: `${accent}18`, borderColor: `${accent}30` }}
          >
            <Icon size={16} style={{ color: accent }} />
          </div>
          <p className="text-[10px] text-white/40 tracking-widest uppercase text-right w-24 leading-tight">{title}</p>
        </div>
        {loading ? (
          <div className="h-8 w-16 bg-white/5 rounded animate-pulse" />
        ) : (
          <div>
            <p className="text-[32px] font-bold text-white tracking-tight leading-none">{value}</p>
            {sub && <p className="text-[11px] mt-1" style={{ color: accent }}>{sub}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------
// PÁGINA
// -------------------------------------------------------

interface PlatformStats {
  totalProperties: number;
  activeStays: number;
  msgFailed24h: number;
  checkins7d: number;
}

export default function SuperAdminDashboard() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterEntity, setFilterEntity] = useState("all");
  const [filterProperty, setFilterProperty] = useState("all");

  const fetchInitialData = useCallback(async () => {
    setLoading(true);
    try {
      const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const [allLogs, allProps, activeStaysRes, msgFailedRes, checkins7dRes] = await Promise.all([
        AuditService.getGlobalActivity(150),
        PropertyService.getAllProperties(),
        supabase.from("stays").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("messages").select("id", { count: "exact", head: true })
          .eq("status", "failed").gte("createdAt", since24h),
        supabase.from("stays").select("id", { count: "exact", head: true })
          .eq("status", "active").gte("checkIn", since7d),
      ]);

      setLogs(allLogs);
      setProperties(allProps);
      setStats({
        totalProperties: allProps.length,
        activeStays: activeStaysRes.count ?? 0,
        msgFailed24h: msgFailedRes.count ?? 0,
        checkins7d: checkins7dRes.count ?? 0,
      });
    } catch (error) {
      console.error("Erro ao carregar dados core:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  const filteredLogs = logs.filter(log => {
    const matchesSearch =
      log.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.details?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesEntity = filterEntity === "all" || log.entity === filterEntity;
    const matchesProperty = filterProperty === "all" || log.propertyId === filterProperty;
    return matchesSearch && matchesEntity && matchesProperty;
  });

  return (
    <RoleGuard allowedRoles={["super_admin"]}>
      <div className="max-w-[1400px] mx-auto space-y-6 md:space-y-10 relative z-10 w-full mb-8">

        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/5 pb-8">
          <div className="space-y-2">
            <div className="flex items-center gap-2 font-bold uppercase tracking-widest text-[10px]" style={{ color: '#B0E0E6' }}>
              <Layers size={14} style={{ color: '#B0E0E6' }} /> Aura Central Command
            </div>
            <h1 className="text-3xl lg:text-4xl font-sans tracking-wide text-white font-bold uppercase">
              Gestão da Plataforma
            </h1>
            <p className="text-white/40 text-sm tracking-wide">
              Monitoramento global de métricas e integridade de dados.
            </p>
          </div>
          <button
            onClick={fetchInitialData}
            className="flex items-center gap-2 px-5 py-2.5 bg-white/5 hover:bg-white/10 rounded-full text-xs font-bold text-white transition-all shadow-inner border border-white/5 uppercase tracking-wider"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} style={{ color: '#B0E0E6' }} />
            Atualizar
          </button>
        </header>

        {/* Stats Grid */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
          <StatCard
            title="Propriedades ativas"
            value={stats?.totalProperties ?? "—"}
            icon={Building2}
            accent="#B0E0E6"
            loading={loading}
          />
          <StatCard
            title="Estadias em curso"
            value={stats?.activeStays ?? "—"}
            sub="em todas as propriedades"
            icon={Users}
            accent="#E6E6FA"
            loading={loading}
          />
          <StatCard
            title="Check-ins (7 dias)"
            value={stats?.checkins7d ?? "—"}
            icon={CheckCircle2}
            accent="#a3e635"
            loading={loading}
          />
          <StatCard
            title="Mensagens falhas (24h)"
            value={stats?.msgFailed24h ?? "—"}
            sub={stats?.msgFailed24h === 0 ? "Nenhuma falha" : "Requer atenção"}
            icon={MessageSquareX}
            accent={stats?.msgFailed24h === 0 ? "#a3e635" : "#f87171"}
            loading={loading}
          />
        </section>

        {/* Log de Auditoria */}
        <section className="bg-[#1c1c1c] rounded-[32px] p-6 lg:p-8 border border-white/5 shadow-[0_10px_40px_rgba(0,0,0,0.4)] overflow-hidden flex flex-col gap-6">

          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            <h2 className="text-lg font-normal text-white/90 flex items-center gap-3">
              <Clock style={{ color: '#B0E0E6' }} size={20} /> Log de Atividades Global
            </h2>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={14} />
                <input
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Buscar no log..."
                  className="bg-[#141414] border border-white/10 rounded-full py-2.5 pl-10 pr-4 text-xs text-white/80 outline-none focus:border-[#B0E0E6]/30 w-full sm:w-56 transition-all shadow-inner placeholder:text-white/30"
                />
              </div>

              <div className="flex items-center gap-2 bg-[#141414] border border-white/10 p-1.5 rounded-full px-4 shadow-inner">
                <Filter size={14} className="text-white/40" />
                <select
                  value={filterProperty}
                  onChange={e => setFilterProperty(e.target.value)}
                  className="bg-transparent text-xs text-white/80 font-medium py-1 outline-none uppercase tracking-wider appearance-none focus:ring-0 max-w-[150px] truncate"
                >
                  <option value="all" className="bg-[#222]">Todas Propriedades</option>
                  {properties.map(p => (
                    <option key={p.id} value={p.id} className="bg-[#222]">{p.name}</option>
                  ))}
                  <option value="SYSTEM" className="bg-[#222]">Sistema Aura</option>
                </select>
              </div>

              <div className="flex items-center gap-2 bg-[#141414] border border-white/10 p-1.5 rounded-full px-4 shadow-inner">
                <Tag size={14} className="text-white/40" />
                <select
                  value={filterEntity}
                  onChange={e => setFilterEntity(e.target.value)}
                  className="bg-transparent text-xs text-white/80 font-medium py-1 outline-none uppercase tracking-wider appearance-none focus:ring-0 max-w-[130px]"
                >
                  <option value="all" className="bg-[#222]">Todas Entidades</option>
                  <option value="STAY" className="bg-[#222]">Estadias</option>
                  <option value="USER" className="bg-[#222]">Usuários</option>
                  <option value="MESSAGE" className="bg-[#222]">Mensagens</option>
                  <option value="PROPERTY" className="bg-[#222]">Configurações</option>
                  <option value="STRUCTURE" className="bg-[#222]">Estruturas</option>
                  <option value="CONCIERGE" className="bg-[#222]">Concierge</option>
                  <option value="FB_ORDER" className="bg-[#222]">F&B</option>
                </select>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr>
                  {["Timestamp", "Autor", "Ação", "Propriedade", "Detalhes"].map(h => (
                    <th key={h} className="pb-4 pt-2 text-[10px] font-semibold tracking-widest text-white/30 uppercase border-b border-white/5 px-4">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-[12px] divide-y divide-white/5">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-white/40 italic">
                      <RefreshCw className="animate-spin mx-auto mb-2" style={{ color: '#B0E0E6' }} />
                      Sincronizando Aura Engine...
                    </td>
                  </tr>
                ) : filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-white/40">
                      Nenhuma atividade encontrada com estes filtros.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map(log => (
                    <tr key={log.id} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="p-4 whitespace-nowrap">
                        <div className="flex items-center gap-2 font-mono text-white/50">
                          <Calendar size={12} style={{ color: '#B0E0E6', opacity: 0.5 }} />
                          {log.timestamp
                            ? format(new Date(log.timestamp), "dd/MM HH:mm:ss", { locale: ptBR })
                            : "---"}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-full bg-[#111] flex items-center justify-center text-[10px] font-bold text-[#E6E6FA] border border-white/10 uppercase shadow-inner">
                            {log.userName.charAt(0)}
                          </div>
                          <span className="font-medium text-white/80 group-hover:text-white transition-colors">
                            {log.userName}
                          </span>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={cn(
                          "px-2.5 py-1 rounded border text-[9px] font-bold uppercase tracking-widest",
                          actionBadgeClass(log.action)
                        )}>
                          {ACTION_LABELS[log.action] || log.action.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className="text-[10px] font-medium bg-[#111] text-white/60 px-3 py-1 rounded-full border border-white/5">
                          {log.propertyId === "SYSTEM"
                            ? "Aura Core"
                            : (properties.find(p => p.id === log.propertyId)?.name || log.propertyId)}
                        </span>
                      </td>
                      <td className="p-4 max-w-xs">
                        <p className="text-white/50 truncate group-hover:whitespace-normal group-hover:overflow-visible transition-all">
                          {log.details}
                        </p>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Bottom bar */}
        <div className="h-14 w-full bg-[#1A1A1A] border border-white/5 rounded-[20px] flex items-center justify-between px-6 lg:px-10 text-sm shadow-[0_10px_30px_rgba(0,0,0,0.5)] mt-8">
          <div className="hidden lg:flex items-center gap-10 text-white/40">
            <div className="flex items-center gap-2">
              <Infinity size={14} style={{ color: '#B0E0E6', opacity: 0.5 }} />
              <span className="font-semibold tracking-widest text-[10px] uppercase">Flexibility</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 border-2 border-current rounded-tl-full border-r-0 border-b-0" />
              <span className="font-semibold tracking-widest text-[10px] uppercase">Fibonacci</span>
            </div>
            <div className="flex items-center gap-2">
              <Circle size={12} style={{ color: '#E6E6FA', opacity: 0.5 }} />
              <span className="font-semibold tracking-widest text-[10px] uppercase">Golden Geometry</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ background: "linear-gradient(45deg, #222, #B0E0E6, #222)" }} />
              <span className="font-semibold tracking-widest text-[10px] uppercase">Arctic Materials</span>
            </div>
          </div>

          <div className="flex items-center gap-3 lg:border-l lg:border-white/10 lg:pl-10 ml-auto">
            <div className="w-[6px] h-[6px] rounded-full animate-pulse" style={{ backgroundColor: '#B0E0E6', boxShadow: '0 0 12px #B0E0E6' }} />
            <Wifi size={14} style={{ color: '#B0E0E6' }} />
            <div className="flex flex-col ml-1">
              <span className="font-bold text-[10px] tracking-widest uppercase" style={{ color: '#E0FFFF' }}>
                Sistema Online
              </span>
              <span className="text-[8px] text-white/30 tracking-wider">
                Aura Engine {stats ? "v1.0.0-beta" : "loading..."}
              </span>
            </div>
          </div>
        </div>

      </div>
    </RoleGuard>
  );
}
