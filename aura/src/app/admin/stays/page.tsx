//src/app/admin/stays/page.tsx

"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import { StayService } from "@/services/stay-service";
import { RoleGuard } from "@/components/auth/RoleGuard";
import {
  Calendar, Search, Loader2, AlertCircle,
  Dog, Users, ArrowUpRight,
  Building2, MapPin, Clock, MessageCircle,
  Archive, Send, X, Star, ShieldAlert,
  Copy, Ban, CheckCircle2, DollarSign
} from "lucide-react";
import { format, differenceInCalendarDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { toast } from "sonner";
import { StayDetailsModal } from "@/components/admin/StayDetailsModal";
import { GuestContactModal } from "@/components/admin/GuestContactModal";
import { useRouter } from "next/navigation";

type TabStatus = 'futuras' | 'ativas' | 'encerradas';

export default function StaysPage() {
  const router = useRouter();
  const { userData } = useAuth();
  const { currentProperty: contextProperty } = useProperty();

  // States de Dados e UI
  const [activeTab, setActiveTab] = useState<TabStatus>('ativas');
  const [stays, setStays] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // States de Modais
  const [selectedStay, setSelectedStay] = useState<any | null>(null);
  const [selectedGuest, setSelectedGuest] = useState<any | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

  // State do Modal de WhatsApp (NOVO)
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);

  // States do Modal de Cancelamento
  const [stayToCancel, setStayToCancel] = useState<string | null>(null);

  // --- Carregamento de Dados ---
  const loadStays = useCallback(async () => {
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
  }, [contextProperty?.id, activeTab]);

  useEffect(() => {
    if (contextProperty?.id) {
      loadStays();
    } else {
      setStays([]);
    }
  }, [loadStays, contextProperty?.id]);

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
      console.error(error);
      toast.error("Erro ao carregar ficha.");
    } finally {
      setLoading(false);
    }
  };

  // Abre o modal de Contato Rápido buscando os dados frescos do hóspede
  const handleOpenWhatsapp = async (stay: any) => {
    if (!contextProperty?.id) return;
    setLoading(true);
    try {
      const data = await StayService.getStayWithGuestAndCabin(contextProperty.id, stay.id);
      if (data && data.guest) {
        setSelectedStay(data.stay);
        setSelectedGuest(data.guest);
        setIsContactModalOpen(true);
      } else {
        toast.error("Hóspede não encontrado para esta reserva.");
      }
    } catch (error) {
      console.error(error);
      toast.error("Erro ao preparar contato com o hóspede.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = (code: string) => {
    const link = `${window.location.origin}/check-in/login?code=${code}`;
    navigator.clipboard.writeText(link);
    toast.success("Link de Check-in copiado!", {
      description: "Envie para o hóspede acessar diretamente."
    });
  };

  const handleCancelStay = async () => {
    if (!stayToCancel || !contextProperty?.id || !userData?.id) return;

    try {
      await StayService.cancelStay(contextProperty.id, stayToCancel, userData.id, userData.fullName);
      toast.success("Reserva cancelada com sucesso.");
      setStayToCancel(null);
      loadStays();
    } catch (error) {
      console.error(error);
      toast.error("Erro ao cancelar reserva.");
    }
  };

  const handleArchive = async (stayId: string) => {
    if (!contextProperty?.id || !userData?.id) return;
    if (!confirm("Deseja arquivar esta estadia? Ela sairá desta lista e ficará guardada no histórico do Aura.")) return;

    try {
      await StayService.archiveStay(contextProperty.id, stayId, userData.id, userData.fullName);
      toast.success("Estadia arquivada com sucesso.");
      setStays(prev => prev.filter(s => s.id !== stayId));
    } catch (error) {
      toast.error("Erro ao arquivar.");
    }
  };

  // --- Lógica de Renderização de Status ---
  const getActiveStatusInfo = (checkOutDate: any) => {
    if (!checkOutDate) return { label: "N/A", color: "text-foreground" };

    const today = new Date();
    const end = checkOutDate.toDate();
    const diff = differenceInCalendarDays(end, today);

    if (diff < 0) return { label: "Check-out Atrasado", color: "text-red-500" };
    if (diff === 0) return { label: "Check-out Hoje", color: "text-orange-500" };
    if (diff === 1) return { label: "Check-out Amanhã", color: "text-yellow-500" };
    return { label: "Hospedagem em Curso", color: "text-green-500" };
  };

  const getFutureStatusInfo = (checkInDate: any, expectedTime?: string) => {
    if (!checkInDate) return "Aguardando";
    const today = new Date();
    const start = checkInDate.toDate();
    const diff = differenceInCalendarDays(start, today);

    const timeString = expectedTime ? ` às ${expectedTime}` : "";

    if (diff === 0) return `Chegada Hoje${timeString}`;
    if (diff === 1) return `Chegada Amanhã${timeString}`;
    if (expectedTime) return `Chegada em ${diff} dias${timeString}`;
    return `Chegada em ${diff} dias`;
  };

  const filteredStays = stays.filter(s =>
    (s.guestName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.cabinName || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <RoleGuard allowedRoles={["super_admin", "admin", "reception", "governance"]}>
      <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">

        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <h1 className="text-4xl font-black tracking-tighter flex items-center gap-3 text-foreground">
              <Calendar className="text-primary" size={36} /> Painel Operacional
            </h1>
            <div className="flex items-center gap-2">
              <p className="font-medium flex items-center gap-2 opacity-70" style={{ color: "hsl(var(--foreground))" }}>
                <MapPin size={14} />
                {contextProperty?.name || "Carregando Propriedade..."}
              </p>
            </div>
          </div>

          <Link
            href="/admin/stays/new"
            className="bg-primary text-primary-foreground font-black px-8 py-4 rounded-2xl flex items-center gap-2 hover:shadow-[0_0_30px_rgba(var(--primary),0.4)] transition-all active:scale-95"
          >
            Nova Hospedagem <ArrowUpRight size={20} />
          </Link>
        </header>

        {/* Filtros e Tabs */}
        <div className="flex flex-col md:flex-row gap-6 items-center justify-between bg-card border border-white/5 p-2 rounded-[32px]">
          <div className="flex gap-1 w-full md:w-auto">
            {(['ativas', 'futuras', 'encerradas'] as TabStatus[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "flex-1 md:flex-none px-8 py-3 rounded-[20px] text-[10px] font-black uppercase tracking-[0.2em] transition-all",
                  activeTab === tab
                    ? "bg-white text-black shadow-xl"
                    : "text-foreground/40 hover:text-foreground hover:bg-white/5"
                )}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-80 px-2">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-foreground/20" size={18} />
            <input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar por hóspede ou cabana..."
              className="w-full pl-12 p-4 bg-secondary border border-white/10 rounded-2xl outline-none focus:border-primary/50 text-sm transition-all"
            />
          </div>
        </div>

        {/* Listagem */}
        {!contextProperty?.id ? (
          <div className="text-center p-24 bg-card rounded-[40px] border border-dashed border-white/10">
            <Building2 size={60} className="mx-auto text-foreground/10 mb-6" />
            <h3 className="text-2xl font-black text-foreground">Carregando...</h3>
          </div>
        ) : loading ? (
          <div className="flex flex-col items-center justify-center p-24 space-y-4">
            <Loader2 className="animate-spin text-primary" size={48} />
            <p className="text-xs font-bold uppercase tracking-widest text-foreground/20">Sincronizando Aura Cloud...</p>
          </div>
        ) : filteredStays.length === 0 ? (
          <div className="text-center p-24 bg-card rounded-[40px] border border-dashed border-white/10">
            <AlertCircle size={48} className="mx-auto text-foreground/20 mb-4" />
            <h3 className="text-xl font-bold text-foreground">Sem estadias {activeTab}</h3>
            <p className="text-foreground/40">Não há registros para esta categoria no momento.</p>
          </div>
        ) : (
          <>
            {/* RENDERIZAÇÃO 1: CARDS GRANDES (Para Ativas e Futuras) */}
            {activeTab !== 'encerradas' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredStays.map((s) => {
                  const activeInfo = getActiveStatusInfo(s.checkOut);
                  const guestName = s.guestName || "Hóspede Desconhecido";

                  const docNumber = s.guest?.document?.number || s.guestDocumentNumber || "";
                  const hasValidDoc = docNumber && docNumber.length > 3 && docNumber !== "N/A";
                  const isPreCheckinDone = s.status === 'pre_checkin_done';
                  const isTempId = !s.guestId || s.guestId.toString().startsWith("GUEST");
                  const isUnknownGuest = isTempId && !hasValidDoc && !isPreCheckinDone;

                  return (
                    <div
                      key={s.id}
                      className="group bg-card border border-white/5 rounded-[40px] overflow-hidden hover:border-primary/40 transition-all flex flex-col shadow-lg"
                    >
                      <div className="p-8 space-y-6 flex-1">
                        {/* Topo do Card */}
                        <div className="flex justify-between items-start">
                          <div className="px-4 py-1.5 bg-primary/10 border border-primary/20 rounded-full">
                            <span className="text-[10px] font-black text-primary uppercase tracking-widest">{s.cabinName}</span>
                          </div>
                          <div className="flex gap-2">
                            {isUnknownGuest && <div className="p-2 bg-red-500/10 rounded-lg animate-pulse" title="Documento Pendente"><ShieldAlert size={16} className="text-red-500" /></div>}
                            {s.hasPet && <div className="p-2 bg-orange-500/10 rounded-lg" title="Pet"><Dog size={16} className="text-orange-500" /></div>}
                            {s.groupId && <div className="p-2 bg-blue-500/10 rounded-lg" title="Grupo"><Users size={16} className="text-blue-500" /></div>}
                          </div>
                        </div>

                        {/* Nome e Datas */}
                        <div className="space-y-1">
                          <h3
                            onClick={() => handleOpenWhatsapp(s)}
                            className="text-2xl font-black text-foreground tracking-tighter transition-colors flex items-center gap-2 cursor-pointer hover:text-primary group/name"
                            title="Clique para enviar WhatsApp"
                          >
                            {guestName.split(' ')[0]} {guestName.split(' ').slice(-1)}
                            <MessageCircle size={20} className="opacity-0 group-hover/name:opacity-100 transition-opacity text-primary" />
                          </h3>
                          <div className="flex items-center gap-2 text-foreground/40 text-[10px] font-bold uppercase tracking-widest">
                            <Clock size={12} />
                            {s.checkIn?.toDate ? format(s.checkIn.toDate(), "dd MMM", { locale: ptBR }) : ''} —
                            {s.checkOut?.toDate ? format(s.checkOut.toDate(), "dd MMM", { locale: ptBR }) : ''}
                          </div>
                        </div>

                        {/* Grid de Informações Variável */}
                        <div className="grid grid-cols-2 gap-3">
                          {/* Status Futuro */}
                          {activeTab === 'futuras' && (
                            <div className="bg-secondary p-4 rounded-3xl border border-white/5">
                              <p className="text-[9px] font-bold text-foreground/20 uppercase mb-1">Previsão</p>
                              <p className="text-sm font-black text-foreground tracking-wide">
                                {getFutureStatusInfo(s.checkIn, s.expectedArrivalTime)}
                              </p>
                            </div>
                          )}
                          {/* Status Ativo */}
                          {activeTab === 'ativas' && (
                            <div className="bg-secondary p-4 rounded-3xl border border-white/5 col-span-2">
                              <p className="text-[9px] font-bold text-foreground/20 uppercase mb-1">Status Atual</p>
                              <div className="flex justify-between items-center">
                                <p className={cn("text-lg font-black tracking-wide", activeInfo.color)}>
                                  {activeInfo.label}
                                </p>
                                {isUnknownGuest && (
                                  <span className="text-[10px] font-bold text-red-500 bg-red-500/10 px-2 py-1 rounded-lg uppercase">
                                    Doc Pendente
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Pré Checkin */}
                          {activeTab === 'futuras' && (
                            <div className="bg-secondary p-4 rounded-3xl border border-white/5 group/copy relative">
                              <div className="flex justify-between items-center mb-1">
                                <p className="text-[9px] font-bold text-foreground/20 uppercase">Pré-Checkin</p>
                                {s.status === 'pending' && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleCopyLink(s.accessCode); }}
                                    className="text-primary hover:text-foreground transition-colors"
                                    title="Copiar Link Direto"
                                  >
                                    <Copy size={12} />
                                  </button>
                                )}
                              </div>
                              <p
                                onClick={() => s.status === 'pending' && handleCopyLink(s.accessCode)}
                                className={cn(
                                  "text-xs font-black uppercase flex items-center gap-1",
                                  s.status === 'pre_checkin_done' ? "text-green-500" : "text-yellow-500 cursor-pointer hover:underline"
                                )}
                              >
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
                          className="flex-1 bg-white/5 hover:bg-white/10 text-foreground text-[10px] font-black uppercase py-4 rounded-2xl transition-all tracking-widest"
                        >
                          Ver Ficha
                        </button>

                        {activeTab === 'futuras' && (
                          <>
                            <button
                              onClick={async () => {
                                if (isUnknownGuest) {
                                  alert("ATENÇÃO: Hóspede sem documento registrado. Solicite o documento antes de confirmar o check-in.");
                                }
                                if (confirm(`Confirmar entrada de ${guestName}?`) && contextProperty?.id && userData?.id) {
                                  await StayService.performCheckIn(contextProperty.id, s.id, userData.id, userData.fullName);
                                  loadStays();
                                  toast.success("Check-in realizado!");
                                }
                              }}
                              className="flex-1 bg-primary text-black text-[10px] font-black uppercase py-4 rounded-2xl hover:shadow-[0_0_20px_rgba(var(--primary),0.4)] transition-all tracking-widest"
                            >
                              Check-in
                            </button>
                            <button
                              onClick={() => setStayToCancel(s.id)}
                              className="p-4 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-2xl transition-all"
                              title="Cancelar Reserva"
                            >
                              <Ban size={18} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* RENDERIZAÇÃO 2: TABELA COMPACTA (Para Encerradas e Histórico) */}
            {activeTab === 'encerradas' && (
              <div className="bg-card border border-white/5 rounded-3xl overflow-hidden shadow-sm">
                <table className="w-full text-left">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="p-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground w-32">Cabana</th>
                      <th className="p-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Hóspede</th>
                      <th className="p-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Período</th>
                      <th className="p-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground text-center">Avisos</th>
                      <th className="p-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground text-center">Avaliação</th>
                      <th className="p-4 text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-sm">
                    {filteredStays.map((s) => {
                      const guestName = s.guestName || "Hóspede Desconhecido";

                      return (
                        <tr key={s.id} className="hover:bg-muted/30 transition-colors group">
                          {/* Coluna: Cabana */}
                          <td className="p-4">
                            <span className="px-3 py-1 bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest rounded-lg border border-primary/20">
                              {s.cabinName}
                            </span>
                          </td>

                          {/* Coluna: Nome */}
                          <td className="p-4 font-bold text-foreground">
                            <div className="flex items-center gap-2">
                              {guestName}
                              {s.status === 'cancelled' && <span className="text-[8px] uppercase tracking-widest bg-red-500/10 text-red-500 px-2 py-0.5 rounded">Cancelada</span>}
                            </div>
                          </td>

                          {/* Coluna: Período */}
                          <td className="p-4">
                            <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                              <Clock size={12} />
                              {s.checkIn?.toDate ? format(s.checkIn.toDate(), "dd/MM") : ''} até {s.checkOut?.toDate ? format(s.checkOut.toDate(), "dd/MM") : ''}
                            </div>
                          </td>

                          {/* Coluna: Alertas Financeiros e Operacionais */}
                          <td className="p-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              {s.hasOpenFolio ? (
                                <div className="p-1.5 bg-orange-500/10 text-orange-500 rounded-md border border-orange-500/20 group-hover:animate-pulse" title="Há itens de frigobar aguardando pagamento/baixa">
                                  <DollarSign size={14} />
                                </div>
                              ) : (
                                <div className="p-1.5 bg-background text-muted-foreground/30 rounded-md border border-border" title="Conta zerada/baixa completa">
                                  <CheckCircle2 size={14} />
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Coluna: AVALIAÇÃO (NOVA) */}
                          <td className="p-4 text-center">
                            <div className="flex items-center justify-center">
                              {(() => {
                                const npsVal = s.nps !== undefined ? s.nps : s.npsScore;
                                const hasEvaluated = npsVal !== undefined && npsVal !== null;

                                if (!hasEvaluated && !s.hasSurvey) {
                                  return (
                                    <span className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest border border-dashed border-white/10 px-2 py-1 rounded-md" title="Pesquisa ainda não respondida">
                                      Pendente
                                    </span>
                                  );
                                }

                                if (npsVal <= 6) {
                                  return (
                                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-red-500/10 text-red-500 rounded-md border border-red-500/20" title="Hóspede Detrator">
                                      <Star size={12} className="fill-red-500" />
                                      <span className="text-[10px] font-black uppercase tracking-wider">Detrator ({npsVal})</span>
                                    </div>
                                  );
                                }

                                if (npsVal >= 9) {
                                  return (
                                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 text-emerald-500 rounded-md border border-emerald-500/20" title="Hóspede Promotor">
                                      <Star size={12} className="fill-emerald-500" />
                                      <span className="text-[10px] font-black uppercase tracking-wider">Promotor ({npsVal})</span>
                                    </div>
                                  );
                                }

                                return (
                                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-yellow-500/10 text-yellow-500 rounded-md border border-yellow-500/20" title="Hóspede Neutro">
                                    <Star size={12} className="fill-yellow-500" />
                                    <span className="text-[10px] font-black uppercase tracking-wider">Neutro ({npsVal})</span>
                                  </div>
                                );
                              })()}
                            </div>
                          </td>

                          {/* Coluna: Ações */}
                          <td className="p-4 text-right">
                            <div className="flex justify-end gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                              <button onClick={() => handleOpenWhatsapp(s)} className="p-2 text-muted-foreground hover:text-green-500 hover:bg-green-500/10 rounded-lg transition-colors" title="WhatsApp">
                                <MessageCircle size={16} />
                              </button>
                              <button onClick={() => handleOpenFicha(s)} className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors" title="Ver Ficha & Extrato">
                                <ArrowUpRight size={16} />
                              </button>
                              <button onClick={() => handleArchive(s.id)} className="p-2 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors" title="Arquivar Definitivamente">
                                <Archive size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {selectedStay && selectedGuest && (
          <StayDetailsModal
            isOpen={isDetailsModalOpen}
            onClose={() => setIsDetailsModalOpen(false)}
            stay={selectedStay}
            guest={selectedGuest}
            onViewGuest={(id) => router.push(`/admin/guests/${id}`)}
            onUpdate={loadStays}
          />
        )}

        {/* Modal de Confirmação de Cancelamento */}
        {stayToCancel && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-card border border-white/10 w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 p-8 text-center space-y-6">
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto text-red-500 border border-red-500/20">
                <AlertCircle size={32} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-foreground">Cancelar Reserva?</h3>
                <p className="text-foreground/40 text-sm mt-2">
                  Esta ação é irreversível. A cabana será liberada imediatamente.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setStayToCancel(null)}
                  className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-foreground font-bold rounded-xl"
                >
                  Voltar
                </button>
                <button
                  onClick={handleCancelStay}
                  className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-foreground font-bold rounded-xl"
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Inteligente de Contato */}
        {isContactModalOpen && selectedStay && selectedGuest && contextProperty?.id && (
          <GuestContactModal
            propertyId={contextProperty.id}
            stay={selectedStay}
            guest={selectedGuest}
            onClose={() => setIsContactModalOpen(false)}
            whatsappApiUrl={contextProperty.settings?.whatsappConfig?.apiUrl}
            whatsappToken={contextProperty.settings?.whatsappConfig?.token}
          />
        )}

      </div>
    </RoleGuard>
  );
}
