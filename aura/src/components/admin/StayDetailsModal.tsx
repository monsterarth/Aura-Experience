// src/components/admin/StayDetailsModal.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { 
  X, Edit2, Save, Calendar, User, 
  MapPin, Phone, Mail, Car, FileText, 
  Users, CheckCircle, Clock, Plane, 
  Briefcase, PawPrint, Trash2, Plus,
  LogOut, RotateCcw
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { StayService } from "@/services/stay-service";
import { GuestService } from "@/services/guest-service";
import { CabinService } from "@/services/cabin-service";
import { cn } from "@/lib/utils";
import { Stay, Guest, Cabin } from "@/types/aura";

interface StayDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  stay: Stay & { guestName?: string; cabinName?: string };
  guest: Guest;
  onViewGuest?: (guestId: string) => void;
  onUpdate?: () => void;
}

type TabType = 'reserva' | 'hospede' | 'fnrh' | 'acompanhantes_pet';

const formatDateForInput = (timestamp: any) => {
  if (!timestamp?.toDate) return "";
  const d = timestamp.toDate();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const parseDateFromInput = (dateStr: string, originalTimestamp: any) => {
  if (!dateStr) return null;
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = originalTimestamp?.toDate ? new Date(originalTimestamp.toDate().getTime()) : new Date();
  d.setFullYear(year, month - 1, day);
  return d;
};

// ==========================================
// COMPONENTES DE UI EXTRAÍDOS
// ==========================================
const Label = ({ icon: Icon, children }: { icon: any, children: React.ReactNode }) => (
  <label className="flex items-center gap-2 text-[10px] font-bold uppercase text-muted-foreground mb-1.5">
    <Icon size={12} className="text-primary" /> {children}
  </label>
);

const Input = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input 
    {...props} 
    className={cn(
      "w-full bg-background border border-border rounded-xl p-2.5 text-foreground text-xs outline-none focus:border-primary/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed [color-scheme:light] dark:[color-scheme:dark]",
      props.className
    )}
  />
);

const Select = ({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select 
    {...props}
    className="w-full bg-background border border-border rounded-xl p-2.5 text-foreground text-xs outline-none focus:border-primary/50 transition-colors appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
  >
      {children}
  </select>
);
// ==========================================

export function StayDetailsModal({ isOpen, onClose, stay, guest, onViewGuest, onUpdate }: StayDetailsModalProps) {
  const { userData } = useAuth(); // Importação do usuário logado para a Auditoria
  
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('reserva');

  const [formData, setFormData] = useState<Partial<Stay>>({});
  const [guestData, setGuestData] = useState<Partial<Guest>>({});
  const [cabins, setCabins] = useState<Cabin[]>([]);

  const [checkInStr, setCheckInStr] = useState("");
  const [checkOutStr, setCheckOutStr] = useState("");

  useEffect(() => {
    if (isOpen && stay?.propertyId) {
       CabinService.getCabinsByProperty(stay.propertyId).then(setCabins);
    }
  }, [isOpen, stay?.propertyId]);

  const initData = useCallback(() => {
    if (stay && guest) {
      setCheckInStr(formatDateForInput(stay.checkIn));
      setCheckOutStr(formatDateForInput(stay.checkOut));

      setFormData({
        cabinId: stay.cabinId,
        expectedArrivalTime: stay.expectedArrivalTime || "",
        roomSetup: stay.roomSetup || "double",
        roomSetupNotes: stay.roomSetupNotes || "",
        counts: stay.counts || { adults: 1, children: 0, babies: 0 },
        vehiclePlate: stay.vehiclePlate || "",
        travelReason: stay.travelReason || "Turismo",
        transportation: stay.transportation || "Carro",
        lastCity: stay.lastCity || "",
        nextCity: stay.nextCity || "",
        hasPet: stay.hasPet || false,
        petDetails: stay.petDetails || { name: "", species: "Cachorro", weight: 0, breed: "" },
        additionalGuests: stay.additionalGuests || [] 
      });

      setGuestData({
        fullName: guest.fullName || "",
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

  useEffect(() => {
    initData();
  }, [initData]);

  if (!isOpen || !stay) return null;

  const handleCancel = () => {
    initData(); 
    setIsEditing(false);
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const parsedCheckIn = parseDateFromInput(checkInStr, stay.checkIn);
      const parsedCheckOut = parseDateFromInput(checkOutStr, stay.checkOut);

      const stayPayload: Partial<Stay> = {
        ...formData,
        checkIn: parsedCheckIn || stay.checkIn,
        checkOut: parsedCheckOut || stay.checkOut,
      };

      await Promise.all([
        StayService.updateStayData(stay.propertyId, stay.id, stayPayload, userData?.id || "ADMIN", userData?.fullName || "Recepção"),
        GuestService.upsertGuest(stay.propertyId, { id: guest.id, ...guestData } as Guest)
      ]);

      toast.success("Ficha da hospedagem atualizada!");
      setIsEditing(false);
      if (onUpdate) onUpdate(); 
    } catch (error) {
      console.error(error);
      toast.error("Erro ao salvar alterações.");
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // LÓGICA DE CHECK-OUT E REATIVAÇÃO
  // ==========================================
  const handleToggleCheckOut = async () => {
    const isFinishing = stay.status === 'active';
    const actionText = isFinishing ? "encerrar esta estadia (Check-out) e enviar a cabana para limpeza" : "reativar esta estadia e colocar a cabana como ocupada";
    
    if (!window.confirm(`Tem certeza que deseja ${actionText}?`)) return;

    setLoading(true);
    try {
      const actorId = userData?.id || "ADMIN";
      const actorName = userData?.fullName || "Recepção";

      if (isFinishing) {
        await StayService.performCheckOut(stay.propertyId, stay.id, actorId, actorName);
        toast.success("Check-out realizado com sucesso!");
      } else {
        await StayService.undoCheckOut(stay.propertyId, stay.id, stay.cabinId, actorId, actorName);
        toast.success("Estadia reativada com sucesso!");
      }

      if (onUpdate) onUpdate();
    } catch (error) {
      console.error(error);
      toast.error(`Erro ao ${isFinishing ? 'realizar check-out' : 'reativar estadia'}.`);
    } finally {
      setLoading(false);
    }
  };
  // ==========================================

  const updateAdditionalGuest = (index: number, field: string, value: string) => {
      const newGuests = [...(formData.additionalGuests || [])];
      (newGuests[index] as any)[field] = value;
      setFormData({ ...formData, additionalGuests: newGuests });
  };

  const removeAdditionalGuest = (index: number) => {
      const newGuests = (formData.additionalGuests || []).filter((_, i) => i !== index);
      setFormData({ ...formData, additionalGuests: newGuests });
  };

  const addAdditionalGuest = (type: 'adult' | 'child' | 'free') => {
      const newGuests = [...(formData.additionalGuests || [])];
      newGuests.push({ id: Date.now().toString(), type, fullName: "", document: "" });
      setFormData({ ...formData, additionalGuests: newGuests });
  };

  const currentAdults = 1 + (formData.additionalGuests?.filter(g => g.type === 'adult').length || 0); 
  const bookedAdults = formData.counts?.adults || 1;
  const isAdultsMismatch = currentAdults !== bookedAdults;

  const currentChildren = formData.additionalGuests?.filter(g => g.type === 'child').length || 0;
  const bookedChildren = formData.counts?.children || 0;
  const isChildrenMismatch = currentChildren !== bookedChildren;

  // Renderizador elegante de Status
  const statusMap: any = {
    pending: { label: 'Pendente', class: 'text-yellow-600 border-yellow-600/30' },
    pre_checkin_done: { label: 'Pré Check-in OK', class: 'text-blue-600 border-blue-600/30' },
    active: { label: 'Hospedado', class: 'text-green-600 border-green-600/30' },
    finished: { label: 'Encerrado', class: 'text-zinc-500 border-zinc-500/30' },
    cancelled: { label: 'Cancelado', class: 'text-red-600 border-red-600/30' },
  };
  const currentStatus = statusMap[stay.status] || { label: stay.status, class: 'text-muted-foreground border-border' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-card border border-border w-full max-w-5xl rounded-[32px] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-300">
        
        {/* --- HEADER --- */}
        <header className="p-6 border-b border-border bg-secondary/50 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-black text-xl border border-primary/20 shadow-sm">
              {guest?.fullName?.charAt(0) || "G"}
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                {guest?.fullName}
                <span className={cn(
                  "px-2 py-0.5 rounded-full text-[9px] uppercase font-black tracking-wider border bg-background",
                  currentStatus.class
                )}>
                  {currentStatus.label}
                </span>
              </h2>
              <p className="text-xs text-muted-foreground font-medium mt-0.5">Reserva: <span className="font-mono">{stay.accessCode}</span></p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isEditing ? (
              <>
                {stay.status === 'active' && (
                  <button onClick={handleToggleCheckOut} disabled={loading} className="px-4 py-2 bg-orange-500/10 text-orange-600 hover:bg-orange-500 hover:text-white rounded-xl text-xs font-bold uppercase transition-all flex items-center gap-2">
                    <LogOut size={16} /> Check-out
                  </button>
                )}
                
                {stay.status === 'finished' && (
                  <button onClick={handleToggleCheckOut} disabled={loading} className="px-4 py-2 bg-blue-500/10 text-blue-600 hover:bg-blue-500 hover:text-white rounded-xl text-xs font-bold uppercase transition-all flex items-center gap-2">
                    <RotateCcw size={16} /> Reativar
                  </button>
                )}

                <button onClick={() => setIsEditing(true)} className="px-4 py-2 hover:bg-accent rounded-xl text-muted-foreground hover:text-foreground transition-all flex items-center gap-2 text-xs font-bold uppercase">
                    <Edit2 size={16} /> Editar
                </button>
              </>
            ) : (
              <>
                <button onClick={handleCancel} className="px-4 py-2 hover:bg-accent rounded-xl text-muted-foreground hover:text-foreground text-xs font-bold uppercase transition-all">Cancelar</button>
                <button onClick={handleSave} disabled={loading} className="px-6 py-2 bg-primary hover:opacity-90 text-primary-foreground rounded-xl text-xs font-bold uppercase flex items-center gap-2 transition-all active:scale-95 shadow-sm">
                    {loading ? "Salvando..." : <><Save size={14} /> Salvar</>}
                </button>
              </>
            )}
            <button onClick={onClose} className="p-3 hover:bg-destructive/10 hover:text-destructive text-muted-foreground rounded-xl transition-all"><X size={20} /></button>
          </div>
        </header>

        {/* --- TABS --- */}
        <div className="flex border-b border-border px-6 gap-6 overflow-x-auto bg-card shrink-0">
            {[
                { id: 'reserva', label: 'Logística', icon: Calendar },
                { id: 'hospede', label: 'Titular', icon: User },
                { id: 'acompanhantes_pet', label: 'Hóspedes Extras & Pet', icon: Users }, 
                { id: 'fnrh', label: 'Viagem & Carro', icon: Plane },
            ].map(tab => (
                <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as TabType)}
                    className={cn(
                        "py-4 text-xs font-bold uppercase tracking-widest flex items-center gap-2 border-b-2 transition-all whitespace-nowrap",
                        activeTab === tab.id ? "text-primary border-primary" : "text-muted-foreground border-transparent hover:text-foreground"
                    )}
                >
                    <tab.icon size={14} /> {tab.label}
                </button>
            ))}
        </div>

        {/* --- CONTENT --- */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-8 bg-background">
          
          {/* TAB: RESERVA */}
          {activeTab === 'reserva' && (
             <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in slide-in-from-right-4 duration-300">
                <div className="space-y-4">
                    <h3 className="text-sm font-bold text-foreground border-b border-border pb-2">Datas & Horários</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label icon={Clock}>Check-in</Label>
                            {isEditing ? (
                                <Input disabled={!isEditing} type="date" value={checkInStr} onChange={e => setCheckInStr(e.target.value)} />
                            ) : (
                                <div className="text-foreground font-mono bg-secondary p-3 rounded-xl text-sm border border-border">
                                    {stay.checkIn?.toDate ? format(stay.checkIn.toDate(), "dd/MM/yyyy") : "Data inválida"}
                                </div>
                            )}
                        </div>
                        <div>
                            <Label icon={Clock}>Check-out</Label>
                            {isEditing ? (
                                <Input disabled={!isEditing} type="date" value={checkOutStr} onChange={e => setCheckOutStr(e.target.value)} />
                            ) : (
                                <div className="text-foreground font-mono bg-secondary p-3 rounded-xl text-sm border border-border">
                                    {stay.checkOut?.toDate ? format(stay.checkOut.toDate(), "dd/MM/yyyy") : "Data inválida"}
                                </div>
                            )}
                        </div>
                        <div className="col-span-2">
                             <Label icon={Clock}>Previsão de Chegada</Label>
                             <Input disabled={!isEditing} type="time" value={formData.expectedArrivalTime} onChange={e => setFormData({...formData, expectedArrivalTime: e.target.value})} />
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <h3 className="text-sm font-bold text-foreground border-b border-border pb-2">Configuração do Quarto</h3>
                    <div>
                        <Label icon={CheckCircle}>Acomodação</Label>
                        {isEditing ? (
                            <Select disabled={!isEditing} value={formData.cabinId} onChange={e => setFormData({...formData, cabinId: e.target.value})}>
                                {cabins.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </Select>
                        ) : (
                            <div className="text-foreground font-bold text-lg p-2 bg-secondary rounded-lg border border-border">{stay.cabinName}</div>
                        )}
                    </div>
                    <div>
                        <Label icon={CheckCircle}>Montagem das Camas</Label>
                        <Select disabled={!isEditing} value={formData.roomSetup} onChange={e => setFormData({...formData, roomSetup: e.target.value as any})}>
                            <option value="double">Casal (Double)</option>
                            <option value="twin">Solteiro (Twin)</option>
                            <option value="triple">Triplo</option>
                            <option value="other">Outro</option>
                        </Select>
                    </div>
                    <div>
                         <Label icon={FileText}>Notas de Montagem</Label>
                         <Input disabled={!isEditing} value={formData.roomSetupNotes} onChange={e => setFormData({...formData, roomSetupNotes: e.target.value})} placeholder="Ex: Berço extra, travesseiro pena..." />
                    </div>
                </div>
             </div>
          )}

          {/* TAB: HÓSPEDE (DADOS PESSOAIS) */}
          {activeTab === 'hospede' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in slide-in-from-right-4 duration-300">
                  <div className="space-y-4">
                      <h3 className="text-sm font-bold text-foreground border-b border-border pb-2">Dados Pessoais</h3>
                      <div>
                          <Label icon={User}>Nome Completo</Label>
                          <Input disabled={!isEditing} value={guestData.fullName} onChange={e => setGuestData({...guestData, fullName: e.target.value})} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label icon={FileText}>Nascimento</Label>
                            <Input disabled={!isEditing} type="date" value={guestData.birthDate} onChange={e => setGuestData({...guestData, birthDate: e.target.value})} />
                        </div>
                        <div>
                            <Label icon={User}>Gênero</Label>
                            <Select disabled={!isEditing} value={guestData.gender} onChange={e => setGuestData({...guestData, gender: e.target.value as any})}>
                                <option value="M">Masculino</option>
                                <option value="F">Feminino</option>
                                <option value="Outro">Outro</option>
                            </Select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                         <div>
                            <Label icon={FileText}>Documento ({guestData.document?.type})</Label>
                            <Input disabled={!isEditing} value={guestData.document?.number} onChange={e => setGuestData({...guestData, document: { ...guestData.document!, number: e.target.value }})} />
                         </div>
                         <div>
                            <Label icon={Briefcase}>Profissão</Label>
                            <Input disabled={!isEditing} value={guestData.occupation} onChange={e => setGuestData({...guestData, occupation: e.target.value})} />
                         </div>
                      </div>
                  </div>

                  <div className="space-y-4">
                      <h3 className="text-sm font-bold text-foreground border-b border-border pb-2">Contato & Endereço</h3>
                      <div className="grid grid-cols-2 gap-4">
                         <div>
                            <Label icon={Phone}>Telefone</Label>
                            <Input disabled={!isEditing} value={guestData.phone} onChange={e => setGuestData({...guestData, phone: e.target.value})} />
                         </div>
                         <div>
                            <Label icon={Mail}>Email</Label>
                            <Input disabled={!isEditing} value={guestData.email} onChange={e => setGuestData({...guestData, email: e.target.value})} />
                         </div>
                      </div>
                      <div className="space-y-2 p-4 bg-secondary/50 rounded-2xl border border-border">
                          <Label icon={MapPin}>Endereço Completo</Label>
                          <Input disabled={!isEditing} placeholder="CEP" value={guestData.address?.zipCode} onChange={e => setGuestData({...guestData, address: {...guestData.address!, zipCode: e.target.value}})} />
                          <div className="grid grid-cols-3 gap-2">
                             <div className="col-span-2"><Input disabled={!isEditing} placeholder="Rua" value={guestData.address?.street} onChange={e => setGuestData({...guestData, address: {...guestData.address!, street: e.target.value}})} /></div>
                             <div><Input disabled={!isEditing} placeholder="Nº" value={guestData.address?.number} onChange={e => setGuestData({...guestData, address: {...guestData.address!, number: e.target.value}})} /></div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                             <Input disabled={!isEditing} placeholder="Cidade" value={guestData.address?.city} onChange={e => setGuestData({...guestData, address: {...guestData.address!, city: e.target.value}})} />
                             <Input disabled={!isEditing} placeholder="UF" value={guestData.address?.state} onChange={e => setGuestData({...guestData, address: {...guestData.address!, state: e.target.value}})} />
                          </div>
                      </div>
                  </div>
              </div>
          )}

          {/* TAB UNIFICADA: ACOMPANHANTES E PET */}
          {activeTab === 'acompanhantes_pet' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in slide-in-from-right-4 duration-300">
                  
                  {/* Lado Esquerdo: Acompanhantes */}
                  <div className="space-y-6">
                    <h3 className="text-sm font-bold text-foreground border-b border-border pb-2">Composição da Ocupação</h3>
                    
                    <div className="grid grid-cols-3 gap-3">
                        <div className={cn("p-3 rounded-xl border flex flex-col items-center justify-center transition-colors", isAdultsMismatch ? "bg-orange-500/10 border-orange-500/50 text-orange-600" : "bg-secondary border-border text-foreground")}>
                            <p className="text-[10px] font-bold uppercase text-center">Adultos<br/><span className="font-normal opacity-70">(Lista/Reserva)</span></p>
                            <p className="text-xl font-black mt-1">{currentAdults} / {bookedAdults}</p>
                            {isAdultsMismatch && isEditing && (
                                <button 
                                onClick={() => setFormData(prev => ({...prev, counts: {...prev.counts!, adults: currentAdults}}))}
                                className="mt-2 px-2 py-1 bg-orange-500 text-white text-[9px] font-bold uppercase rounded hover:bg-orange-600"
                                >
                                    Ajustar Reserva
                                </button>
                            )}
                        </div>
                        <div className={cn("p-3 rounded-xl border flex flex-col items-center justify-center transition-colors", isChildrenMismatch ? "bg-orange-500/10 border-orange-500/50 text-orange-600" : "bg-secondary border-border text-foreground")}>
                            <p className="text-[10px] font-bold uppercase text-center">Crianças<br/><span className="font-normal opacity-70">(Lista/Reserva)</span></p>
                            <p className="text-xl font-black mt-1">{currentChildren} / {bookedChildren}</p>
                            {isChildrenMismatch && isEditing && (
                                <button 
                                onClick={() => setFormData(prev => ({...prev, counts: {...prev.counts!, children: currentChildren}}))}
                                className="mt-2 px-2 py-1 bg-orange-500 text-white text-[9px] font-bold uppercase rounded hover:bg-orange-600"
                                >
                                    Ajustar Reserva
                                </button>
                            )}
                        </div>
                        <div className="p-3 rounded-xl border bg-secondary border-border text-foreground flex flex-col items-center justify-center">
                            <p className="text-[10px] font-bold uppercase">Bebês (Free)</p>
                            <p className="text-xl font-black mt-1">{formData.additionalGuests?.filter(g => g.type === 'free').length}</p>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <Label icon={Users}>Lista de Acompanhantes</Label>
                        </div>
                        
                        {formData.additionalGuests?.length === 0 ? (
                            <div className="p-6 text-center border border-dashed border-border rounded-xl text-muted-foreground text-xs uppercase font-bold">
                                Sem acompanhantes registrados
                            </div>
                        ) : (
                            formData.additionalGuests?.map((g, idx) => (
                                <div key={idx} className="bg-secondary/50 border border-border p-3 rounded-xl flex items-center gap-3">
                                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2">
                                        <Input disabled={!isEditing} value={g.fullName} onChange={e => updateAdditionalGuest(idx, 'fullName', e.target.value)} placeholder="Nome Completo" />
                                        <Input disabled={!isEditing} value={g.document} onChange={e => updateAdditionalGuest(idx, 'document', e.target.value)} placeholder="Documento" />
                                    </div>
                                    <div className="w-20 text-center shrink-0">
                                        <span className="text-[9px] font-bold uppercase bg-background border border-border px-2 py-1 rounded text-muted-foreground">
                                            {g.type === 'adult' ? 'Adulto' : g.type === 'child' ? 'Criança' : 'Bebê'}
                                        </span>
                                    </div>
                                    {isEditing && (
                                        <button onClick={() => removeAdditionalGuest(idx)} className="p-2 text-destructive hover:bg-destructive/10 rounded-lg transition-colors shrink-0">
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </div>
                            ))
                        )}

                        {isEditing && (
                            <div className="flex gap-2 pt-2">
                                <button onClick={() => addAdditionalGuest('adult')} className="flex-1 py-2 bg-secondary border border-border text-foreground text-[10px] font-bold uppercase rounded-lg hover:border-primary transition-colors flex justify-center items-center gap-1"><Plus size={12}/> Adulto</button>
                                <button onClick={() => addAdditionalGuest('child')} className="flex-1 py-2 bg-secondary border border-border text-foreground text-[10px] font-bold uppercase rounded-lg hover:border-primary transition-colors flex justify-center items-center gap-1"><Plus size={12}/> Criança</button>
                                <button onClick={() => addAdditionalGuest('free')} className="flex-1 py-2 bg-secondary border border-border text-foreground text-[10px] font-bold uppercase rounded-lg hover:border-primary transition-colors flex justify-center items-center gap-1"><Plus size={12}/> Bebê</button>
                            </div>
                        )}
                    </div>
                  </div>

                  {/* Lado Direito: Pet */}
                  <div className="space-y-4">
                      <h3 className="text-sm font-bold text-foreground border-b border-border pb-2 flex items-center justify-between">
                          <span className="flex items-center gap-2"><PawPrint size={14} className="text-primary"/> Pet Friendly</span>
                          <input type="checkbox" disabled={!isEditing} checked={formData.hasPet} onChange={e => setFormData({...formData, hasPet: e.target.checked})} className="accent-primary w-4 h-4 cursor-pointer disabled:opacity-50" />
                      </h3>
                      
                      {formData.hasPet ? (
                          <div className="p-4 bg-secondary/50 rounded-2xl border border-border space-y-3">
                              <Input disabled={!isEditing} placeholder="Nome do Pet" value={formData.petDetails?.name} onChange={e => setFormData({...formData, petDetails: {...formData.petDetails!, name: e.target.value} as any})} />
                              <div className="grid grid-cols-2 gap-3">
                                  <Select disabled={!isEditing} value={formData.petDetails?.species} onChange={e => setFormData({...formData, petDetails: {...formData.petDetails!, species: e.target.value} as any})}>
                                      <option value="Cachorro">Cachorro</option>
                                      <option value="Gato">Gato</option>
                                      <option value="Outro">Outro</option>
                                  </Select>
                                  <Input disabled={!isEditing} type="number" placeholder="Peso (kg)" value={formData.petDetails?.weight || ""} onChange={e => setFormData({...formData, petDetails: {...formData.petDetails!, weight: Number(e.target.value)} as any})} />
                              </div>
                              <Input disabled={!isEditing} placeholder="Raça (Opcional)" value={formData.petDetails?.breed} onChange={e => setFormData({...formData, petDetails: {...formData.petDetails!, breed: e.target.value} as any})} />
                          </div>
                      ) : (
                          <div className="p-8 text-center border border-dashed border-border rounded-xl text-muted-foreground text-xs uppercase font-bold flex flex-col items-center gap-2">
                              <PawPrint size={24} className="opacity-20" />
                              Sem Pet Registrado
                          </div>
                      )}
                  </div>

              </div>
          )}

          {/* TAB: FNRH (VIAGEM) */}
          {activeTab === 'fnrh' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in slide-in-from-right-4 duration-300">
                  <div className="space-y-4">
                      <h3 className="text-sm font-bold text-foreground border-b border-border pb-2">Dados da Viagem</h3>
                      <div>
                          <Label icon={Plane}>Motivo da Viagem</Label>
                          <Select disabled={!isEditing} value={formData.travelReason} onChange={e => setFormData({...formData, travelReason: e.target.value as any})}>
                              <option value="Turismo">Turismo</option>
                              <option value="Negocios">Negócios</option>
                              <option value="Congresso">Congresso/Feira</option>
                              <option value="Saude">Saúde</option>
                              <option value="Outros">Outros</option>
                          </Select>
                      </div>
                      <div>
                          <Label icon={Car}>Meio de Transporte</Label>
                          <Select disabled={!isEditing} value={formData.transportation} onChange={e => setFormData({...formData, transportation: e.target.value as any})}>
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
                              <Input disabled={!isEditing} value={formData.vehiclePlate} onChange={e => setFormData({...formData, vehiclePlate: e.target.value})} placeholder="XXX-0000" />
                          </div>
                      )}
                  </div>

                  <div className="space-y-4">
                      <h3 className="text-sm font-bold text-foreground border-b border-border pb-2">Itinerário</h3>
                      <div>
                          <Label icon={MapPin}>Cidade de Origem (Última procedência)</Label>
                          <Input disabled={!isEditing} value={formData.lastCity} onChange={e => setFormData({...formData, lastCity: e.target.value})} placeholder="Cidade/UF" />
                      </div>
                      <div>
                          <Label icon={MapPin}>Próximo Destino</Label>
                          <Input disabled={!isEditing} value={formData.nextCity} onChange={e => setFormData({...formData, nextCity: e.target.value})} placeholder="Cidade/UF" />
                      </div>
                  </div>
              </div>
          )}

        </div>
      </div>
    </div>
  );
}