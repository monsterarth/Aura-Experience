// src/components/admin/StayDetailsModal.tsx
"use client";

import React, { useState, useEffect } from "react";
import { 
  X, Edit2, Save, Calendar, User, 
  MapPin, Phone, Mail, Car, FileText, 
  Users, CheckCircle, Clock, Plane, 
  Briefcase, PawPrint 
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { StayService } from "@/services/stay-service";
import { GuestService } from "@/services/guest-service";
import { cn } from "@/lib/utils";
import { Stay, Guest } from "@/types/aura";

interface StayDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  stay: Stay & { guestName?: string; cabinName?: string }; // Extensão para visualização
  guest: Guest;
  onViewGuest?: (guestId: string) => void;
  onUpdate?: () => void;
}

type TabType = 'reserva' | 'hospede' | 'fnrh' | 'extras';

export function StayDetailsModal({ isOpen, onClose, stay, guest, onViewGuest, onUpdate }: StayDetailsModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('reserva');

  // Estado unificado para formulário
  const [formData, setFormData] = useState<Partial<Stay>>({});
  const [guestData, setGuestData] = useState<Partial<Guest>>({});

  useEffect(() => {
    if (stay && guest) {
      setFormData({
        checkIn: stay.checkIn,
        checkOut: stay.checkOut,
        expectedArrivalTime: stay.expectedArrivalTime || "",
        roomSetup: stay.roomSetup || "double",
        roomSetupNotes: stay.roomSetupNotes || "",
        counts: stay.counts || { adults: 2, children: 0, babies: 0 },
        vehiclePlate: stay.vehiclePlate || "",
        travelReason: stay.travelReason || "Turismo",
        transportation: stay.transportation || "Carro",
        lastCity: stay.lastCity || "",
        nextCity: stay.nextCity || "",
        hasPet: stay.hasPet || false,
        petDetails: stay.petDetails || { name: "", species: "Cachorro", weight: 0, breed: "" }
      });

      setGuestData({
        nationality: guest.nationality || "Brasil",
        document: guest.document || { type: 'CPF', number: '' },
        birthDate: guest.birthDate || "",
        gender: guest.gender || "Outro",
        occupation: guest.occupation || "",
        email: guest.email || "",
        phone: guest.phone || "",
        address: guest.address || {
            street: "", number: "", neighborhood: "", 
            city: "", state: "", zipCode: "", country: "Brasil"
        }
      });
    }
  }, [stay, guest]);

  if (!isOpen || !stay) return null;

  const handleSave = async () => {
    setLoading(true);
    try {
      // 1. Atualizar Estadia (Stay)
      // Convertendo strings de data de volta se necessário, mas aqui assumimos que o form mantém o formato correto ou convertemos no serviço
      // Para o input date-time-local, precisamos converter para Date object antes de mandar para o Firebase se o serviço esperar Date
      
      const stayPayload: Partial<Stay> = {
        ...formData,
        // Garantir tipos corretos para datas se foram editadas via string input
        // (A conversão real depende de como seu StayService trata. Se ele espera Date, converta aqui)
      };

      // 2. Atualizar Hóspede (Guest)
      const guestPayload: Partial<Guest> = {
        ...guestData
      };

      await Promise.all([
        StayService.updateStayData(stay.propertyId, stay.id, stayPayload, "ADMIN", "Recepção"),
        GuestService.upsertGuest(stay.propertyId, { id: guest.id, ...guestData } as Guest)
      ]);

      toast.success("Ficha e dados do hóspede atualizados!");
      setIsEditing(false);
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error(error);
      toast.error("Erro ao salvar alterações.");
    } finally {
      setLoading(false);
    }
  };

  const Label = ({ icon: Icon, children }: { icon: any, children: React.ReactNode }) => (
    <label className="flex items-center gap-2 text-[10px] font-bold uppercase text-white/40 mb-1.5">
      <Icon size={12} className="text-primary" /> {children}
    </label>
  );

  const Input = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input 
      {...props} 
      disabled={!isEditing}
      className={cn(
        "w-full bg-black/40 border border-white/10 rounded-xl p-2.5 text-white text-xs outline-none focus:border-primary/50 transition-colors disabled:opacity-70 disabled:cursor-not-allowed",
        props.className
      )}
    />
  );

  const Select = ({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) => (
    <select 
      {...props}
      disabled={!isEditing}
      className="w-full bg-black/40 border border-white/10 rounded-xl p-2.5 text-white text-xs outline-none focus:border-primary/50 transition-colors appearance-none disabled:opacity-70"
    >
        {children}
    </select>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-[#141414] border border-white/10 w-full max-w-5xl rounded-[32px] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-300">
        
        {/* --- HEADER --- */}
        <header className="p-6 border-b border-white/5 bg-white/[0.02] flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-black text-xl border border-primary/20">
              {guest?.fullName?.charAt(0) || "G"}
            </div>
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                {guest?.fullName}
                <span className={cn(
                  "px-2 py-0.5 rounded-full text-[9px] uppercase font-black tracking-wider border",
                  stay.status === 'active' ? "bg-green-500/10 text-green-500 border-green-500/20" :
                  stay.status === 'pending' ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" :
                  "bg-white/5 text-white/40 border-white/10"
                )}>
                  {stay.status === 'active' ? 'Hospedado' : stay.status === 'pending' ? 'Pendente' : stay.status}
                </span>
              </h2>
              <p className="text-xs text-white/40 font-medium">Reserva: <span className="font-mono text-white/20">{stay.accessCode}</span></p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isEditing ? (
              <button onClick={() => setIsEditing(true)} className="p-3 hover:bg-white/5 rounded-xl text-white/40 hover:text-white transition-all flex items-center gap-2 text-xs font-bold uppercase"><Edit2 size={16} /> Editar</button>
            ) : (
              <>
                <button onClick={() => setIsEditing(false)} className="px-4 py-2 hover:bg-white/5 rounded-xl text-white/40 hover:text-white text-xs font-bold uppercase">Cancelar</button>
                <button onClick={handleSave} disabled={loading} className="px-6 py-2 bg-primary hover:bg-primary/90 text-black rounded-xl text-xs font-bold uppercase flex items-center gap-2">{loading ? "Salvando..." : <><Save size={14} /> Salvar</>}</button>
              </>
            )}
            <button onClick={onClose} className="p-3 hover:bg-red-500/10 hover:text-red-500 text-white/20 rounded-xl transition-all"><X size={20} /></button>
          </div>
        </header>

        {/* --- TABS --- */}
        <div className="flex border-b border-white/5 px-6 gap-6">
            {[
                { id: 'reserva', label: 'Logística & Quarto', icon: Calendar },
                { id: 'hospede', label: 'Dados Hóspede', icon: User },
                { id: 'fnrh', label: 'Viagem & FNRH', icon: Plane },
                { id: 'extras', label: 'Pet & Ocupantes', icon: PawPrint },
            ].map(tab => (
                <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as TabType)}
                    className={cn(
                        "py-4 text-xs font-bold uppercase tracking-widest flex items-center gap-2 border-b-2 transition-all",
                        activeTab === tab.id ? "text-primary border-primary" : "text-white/40 border-transparent hover:text-white"
                    )}
                >
                    <tab.icon size={14} /> {tab.label}
                </button>
            ))}
        </div>

        {/* --- CONTENT --- */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-8 bg-[#0a0a0a]">
          
          {/* TAB: RESERVA */}
          {activeTab === 'reserva' && (
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-right-4 duration-300">
                <div className="space-y-4">
                    <h3 className="text-sm font-bold text-white border-b border-white/5 pb-2">Datas & Horários</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label icon={Clock}>Check-in</Label>
                            <div className="text-white font-mono bg-white/5 p-3 rounded-xl text-sm border border-white/5">
                                {stay.checkIn?.toDate ? format(stay.checkIn.toDate(), "dd/MM/yyyy HH:mm") : "Data inválida"}
                            </div>
                        </div>
                        <div>
                            <Label icon={Clock}>Check-out</Label>
                            <div className="text-white font-mono bg-white/5 p-3 rounded-xl text-sm border border-white/5">
                                {stay.checkOut?.toDate ? format(stay.checkOut.toDate(), "dd/MM/yyyy HH:mm") : "Data inválida"}
                            </div>
                        </div>
                        <div className="col-span-2">
                             <Label icon={Clock}>Previsão de Chegada</Label>
                             <Input 
                                type="time" 
                                value={formData.expectedArrivalTime} 
                                onChange={e => setFormData({...formData, expectedArrivalTime: e.target.value})} 
                             />
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <h3 className="text-sm font-bold text-white border-b border-white/5 pb-2">Configuração do Quarto</h3>
                    <div>
                        <Label icon={CheckCircle}>Acomodação</Label>
                        <div className="text-white font-bold text-lg">{stay.cabinName}</div>
                    </div>
                    <div>
                        <Label icon={CheckCircle}>Montagem das Camas</Label>
                        <Select value={formData.roomSetup} onChange={e => setFormData({...formData, roomSetup: e.target.value as any})}>
                            <option value="double">Casal (Double)</option>
                            <option value="twin">Solteiro (Twin)</option>
                            <option value="triple">Triplo</option>
                            <option value="other">Outro</option>
                        </Select>
                    </div>
                    <div>
                         <Label icon={FileText}>Notas de Montagem</Label>
                         <Input value={formData.roomSetupNotes} onChange={e => setFormData({...formData, roomSetupNotes: e.target.value})} placeholder="Ex: Berço extra, travesseiro pena..." />
                    </div>
                </div>
             </div>
          )}

          {/* TAB: HÓSPEDE (DADOS PESSOAIS) */}
          {activeTab === 'hospede' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-right-4 duration-300">
                  <div className="space-y-4">
                      <h3 className="text-sm font-bold text-white border-b border-white/5 pb-2">Dados Pessoais</h3>
                      <div>
                          <Label icon={User}>Nome Completo</Label>
                          <Input value={guestData.fullName} onChange={e => setGuestData({...guestData, fullName: e.target.value})} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label icon={FileText}>Nascimento</Label>
                            <Input type="date" value={guestData.birthDate} onChange={e => setGuestData({...guestData, birthDate: e.target.value})} />
                        </div>
                        <div>
                            <Label icon={User}>Gênero</Label>
                            <Select value={guestData.gender} onChange={e => setGuestData({...guestData, gender: e.target.value as any})}>
                                <option value="M">Masculino</option>
                                <option value="F">Feminino</option>
                                <option value="Outro">Outro</option>
                            </Select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                         <div>
                            <Label icon={FileText}>Documento ({guestData.document?.type})</Label>
                            <Input value={guestData.document?.number} onChange={e => setGuestData({...guestData, document: { ...guestData.document!, number: e.target.value }})} />
                         </div>
                         <div>
                            <Label icon={Briefcase}>Profissão</Label>
                            <Input value={guestData.occupation} onChange={e => setGuestData({...guestData, occupation: e.target.value})} />
                         </div>
                      </div>
                  </div>

                  <div className="space-y-4">
                      <h3 className="text-sm font-bold text-white border-b border-white/5 pb-2">Contato & Endereço</h3>
                      <div className="grid grid-cols-2 gap-4">
                         <div>
                            <Label icon={Phone}>Telefone</Label>
                            <Input value={guestData.phone} onChange={e => setGuestData({...guestData, phone: e.target.value})} />
                         </div>
                         <div>
                            <Label icon={Mail}>Email</Label>
                            <Input value={guestData.email} onChange={e => setGuestData({...guestData, email: e.target.value})} />
                         </div>
                      </div>
                      <div className="space-y-2 p-4 bg-white/5 rounded-2xl border border-white/5">
                          <Label icon={MapPin}>Endereço Completo</Label>
                          <Input placeholder="CEP" value={guestData.address?.zipCode} onChange={e => setGuestData({...guestData, address: {...guestData.address!, zipCode: e.target.value}})} />
                          <div className="grid grid-cols-3 gap-2">
                             <div className="col-span-2"><Input placeholder="Rua" value={guestData.address?.street} onChange={e => setGuestData({...guestData, address: {...guestData.address!, street: e.target.value}})} /></div>
                             <div><Input placeholder="Nº" value={guestData.address?.number} onChange={e => setGuestData({...guestData, address: {...guestData.address!, number: e.target.value}})} /></div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                             <Input placeholder="Cidade" value={guestData.address?.city} onChange={e => setGuestData({...guestData, address: {...guestData.address!, city: e.target.value}})} />
                             <Input placeholder="UF" value={guestData.address?.state} onChange={e => setGuestData({...guestData, address: {...guestData.address!, state: e.target.value}})} />
                          </div>
                      </div>
                  </div>
              </div>
          )}

          {/* TAB: FNRH (VIAGEM) */}
          {activeTab === 'fnrh' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-right-4 duration-300">
                  <div className="space-y-4">
                      <h3 className="text-sm font-bold text-white border-b border-white/5 pb-2">Dados da Viagem</h3>
                      <div>
                          <Label icon={Plane}>Motivo da Viagem</Label>
                          <Select value={formData.travelReason} onChange={e => setFormData({...formData, travelReason: e.target.value as any})}>
                              <option value="Turismo">Turismo</option>
                              <option value="Negocios">Negócios</option>
                              <option value="Congresso">Congresso/Feira</option>
                              <option value="Saude">Saúde</option>
                              <option value="Outros">Outros</option>
                          </Select>
                      </div>
                      <div>
                          <Label icon={Car}>Meio de Transporte</Label>
                          <Select value={formData.transportation} onChange={e => setFormData({...formData, transportation: e.target.value as any})}>
                              <option value="Carro">Carro Próprio/Alugado</option>
                              <option value="Onibus">Ônibus</option>
                              <option value="Avião">Avião</option>
                              <option value="Navio">Navio</option>
                              <option value="Outro">Outro</option>
                          </Select>
                      </div>
                      {formData.transportation === 'Carro' && (
                          <div>
                              <Label icon={Car}>Placa do Veículo</Label>
                              <Input value={formData.vehiclePlate} onChange={e => setFormData({...formData, vehiclePlate: e.target.value})} placeholder="XXX-0000" />
                          </div>
                      )}
                  </div>

                  <div className="space-y-4">
                      <h3 className="text-sm font-bold text-white border-b border-white/5 pb-2">Itinerário</h3>
                      <div>
                          <Label icon={MapPin}>Cidade de Origem (Última procedência)</Label>
                          <Input value={formData.lastCity} onChange={e => setFormData({...formData, lastCity: e.target.value})} placeholder="Cidade/UF" />
                      </div>
                      <div>
                          <Label icon={MapPin}>Próximo Destino</Label>
                          <Input value={formData.nextCity} onChange={e => setFormData({...formData, nextCity: e.target.value})} placeholder="Cidade/UF" />
                      </div>
                  </div>
              </div>
          )}

          {/* TAB: EXTRAS */}
          {activeTab === 'extras' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-right-4 duration-300">
                  <div className="space-y-4">
                      <h3 className="text-sm font-bold text-white border-b border-white/5 pb-2">Composição da Hospedagem</h3>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="bg-white/5 p-3 rounded-2xl border border-white/5 text-center">
                            <Label icon={Users}>Adultos</Label>
                            <Input type="number" min="1" className="text-center font-bold" value={formData.counts?.adults} onChange={e => setFormData({...formData, counts: {...formData.counts!, adults: Number(e.target.value)}})}/>
                        </div>
                        <div className="bg-white/5 p-3 rounded-2xl border border-white/5 text-center">
                            <Label icon={Users}>Crianças</Label>
                            <Input type="number" min="0" className="text-center font-bold" value={formData.counts?.children} onChange={e => setFormData({...formData, counts: {...formData.counts!, children: Number(e.target.value)}})}/>
                        </div>
                        <div className="bg-white/5 p-3 rounded-2xl border border-white/5 text-center">
                            <Label icon={Users}>Bebês</Label>
                            <Input type="number" min="0" className="text-center font-bold" value={formData.counts?.babies} onChange={e => setFormData({...formData, counts: {...formData.counts!, babies: Number(e.target.value)}})}/>
                        </div>
                      </div>
                  </div>

                  <div className="space-y-4">
                      <h3 className="text-sm font-bold text-white border-b border-white/5 pb-2 flex items-center justify-between">
                          <span>Pet Friendly</span>
                          <input type="checkbox" checked={formData.hasPet} onChange={e => setFormData({...formData, hasPet: e.target.checked})} className="toggle-checkbox" />
                      </h3>
                      
                      {formData.hasPet ? (
                          <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-3">
                              <Input placeholder="Nome do Pet" value={formData.petDetails?.name} onChange={e => setFormData({...formData, petDetails: {...formData.petDetails!, name: e.target.value} as any})} />
                              <div className="grid grid-cols-2 gap-3">
                                  <Select value={formData.petDetails?.species} onChange={e => setFormData({...formData, petDetails: {...formData.petDetails!, species: e.target.value} as any})}>
                                      <option value="Cachorro">Cachorro</option>
                                      <option value="Gato">Gato</option>
                                      <option value="Outro">Outro</option>
                                  </Select>
                                  <Input type="number" placeholder="Peso (kg)" value={formData.petDetails?.weight} onChange={e => setFormData({...formData, petDetails: {...formData.petDetails!, weight: Number(e.target.value)} as any})} />
                              </div>
                              <Input placeholder="Raça (Opcional)" value={formData.petDetails?.breed} onChange={e => setFormData({...formData, petDetails: {...formData.petDetails!, breed: e.target.value} as any})} />
                          </div>
                      ) : (
                          <div className="p-8 text-center border border-dashed border-white/10 rounded-2xl text-white/20 text-xs uppercase font-bold">
                              Sem Pet Registrado
                          </div>
                      )}
                  </div>
              </div>
          )}

        </div>
      </div>
    </div>
  );
}