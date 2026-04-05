"use client";

import React, { useState, useEffect } from "react";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { AuditService } from "@/services/audit-service";
import { PropertyService } from "@/services/property-service";
import { AuditLog, Property } from "@/types/aura";
import {
  Activity,
  BarChart3,
  Building2,
  Search,
  Filter,
  Clock,
  User,
  Tag,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  Calendar,
  RefreshCw,
  Infinity, 
  Circle, 
  Lightbulb
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

// --- COMPONENTES AUXILIARES ESTILIZADOS ---

const StatCard = ({ title, value, trend, icon: Icon, color }: any) => {
  // Translate the old solid color classes to the new translucent aesthetics
  const getIconColor = (colorClass: string) => {
    if (colorClass.includes('blue')) return { bg: "bg-[#00BFFF]/20", text: "text-[#00BFFF]", border: "border-[#00BFFF]/30" };
    if (colorClass.includes('purple')) return { bg: "bg-[#E6E6FA]/20", text: "text-[#E6E6FA]", border: "border-[#E6E6FA]/30" };
    if (colorClass.includes('orange')) return { bg: "bg-orange-500/20", text: "text-orange-400", border: "border-orange-500/30" };
    if (colorClass.includes('green')) return { bg: "bg-[#E0FFFF]/20", text: "text-[#E0FFFF]", border: "border-[#E0FFFF]/30" };
    return { bg: "bg-white/10", text: "text-white", border: "border-white/20" };
  };

  const style = getIconColor(color);

  return (
    <div className="bg-[#1c1c1c] rounded-[24px] p-6 border border-white/5 shadow-[0_8px_30px_rgba(0,0,0,0.5)] relative overflow-hidden group">
      <div className="absolute inset-0 opacity-[0.02] bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]" />
      <div className="flex flex-col h-full justify-between relative z-10">
         <div className="flex items-center justify-between mb-4">
           <div className="flex items-center gap-4">
             <div className={cn("p-3 rounded-2xl border shadow-inner", style.bg, style.border)}>
               <Icon size={18} className={style.text} />
             </div>
             <p className="text-[11px] text-white/60 tracking-[0.5px] uppercase w-20 leading-tight">{title}</p>
           </div>
           {trend !== undefined && (
             <span className={cn("text-[10px] font-medium px-2 py-1 rounded", trend > 0 ? "text-[#00BFFF] bg-[#00BFFF]/10" : "text-red-500 bg-red-500/10")}>
               {trend > 0 ? '+' : ''}{trend}%
             </span>
           )}
         </div>
         <h3 className="text-[32px] font-bold text-white tracking-tight">{value}</h3>
      </div>
    </div>
  );
};

// --- ACTION LABEL MAP ---
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

function actionBadgeClass(action: string): string {
  if (action.includes('DELETE') || action.includes('LOST')) return "bg-red-500/10 text-red-400 border-red-500/20";
  if (action.includes('UPDATE') || action.includes('STATUS_CHANGED') || action.includes('RETURNED')) return "bg-[#00BFFF]/10 text-[#00BFFF] border-[#00BFFF]/20";
  if (action.includes('MESSAGE')) return "bg-orange-500/10 text-orange-400 border-orange-500/20";
  if (action.includes('BOOKING') || action === 'CHECKIN' || action === 'CHECKOUT') return "bg-[#E6E6FA]/10 text-[#E6E6FA] border-[#E6E6FA]/20";
  if (action.includes('CONCIERGE')) return "bg-orange-500/10 text-orange-400 border-orange-500/20";
  return "bg-[#E0FFFF]/10 text-[#E0FFFF] border-[#E0FFFF]/20";
}

// --- PÁGINA PRINCIPAL FUNCIONAL COM A NOVA UI ---

export default function SuperAdminDashboard() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterEntity, setFilterEntity] = useState("all");
  const [filterProperty, setFilterProperty] = useState("all");

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const [allLogs, allProps] = await Promise.all([
        AuditService.getGlobalActivity(100),
        PropertyService.getAllProperties()
      ]);
      setLogs(allLogs);
      setProperties(allProps);
    } catch (error) {
      console.error("Erro ao carregar dados core:", error);
    } finally {
      setLoading(false);
    }
  };

  // Lógica de Filtragem de Logs
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
              <div className="flex items-center gap-2 text-[#E0FFFF] font-bold uppercase tracking-widest text-[10px]">
                <Layers size={14} className="text-[#00BFFF]" /> Aura Central Command
              </div>
              <h1 className="text-3xl lg:text-4xl font-sans tracking-wide text-white font-bold uppercase">Gestão da Plataforma</h1>
              <p className="text-white/40 text-sm tracking-wide">Monitoramento global de métricas e integridade de dados.</p>
            </div>
            
            <div className="flex items-center gap-4">
              <button
                onClick={fetchInitialData}
                className="flex items-center gap-2 px-5 py-2.5 bg-white/5 hover:bg-white/10 rounded-full text-xs font-bold text-white transition-all shadow-inner border border-white/5 uppercase tracking-wider"
              >
                <RefreshCw size={14} className={loading ? "animate-spin text-[#00BFFF]" : "text-[#00BFFF]"} /> Atualizar
              </button>
            </div>
          </header>

          {/* Grid de Estatísticas */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
            <StatCard
              title="Propriedades Ativas"
              value={properties.length}
              trend={12}
              icon={Building2}
              color="bg-blue-500"
            />
            <StatCard
              title="Hóspedes no Aura"
              value="1,284"
              trend={24}
              icon={User}
              color="bg-purple-500"
            />
            <StatCard
              title="Transações API"
              value="45.2k"
              trend={-5}
              icon={Activity}
              color="bg-orange-500"
            />
            <StatCard
              title="Conversão WhatsApp"
              value="92%"
              trend={3}
              icon={BarChart3}
              color="bg-green-500"
            />
          </section>

          {/* Central de Auditoria - Redesenhada como Tabela de Detalhes premium */}
          <section className="bg-[#1c1c1c] rounded-[32px] p-6 lg:p-8 border border-white/5 shadow-[0_10px_40px_rgba(0,0,0,0.4)] overflow-hidden flex flex-col gap-6">
            
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
              <h2 className="text-lg font-normal text-white/90 flex items-center gap-3">
                <Clock className="text-[#B0E0E6]" size={20} /> Log de Atividades Global
              </h2>

              {/* Filtros Premium */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={14} />
                  <input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar no log..."
                    className="bg-[#141414] border border-white/10 rounded-full py-2.5 pl-10 pr-4 text-xs text-white/80 outline-none focus:border-[#E0FFFF]/30 w-full sm:w-56 transition-all shadow-inner placeholder:text-white/30"
                  />
                </div>

                <div className="flex items-center gap-2 bg-[#141414] border border-white/10 p-1.5 rounded-full px-4 shadow-inner">
                  <Filter size={14} className="text-[#E6E6FA]/60" />
                  <select
                    value={filterProperty}
                    onChange={(e) => setFilterProperty(e.target.value)}
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
                  <Tag size={14} className="text-[#E6E6FA]/60" />
                  <select
                    value={filterEntity}
                    onChange={(e) => setFilterEntity(e.target.value)}
                    className="bg-transparent text-xs text-white/80 font-medium py-1 outline-none uppercase tracking-wider appearance-none focus:ring-0 max-w-[130px]"
                  >
                    <option value="all" className="bg-[#222]">Todas Entidades</option>
                    <option value="STAY" className="bg-[#222]">Estadias</option>
                    <option value="USER" className="bg-[#222]">Usuários</option>
                    <option value="MESSAGE" className="bg-[#222]">Mensagens</option>
                    <option value="PROPERTY" className="bg-[#222]">Configurações</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Tabela de Auditoria Premium */}
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className="pb-4 pt-2 text-[10px] font-semibold tracking-widest text-white/30 uppercase border-b border-white/5 px-4">Timestamp</th>
                    <th className="pb-4 pt-2 text-[10px] font-semibold tracking-widest text-white/30 uppercase border-b border-white/5 px-4">Autor</th>
                    <th className="pb-4 pt-2 text-[10px] font-semibold tracking-widest text-white/30 uppercase border-b border-white/5 px-4">Ação</th>
                    <th className="pb-4 pt-2 text-[10px] font-semibold tracking-widest text-white/30 uppercase border-b border-white/5 px-4">Propriedade</th>
                    <th className="pb-4 pt-2 text-[10px] font-semibold tracking-widest text-white/30 uppercase border-b border-white/5 px-4">Detalhes</th>
                  </tr>
                </thead>
                <tbody className="text-[12px] divide-y divide-white/5">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="p-12 text-center text-white/40 italic">
                        <RefreshCw className="animate-spin mx-auto mb-2 text-[#00BFFF]" /> Sincronizando Aura Engine...
                      </td>
                    </tr>
                  ) : filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-12 text-center text-white/40">
                        Nenhuma atividade encontrada com estes filtros.
                      </td>
                    </tr>
                  ) : (
                    filteredLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-white/[0.02] transition-colors group">
                        <td className="p-4 whitespace-nowrap">
                          <div className="flex items-center gap-2 font-mono text-white/50">
                            <Calendar size={12} className="text-[#00BFFF]/50" />
                            {log.timestamp ? format(new Date(log.timestamp), "dd/MM HH:mm:ss", { locale: ptBR }) : "---"}
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-full bg-[#111] flex items-center justify-center text-[10px] font-bold text-[#E6E6FA] border border-white/10 uppercase shadow-inner">
                              {log.userName.charAt(0)}
                            </div>
                            <span className="font-medium text-white/80 group-hover:text-white transition-colors">{log.userName}</span>
                          </div>
                        </td>
                        <td className="p-4">
                          <span className={cn(
                            "px-2.5 py-1 rounded border text-[9px] font-bold uppercase tracking-widest overflow-hidden",
                            actionBadgeClass(log.action)
                          )}>
                            {ACTION_LABELS[log.action] || log.action.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className="text-[10px] font-medium bg-[#111] text-white/60 px-3 py-1 rounded-full border border-white/5">
                            {log.propertyId === 'SYSTEM'
                              ? 'Aura Core'
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

          {/* BOTTOM BAR (Aura Brand Principles) */}
          <div className="h-14 w-full bg-[#1A1A1A] border border-white/5 rounded-[20px] flex items-center justify-between px-6 lg:px-10 text-sm shadow-[0_10px_30px_rgba(0,0,0,0.5)] mt-8">
             <div className="hidden lg:flex items-center gap-10 text-white/40">
                <div className="flex items-center gap-2 flex-wrap">
                   <Infinity size={14} className="text-[#E0FFFF]/50" />
                   <span className="font-semibold tracking-widest text-[10px] uppercase">Flexibility</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                   <div className="w-3 h-3 border-2 border-current rounded-tl-full border-r-0 border-b-0" />
                   <span className="font-semibold tracking-widest text-[10px] uppercase">Fibonacci</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                   <div className="flex items-center">
                     <Circle size={12} className="text-[#E6E6FA]/50" />
                     <div className="w-3 h-3 border-2 border-current ml-1" />
                   </div>
                   <span className="font-semibold tracking-widest text-[10px] uppercase">Golden Geometry</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                   <div className="w-3 h-3 rounded-full" style={{ background: "linear-gradient(45deg, #222, #E6E6FA, #222)" }} />
                   <span className="font-semibold tracking-widest text-[10px] uppercase">Iridescent Materials</span>
                </div>
             </div>

             <div className="flex items-center gap-3 lg:border-l lg:border-white/10 lg:pl-10 ml-auto">
                <div className="flex items-center justify-center p-1">
                   <div className="w-[6px] h-[6px] rounded-full bg-[#00BFFF] shadow-[0_0_12px_#00BFFF] animate-pulse" />
                </div>
                <Lightbulb size={14} className="text-[#00BFFF]" />
                <div className="flex flex-col ml-1">
                   <span className="font-bold text-[#E0FFFF] text-[10px] tracking-widest uppercase">LED Status</span>
                   <span className="text-[8px] text-white/30 tracking-wider">Aura Engine {properties.length > 0 ? "v1.0.0-beta" : "Loading"}</span>
                </div>
             </div>
          </div>
        </div>
    </RoleGuard>
  );
}
