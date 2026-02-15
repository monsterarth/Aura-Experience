"use client";

import React, { useState, useEffect } from "react";
import { useProperty } from "@/context/PropertyContext";
import { CabinService } from "@/services/cabin-service";
import { Cabin } from "@/types/aura";
import { 
  Home, Plus, Wifi, Trash2, Edit3, Users, X, Hammer, Hash, Layers, 
  Building2, PlusCircle, BedDouble, Info, Link as LinkIcon
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function CabinsPage() {
  const { property, loading: propertyLoading } = useProperty();
  const [cabins, setCabins] = useState<Cabin[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCabin, setEditingCabin] = useState<Partial<Cabin> | null>(null);
  const [newSetup, setNewSetup] = useState("");

  useEffect(() => {
    if (property?.id) {
      loadCabins();
    } else {
      setCabins([]);
      setLoading(false);
    }
  }, [property]);

  async function loadCabins() {
    if (!property?.id) return;
    setLoading(true);
    try {
      const data = await CabinService.getCabinsByProperty(property.id);
      setCabins(data);
    } catch (error) {
      toast.error("Erro ao carregar unidades.");
    } finally {
      setLoading(false);
    }
  }

  const handleOpenModal = (cabin?: Cabin) => {
    setEditingCabin(cabin || {
      number: "",
      category: "",
      capacity: 2,
      status: "available",
      allowedSetups: [],
      wifi: { ssid: "", password: "" },
      equipment: []
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!property?.id || !editingCabin?.number || !editingCabin?.category) {
      return toast.error("Preencha todos os campos obrigatórios.");
    }
    
    try {
      await CabinService.saveCabin(property.id, editingCabin);
      toast.success("Unidade configurada com sucesso!");
      setIsModalOpen(false);
      loadCabins();
    } catch (error) {
      toast.error("Erro ao salvar cabana.");
    }
  };

  const handleDelete = async (cabinId: string) => {
    if (!property?.id || !confirm("Deseja realmente excluir esta unidade?")) return;
    try {
      await CabinService.deleteCabin(property.id, cabinId);
      toast.success("Unidade removida.");
      loadCabins();
    } catch (error) {
      toast.error("Erro ao excluir.");
    }
  };

  // Funções Auxiliares para Arrays
  const addSetup = () => {
    if (!newSetup) return;
    const currentSetups = editingCabin?.allowedSetups || [];
    setEditingCabin({ ...editingCabin, allowedSetups: [...currentSetups, newSetup] });
    setNewSetup("");
  };

  const removeSetup = (index: number) => {
    const filtered = (editingCabin?.allowedSetups || []).filter((_, i) => i !== index);
    setEditingCabin({ ...editingCabin, allowedSetups: filtered });
  };

  const addEquipment = () => {
    const currentEq = editingCabin?.equipment || [];
    setEditingCabin({ 
      ...editingCabin, 
      equipment: [...currentEq, { id: Date.now().toString(), type: "", model: "", manualUrl: "" }] 
    });
  };

  const removeEquipment = (id: string) => {
    const filtered = (editingCabin?.equipment || []).filter(e => e.id !== id);
    setEditingCabin({ ...editingCabin, equipment: filtered });
  };

  if (!property && !propertyLoading) {
    return (
      <div className="p-24 text-center space-y-4 animate-in fade-in">
        <Building2 size={64} className="mx-auto text-muted-foreground/20" />
        <h2 className="text-2xl font-black uppercase italic text-muted-foreground/40">Selecione uma Propriedade no Menu Lateral</h2>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-10 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black tracking-tighter flex items-center gap-3 italic">
            <Home className="text-primary" size={36} /> {property?.name}
          </h1>
          <p className="text-white/40 font-bold uppercase text-[10px] tracking-widest mt-2 px-1">Gestão de Unidades & Inventário</p>
        </div>
        <button 
          onClick={() => handleOpenModal()}
          className="bg-primary text-black font-black px-8 py-4 rounded-2xl flex items-center gap-2 hover:shadow-[0_0_20px_rgba(var(--primary),0.4)] transition-all active:scale-95"
        >
          Nova Cabana <Plus size={20} />
        </button>
      </header>

      {loading ? (
        <div className="flex justify-center p-24"><Loader2 className="animate-spin text-primary" size={48} /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {cabins.map((cabin) => (
            <div key={cabin.id} className="bg-[#141414] border border-white/5 rounded-[40px] p-8 space-y-6 group hover:border-primary/40 transition-all flex flex-col">
              <div className="flex justify-between items-center">
                <div className={cn(
                  "px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest",
                  cabin.status === 'available' ? "bg-green-500/10 text-green-500" : "bg-white/5 text-white/40"
                )}>
                  {cabin.status}
                </div>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                  <button onClick={() => handleOpenModal(cabin)} className="p-2 bg-white/5 rounded-xl hover:text-primary transition-colors"><Edit3 size={16}/></button>
                  <button onClick={() => handleDelete(cabin.id)} className="p-2 bg-white/5 rounded-xl hover:text-red-500 transition-colors"><Trash2 size={16}/></button>
                </div>
              </div>

              <div>
                <p className="text-primary font-black text-4xl tracking-tighter leading-none">{cabin.number}</p>
                <h3 className="text-xl font-bold text-white/80 mt-2">{cabin.category}</h3>
              </div>

              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase">
                  <Users size={14} className="text-primary" /> {cabin.capacity} Pessoas
                </div>
                <div className="flex flex-wrap gap-1">
                  {cabin.allowedSetups?.map(s => (
                    <span key={s} className="bg-white/5 px-2 py-1 rounded-md text-[8px] font-bold text-white/30 uppercase">{s}</span>
                  ))}
                </div>
              </div>

              <div className="flex gap-4 border-t border-white/5 pt-6">
                <div className="flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase">
                  <Wifi size={14} className={cabin.wifi?.ssid ? "text-green-500" : ""} /> Wifi
                </div>
                <div className="flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase">
                  <Hammer size={14} className={cabin.equipment?.length ? "text-primary" : ""} /> {cabin.equipment?.length || 0} Itens
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-md p-6">
          <form onSubmit={handleSave} className="bg-[#0d0d0d] border border-white/10 w-full max-w-4xl rounded-[48px] overflow-hidden shadow-2xl animate-in zoom-in duration-300">
            <header className="p-8 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
              <h2 className="text-2xl font-black uppercase tracking-tighter italic">Configurar Unidade</h2>
              <button type="button" onClick={() => setIsModalOpen(false)} className="p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors"><X/></button>
            </header>

            <div className="p-10 space-y-12 max-h-[70vh] overflow-y-auto custom-scrollbar">
              
              {/* Identificação & Capacidade */}
              <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-primary tracking-widest flex items-center gap-2">
                    <Hash size={12}/> Número
                  </label>
                  <input 
                    value={editingCabin?.number} 
                    onChange={e => setEditingCabin({...editingCabin!, number: e.target.value})}
                    placeholder="Ex: 01"
                    className="w-full bg-white/5 border border-white/10 p-4 rounded-2xl outline-none focus:border-primary text-xl font-bold"
                  />
                </div>
                <div className="space-y-2 md:col-span-1">
                  <label className="text-[10px] font-black uppercase text-primary tracking-widest flex items-center gap-2">
                    <Layers size={12}/> Categoria
                  </label>
                  <input 
                    value={editingCabin?.category} 
                    onChange={e => setEditingCabin({...editingCabin!, category: e.target.value})}
                    placeholder="Ex: Praia"
                    className="w-full bg-white/5 border border-white/10 p-4 rounded-2xl outline-none focus:border-primary text-xl font-bold"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-primary tracking-widest flex items-center gap-2">
                    <Users size={12}/> Capacidade
                  </label>
                  <input 
                    type="number"
                    value={editingCabin?.capacity} 
                    onChange={e => setEditingCabin({...editingCabin!, capacity: Number(e.target.value)})}
                    className="w-full bg-white/5 border border-white/10 p-4 rounded-2xl outline-none focus:border-primary text-xl font-bold"
                  />
                </div>
              </section>

              {/* Montagens de Quarto (Allowed Setups) */}
              <section className="space-y-4">
                <h4 className="text-[10px] font-black uppercase text-white/40 tracking-[0.2em] flex items-center gap-2">
                  <BedDouble size={14}/> Montagens de Quarto Permitidas
                </h4>
                <div className="flex gap-2">
                  <input 
                    value={newSetup}
                    onChange={e => setNewSetup(e.target.value)}
                    placeholder="Ex: Cama Casal + Berço"
                    className="flex-1 bg-white/5 border border-white/10 p-4 rounded-2xl outline-none focus:border-primary text-sm"
                  />
                  <button type="button" onClick={addSetup} className="p-4 bg-primary text-black rounded-2xl font-black">
                    <PlusCircle size={20}/>
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {editingCabin?.allowedSetups?.map((setup, idx) => (
                    <div key={idx} className="bg-white/5 border border-white/10 px-4 py-2 rounded-xl flex items-center gap-3 text-xs font-bold">
                      {setup}
                      <button type="button" onClick={() => removeSetup(idx)} className="text-red-500 hover:text-red-400"><X size={14}/></button>
                    </div>
                  ))}
                </div>
              </section>

              {/* Conectividade (Wifi) */}
              <section className="bg-primary/5 border border-primary/10 p-8 rounded-[32px] space-y-6">
                <h4 className="text-xs font-black uppercase text-primary tracking-widest flex items-center gap-2">
                  <Wifi size={16}/> Rede Wireless da Unidade
                </h4>
                <div className="grid grid-cols-2 gap-6">
                  <input 
                    placeholder="Rede (SSID)"
                    value={editingCabin?.wifi?.ssid}
                    onChange={e => setEditingCabin({...editingCabin!, wifi: {...editingCabin?.wifi!, ssid: e.target.value}})}
                    className="bg-black/40 border border-white/10 p-4 rounded-2xl outline-none text-sm"
                  />
                  <input 
                    placeholder="Senha"
                    value={editingCabin?.wifi?.password}
                    onChange={e => setEditingCabin({...editingCabin!, wifi: {...editingCabin?.wifi!, password: e.target.value}})}
                    className="bg-black/40 border border-white/10 p-4 rounded-2xl outline-none text-sm"
                  />
                </div>
              </section>

              {/* Equipamentos & Manuais */}
              <section className="space-y-6">
                <div className="flex justify-between items-center">
                  <h4 className="text-[10px] font-black uppercase text-white/40 tracking-[0.2em] flex items-center gap-2">
                    <Hammer size={16}/> Equipamentos & Manuais
                  </h4>
                  <button type="button" onClick={addEquipment} className="text-[10px] font-black uppercase bg-primary/10 text-primary px-4 py-2 rounded-xl hover:bg-primary/20 transition-all">+ Item</button>
                </div>
                
                <div className="space-y-4">
                  {editingCabin?.equipment?.map((eq, idx) => (
                    <div key={eq.id} className="bg-white/[0.02] border border-white/5 p-6 rounded-[24px] grid grid-cols-1 md:grid-cols-3 gap-4 animate-in slide-in-from-top-2">
                      <div className="space-y-1">
                        <label className="text-[8px] font-black text-white/20 uppercase ml-1">Tipo</label>
                        <input 
                          placeholder="Ex: Banheira"
                          value={eq.type}
                          onChange={e => {
                            const newEq = [...editingCabin.equipment!];
                            newEq[idx].type = e.target.value;
                            setEditingCabin({...editingCabin, equipment: newEq});
                          }}
                          className="w-full bg-black/20 border border-white/10 p-3 rounded-xl text-xs outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] font-black text-white/20 uppercase ml-1">Modelo/Ref</label>
                        <input 
                          placeholder="Ex: Jacuzzi 500L"
                          value={eq.model}
                          onChange={e => {
                            const newEq = [...editingCabin.equipment!];
                            newEq[idx].model = e.target.value;
                            setEditingCabin({...editingCabin, equipment: newEq});
                          }}
                          className="w-full bg-black/20 border border-white/10 p-3 rounded-xl text-xs outline-none"
                        />
                      </div>
                      <div className="space-y-1 relative">
                        <label className="text-[8px] font-black text-white/20 uppercase ml-1">Manual (URL)</label>
                        <div className="flex gap-2">
                          <input 
                            placeholder="Link do PDF/Vídeo"
                            value={eq.manualUrl}
                            onChange={e => {
                              const newEq = [...editingCabin.equipment!];
                              newEq[idx].manualUrl = e.target.value;
                              setEditingCabin({...editingCabin, equipment: newEq});
                            }}
                            className="flex-1 bg-black/20 border border-white/10 p-3 rounded-xl text-xs outline-none"
                          />
                          <button type="button" onClick={() => removeEquipment(eq.id)} className="p-3 text-red-500 hover:bg-red-500/10 rounded-xl transition-all">
                            <Trash2 size={16}/>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {(!editingCabin?.equipment || editingCabin.equipment.length === 0) && (
                    <div className="text-center py-10 border border-dashed border-white/5 rounded-3xl">
                      <p className="text-xs text-white/20 font-bold uppercase tracking-widest">Nenhum equipamento vinculado</p>
                    </div>
                  )}
                </div>
              </section>
            </div>

            <footer className="p-8 border-t border-white/5 bg-black flex justify-end gap-4">
               <button type="button" onClick={() => setIsModalOpen(false)} className="px-8 py-4 font-black uppercase text-[10px] text-white/30">Cancelar</button>
               <button type="submit" className="px-12 py-4 bg-primary text-black font-black uppercase text-[10px] rounded-2xl hover:shadow-[0_0_30px_rgba(var(--primary),0.4)] active:scale-95 transition-all">
                 Confirmar Configuração
               </button>
            </footer>
          </form>
        </div>
      )}
    </div>
  );
}

const Loader2 = ({ className, size }: { className?: string, size?: number }) => (
  <svg width={size || 24} height={size || 24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
);