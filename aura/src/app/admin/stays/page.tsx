// src/app/admin/stays/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import { StayService } from "@/services/stay-service";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { 
  Calendar, Search, Loader2, AlertCircle, 
  Dog, Users, UserCheck, ArrowUpRight, 
  Building2, MapPin, Clock, MessageCircle, 
  Archive, Send, X, Star
} from "lucide-react";
import { format, differenceInCalendarDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { toast } from "sonner";
import { StayDetailsModal } from "@/components/admin/StayDetailsModal";
import { useRouter } from "next/navigation";

type TabStatus = 'futuras' | 'ativas' | 'encerradas';

export default function StaysPage() {
  const router = useRouter();
  const { userData } = useAuth();
  const { property: contextProperty } = useProperty();
  
  // States de Dados e UI
  const [activeTab, setActiveTab] = useState<TabStatus>('ativas');
  const [stays, setStays] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // States de Modais
  const [selectedStay, setSelectedStay] = useState<any | null>(null);
  const [selectedGuest, setSelectedGuest] = useState<any | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

  // States do Modal de WhatsApp
  const [isMsgModalOpen, setIsMsgModalOpen] = useState(false);
  const [msgData, setMsgData] = useState({ phone: "", name: "", text: "" });
  const [sendingMsg, setSendingMsg] = useState(false);

  // --- Carregamento de Dados ---
  useEffect(() => {
    if (contextProperty?.id) {
      loadStays();
    } else {
      setStays([]);
    }
  }, [activeTab, contextProperty?.id]);

  async function loadStays() {
    if (!contextProperty?.id) return;
    setLoading(true);
    try {
      let statusFilter: string[] = [];
      if (activeTab === 'futuras') statusFilter = ['pending', 'pre_checkin_done'];
      if (activeTab === 'ativas') statusFilter = ['active'];
      if (activeTab === 'encerradas') statusFilter = ['finished', 'cancelled'];

      const data = await StayService.getStaysByStatus(contextProperty.id, statusFilter);
      setStays(data);
    } catch (error) {
      toast.error("Erro ao carregar estadias.");
    } finally {
      setLoading(false);
    }
  }

  // --- Handlers ---

  const handleOpenFicha = async (stay: any) => {
    if (!contextProperty?.id) return;
    setLoading(true);
    try {
      const data = await StayService.getStayWithGuestAndCabin(contextProperty.id, stay.id);
      if (data) {
        setSelectedStay({ ...data.stay, guestName: data.guest?.fullName, cabinName: data.cabin?.name });
        setSelectedGuest(data.guest);
        setIsDetailsModalOpen(true);
      }
    } catch (error) {
      toast.error("Erro ao carregar ficha.");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenWhatsapp = (stay: any) => {
    // Tenta pegar o telefone do objeto stay (se existir) ou usa um fallback
    const phone = stay.guestPhone || ""; 
    
    // Texto personalizado por status (Opcional, mas melhora a experiência)
    let defaultText = `Olá ${stay.guestName.split(' ')[0]}, tudo bem? Gostaríamos de falar sobre sua estadia no ${contextProperty?.name}.`;
    
    if (activeTab === 'futuras') {
        defaultText = `Olá ${stay.guestName.split(' ')[0]}, estamos ansiosos pela sua chegada no ${contextProperty?.name}! Precisa de ajuda com o check-in?`;
    } else if (activeTab === 'ativas') {
        defaultText = `Olá ${stay.guestName.split(' ')[0]}, como está sendo sua experiência no ${contextProperty?.name}? Precisa de algo?`;
    }

    setMsgData({ 
        phone, 
        name: stay.guestName, 
        text: defaultText
    });
    setIsMsgModalOpen(true);
  };

  const handleSendWhatsapp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSendingMsg(true);
    try {
        // Simulação de chamada de API
        await new Promise(resolve => setTimeout(resolve, 1000));
        // Aqui entraria: await WhatsappService.sendMessage(msgData.phone, msgData.text);
        toast.success(`Mensagem enviada para ${msgData.name}`);
        setIsMsgModalOpen(false);
    } catch (err) {
        toast.error("Erro ao enviar mensagem");
    } finally {
        setSendingMsg(false);
    }
  };

  const handleArchive = async (stayId: string) => {
    if(!confirm("Deseja arquivar esta estadia?")) return;
    // Aqui chamaria StayService.archive(stayId)
    toast.success("Estadia arquivada com sucesso.");
    setStays(prev => prev.filter(s => s.id !== stayId));
  };

  // --- Lógica de Renderização de Status ---

  const getActiveStatusInfo = (checkOutDate: any) => {
    if (!checkOutDate) return { label: "N/A", color: "text-white" };
    
    const today = new Date();
    const end = checkOutDate.toDate();
    const diff = differenceInCalendarDays(end, today);

    if (diff < 0) return { label: "Check-out Atrasado", color: "text-red-500" };
    if (diff === 0) return { label: "Check-out Hoje", color: "text-orange-500" };
    if (diff === 1) return { label: "Check-out Amanhã", color: "text-yellow-500" };
    return { label: "Hospedagem em Curso", color: "text-green-500" };
  };

  const getFutureStatusInfo = (checkInDate: any) => {
    if (!checkInDate) return "Aguardando";
    const today = new Date();
    const start = checkInDate.toDate();
    const diff = differenceInCalendarDays(start, today);

    if (diff === 0) return "Chegada Hoje";
    if (diff === 1) return "Chegada Amanhã";
    return `Chegada em ${diff} dias`;
  };

  const filteredStays = stays.filter(s => 
    s.guestName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.cabinName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <RoleGuard allowedRoles={["super_admin", "admin", "reception"]}>
      <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <h1 className="text-4xl font-black tracking-tighter flex items-center gap-3 text-white">
              <Calendar className="text-primary" size={36} /> Painel Operacional
            </h1>
            <div className="flex items-center gap-2">
              <p className="text-muted-foreground font-medium flex items-center gap-2">
                <MapPin size={14} /> 
                {contextProperty?.name || "Carregando Propriedade..."}
              </p>
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
        {!contextProperty?.id ? (
          <div className="text-center p-24 bg-[#141414] rounded-[40px] border border-dashed border-white/10">
            <Building2 size={60} className="mx-auto text-white/10 mb-6" />
            <h3 className="text-2xl font-black text-white">Carregando...</h3>
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
            {filteredStays.map((s) => {
                const activeInfo = getActiveStatusInfo(s.checkOut);

                return (
                  <div 
                    key={s.id}
                    className="group bg-[#141414] border border-white/5 rounded-[40px] overflow-hidden hover:border-primary/40 transition-all flex flex-col shadow-lg"
                  >
                    <div className="p-8 space-y-6 flex-1">
                      {/* Topo do Card */}
                      <div className="flex justify-between items-start">
                        <div className="px-4 py-1.5 bg-primary/10 border border-primary/20 rounded-full">
                            <span className="text-[10px] font-black text-primary uppercase tracking-widest">{s.cabinName}</span>
                        </div>
                        <div className="flex gap-2">
                          {s.hasPet && <div className="p-2 bg-orange-500/10 rounded-lg" title="Pet"><Dog size={16} className="text-orange-500" /></div>}
                          {s.groupId && <div className="p-2 bg-blue-500/10 rounded-lg" title="Grupo"><Users size={16} className="text-blue-500" /></div>}
                        </div>
                      </div>

                      {/* Nome e Datas (Nome agora sempre clicável para WhatsApp) */}
                      <div className="space-y-1">
                        <h3 
                            onClick={() => handleOpenWhatsapp(s)}
                            className="text-2xl font-black text-white tracking-tighter transition-colors flex items-center gap-2 cursor-pointer hover:text-primary group/name"
                            title="Clique para enviar WhatsApp"
                        >
                            {s.guestName.split(' ')[0]} {s.guestName.split(' ').slice(-1)}
                            <MessageCircle size={20} className="opacity-0 group-hover/name:opacity-100 transition-opacity text-primary" />
                        </h3>
                        <div className="flex items-center gap-2 text-white/40 text-[10px] font-bold uppercase tracking-widest">
                            <Clock size={12} />
                            {s.checkIn?.toDate ? format(s.checkIn.toDate(), "dd MMM", { locale: ptBR }) : ''} — 
                            {s.checkOut?.toDate ? format(s.checkOut.toDate(), "dd MMM", { locale: ptBR }) : ''}
                        </div>
                      </div>

                      {/* Grid de Informações Variável */}
                      <div className="grid grid-cols-2 gap-3">
                        {/* COLUNA 1: Variavel por Tab */}
                        {activeTab === 'futuras' && (
                            <div className="bg-black/40 p-4 rounded-3xl border border-white/5">
                                <p className="text-[9px] font-bold text-white/20 uppercase mb-1">Previsão</p>
                                <p className="text-sm font-black text-white tracking-wide">
                                    {getFutureStatusInfo(s.checkIn)}
                                </p>
                            </div>
                        )}
                        {activeTab === 'ativas' && (
                            <div className="bg-black/40 p-4 rounded-3xl border border-white/5 col-span-2">
                                <p className="text-[9px] font-bold text-white/20 uppercase mb-1">Status Atual</p>
                                <p className={cn("text-lg font-black tracking-wide", activeInfo.color)}>
                                    {activeInfo.label}
                                </p>
                            </div>
                        )}
                        {activeTab === 'encerradas' && (
                            <div className="bg-black/40 p-4 rounded-3xl border border-white/5">
                                <p className="text-[9px] font-bold text-white/20 uppercase mb-1">Avaliação</p>
                                <div className="flex items-center gap-1">
                                    {s.nps ? (
                                        <>
                                            <Star size={14} className="text-yellow-500 fill-yellow-500" />
                                            <p className="text-lg font-black text-white">NPS {s.nps}</p>
                                        </>
                                    ) : (
                                        <p className="text-xs font-bold text-white/40 uppercase">Não Avaliou</p>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* COLUNA 2: Mantém Pré-Checkin para Futuras */}
                        {activeTab === 'futuras' && (
                             <div className="bg-black/40 p-4 rounded-3xl border border-white/5">
                                <p className="text-[9px] font-bold text-white/20 uppercase mb-1">Pré-Checkin</p>
                                <p className={cn("text-xs font-black uppercase", s.status === 'pre_checkin_done' ? "text-green-500" : "text-yellow-500")}>
                                {s.status === 'pre_checkin_done' ? "Pronto" : "Pendente"}
                                </p>
                            </div>
                        )}
                      </div>
                    </div>

                    {/* Footer de Ações */}
                    <div className="p-6 bg-white/[0.02] border-t border-white/5 flex gap-3">
                        <button 
                            onClick={() => handleOpenFicha(s)}
                            className="flex-1 bg-white/5 hover:bg-white/10 text-white text-[10px] font-black uppercase py-4 rounded-2xl transition-all tracking-widest"
                        >
                            Ver Ficha
                        </button>  

                        {/* Botão de Check-in (Apenas Futuras/Pendentes) */}
                        {activeTab === 'futuras' && (
                            <button 
                            onClick={async () => {
                                if (confirm(`Confirmar entrada de ${s.guestName}?`) && contextProperty?.id && userData?.id) {
                                await StayService.performCheckIn(contextProperty.id, s.id, userData.id, userData.fullName);
                                loadStays();
                                toast.success("Check-in realizado!");
                                }
                            }}
                            className="flex-1 bg-primary text-black text-[10px] font-black uppercase py-4 rounded-2xl hover:shadow-[0_0_20px_rgba(var(--primary),0.4)] transition-all tracking-widest"
                            >
                            Check-in
                            </button>
                        )}

                        {/* Botão Arquivar (Apenas Encerradas) */}
                        {activeTab === 'encerradas' && (
                            <button 
                                onClick={() => handleArchive(s.id)}
                                className="px-4 bg-white/5 hover:bg-red-500/20 text-white/40 hover:text-red-500 rounded-2xl transition-all"
                                title="Arquivar"
                            >
                                <Archive size={18} />
                            </button>
                        )}
                    </div>
                  </div>
                );
            })}
          </div>
        )}

        {/* Modal de Detalhes da Estadia */}
        {selectedStay && selectedGuest && (
          <StayDetailsModal 
            isOpen={isDetailsModalOpen}
            onClose={() => setIsDetailsModalOpen(false)}
            stay={selectedStay}
            guest={selectedGuest}
            onViewGuest={(id) => router.push(`/admin/guests/${id}`)}
          />
        )}

        {/* Modal de WhatsApp */}
        {isMsgModalOpen && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-[#141414] border border-white/10 w-full max-w-md rounded-[32px] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
                    <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/5">
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                            <MessageCircle className="text-green-500" /> Contatar Hóspede
                        </h3>
                        <button onClick={() => setIsMsgModalOpen(false)} className="text-white/40 hover:text-white transition-colors">
                            <X size={24} />
                        </button>
                    </div>
                    
                    <form onSubmit={handleSendWhatsapp} className="p-6 space-y-6">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-white/40 uppercase">Para</label>
                            <div className="p-3 bg-black/40 border border-white/10 rounded-xl text-white font-medium">
                                {msgData.name} <span className="text-white/30 text-xs ml-2">({msgData.phone || "Sem telefone"})</span>
                            </div>
                        </div>
                        
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-white/40 uppercase">Mensagem</label>
                            <textarea 
                                autoFocus
                                rows={5}
                                value={msgData.text}
                                onChange={e => setMsgData({...msgData, text: e.target.value})}
                                className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-white outline-none focus:border-green-500/50 resize-none"
                            ></textarea>
                        </div>

                        <button 
                            type="submit" 
                            disabled={sendingMsg || !msgData.phone}
                            className="w-full bg-green-500 hover:bg-green-600 text-black font-black uppercase py-4 rounded-2xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {sendingMsg ? <Loader2 className="animate-spin" /> : <><Send size={18} /> Enviar WhatsApp</>}
                        </button>
                    </form>
                </div>
            </div>
        )}

      </div>
    </RoleGuard>
  );
}