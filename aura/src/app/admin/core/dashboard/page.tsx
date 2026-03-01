// src/app/admin/core/dashboard/page.tsx
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
  RefreshCw
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

// --- COMPONENTES AUXILIARES ---

const StatCard = ({ title, value, trend, icon: Icon, color }: any) => (
  <div className="bg-card border border-border p-6 rounded-[24px] shadow-sm space-y-4">
    <div className="flex items-center justify-between">
      <div className={cn("p-2 rounded-xl bg-opacity-10", color)}>
        <Icon size={24} className={color.replace('bg-', 'text-')} />
      </div>
      {trend && (
        <span className={cn("flex items-center text-xs font-bold", trend > 0 ? "text-green-500" : "text-red-500")}>
          {trend > 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          {Math.abs(trend)}%
        </span>
      )}
    </div>
    <div>
      <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
      <h3 className="text-3xl font-black">{value}</h3>
    </div>
  </div>
);

// --- PÁGINA PRINCIPAL ---

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
      <div className="p-8 max-w-[1600px] mx-auto space-y-10 animate-in fade-in duration-500">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-border pb-8">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-primary font-bold uppercase tracking-widest text-xs">
              <Layers size={14} /> Aura Central Command
            </div>
            <h1 className="text-4xl font-black tracking-tighter">Gestão da Plataforma</h1>
            <p className="text-muted-foreground font-medium italic">Monitoramento global de métricas e integridade de dados.</p>
          </div>
          <button 
            onClick={fetchInitialData}
            className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-border rounded-xl text-sm font-bold transition-all"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Atualizar Dados
          </button>
        </header>

        {/* Grid de Estatísticas (MOCKADOS) */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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

        {/* Central de Auditoria */}
        <section className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h2 className="text-2xl font-black tracking-tight flex items-center gap-2">
              <Clock className="text-primary" /> Log de Atividades Global
            </h2>

            {/* Filtros */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                <input 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar no log..."
                  className="pl-10 p-2 bg-card border border-border rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20 w-64"
                />
              </div>
              
              <div className="flex items-center gap-2 bg-card border border-border p-1 rounded-xl">
                <Filter size={16} className="ml-2 text-muted-foreground" />
                <select 
                  value={filterProperty}
                  onChange={(e) => setFilterProperty(e.target.value)}
                  className="bg-transparent text-sm font-medium p-1 outline-none"
                >
                  <option value="all">Todas as Propriedades</option>
                  {properties.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                  <option value="SYSTEM">Sistema Aura</option>
                </select>
              </div>

              <div className="flex items-center gap-2 bg-card border border-border p-1 rounded-xl">
                <Tag size={16} className="ml-2 text-muted-foreground" />
                <select 
                  value={filterEntity}
                  onChange={(e) => setFilterEntity(e.target.value)}
                  className="bg-transparent text-sm font-medium p-1 outline-none"
                >
                  <option value="all">Todas Entidades</option>
                  <option value="STAY">Estadias</option>
                  <option value="USER">Usuários</option>
                  <option value="MESSAGE">Mensagens</option>
                  <option value="PROPERTY">Configurações</option>
                </select>
              </div>
            </div>
          </div>

          {/* Tabela de Auditoria */}
          <div className="bg-card border border-border rounded-[32px] overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="p-4 text-xs font-bold uppercase text-muted-foreground tracking-widest">Timestamp</th>
                    <th className="p-4 text-xs font-bold uppercase text-muted-foreground tracking-widest">Autor</th>
                    <th className="p-4 text-xs font-bold uppercase text-muted-foreground tracking-widest">Ação</th>
                    <th className="p-4 text-xs font-bold uppercase text-muted-foreground tracking-widest">Propriedade</th>
                    <th className="p-4 text-xs font-bold uppercase text-muted-foreground tracking-widest">Detalhes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="p-12 text-center text-muted-foreground italic">
                        <RefreshCw className="animate-spin mx-auto mb-2" /> Sincronizando logs...
                      </td>
                    </tr>
                  ) : filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-12 text-center text-muted-foreground">
                        Nenhuma atividade encontrada com estes filtros.
                      </td>
                    </tr>
                  ) : (
                    filteredLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-muted/30 transition-colors group">
                        <td className="p-4 whitespace-nowrap">
                          <div className="flex items-center gap-2 text-xs font-mono">
                            <Calendar size={12} className="text-muted-foreground" />
                            {log.timestamp ? format(log.timestamp.toDate(), "dd/MM HH:mm:ss", { locale: ptBR }) : "---"}
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary border border-primary/20 uppercase">
                              {log.userName.charAt(0)}
                            </div>
                            <span className="text-sm font-bold">{log.userName}</span>
                          </div>
                        </td>
                        <td className="p-4">
                          <span className={cn(
                            "px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-tighter",
                            log.action.includes('CREATE') && "bg-green-500/10 text-green-500",
                            log.action.includes('UPDATE') && "bg-blue-500/10 text-blue-500",
                            log.action.includes('DELETE') && "bg-red-500/10 text-red-500",
                            log.action.includes('MESSAGE') && "bg-orange-500/10 text-orange-500",
                          )}>
                            {log.action.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className="text-xs font-medium bg-muted px-2 py-1 rounded-lg">
                            {log.propertyId === 'SYSTEM' ? '⚙️ AURA CORE' : log.propertyId}
                          </span>
                        </td>
                        <td className="p-4 max-w-xs">
                          <p className="text-sm text-muted-foreground truncate group-hover:whitespace-normal group-hover:overflow-visible transition-all">
                            {log.details}
                          </p>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Footer Técnico */}
        <footer className="pt-10 flex flex-col md:flex-row justify-between items-center text-[10px] font-bold text-muted-foreground uppercase tracking-[0.3em]">
          <span>Aura Engine v1.0.0-beta</span>
          <span className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> Nodes Saudáveis
          </span>
          <span>© 2026 Experience Design</span>
        </footer>
      </div>
    </RoleGuard>
  );
}
