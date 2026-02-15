"use client";

import React, { useState } from "react";
import { Stay, Guest } from "@/types/aura";
import { StayService } from "@/services/stay-service";
import { useAuth } from "@/context/AuthContext";
import { 
  X, FileText, Download, User, MapPin, 
  Car, Dog, Calendar, Clock, Utensils, 
  ShieldCheck, AlertTriangle, Printer, ExternalLink,
  Globe2, ArrowDownRight, Loader2
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface StayDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  stay: Stay & { guestName: string; cabinName: string };
  guest: Guest;
  onViewGuest: (id: string) => void;
}

export const StayDetailsModal = ({ isOpen, onClose, stay, guest, onViewGuest }: StayDetailsModalProps) => {
  const { userData } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const handleExportFNRH = () => {
    // Aqui no futuro chamaremos a lib jsPDF ou uma API Route
    toast.info("Gerando PDF da FNRH Digital padrão SNHTur...");
  };

  const handleCheckOut = async () => {
    if (!userData) return;
    
    const confirmMessage = `Confirmar encerramento da estadia de ${stay.guestName}?\n\nA unidade será liberada para limpeza e o ciclo de feedback será iniciado.`;
    
    if (!confirm(confirmMessage)) return;

    setIsProcessing(true);
    try {
      await StayService.performCheckOut(stay.propertyId, stay.id, userData.id, userData.fullName);
      toast.success("Check-out realizado com sucesso!");
      onClose();
      // Recarrega a página para atualizar o status na listagem
      window.location.reload();
    } catch (error) {
      console.error(error);
      toast.error("Erro ao processar check-out operacional.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-end bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="h-full w-full max-w-2xl bg-[#0d0d0d] border-l border-white/10 shadow-2xl flex flex-col animate-in slide-in-from-right duration-500">
        
        {/* Header */}
        <header className="p-6 border-b border-white/5 flex items-center justify-between bg-black/40">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary border border-primary/20">
              <FileText size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black text-white uppercase tracking-tighter">Ficha de Hospedagem</h2>
              <p className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em]">ID: {stay.id.slice(0,8)} • Código: {stay.accessCode}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-white/40 transition-colors"><X /></button>
        </header>

        <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
          
          {/* 1. Status & Ações Rápidas */}
          <section className="flex items-center justify-between bg-white/5 p-6 rounded-[32px] border border-white/5">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Status da Estadia</span>
              <div className="flex items-center gap-2">
                <div className={cn("w-2 h-2 rounded-full", 
                  stay.status === 'active' ? "bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]" : "bg-yellow-500"
                )} />
                <span className="font-black uppercase text-sm">{stay.status.replace('_', ' ')}</span>
              </div>
            </div>
            
            <div className="flex gap-2">
              {/* Botão de Check-out - Aparece apenas para estadias ATIVAS */}
              {stay.status === 'active' && (
                <button 
                  onClick={handleCheckOut}
                  disabled={isProcessing}
                  className="p-3 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-xl font-black flex items-center gap-2 text-xs transition-all border border-red-500/20 disabled:opacity-50"
                >
                  {isProcessing ? <Loader2 className="animate-spin" size={16} /> : <ArrowDownRight size={16} />} 
                  Encerrar Estadia
                </button>
              )}
              
              <button 
                onClick={handleExportFNRH}
                className="p-3 bg-white/5 hover:bg-white/10 rounded-xl text-white transition-all flex items-center gap-2 text-xs font-bold"
              >
                <Download size={16} /> FNRH PDF
              </button>
              <button 
                onClick={() => onViewGuest(guest.id)}
                className="p-3 bg-primary text-black rounded-xl font-black flex items-center gap-2 text-xs transition-all hover:scale-105"
              >
                <User size={16} /> Perfil Completo
              </button>
            </div>
          </section>

          {/* 2. O Hóspede */}
          <section className="space-y-6">
            <h3 className="text-sm font-black text-primary uppercase tracking-[0.2em] flex items-center gap-2">
              <User size={16} /> Informações do Titular
            </h3>
            <div className="grid grid-cols-2 gap-6 bg-white/[0.02] p-6 rounded-[32px] border border-white/5">
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-white/20 uppercase">Nome</p>
                <p className="font-bold">{guest.fullName}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-white/20 uppercase">Documento ({guest.document?.type || 'CPF'})</p>
                <p className="font-bold">{guest.document?.number || 'Não informado'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-white/20 uppercase">WhatsApp</p>
                <p className="font-bold text-primary">{guest.phone}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-white/20 uppercase">Alergias</p>
                <p className={cn("font-bold", guest.allergies?.length ? "text-red-400" : "text-white/40")}>
                  {guest.allergies?.join(", ") || "Nenhuma informada"}
                </p>
              </div>
            </div>
          </section>

          {/* 3. Logística da Unidade */}
          <section className="space-y-6">
            <h3 className="text-sm font-black text-primary uppercase tracking-[0.2em] flex items-center gap-2">
              <Calendar size={16} /> Logística & Acomodação
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white/5 p-4 rounded-3xl">
                <p className="text-[9px] font-bold text-white/20 uppercase">Cabana</p>
                <p className="font-black text-lg">{stay.cabinName}</p>
              </div>
              <div className="bg-white/5 p-4 rounded-3xl">
                <p className="text-[9px] font-bold text-white/20 uppercase">Adultos/Crianças</p>
                <p className="font-black text-lg">{stay.counts.adults} / {stay.counts.children}</p>
              </div>
              <div className="bg-white/5 p-4 rounded-3xl">
                <p className="text-[9px] font-bold text-white/20 uppercase">Chegada Prevista</p>
                <p className="font-black text-lg">{stay.expectedArrivalTime || "--:--"}</p>
              </div>
            </div>

            <div className="p-6 bg-primary/5 border border-primary/10 rounded-[32px] space-y-4">
              <div className="flex items-center gap-2 font-black text-sm uppercase">
                <Utensils size={18} className="text-primary" /> Montagem do Quarto
              </div>
              <p className="text-sm text-white/80 font-medium italic">
                "{stay.roomSetupNotes || "Configuração padrão da unidade"}"
              </p>
            </div>
          </section>

          {/* 4. FNRH & Viagem */}
          <section className="space-y-6">
            <h3 className="text-sm font-black text-primary uppercase tracking-[0.2em] flex items-center gap-2">
              <Globe2 size={16} /> Itinerário & FNRH
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 border border-white/10 rounded-2xl">
                <p className="text-[9px] font-bold text-white/20 uppercase">Procedência</p>
                <p className="text-sm font-bold">{stay.lastCity || "Não declarada"}</p>
              </div>
              <div className="p-4 border border-white/10 rounded-2xl">
                <p className="text-[9px] font-bold text-white/20 uppercase">Próximo Destino</p>
                <p className="text-sm font-bold">{stay.nextCity || "Não declarado"}</p>
              </div>
              <div className="p-4 border border-white/10 rounded-2xl">
                <p className="text-[9px] font-bold text-white/20 uppercase">Transporte</p>
                <p className="text-sm font-bold flex items-center gap-2">
                  <Car size={14} /> {stay.transportation} {stay.vehiclePlate ? `(${stay.vehiclePlate})` : ''}
                </p>
              </div>
              <div className="p-4 border border-white/10 rounded-2xl">
                <p className="text-[9px] font-bold text-white/20 uppercase">Motivo</p>
                <p className="text-sm font-bold">{stay.travelReason}</p>
              </div>
            </div>
          </section>

          {/* 5. Pets */}
          {stay.hasPet && (
            <section className="bg-orange-500/10 border border-orange-500/20 p-6 rounded-[32px] flex items-center gap-6">
              <div className="w-16 h-16 bg-orange-500 text-black rounded-2xl flex items-center justify-center">
                <Dog size={32} />
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest">Informação Pet</p>
                <h4 className="text-lg font-black text-white">{stay.petDetails?.name || "Sem nome"}</h4>
                <p className="text-xs text-white/40 font-bold uppercase">{stay.petDetails?.species} • {stay.petDetails?.weight}kg</p>
              </div>
            </section>
          )}

        </div>

        {/* Footer com Auditoria Simples */}
        <footer className="p-6 border-t border-white/5 bg-black/40 text-center">
          <p className="text-[9px] font-bold text-white/20 uppercase tracking-[0.3em]">
            Estadia criada em {format(stay.createdAt.toDate(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </p>
        </footer>
      </div>
    </div>
  );
};