// src/app/admin/stays/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import { StayService } from "@/services/stay-service";
import { PropertyService } from "@/services/property-service";
import { Stay, Property } from "@/types/aura";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { 
  Calendar, Search, Loader2, AlertCircle, 
  Dog, Users, UserCheck, ArrowUpRight, 
  Building2, ChevronRight, MapPin, Clock 
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { toast } from "sonner";
import { StayDetailsModal } from "@/components/admin/StayDetailsModal";
import { useRouter } from "next/navigation";

type TabStatus = 'futuras' | 'ativas' | 'encerradas';

export default function StaysPage() {
  const router = useRouter();
  const { userData, isSuperAdmin } = useAuth();
  const { property: contextProperty } = useProperty();
  const [selectedStay, setSelectedStay] = useState<any | null>(null);
  const [selectedGuest, setSelectedGuest] = useState<any | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleOpenFicha = async (stay: any) => {
    setLoading(true);
    try {
      // Usamos o novo método do service para pegar tudo de uma vez
      const data = await StayService.getStayWithGuestAndCabin(selectedPropertyId, stay.id);
      if (data) {
        setSelectedStay({ ...data.stay, guestName: data.guest?.fullName, cabinName: data.cabin?.name });
        setSelectedGuest(data.guest);
        setIsModalOpen(true);
      }
    } catch (error) {
      toast.error("Erro ao carregar ficha.");
    } finally {
      setLoading(false);
    }
  };

  // States de Dados
  const [activeTab, setActiveTab] = useState<TabStatus>('ativas');
  const [stays, setStays] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  
  // States de Super Admin
  const [allProperties, setAllProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");

  // 1. Carregar lista de propriedades se for Super Admin
  useEffect(() => {
    if (isSuperAdmin) {
      PropertyService.getAllProperties().then(setAllProperties);
    }
  }, [isSuperAdmin]);

  // 2. Definir a propriedade inicial
  useEffect(() => {
    const pId = userData?.propertyId || contextProperty?.id;
    if (pId) setSelectedPropertyId(pId);
  }, [userData, contextProperty]);

  // 3. Carregar estadias sempre que a propriedade ou a aba mudar
  useEffect(() => {
    if (selectedPropertyId) {
      loadStays();
    } else {
      setStays([]);
    }
  }, [activeTab, selectedPropertyId]);

  async function loadStays() {
    setLoading(true);
    try {
      let statusFilter: string[] = [];
      if (activeTab === 'futuras') statusFilter = ['pending', 'pre_checkin_done'];
      if (activeTab === 'ativas') statusFilter = ['active'];
      if (activeTab === 'encerradas') statusFilter = ['finished', 'cancelled'];

      const data = await StayService.getStaysByStatus(selectedPropertyId, statusFilter);
      setStays(data);
    } catch (error) {
      toast.error("Erro ao carregar estadias.");
    } finally {
      setLoading(false);
    }
  }

  const filteredStays = stays.filter(s => 
    s.guestName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.cabinName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <RoleGuard allowedRoles={["super_admin", "admin", "reception"]}>
      <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
        
        {/* Header com Seletor Dinâmico */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <h1 className="text-4xl font-black tracking-tighter flex items-center gap-3 text-white">
              <Calendar className="text-primary" size={36} /> Painel Operacional
            </h1>
            <div className="flex items-center gap-2">
              {isSuperAdmin ? (
                <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl">
                  <Building2 size={14} className="text-primary" />
                  <select 
                    value={selectedPropertyId}
                    onChange={(e) => setSelectedPropertyId(e.target.value)}
                    className="bg-transparent text-xs font-bold text-white outline-none pr-2"
                  >
                    <option value="">Selecionar Propriedade...</option>
                    {allProperties.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <p className="text-muted-foreground font-medium flex items-center gap-2">
                  <MapPin size={14} /> {contextProperty?.name || "Carregando..."}
                </p>
              )}
            </div>
          </div>

          <Link 
            href="/admin/stays/new"
            className="bg-primary text-black font-black px-8 py-4 rounded-2xl flex items-center gap-2 hover:shadow-[0_0_30px_rgba(var(--primary),0.4)] transition-all active:scale-95"
          >
            Nova Hospedagem <ArrowUpRight size={20} />
          </Link>
        </header>

        {/* Filtros e Tabs */}
        <div className="flex flex-col md:flex-row gap-6 items-center justify-between bg-[#141414] border border-white/5 p-2 rounded-[32px]">
          <div className="flex gap-1 w-full md:w-auto">
            {(['ativas', 'futuras', 'encerradas'] as TabStatus[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "flex-1 md:flex-none px-8 py-3 rounded-[20px] text-[10px] font-black uppercase tracking-[0.2em] transition-all",
                  activeTab === tab 
                    ? "bg-white text-black shadow-xl" 
                    : "text-white/40 hover:text-white hover:bg-white/5"
                )}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-80 px-2">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-white/20" size={18} />
            <input 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar por hóspede ou cabana..."
              className="w-full pl-12 p-4 bg-black/40 border border-white/10 rounded-2xl outline-none focus:border-primary/50 text-sm transition-all"
            />
          </div>
        </div>

        {/* Listagem */}
        {!selectedPropertyId ? (
          <div className="text-center p-24 bg-[#141414] rounded-[40px] border border-dashed border-white/10">
            <Building2 size={60} className="mx-auto text-white/10 mb-6" />
            <h3 className="text-2xl font-black text-white">Aguardando Seleção</h3>
            <p className="text-white/40 mt-2">Selecione uma propriedade no topo para gerenciar as estadias.</p>
          </div>
        ) : loading ? (
          <div className="flex flex-col items-center justify-center p-24 space-y-4">
            <Loader2 className="animate-spin text-primary" size={48} />
            <p className="text-xs font-bold uppercase tracking-widest text-white/20">Sincronizando Aura Cloud...</p>
          </div>
        ) : filteredStays.length === 0 ? (
          <div className="text-center p-24 bg-[#141414] rounded-[40px] border border-dashed border-white/10">
            <AlertCircle size={48} className="mx-auto text-white/20 mb-4" />
            <h3 className="text-xl font-bold text-white">Sem estadias {activeTab}</h3>
            <p className="text-white/40">Não há registros para esta categoria no momento.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredStays.map((s) => (
              <div 
                key={s.id}
                className="group bg-[#141414] border border-white/5 rounded-[40px] overflow-hidden hover:border-primary/40 transition-all flex flex-col shadow-lg"
              >
                <div className="p-8 space-y-6 flex-1">
                  <div className="flex justify-between items-start">
                    <div className="px-4 py-1.5 bg-primary/10 border border-primary/20 rounded-full">
                        <span className="text-[10px] font-black text-primary uppercase tracking-widest">{s.cabinName}</span>
                    </div>
                    <div className="flex gap-2">
                      {s.hasPet && <div className="p-2 bg-orange-500/10 rounded-lg"><Dog size={16} className="text-orange-500" /></div>}
                      {s.groupId && <div className="p-2 bg-blue-500/10 rounded-lg"><Users size={16} className="text-blue-500" /></div>}
                      {s.status === 'pre_checkin_done' && <div className="p-2 bg-green-500/10 rounded-lg"><UserCheck size={16} className="text-green-500" /></div>}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-2xl font-black text-white tracking-tighter group-hover:text-primary transition-colors">
                        {s.guestName.split(' ')[0]} {s.guestName.split(' ').slice(-1)}
                    </h3>
                    <div className="flex items-center gap-2 text-white/40 text-[10px] font-bold uppercase tracking-widest">
                        <Clock size={12} />
                        {format(s.checkIn.toDate(), "dd MMM", { locale: ptBR })} — {format(s.checkOut.toDate(), "dd MMM", { locale: ptBR })}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-black/40 p-4 rounded-3xl border border-white/5">
                        <p className="text-[9px] font-bold text-white/20 uppercase mb-1">Código</p>
                        <p className="text-lg font-black text-primary tracking-widest">{s.accessCode}</p>
                    </div>
                    <div className="bg-black/40 p-4 rounded-3xl border border-white/5">
                        <p className="text-[9px] font-bold text-white/20 uppercase mb-1">Pré-Checkin</p>
                        <p className={cn("text-xs font-black uppercase", s.status === 'pending' ? "text-yellow-500" : "text-green-500")}>
                          {s.status === 'pending' ? "Pendente" : "Completo"}
                        </p>
                    </div>
                  </div>
                </div>

                <div className="p-6 bg-white/[0.02] border-t border-white/5 flex gap-3">
                <button 
                    onClick={() => handleOpenFicha(s)}
                    className="flex-1 bg-white/5 hover:bg-white/10 text-white text-[10px] font-black uppercase py-4 rounded-2xl transition-all tracking-widest"
                    >
                    Ver Ficha
                </button>  
                  {(s.status === 'pending' || s.status === 'pre_checkin_done') && (
                    <button 
                      onClick={async () => {
                        if (confirm(`Confirmar entrada de ${s.guestName}?`)) {
                          await StayService.performCheckIn(selectedPropertyId, s.id, userData!.id, userData!.fullName);
                          loadStays();
                          toast.success("Check-in realizado!");
                        }
                      }}
                      className="flex-1 bg-primary text-black text-[10px] font-black uppercase py-4 rounded-2xl hover:shadow-[0_0_20px_rgba(var(--primary),0.4)] transition-all tracking-widest"
                    >
                      Check-in
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {selectedStay && selectedGuest && (
          <StayDetailsModal 
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            stay={selectedStay}
            guest={selectedGuest}
            onViewGuest={(id) => router.push(`/admin/guests/${id}`)}
          />
        )}
      </div>
    </RoleGuard>
  );
}